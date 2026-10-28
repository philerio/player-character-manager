import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const qi = (s) => '"' + s.replaceAll('"', '""') + '"';
const hash = (value) => createHash("sha256").update(value).digest("hex");
const appTable = (name) =>
  !name.startsWith("sqlite_") && !name.startsWith("_cf_");
function tables(db) {
  return db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name",
    )
    .all()
    .filter((r) => appTable(r.name));
}
function rows(db, table) {
  const columns = db.prepare(`PRAGMA table_info(${qi(table)})`).all();
  const keys = columns
    .filter((c) => c.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => qi(c.name));
  const statement = db.prepare(
    `SELECT * FROM ${qi(table)} ORDER BY ${keys.length ? keys.join(",") : "rowid"}`,
  );
  statement.setReadBigInts(true);
  return statement.iterate();
}
function summary(db) {
  const result = {};
  for (const table of tables(db)) {
    const digest = createHash("sha256");
    let count = 0;
    for (const row of rows(db, table.name)) {
      digest.update(
        JSON.stringify(row, (_, v) =>
          typeof v === "bigint" ? { $integer: v.toString() } : v,
        ) + "\n",
      );
      count++;
    }
    result[table.name] = { rows: count, sha256: digest.digest("hex") };
  }
  return result;
}
function validate(db) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("SQLite integrity check failed.");
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw Error("Backup contains broken foreign-key references.");
  const names = new Set(tables(db).map((t) => t.name));
  for (const table of [
    "players",
    "characters",
    "territories",
    "records",
    "wallet_backups",
    "command_receipts",
    "media_files",
    "media_file_parts",
  ])
    if (!names.has(table))
      throw Error(
        `Backup is incomplete: missing ${table}. Apply file-storage migrations before making a full backup.`,
      );
  for (const file of db
    .prepare("SELECT * FROM media_files WHERE storage='d1'")
    .iterate()) {
    const parts = db
      .prepare(
        "SELECT part,data FROM media_file_parts WHERE file_id=? ORDER BY part",
      )
      .all(file.id);
    if (parts.length !== file.part_count || parts.some((p, i) => p.part !== i))
      throw Error(`File ${file.id} has missing content parts.`);
    const encoded = parts.map((p) => p.data).join("");
    const bytes = Buffer.from(encoded, "base64");
    if (
      encoded.length !== file.encoded_length ||
      bytes.length !== file.byte_length ||
      hash(bytes) !== file.sha256
    )
      throw Error(`File ${file.id} failed its integrity check.`);
  }
  for (const table of ["characters", "territories"]) {
    for (const row of db
      .prepare(
        `SELECT id,${table === "characters" ? "id AS character_id" : "character_id"},data FROM ${qi(table)} WHERE active=1`,
      )
      .iterate()) {
      const data = JSON.parse(row.data);
      for (const field of table === "characters"
        ? ["portraitFileId"]
        : ["mapFileId", "poiMapFileId", "workbookFileId"]) {
        if (!String(data[field] || "").startsWith("d1:")) continue;
        const file = db
          .prepare(
            "SELECT id FROM media_files WHERE id=? AND character_id=? AND active=1 AND storage='d1'",
          )
          .get(data[field].slice(3), row.character_id);
        if (!file)
          throw Error(
            `Record ${row.id} references a missing or incorrectly owned D1 file.`,
          );
      }
    }
  }
  const triggers = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all()
      .map((t) => t.name),
  );
  for (const name of [
    "records_clock_insert",
    "records_clock_update",
    "records_clock_delete",
    "territories_clock_insert",
    "territories_clock_update",
    "territories_clock_delete",
    "characters_clock_insert",
    "characters_clock_update",
  ])
    if (!triggers.has(name))
      throw Error(`Backup is missing write-protection trigger ${name}.`);
}
function literal(v) {
  if (v === null) return "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw Error("Non-finite number in backup.");
    return String(v);
  }
  if (v instanceof Uint8Array)
    return "X'" + Buffer.from(v).toString("hex") + "'";
  if (typeof v === "string")
    return v.includes("\0")
      ? "CAST(X'" + Buffer.from(v).toString("hex") + "' AS TEXT)"
      : "'" + v.replaceAll("'", "''") + "'";
  throw Error("Unsupported value in database backup.");
}
/** Generate D1-compatible SQL without oversized inline JSON or base64 INSERTs. */
function writeRestore(db, path) {
  const fd = openSync(path, "wx", 0o600);
  let token = 0;
  const write = (sql) => {
    if (Buffer.byteLength(sql) > 90000)
      throw Error("A restore statement exceeds the conservative D1 limit.");
    writeSync(fd, sql + ";\n");
  };
  try {
    write("PRAGMA defer_foreign_keys=ON");
    const all = tables(db);
    if (all.some((t) => t.name === "_pcm_restore_parts"))
      throw Error("Reserved restore staging table exists in the backup.");
    for (const table of all) write(table.sql);
    write(
      'CREATE TABLE "_pcm_restore_parts" (value_id INTEGER,part INTEGER,data TEXT,PRIMARY KEY(value_id,part))',
    );
    for (const table of all)
      for (const row of rows(db, table.name)) {
        const staged = [];
        const values = Object.values(row).map((v) => {
          const text = literal(v);
          if (Buffer.byteLength(text) <= 16000) return text;
          if (typeof v !== "string")
            throw Error(
              "Large binary cells need a separate recovery plan; campaign uploads use text parts.",
            );
          const id = ++token;
          staged.push(id);
          let part = 0;
          for (let offset = 0; offset < v.length;) {
            let end = Math.min(v.length, offset + 8000);
            if (end < v.length && /[\uD800-\uDBFF]/.test(v[end - 1])) end--;
            write(
              `INSERT INTO "_pcm_restore_parts" VALUES(${id},${part++},${literal(v.slice(offset, end))})`,
            );
            offset = end;
          }
          return `(SELECT group_concat(data,'') FROM (SELECT data FROM "_pcm_restore_parts" WHERE value_id=${id} ORDER BY part))`;
        });
        write(
          `INSERT INTO ${qi(table.name)} (${Object.keys(row).map(qi).join(",")}) VALUES(${values.join(",")})`,
        );
        if (staged.length)
          write(
            `DELETE FROM "_pcm_restore_parts" WHERE value_id IN(${staged.join(",")})`,
          );
      }
    write('DROP TABLE "_pcm_restore_parts"');
    // Restore clocks before enabling triggers, so replay cannot change saved revisions.
    for (const object of db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type IN('index','trigger','view') AND sql IS NOT NULL ORDER BY type,name",
      )
      .all())
      write(object.sql);
    write("PRAGMA defer_foreign_keys=OFF");
  } finally {
    closeSync(fd);
  }
}
/** Both databases are disposable, on disk, and never point at campaign state. */
export function verifyBackup(file, outputDir, expectedHash) {
  const sql = readFileSync(file, "utf8");
  if (expectedHash && hash(sql) !== expectedHash)
    throw Error(
      "Export checksum differs from the original manifest. Restore verification was stopped.",
    );
  const temp = mkdtempSync(join(tmpdir(), "pcm-backup-check-"));
  const source = new DatabaseSync(join(temp, "source.sqlite"));
  let restored;
  try {
    // This command accepts trusted SQL exports, not arbitrary downloaded scripts.
    source.exec("PRAGMA foreign_keys=OFF");
    source.exec(sql);
    source.exec("PRAGMA foreign_keys=ON");
    validate(source);
    const before = summary(source);
    mkdirSync(outputDir, { mode: 0o700 });
    const restore = join(outputDir, "restore.sql");
    writeRestore(source, restore);
    restored = new DatabaseSync(join(temp, "restored.sqlite"));
    restored.exec("PRAGMA foreign_keys=ON; BEGIN;");
    restored.exec(readFileSync(restore, "utf8"));
    restored.exec("COMMIT");
    validate(restored);
    const after = summary(restored);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error("Restored rows differ from the source backup.");
    const schema = (db) =>
      db
        .prepare(
          "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN('table','index','trigger','view') ORDER BY type,name",
        )
        .all()
        .filter((r) => appTable(r.name));
    if (JSON.stringify(schema(source)) !== JSON.stringify(schema(restored)))
      throw Error("Restored schema differs from the backup.");
    const manifest = {
      format: "pcm-d1-backup",
      version: 1,
      verifiedAt: new Date().toISOString(),
      sourceSha256: hash(sql),
      restoreSha256: hash(readFileSync(restore)),
      tables: before,
    };
    writeFileSync(
      join(outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    return manifest;
  } catch (error) {
    // No verification manifest means the export must not be used as a verified restore.
    throw error;
  } finally {
    restored?.close();
    source.close();
    rmSync(temp, { recursive: true, force: true });
  }
}
export function parseArgs(argv) {
  const command = argv[0];
  if (!["create", "verify"].includes(command))
    throw Error(
      "Use create --local|--remote [--out DIR] or verify --file trusted-export.sql [--out DIR].",
    );
  const options = {
    command,
    binding: "DB",
    config: join(root, "wrangler.jsonc"),
  };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--local" || arg === "--remote") {
      if (options.target)
        throw Error("Choose exactly one of --local or --remote.");
      options.target = arg;
    } else if (
      ["--out", "--file", "--binding", "--config", "--manifest"].includes(arg)
    ) {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw Error(`Missing value for ${arg}.`);
      options[arg.slice(2)] = value;
    } else throw Error(`Unknown option ${arg}.`);
  }
  if (command === "create" && !options.target)
    throw Error("Choose --local or --remote explicitly.");
  if (command === "verify" && (!options.file || options.target))
    throw Error(
      "Verification needs --file and does not connect to Cloudflare.",
    );
  return options;
}
async function main() {
  process.umask(0o077);
  const options = parseArgs(process.argv.slice(2));
  const parent = resolve(root, "migration-output", "backups");
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const output = resolve(
    options.out ||
      join(
        parent,
        new Date().toISOString().replaceAll(":", "-") +
          "-" +
          randomUUID().slice(0, 8),
      ),
  );
  if (existsSync(output))
    throw Error(
      "Output directory already exists. Choose a new directory; backups are never overwritten.",
    );
  if (options.command === "verify") {
    const file = resolve(options.file);
    const defaultManifest = join(dirname(file), "verified", "manifest.json");
    const manifestFile = options.manifest
      ? resolve(options.manifest)
      : existsSync(defaultManifest)
        ? defaultManifest
        : null;
    let expectedHash;
    if (manifestFile) {
      const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
      if (
        manifest.format !== "pcm-d1-backup" ||
        manifest.version !== 1 ||
        !/^[a-f0-9]{64}$/.test(manifest.sourceSha256)
      )
        throw Error("Invalid backup manifest.");
      expectedHash = manifest.sourceSha256;
    }
    verifyBackup(file, output, expectedHash);
  } else {
    mkdirSync(output, { mode: 0o700 });
    const raw = join(output, "export.sql");
    const args = [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "export",
      options.binding,
      options.target,
      "--config",
      resolve(options.config),
      "--output",
      raw,
    ];
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    if (result.error || result.status !== 0)
      throw Error("Export failed. No verified backup was created.");
    chmodSync(raw, 0o600);
    if (!statSync(raw).size) throw Error("Export is empty.");
    verifyBackup(raw, join(output, "verified"));
  }
  console.log(
    `Backup verified by restoring into disposable SQLite databases. Files: ${output}`,
  );
  console.log(
    "Keep this directory private. Browser-only wallets, external Drive files and Worker secrets require separate backups.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
