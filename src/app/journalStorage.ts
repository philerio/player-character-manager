import { getDraftScope, type SheetJournalEntry } from "../google-sheets-api";
import { appStorage } from "./storage";
export type JournalOperation = {
  id: string;
  kind: "create" | "update" | "delete";
  entryId: string;
  entry?: SheetJournalEntry;
};
export type JournalDraft = {
  characterId: string;
  entries: SheetJournalEntry[];
  baseEntries: SheetJournalEntry[];
  operations: JournalOperation[];
  uncertain?: string[];
  updatedAt: string;
};
const key = (id: string) => `pcm-journal-draft:${getDraftScope()}:${id}`;
export function loadJournalDraft(id: string): JournalDraft | null {
  try {
    const raw = appStorage.getItem(key(id));
    if (!raw) return null;
    const data = JSON.parse(raw) as JournalDraft;
    return data.characterId === id &&
      Array.isArray(data.entries) &&
      Array.isArray(data.baseEntries) &&
      Array.isArray(data.operations)
      ? data
      : null;
  } catch {
    return null;
  }
}
export function saveJournalDraft(data: JournalDraft) {
  appStorage.setItem(key(data.characterId), JSON.stringify(data));
}
export function clearJournalDraft(id: string) {
  appStorage.removeItem(key(id));
}
export function acknowledgeJournalOperation(
  id: string,
  sent: JournalOperation,
  remote?: SheetJournalEntry,
) {
  const latest = loadJournalDraft(id);
  if (!latest)
    throw new Error(
      "The journal working copy disappeared during synchronization.",
    );
  const newId = remote?.entryId || sent.entryId;
  const operations = latest.operations
    .filter((row) => row.id !== sent.id)
    .map((row) =>
      row.entryId === sent.entryId
        ? {
            ...row,
            entryId: newId,
            kind: row.kind === "create" ? ("update" as const) : row.kind,
            entry: row.entry ? { ...row.entry, entryId: newId } : undefined,
          }
        : row,
    );
  const pending = operations.some((row) => row.entryId === newId);
  const entries = latest.entries.map((row) =>
    row.entryId === sent.entryId && remote
      ? { ...(pending ? row : remote), entryId: newId, syncPending: pending }
      : row,
  );
  const baseEntries = latest.baseEntries.filter(
    (row) => row.entryId !== sent.entryId && row.entryId !== newId,
  );
  if (remote) baseEntries.push(remote);
  const next = {
    ...latest,
    entries,
    baseEntries,
    operations,
    uncertain: latest.uncertain?.filter((value) => value !== sent.id),
    updatedAt: new Date().toISOString(),
  };
  saveJournalDraft(next);
  return next;
}
