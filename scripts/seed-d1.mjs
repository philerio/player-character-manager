import { mkdirSync, writeFileSync } from "node:fs";
import { convertWorkbook } from "./import-workbook.mjs";
import { fixtureSheets } from "./d1-fixture.mjs";
const result = convertWorkbook(fixtureSheets());
if (result.errors.length) throw Error(result.errors.join("\n"));
mkdirSync("migration-output", { recursive: true });
writeFileSync("migration-output/local-seed.sql", result.sql, {
  flag: "wx",
  mode: 0o600,
});
console.log(
  "Synthetic local seed written. Accounts: dm/player/other@example.test; password: local-test-password.",
);
