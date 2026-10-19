import { createHash } from "node:crypto";
import {
  RecordFieldError,
  canonicalJSON,
  validateRecordFields,
  validateWalletBackupFields,
} from "../shared/records.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import XLSX from "xlsx";

const definitions = {
  Players: ["players", "playerId"],
  Characters: ["characters", "characterId"],
  Territories: ["territories", "territoryId"],
  Journal: ["journal", "entryId"],
  Retainers: ["retainer", "retainerId"],
  "Territory Hexes": ["hex", "hexId"],
  "Wallet Transactions": ["transaction", "transactionId"],
  "Recurring Expenses": ["recurring", "scheduleId"],
  "Scouting Missions": ["scouting", "missionId"],
  "Custom Missions": ["custom", "missionId"],
};
const collections = {
  players: "players",
  characters: "characters",
  territories: "territories",
  journal: "journal",
  retainer: "retainers",
  hex: "territoryHexes",
  transaction: "transactions",
  recurring: "recurringExpenses",
  scouting: "scoutingMissions",
  custom: "customMissions",
};
const calendarFields = new Set(["startDate", "hiringDate"]);
function calendarDate(value) {
  const string = value instanceof Date ? value.toISOString() : String(value);
  const match = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.exec(
    string,
  );
  if (
    !match ||
    new Date(match[1] + "T00:00:00Z").toISOString().slice(0, 10) !== match[1]
  )
    throw new Error("Invalid calendar date");
  return match[1];
}
const numericFields = new Set(
  "level wageGp men mapX mapY pp gp sp cp population occurrenceCount hexPopulationValue potentialHostileEncounterPopulation cerealFields cottonFields pastureFields fieldCapacity durationDays encounterRoll reactionModifier reactionRoll adjustedReactionRoll populationAdded attackerCount scoutMoraleRoll scoutMoraleBonus attackerMoraleRoll attackerMoraleBonus casualtyRoll scoutsKilled serjeantsChecked serjeantsKilled survivors strandedMen promotionFeeGp attackThac0 attackRoll attackNeeded attackTargetArmorClass".split(
    " ",
  ),
);
const flags = new Set(
  "active territoriesEnabled retainersEnabled mustChangePassword deleted dmRevealed payChurchTithe clericFightingForce encounterOccurred scoutMoralePassed attackerMoralePassed encounterKnownToPlayer attackHit shield".split(
    " ",
  ),
);
const hexKey = (value) => {
  const key = String(value).trim().toLowerCase();
  return key && Number.isFinite(Number(key)) ? String(Number(key)) : key;
};
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const buildInsert = (table, columns, values) =>
  `INSERT INTO ${table} (${columns.join(",")}) VALUES (${values.map((value) => (value === null ? "NULL" : quote(value))).join(",")});`;
