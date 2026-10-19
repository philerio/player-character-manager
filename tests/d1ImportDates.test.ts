import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { recurringOccurrenceDate } from "../src/app/wallet";
import { validateResponse } from "../src/app/validation";
// @ts-expect-error The workbook importer is a Node CLI module.
import { convertWorkbook } from "../scripts/import-workbook.mjs";
// @ts-expect-error Synthetic workbook fixture shared with the CLI.
import { fixtureSheets } from "../scripts/d1-fixture.mjs";
it("loads Excel recurring dates through SQLite into the real frontend recurrence engine", () => {
  const sheets = fixtureSheets();
  sheets["Recurring Expenses"] = [
    {
      scheduleId: "excel-date",
      characterId: "player-character",
      label: "Monthly",
      pp: 0,
      gp: 1,
      sp: 0,
      cp: 0,
      frequency: "monthly",
      startDate: new Date("2026-01-02T00:00:00Z"),
      occurrenceCount: 0,
      active: true,
    },
  ];
  const converted = convertWorkbook(sheets);
  expect(converted.errors).toEqual([]);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync("worker/migrations/0001_initial.sql", "utf8"));
    db.exec(converted.sql);
    const schedule = JSON.parse(
      String(
        db.prepare("SELECT data FROM records WHERE kind='recurring'").get()!
          .data,
      ),
    );
    validateResponse(
      "wallet",
      {
        ok: true,
        characterId: "player-character",
        balance: { pp: 0, gp: 0, sp: 0, cp: 0 },
        transactions: [],
        recurringExpenses: [schedule],
      },
      "player-character",
    );
    expect(
      recurringOccurrenceDate(
        schedule.startDate,
        schedule.frequency,
        0,
      )?.toISOString(),
    ).toBe("2026-01-02T12:00:00.000Z");
    expect(
      recurringOccurrenceDate(
        schedule.startDate,
        schedule.frequency,
        1,
      )?.toISOString(),
    ).toBe("2026-02-02T12:00:00.000Z");
  } finally {
    db.close();
  }
});
