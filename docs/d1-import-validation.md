# Workbook import validation

## Latest production export: Player Character Manager20261019.xlsx

Use the new private SQL file `migration-output/d1-production-import-20261019.sql` for the fresh production database. It was generated from `playerData/Player Character Manager20261019.xlsx`, not the older export below. The cleaned import copy is `playerData/Player Character Manager20261019 - D1 import.xlsx`. The original fresh export remains unchanged.

The latest workbook has the same 46 orphan rows referring to the same nine missing character IDs as the previous cleanup: 19 recurring expenses and 27 wallet transactions. None match a character after ignoring case, whitespace and punctuation; the nearest valid IDs require 23–26 single-character edits. No character ownership was inferred or reassigned. The cleaned copy excludes those rows, with their full values and original Excel row locations preserved privately in `migration-output/workbook-cleanup-20261019-latest.json`.

All retained row values were compared with the fresh source after writing and reopening the cleaned workbook. Validation passes with zero errors. The generated SQL was imported into a disposable SQLite database with all six migrations, including D1 file storage; integrity and foreign-key checks passed. Live counts were verified:

| Data                | Imported rows |
| ------------------- | ------------: |
| Players             |             5 |
| Characters          |            12 |
| Territories         |             5 |
| Territory hexes     |           305 |
| Scouting missions   |           155 |
| Recruitment offers  |            40 |
| Retainers           |            19 |
| Wallet transactions |           136 |
| Recurring expenses  |            30 |
| Journal entries     |             2 |
| Wallet snapshots    |             1 |

The two source Wallet Backups rows form one complete snapshot. The 22 source sessions are intentionally excluded; users sign in again. All 721 retained non-session source rows are also preserved in the private migration archive. Account recovery hashes remain included in private account data. Source/workbook/SQL hashes and the validation results are saved in `migration-output/d1-production-import-20261019-validation.json`.

Import from the repository root, only after checking that `DB` targets the intended **empty** database:

```bash
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file migration-output/d1-production-import-20261019.sql
```

Do not run the local test seed or import this over a populated campaign. No hosted database or Google Sheet was modified while preparing these files. The workbook, SQL, validation results and recovery archive remain gitignored; generated files have owner-only permissions.

## Earlier import copy: 2026-10-19

Use `playerData/Player Character Manager - D1 import.xlsx` for the D1 import. The original `playerData/Player Character Manager.xlsx` is unchanged.

The original's 46 orphan records refer to nine character IDs absent from all 12 character records. Comparing IDs after ignoring whitespace, case and punctuation found no match; the nearest existing IDs still require 23–26 single-character edits. No other workbook fields reference those missing IDs. There is no evidence of a simple typo, so no records were reassigned and no character ownership was inferred.

At the user's request, the import copy excludes 19 recurring expenses and 27 wallet transactions for those missing IDs. All remaining data rows were verified unchanged after writing and reopening the workbook. Removed records, their original sheet/row locations and file hashes are retained privately in `migration-output/workbook-cleanup-2026-10-19.json`.

Validation passes with zero errors. Importing the generated SQL into a disposable in-memory SQLite database with all three migrations also passes foreign-key and integrity checks. The copy retains all 12 characters, 30 recurring expenses and 136 wallet transactions. Updated SQL for a fresh empty destination is available privately at `migration-output/d1-import-2026-10-19-v2.sql` (including live recruitment offers and private account recovery hashes). Existing imported databases should apply schema migrations 0004/0005 instead of reimporting; no local working database, hosted database or Google Sheet was modified.

```bash
npm run d1:import -- "playerData/Player Character Manager - D1 import.xlsx"
```

Both the cleaned workbook and recovery archive remain gitignored. Treat the workbook and SQL as private campaign data.

## Original workbook: 2026-10-14

The following historical report describes the unchanged original export. Its SQL generation remains blocked by 46 missing-character references; use the cleaned copy above for import.

| Sheet                 | Rows |
| --------------------- | ---: |
| Players               |    5 |
| Wallet Backups        |    2 |
| Tab Sync Revisions    |    7 |
| Custom Missions       |    0 |
| Territory Recruitment |   40 |
| Scouting Missions     |  155 |
| Territory Hexes       |  305 |
| Recurring Expenses    |   49 |
| Sessions              |   20 |
| Characters            |   12 |
| Wallet Transactions   |  163 |
| Territories           |    5 |
| Retainers             |   19 |
| Journal               |    2 |
| Uploads               |    0 |
| Settings              |    3 |

## Issues

Row numbers include the header row. This report contains locations and reasons, without account hashes, emails, or ledger values.

- Recurring Expenses, row 2, characterId: character does not exist
- Recurring Expenses, row 3, characterId: character does not exist
- Recurring Expenses, row 4, characterId: character does not exist
- Recurring Expenses, row 5, characterId: character does not exist
- Recurring Expenses, row 6, characterId: character does not exist
- Recurring Expenses, row 7, characterId: character does not exist
- Recurring Expenses, row 31, characterId: character does not exist
- Recurring Expenses, row 32, characterId: character does not exist
- Recurring Expenses, row 33, characterId: character does not exist
- Recurring Expenses, row 34, characterId: character does not exist
- Recurring Expenses, row 35, characterId: character does not exist
- Recurring Expenses, row 36, characterId: character does not exist
- Recurring Expenses, row 37, characterId: character does not exist
- Recurring Expenses, row 38, characterId: character does not exist
- Recurring Expenses, row 39, characterId: character does not exist
- Recurring Expenses, row 40, characterId: character does not exist
- Recurring Expenses, row 41, characterId: character does not exist
- Recurring Expenses, row 42, characterId: character does not exist
- Recurring Expenses, row 43, characterId: character does not exist
- Wallet Transactions, row 5, characterId: character does not exist
- Wallet Transactions, row 74, characterId: character does not exist
- Wallet Transactions, row 75, characterId: character does not exist
- Wallet Transactions, row 76, characterId: character does not exist
- Wallet Transactions, row 77, characterId: character does not exist
- Wallet Transactions, row 78, characterId: character does not exist
- Wallet Transactions, row 79, characterId: character does not exist
- Wallet Transactions, row 80, characterId: character does not exist
- Wallet Transactions, row 81, characterId: character does not exist
- Wallet Transactions, row 82, characterId: character does not exist
- Wallet Transactions, row 83, characterId: character does not exist
- Wallet Transactions, row 84, characterId: character does not exist
- Wallet Transactions, row 85, characterId: character does not exist
- Wallet Transactions, row 86, characterId: character does not exist
- Wallet Transactions, row 87, characterId: character does not exist
- Wallet Transactions, row 88, characterId: character does not exist
- Wallet Transactions, row 89, characterId: character does not exist
- Wallet Transactions, row 90, characterId: character does not exist
- Wallet Transactions, row 91, characterId: character does not exist
- Wallet Transactions, row 95, characterId: character does not exist
- Wallet Transactions, row 96, characterId: character does not exist
- Wallet Transactions, row 100, characterId: character does not exist
- Wallet Transactions, row 140, characterId: character does not exist
- Wallet Transactions, row 141, characterId: character does not exist
- Wallet Transactions, row 142, characterId: character does not exist
- Wallet Transactions, row 143, characterId: character does not exist
- Wallet Transactions, row 144, characterId: character does not exist

This original-workbook issue list is retained for comparison with the recovery archive. It is a snapshot report, not a live diagnosis.
