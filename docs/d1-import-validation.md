# Workbook import validation

## Cleaned import copy: 2026-10-19

Use `playerData/Player Character Manager - D1 import.xlsx` for the D1 import. The original `playerData/Player Character Manager.xlsx` is unchanged.

The original's 46 orphan records refer to nine character IDs absent from all 12 character records. Comparing IDs after ignoring whitespace, case and punctuation found no match; the nearest existing IDs still require 23–26 single-character edits. No other workbook fields reference those missing IDs. There is no evidence of a simple typo, so no records were reassigned and no character ownership was inferred.

At the user's request, the import copy excludes 19 recurring expenses and 27 wallet transactions for those missing IDs. All remaining data rows were verified unchanged after writing and reopening the workbook. Removed records, their original sheet/row locations and file hashes are retained privately in `migration-output/workbook-cleanup-2026-10-19.json`.

Validation passes with zero errors. Importing the generated SQL into a disposable in-memory SQLite database with all three migrations also passes foreign-key and integrity checks. The copy retains all 12 characters, 30 recurring expenses and 136 wallet transactions. SQL is available privately at `migration-output/d1-import-2026-10-19.sql`; no local working database, hosted database or Google Sheet was modified.

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
