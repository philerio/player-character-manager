export class RecordFieldError extends Error {
  path: string;
  expected: string;
  received: string;
  collection?: string;
  recordIndex?: number;
  recordId?: string;
  constructor(path: string, expected: string, value: unknown);
}
export function validateRecordFields(
  name: string,
  row: Record<string, unknown>,
  rowPath?: string,
): void;
export function validateWalletBackupFields(
  transactions: unknown,
  schedules: unknown,
  characterId: string,
): void;
export function canonicalJSON(value: unknown): string;