export function readWorkbook(path) {
  const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  return Object.fromEntries(
    wb.SheetNames.map((name) => [
      name,
      XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }),
    ]),
  );
}
/** Pure validation/conversion; never connects to Cloudflare or modifies the workbook. */
export function convertWorkbook(sheets) {
  const errors = [],
    statements = [],
    counts = {},
    normalized = {};
  const issue = (sheet, row, field, reason) =>
    errors.push(`${sheet}, row ${row}, ${field}: ${reason}`);
  let sourceLocation = { sheet: "Workbook", row: 1, field: "row" };
  const insert = (table, columns, values) => {
    const statement = buildInsert(table, columns, values);
    if (Buffer.byteLength(statement, "utf8") > 100000)
      issue(
        sourceLocation.sheet,
        sourceLocation.row,
        sourceLocation.field,
        "generated SQL exceeds D1's 100,000-byte statement limit",
      );
    return statement;
  };
  for (const [sheet, rows] of Object.entries(sheets)) {
    counts[sheet] = rows.length;
    const definition = definitions[sheet];
    if (!definition) continue;
    const [kind, idField] = definition,
      ids = new Set();
    normalized[sheet] = rows.map((source, index) => {
      const rowNumber = index + 2,
        data = { ...source };
      for (const [field, value] of Object.entries(data)) {
        if (calendarFields.has(field) && value !== "") {
          try {
            data[field] = calendarDate(value);
          } catch {
            issue(
              sheet,
              rowNumber,
              field,
              "expected a valid calendar date (YYYY-MM-DD)",
            );
          }
        } else if (value instanceof Date) data[field] = value.toISOString();
        else if (flags.has(field)) {
          const flag = String(value).trim().toLowerCase();
          if (
            value === "" &&
            ["retainer", "territories"].includes(kind) &&
            field === "active"
          )
            data[field] = true;
          else if (["", "true", "false", "1", "0"].includes(flag))
            data[field] = ["true", "1"].includes(flag);
          else issue(sheet, rowNumber, field, "expected a checkbox value");
        } else if (numericFields.has(field)) {
          const number = Number(value);
          if (!Number.isFinite(number))
            issue(sheet, rowNumber, field, "expected a finite number");
          else data[field] = number;
        } else data[field] = String(value);
      }
      for (const [field, target] of [
        ["assetsJson", "assets"],
        ["rosterJson", "roster"],
        ["allocationsJson", "allocations"],
      ])
        if (field in data) {
          try {
            data[target] = data[field] ? JSON.parse(data[field]) : [];
            if (!Array.isArray(data[target])) throw Error();
            // Allocation/roster checkbox normalization also occurs within JSON.
            for (const item of data[target]) {
              if (!item || typeof item !== "object" || Array.isArray(item))
                throw Error();
              if (
                "men" in item &&
                (typeof item.men !== "number" ||
                  !Number.isInteger(item.men) ||
                  item.men < 0)
              )
                throw Error();
            }
          } catch {
            issue(
              sheet,
              rowNumber,
              field,
              "expected a valid JSON array with valid entries",
            );
          }
          delete data[field];
        }
      if (["hex", "scouting", "territories"].includes(kind))
        data.hexNumber = String(data.hexNumber || "");
      if (data.active === undefined)
        data.active = ["retainer", "territories"].includes(kind);
      const needed = [
        idField,
        ...(kind === "players"
          ? ["displayName", "email", "passwordSalt", "passwordHash"]
          : kind === "characters"
            ? ["playerId", "name", "class"]
            : ["characterId"]),
      ];
      if (["hex", "scouting", "custom"].includes(kind))
        needed.push("territoryId");
      if (["hex", "scouting"].includes(kind)) needed.push("hexNumber");
      if (kind === "journal")
        needed.push("title", "playerId", "createdAt", "updatedAt");
      if (kind === "retainer" || kind === "territories")
        needed.push("name", "createdAt");
      if (kind === "hex") needed.push("createdAt");
      if (kind === "transaction") needed.push("label", "timestamp");
      if (kind === "recurring") needed.push("label", "startDate");
      for (const field of needed)
        if (typeof data[field] !== "string" || !data[field].trim())
          issue(sheet, rowNumber, field, "required text is missing");
      for (const [field, allowed] of kind === "players"
        ? [["role", ["dm", "player"]]]
        : kind === "retainer"
          ? [
              ["type", ["force", "individual"]],
              ["costCoin", ["pp", "gp", "sp", "cp"]],
              ["wageFrequency", ["weekly", "monthly", "annually"]],
            ]
          : kind === "transaction"
            ? [["type", ["income", "expense"]]]
            : kind === "recurring"
              ? [["frequency", ["weekly", "monthly", "annually"]]]
              : kind === "scouting"
                ? [["status", ["active", "completed", "failed", "cancelled"]]]
                : [])
        if (!allowed.includes(data[field]))
          issue(sheet, rowNumber, field, "unexpected value");
      const requiredNumbers =
        kind === "characters"
          ? ["level"]
          : kind === "retainer"
            ? ["wageGp"]
            : ["transaction", "recurring"].includes(kind)
              ? ["pp", "gp", "sp", "cp"]
              : ["hex", "scouting"].includes(kind)
                ? ["mapX", "mapY"]
                : [];
      if (["scouting", "custom"].includes(kind)) requiredNumbers.push("men");
      if (kind === "recurring") requiredNumbers.push("occurrenceCount");
      for (const field of requiredNumbers)
        if (typeof data[field] !== "number" || !Number.isFinite(data[field]))
          issue(sheet, rowNumber, field, "required number is missing");
      for (const field of ["mapX", "mapY"])
        if (field in data && (data[field] < 0 || data[field] > 100))
          issue(sheet, rowNumber, field, "must be between 0 and 100");
      for (const field of ["updatedAt", "createdAt", "timestamp", "startDate"])
        if (data[field] && !Number.isFinite(Date.parse(data[field])))
          issue(sheet, rowNumber, field, "invalid date");
      if (["scouting", "custom"].includes(kind)) {
        if (!Array.isArray(data.allocations))
          issue(
            sheet,
            rowNumber,
            "allocationsJson",
            "required allocation array is missing",
          );
        else
          for (const item of data.allocations)
            if (
              !item.retainerId ||
              !item.soldierType ||
              !Number.isInteger(item.men) ||
              item.men < 0
            )
              issue(
                sheet,
                rowNumber,
                "allocationsJson",
                "invalid allocation entry",
              );
      }
      try {
        validateRecordFields(collections[kind], data);
      } catch (error) {
        if (!(error instanceof RecordFieldError)) throw error;
        issue(
          sheet,
          rowNumber,
          error.path.replace(/^record\./, ""),
          `expected ${error.expected}; received ${error.received}`,
        );
      }
      if (ids.has(data[idField]))
        issue(sheet, rowNumber, idField, "duplicate ID");
      ids.add(data[idField]);
      return data;
    });
  }
  for (const sheet of ["Players", "Characters"])
    if (!normalized[sheet]?.length)
      issue(sheet, 1, "sheet", "required nonempty sheet is missing");
  const players = new Set(
    (normalized.Players || []).map((row) => row.playerId),
  );
  const characters = new Set(
    (normalized.Characters || []).map((row) => row.characterId),
  );
  const territories = new Map(
    (normalized.Territories || []).map((row) => [
      row.territoryId,
      row.characterId,
    ]),
  );
  const emails = new Set(),
    hexes = new Set(),
    mutations = new Set();
  for (const [sheet, rows] of Object.entries(normalized)) {
    const [kind, idField] = definitions[sheet];
    rows.forEach((data, index) => {
      const row = index + 2;
      sourceLocation = { sheet, row, field: "row" };
      if (kind === "players") {
        const email = String(data.email || "")
          .trim()
          .toLowerCase();
        if (emails.has(email)) issue(sheet, row, "email", "duplicate email");
        emails.add(email);
        const {
          passwordSalt,
          passwordHash,
          recoveryAnswerSalt,
          recoveryAnswerHash,
          ...safe
        } = data;
        statements.push(
          insert(
            "players",
            [
              "id",
              "email",
              "role",
              "active",
              "password_salt",
              "password_hash",
              "data",
            ],
            [
              data.playerId,
              email,
              data.role,
              data.active ? 1 : 0,
              passwordSalt,
              passwordHash,
              JSON.stringify(safe),
            ],
          ),
        );
      } else if (kind === "characters") {
        if (!players.has(data.playerId))
          issue(sheet, row, "playerId", "owner does not exist");
        statements.push(
          insert(
            "characters",
            ["id", "player_id", "active", "data"],
            [
              data.characterId,
              data.playerId,
              data.active ? 1 : 0,
              JSON.stringify(data),
            ],
          ),
        );
      } else {
        if (!characters.has(data.characterId))
          issue(sheet, row, "characterId", "character does not exist");
        if (
          data.territoryId &&
          kind !== "territories" &&
          territories.get(data.territoryId) !== data.characterId
        )
          issue(
            sheet,
            row,
            "territoryId",
            "territory does not belong to this character",
          );
        if (kind === "territories") {
          delete data.scoutingWebhookUrl;
          statements.push(
            insert(
              "territories",
              ["id", "character_id", "active", "data"],
              [
                data.territoryId,
                data.characterId,
                data.active ? 1 : 0,
                JSON.stringify(data),
              ],
            ),
          );
        } else {
          if (data.clientMutationId) {
            const mutationKey = JSON.stringify([
              kind,
              data.characterId,
              data.clientMutationId,
            ]);
            if (mutations.has(mutationKey))
              issue(
                sheet,
                row,
                "clientMutationId",
                "duplicate mutation ID for this character",
              );
            mutations.add(mutationKey);
          }
          if (kind === "hex") {
            const key = `${data.territoryId}::${hexKey(data.hexNumber)}`;
            if (hexes.has(key))
              issue(sheet, row, "hexNumber", "duplicate normalized hex");
            hexes.add(key);
          }
          statements.push(
            insert(
              "records",
              [
                "kind",
                "id",
                "character_id",
                "territory_id",
                "hex_key",
                "mutation_id",
                "updated_at",
                "data",
              ],
              [
                kind,
                data[idField],
                data.characterId,
                data.territoryId || null,
                kind === "hex" ? hexKey(data.hexNumber) : null,
                data.clientMutationId || null,
                data.updatedAt || data.createdAt || "",
                JSON.stringify(data),
              ],
            ),
          );
        }
      }
    });
  }
  const revisionKeys = new Set();
  for (const [index, row] of (sheets["Tab Sync Revisions"] || []).entries()) {
    sourceLocation = {
      sheet: "Tab Sync Revisions",
      row: index + 2,
      field: "row",
    };
    const revisionKey = JSON.stringify([row.characterId, row.tab]);
    if (revisionKeys.has(revisionKey))
      issue(
        "Tab Sync Revisions",
        index + 2,
        "tab",
        "duplicate character/tab revision",
      );
    revisionKeys.add(revisionKey);
    if (!characters.has(String(row.characterId)))
      issue(
        "Tab Sync Revisions",
        index + 2,
        "characterId",
        "character does not exist",
      );
    if (
      !["wallet", "journal", "retainers", "territories"].includes(row.tab) ||
      !Number.isInteger(Number(row.revision)) ||
      Number(row.revision) < 0
    )
      issue(
        "Tab Sync Revisions",
        index + 2,
        "revision",
        "invalid revision or tab",
      );
    statements.push(
      insert(
        "revisions",
        ["character_id", "tab", "revision", "updated_at"],
        [
          row.characterId,
          row.tab,
          row.revision,
          row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : row.updatedAt,
        ],
      ),
    );
  }
  const backups = new Map(),
    backupIds = new Set();
  for (const [index, row] of (sheets["Wallet Backups"] || []).entries()) {
    const id = String(row.backupRowId || "").trim();
    if (!id || backupIds.has(id))
      issue(
        "Wallet Backups",
        index + 2,
        "backupRowId",
        "expected a nonempty unique backup row ID",
      );
    backupIds.add(id);
    const characterId = String(row.characterId || "");
    if (!characters.has(characterId))
      issue(
        "Wallet Backups",
        index + 2,
        "characterId",
        "character does not exist",
      );
    const group = backups.get(characterId) || [];
    group.push({ row, index: index + 2 });
    backups.set(characterId, group);
  }
  for (const [characterId, group] of backups) {
    const metas = group.filter((item) => item.row.entryType === "meta");
    if (metas.length !== 1) {
      issue(
        "Wallet Backups",
        group[0].index,
        "entryType",
        "expected exactly one backup metadata row",
      );
      continue;
    }
    const meta = metas[0],
      playerId = String(meta.row.playerId || "");
    if (!players.has(playerId))
      issue(
        "Wallet Backups",
        meta.index,
        "playerId",
        "backup account does not exist",
      );
    const at =
      meta.row.backedUpAt instanceof Date
        ? meta.row.backedUpAt.toISOString()
        : String(meta.row.backedUpAt || "");
    if (!at || !Number.isFinite(Date.parse(at)))
      issue(
        "Wallet Backups",
        meta.index,
        "backedUpAt",
        "invalid backup timestamp",
      );
    const payload = { transactions: [], recurringExpenses: [] };
    for (const [type, key] of [
      ["transaction", "transactions"],
      ["recurring", "recurringExpenses"],
    ]) {
      const rows = group
        .filter((item) => item.row.entryType === type)
        .sort((a, b) => Number(a.row.entryOrder) - Number(b.row.entryOrder));
      rows.forEach(({ row, index }, order) => {
        if (Number(row.entryOrder) !== order)
          issue(
            "Wallet Backups",
            index,
            "entryOrder",
            "duplicate or missing entry order",
          );
        if (
          String(row.playerId) !== playerId ||
          (row.backedUpAt instanceof Date
            ? row.backedUpAt.toISOString()
            : String(row.backedUpAt)) !== at
        )
          issue(
            "Wallet Backups",
            index,
            "backedUpAt",
            "rows belong to inconsistent backup snapshots",
          );
        try {
          const data = JSON.parse(String(row.payloadJson || ""));
          if (key === "recurringExpenses" && data.startDate)
            data.startDate = calendarDate(data.startDate);
          payload[key].push(data);
        } catch {
          issue(
            "Wallet Backups",
            index,
            "payloadJson",
            "invalid backup JSON or date",
          );
        }
      });
    }
    for (const item of group)
      if (!["meta", "transaction", "recurring"].includes(item.row.entryType))
        issue(
          "Wallet Backups",
          item.index,
          "entryType",
          "unknown backup row type",
        );
    try {
      validateWalletBackupFields(
        payload.transactions,
        payload.recurringExpenses,
        characterId,
      );
    } catch (error) {
      if (!(error instanceof RecordFieldError)) throw error;
      const entryType =
        error.collection === "transactions" ? "transaction" : "recurring";
      const sourceRows = group
        .filter((item) => item.row.entryType === entryType)
        .sort((a, b) => Number(a.row.entryOrder) - Number(b.row.entryOrder));
      const sourceRow = error.recordIndex
        ? sourceRows[error.recordIndex - 1]?.index
        : undefined;
      issue(
        "Wallet Backups",
        sourceRow ?? meta.index,
        error.path,
        `expected ${error.expected}; received ${error.received}`,
      );
    }
    const json = canonicalJSON(payload);
    const hash = createHash("sha256").update(json).digest("base64url") + "=";
    sourceLocation = {
      sheet: "Wallet Backups",
      row: meta.index,
      field: "payloadJson",
    };
    const statement = insert(
      "wallet_backups",
      [
        "id",
        "character_id",
        "player_id",
        "mutation_id",
        "payload_hash",
        "backed_up_at",
        "data",
      ],
      [
        "sheet:" + String(meta.row.backupRowId),
        characterId,
        playerId,
        null,
        hash,
        at,
        json,
      ],
    );
    statements.push(statement);
  }
  const settingKeys = new Set();
  for (const [index, row] of (sheets.Settings || []).entries()) {
    if (!["campaignName", "coinWeightPerPound"].includes(row.key)) continue;
    sourceLocation = { sheet: "Settings", row: index + 2, field: "value" };
    if (settingKeys.has(row.key))
      issue("Settings", index + 2, "key", "duplicate setting key");
    settingKeys.add(row.key);
    statements.push(insert("settings", ["key", "value"], [row.key, row.value]));
  }
  // Preserve the source archive, applying the same SQL limits as live records.
  for (const [sheet, rows] of Object.entries(sheets)) {
    if (sheet === "Sessions") continue;
    rows.forEach((row, index) => {
      sourceLocation = { sheet, row: index + 2, field: "archive" };
      statements.push(
        insert(
          "migration_archive",
          ["sheet", "row_number", "data"],
          [sheet, index + 2, JSON.stringify(row)],
        ),
      );
    });
  }
  // Order parents before children regardless of workbook tab order.
  statements.sort((a, b) => {
    const rank = (statement) =>
      [
        "players",
        "characters",
        "territories",
        "records",
        "revisions",
        "wallet_backups",
        "settings",
        "migration_archive",
      ].findIndex((table) => statement.startsWith(`INSERT INTO ${table} `));
    return rank(a) - rank(b);
  });
  return {
    errors,
    counts,
    sql: errors.length ? null : statements.join("\n") + "\n",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2),
    outputIndex = args.indexOf("--output");
  const path = args[0];
  if (!path)
    throw Error(
      "Usage: npm run d1:import -- workbook.xlsx [--output migration-output/import.sql]",
    );
  const result = convertWorkbook(readWorkbook(path));
  console.log(
    JSON.stringify({ counts: result.counts, errors: result.errors }, null, 2),
  );
  if (result.errors.length) process.exitCode = 1;
  else if (outputIndex >= 0) {
    if (!args[outputIndex + 1]) throw Error("Missing output path.");
    writeFileSync(args[outputIndex + 1], result.sql, {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      "Validated SQL written. It contains account hashes and campaign data; keep it private.",
    );
  } else console.log("Validation passed. No files or database were changed.");
}
