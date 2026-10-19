import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { validateWalletBackupFields } from "../../shared/records.mjs";
// @ts-expect-error The workbook importer is a Node CLI module.
import { convertWorkbook } from "../../scripts/import-workbook.mjs";
// @ts-expect-error Synthetic workbook fixture shared with the CLI.
import { fixtureSheets } from "../../scripts/d1-fixture.mjs";
function sheetsWithBackup() {
  const sheets = fixtureSheets();
  const meta = {
    backupRowId: "snapshot",
    characterId: "player-character",
    playerId: "player",
    entryType: "meta",
    entryOrder: 0,
    backedUpAt: "2026-10-14T12:00:00.000Z",
    payloadJson: "",
  };
  const transaction = {
    id: -123,
    transactionId: "local-123",
    label: "Coins ' quoted",
    kind: "income",
    coins: { pp: 0, gp: 15, sp: 0, cp: 0 },
    timestamp: "Oct 14, 2026",
  };
  const schedule = {
    scheduleId: "monthly",
    characterId: "player-character",
    label: "Monthly",
    pp: 0,
    gp: 1,
    sp: 0,
    cp: 0,
    frequency: "monthly",
    startDate: "2027-01-02T00:00:00.000Z",
    occurrenceCount: 0,
    active: true,
  };
  sheets["Wallet Backups"] = [
    meta,
    {
      ...meta,
      backupRowId: "transaction-row",
      entryType: "transaction",
      payloadJson: JSON.stringify(transaction),
    },
    {
      ...meta,
      backupRowId: "schedule-row",
      entryType: "recurring",
      payloadJson: JSON.stringify(schedule),
    },
  ];
  return { sheets, transaction, schedule };
}
it("imports sheet wallet backups as restorable snapshots while preserving original archived rows", () => {
  const { sheets, transaction, schedule } = sheetsWithBackup();
  const original = JSON.stringify(sheets);
  const result = convertWorkbook(sheets);
  expect(result.errors).toEqual([]);
  expect(JSON.stringify(sheets)).toBe(original);
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("worker/migrations")
      .filter((file) => file.endsWith(".sql"))
      .sort())
      db.exec(readFileSync(`worker/migrations/${file}`, "utf8"));
    db.exec(result.sql);
    const row = db.prepare("SELECT * FROM wallet_backups").get()!;
    expect(row.id).toBe("sheet:snapshot");
    expect(row.player_id).toBe("player");
    const payload = JSON.parse(String(row.data));
    expect(payload.transactions).toEqual([transaction]);
    expect(payload.recurringExpenses).toEqual([
      { ...schedule, startDate: "2027-01-02" },
    ]);
    validateWalletBackupFields(
      payload.transactions,
      payload.recurringExpenses,
      "player-character",
    );
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM migration_archive WHERE sheet='Wallet Backups'",
        )
        .get()!.n,
    ).toBe(3);
  } finally {
    db.close();
  }
});
it.each([
  "missing meta",
  "duplicate meta",
  "duplicate row ID",
  "missing row ID",
  "bad order",
  "bad JSON",
  "unknown type",
  "missing owner",
  "missing character",
  "mixed snapshots",
  "invalid field",
  "oversized",
])("blocks an incomplete or invalid workbook backup: %s", (failure) => {
  const { sheets } = sheetsWithBackup();
  const rows = sheets["Wallet Backups"];
  if (failure === "missing meta") rows.splice(0, 1);
  if (failure === "duplicate meta")
    rows.push({ ...rows[0], backupRowId: "duplicate-meta" });
  if (failure === "duplicate row ID") rows[1].backupRowId = rows[0].backupRowId;
  if (failure === "missing row ID") rows[0].backupRowId = "";
  if (failure === "bad order") rows[1].entryOrder = 1;
  if (failure === "bad JSON") rows[1].payloadJson = "{INVALID_PRIVATE_JSON";
  if (failure === "unknown type") rows[1].entryType = "unknown";
  if (failure === "missing owner") rows[0].playerId = "unknown";
  if (failure === "missing character")
    rows.forEach((row: any) => (row.characterId = "missing"));
  if (failure === "mixed snapshots")
    rows[1].backedUpAt = "2026-10-15T00:00:00Z";
  if (failure === "invalid field")
    rows[1].payloadJson = JSON.stringify({
      id: 1,
      label: "PRIVATE",
      kind: "invalid",
      coins: { pp: 0, gp: 1, sp: 0, cp: 0 },
    });
  if (failure === "oversized")
    rows[1].payloadJson = JSON.stringify({
      ...JSON.parse(rows[1].payloadJson),
      note: "x".repeat(100000),
    });
  const converted = convertWorkbook(sheets);
  expect(converted.sql).toBeNull();
  if (failure === "invalid field")
    expect(converted.errors.join("\n")).toContain(
      "Wallet Backups, row 3, transactions[0].kind:",
    );
  expect(
    converted.errors.some((error: string) => error.includes("Wallet Backups")),
  ).toBe(true);
  expect(JSON.stringify(converted.errors)).not.toMatch(
    /INVALID_PRIVATE_JSON|"PRIVATE"/,
  );
});

it("validates SQL byte limits for live records and archived rows, including multibyte text", () => {
  const sheets = fixtureSheets();
  sheets.Journal = [
    {
      entryId: "large",
      characterId: "player-character",
      playerId: "player",
      title: "Journal",
      category: "",
      notes: "界".repeat(40000),
      createdAt: "2026-10-14",
      updatedAt: "2026-10-14",
    },
  ];
  sheets["Extra Source"] = [{ privateNote: "x".repeat(100000) }];
  const result = convertWorkbook(sheets);
  expect(result.sql).toBeNull();
  expect(result.errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Journal, row 2, row: generated SQL exceeds"),
      expect.stringContaining("Journal, row 2, archive: generated SQL exceeds"),
      expect.stringContaining(
        "Extra Source, row 2, archive: generated SQL exceeds",
      ),
    ]),
  );
  expect(JSON.stringify(result.errors)).not.toContain("界");
});
it("rejects duplicate settings with their source row before producing any SQL", () => {
  const sheets = fixtureSheets();
  sheets.Settings.push({ key: "campaignName", value: "Other campaign" });
  const result = convertWorkbook(sheets);
  expect(result.sql).toBeNull();
  expect(result.errors).toContain(
    "Settings, row 3, key: duplicate setting key",
  );
});
