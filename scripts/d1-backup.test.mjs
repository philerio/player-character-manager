import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fixtureSheets } from "./d1-fixture.mjs";
import { convertWorkbook } from "./import-workbook.mjs";
import { parseArgs, verifyBackup } from "./d1-backup.mjs";
const literal = (v) =>
  v === null
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : "'" + v.replaceAll("'", "''") + "'";
function dump(db) {
  const schema = db
    .prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all();
  const lines = schema
    .filter((r) => r.type === "table")
    .map((r) => r.sql + ";");
  for (const table of schema.filter((r) => r.type === "table"))
    for (const row of db.prepare(`SELECT * FROM "${table.name}"`).all())
      lines.push(
        `INSERT INTO "${table.name}" VALUES(${Object.values(row).map(literal).join(",")});`,
      );
  lines.push(
    ...schema.filter((r) => r.type !== "table").map((r) => r.sql + ";"),
  );
  return lines.join("\n");
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("worker/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("worker/migrations/" + file, "utf8"));
  db.exec(convertWorkbook(fixtureSheets()).sql);
  return db;
}
test("full backup restores all tables, file bytes, clocks and receipts with bounded SQL statements", () => {
  const dir = mkdtempSync(join(tmpdir(), "pcm-backup-test-")),
    db = fixture();
  try {
    const bytes = Buffer.alloc(400000, 65),
      base64 = bytes.toString("base64"),
      sha = createHash("sha256").update(bytes).digest("hex");
    db.prepare(
      "INSERT INTO media_files(id,character_id,category,name,mime_type,created_at,storage,byte_length,encoded_length,part_count,sha256) VALUES('image','player-character','territory.map.upload','map.png','image/png','2026-10-19','d1',?,?,2,?)",
    ).run(bytes.length, base64.length, sha);
    db.prepare("INSERT INTO media_file_parts VALUES('image',0,?)").run(
      base64.slice(0, 524288),
    );
    db.prepare("INSERT INTO media_file_parts VALUES('image',1,?)").run(
      base64.slice(524288),
    );
    db.exec(
      "UPDATE territories SET data=json_set(data,'$.mapFileId','d1:image') WHERE id='territory'",
    );
    db.prepare("INSERT INTO settings(key,value) VALUES('long-test',?)").run(
      "Apostrophe's 😀\n".repeat(8000),
    );
    db.exec(
      "INSERT INTO command_receipts VALUES('player','test','test','player-character','hash','{\"ok\":true}','2026-10-19')",
    );
    const file = join(dir, "export.sql"),
      out = join(dir, "verified");
    writeFileSync(file, dump(db));
    const manifest = verifyBackup(file, out);
    assert.equal(manifest.tables.media_file_parts.rows, 2);
    assert.equal(manifest.tables.command_receipts.rows, 1);
    assert.throws(
      () => verifyBackup(file, join(dir, "tampered"), "0".repeat(64)),
      /checksum differs/,
    );
    const restored = new DatabaseSync(":memory:");
    try {
      restored.exec("PRAGMA foreign_keys=ON; BEGIN;");
      restored.exec(readFileSync(join(out, "restore.sql"), "utf8"));
      restored.exec("COMMIT");
      assert.equal(
        restored
          .prepare("SELECT value FROM settings WHERE key='long-test'")
          .get().value,
        "Apostrophe's 😀\n".repeat(8000),
      );
      const encoded = restored
        .prepare("SELECT data FROM media_file_parts ORDER BY part")
        .all()
        .map((r) => r.data)
        .join("");
      assert(Buffer.from(encoded, "base64").equals(bytes));
      const clock = restored
        .prepare(
          "SELECT revision FROM campaign_clocks WHERE character_id='player-character'",
        )
        .get().revision;
      restored.exec(
        "UPDATE territories SET data=json_set(data,'$.name','Restored') WHERE id='territory'",
      );
      assert.equal(
        restored
          .prepare(
            "SELECT revision FROM campaign_clocks WHERE character_id='player-character'",
          )
          .get().revision,
        clock + 1,
      );
      assert.equal(statSync(join(out, "restore.sql")).mode & 0o777, 0o600);
      assert.throws(() => verifyBackup(file, out), /exist/);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("rejects incomplete files and broken relationships without a verification manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "pcm-backup-test-")),
    db = fixture();
  try {
    const file = join(dir, "bad.sql"),
      out = join(dir, "verified");
    db.exec(
      "INSERT INTO media_files(id,character_id,category,name,mime_type,created_at,storage,part_count) VALUES('bad','player-character','test','bad','image/png','2026-10-19','d1',1)",
    );
    writeFileSync(file, dump(db));
    assert.throws(() => verifyBackup(file, out), /missing content/);
    assert(!existsSync(join(out, "manifest.json")));
    db.exec(
      "DELETE FROM media_files; PRAGMA foreign_keys=OFF; UPDATE characters SET player_id='missing'",
    );
    writeFileSync(file, dump(db));
    assert.throws(() => verifyBackup(file, out), /foreign-key/);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("requires explicit backup target and rejects ambiguous or unknown options", () => {
  assert.throws(() => parseArgs(["create"]), /explicitly/);
  assert.throws(
    () => parseArgs(["create", "--local", "--remote"]),
    /exactly one/,
  );
  assert.throws(
    () => parseArgs(["verify", "--file", "dump.sql", "--remote"]),
    /does not connect/,
  );
  assert.throws(
    () => parseArgs(["create", "--remote", "--out"]),
    /Missing value/,
  );
  assert.throws(
    () => parseArgs(["create", "--remote", "--unknown"]),
    /Unknown/,
  );
  assert.equal(parseArgs(["create", "--local"]).target, "--local");
});
