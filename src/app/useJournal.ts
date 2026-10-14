import { getDraftScope } from "../google-sheets-api";
import type { AppModal } from "./core";
import {
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  saveCachedSheetData,
  loadCachedSheetData,
  loadJournalData,
  saveJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  type SheetCharacter,
  type SheetBootstrap,
  type SheetJournalEntry,
} from "../google-sheets-api";
import {
  AppError,
  errorMessage,
  definitelyNotApplied,
  type SyncProgress,
} from "./errors";
import {
  loadJournalDraft,
  saveJournalDraft,
  clearJournalDraft,
  acknowledgeJournalOperation,
  type JournalOperation,
} from "./journalStorage";
type JournalContext = {
  cacheBaseRef: RefObject<SheetBootstrap | null>;
  selectedCharacter: SheetCharacter | undefined;
  selectedCharacterIdRef: RefObject<string>;
  setModal: Dispatch<SetStateAction<AppModal>>;
};
export function useJournal(getContext: () => JournalContext) {
  const [journalEntries, setJournalEntries] = useState<SheetJournalEntry[]>([]);
  const [editingJournalEntry, setEditingJournalEntry] =
    useState<SheetJournalEntry | null>(null);
  const [journalDraftDirty, setJournalDraftDirty] = useState(false);
  const [journalSyncing, setJournalSyncing] = useState(false);
  const [journalSyncError, setJournalSyncError] = useState("");
  const [journalProgress, setJournalProgress] = useState<SyncProgress | null>(
    null,
  );
  const lock = useRef(new Set<string>());
  function persistJournalCache(nextJournal: SheetJournalEntry[]) {
    const { cacheBaseRef } = getContext();
    const base = cacheBaseRef.current;
    if (!base) return;
    const next = { ...base, journal: nextJournal };
    cacheBaseRef.current = next;
    saveCachedSheetData(next);
  }
  function queue(
    operation: JournalOperation,
    entries: SheetJournalEntry[],
    characterId: string,
  ) {
    const previous = loadJournalDraft(characterId);
    saveJournalDraft({
      characterId,
      entries,
      baseEntries: previous?.baseEntries || journalEntries,
      operations: [...(previous?.operations || []), operation],
      uncertain: previous?.uncertain,
      updatedAt: new Date().toISOString(),
    });
    setJournalEntries(entries);
    setJournalDraftDirty(true);
    setJournalSyncError("");
    persistJournalCache(entries);
  }
  async function saveCampaignJournalEntry(input: {
    title: string;
    tags: string[];
    notes: string;
  }) {
    const { selectedCharacter, setModal } = getContext();
    if (!selectedCharacter) return;
    const now = new Date().toISOString();
    const entry: SheetJournalEntry = {
      ...(editingJournalEntry || {
        entryId: `local-${crypto.randomUUID()}`,
        characterId: selectedCharacter.characterId,
        playerId: selectedCharacter.playerId,
        createdAt: now,
      }),
      title: input.title,
      category: input.tags.join(", "),
      notes: input.notes,
      updatedAt: now,
      syncPending: true,
    };
    const entries = editingJournalEntry
      ? journalEntries.map((row) =>
          row.entryId === entry.entryId ? entry : row,
        )
      : [entry, ...journalEntries];
    queue(
      {
        id: crypto.randomUUID(),
        kind: editingJournalEntry ? "update" : "create",
        entryId: entry.entryId,
        entry,
      },
      entries,
      selectedCharacter.characterId,
    );
    setEditingJournalEntry(null);
    setModal(null);
  }
  async function removeCampaignJournalEntry() {
    const { selectedCharacter, setModal } = getContext();
    if (!selectedCharacter || !editingJournalEntry) return;
    queue(
      {
        id: crypto.randomUUID(),
        kind: "delete",
        entryId: editingJournalEntry.entryId,
      },
      journalEntries.filter(
        (row) => row.entryId !== editingJournalEntry.entryId,
      ),
      selectedCharacter.characterId,
    );
    setEditingJournalEntry(null);
    setModal(null);
  }
  async function syncJournalToCampaign() {
    const { selectedCharacter, selectedCharacterIdRef } = getContext();
    if (!selectedCharacter) return;
    const id = selectedCharacter.characterId;
    if (lock.current.has(id))
      throw new AppError("conflict", "The journal is already syncing.");
    const scope = getDraftScope();
    const assertScope = () => {
      if (getDraftScope() !== scope)
        throw new AppError(
          "uncertain",
          "The account changed during synchronization. The original account’s journal draft is preserved for review.",
        );
    };
    const initial = loadJournalDraft(id);
    if (!initial?.operations.length) return;
    lock.current.add(id);
    setJournalSyncing(true);
    setJournalSyncError("");
    const active = () => selectedCharacterIdRef.current === id;
    try {
      const data = await loadJournalData(id);
      assertScope();
      const remote = new Map(data.journal.map((row) => [row.entryId, row]));
      let latest = loadJournalDraft(id)!;
      for (const uncertain of latest.uncertain || []) {
        const operation = latest.operations.find((row) => row.id === uncertain);
        const entry = data.journal.find(
          (row) => row.clientMutationId === uncertain,
        );
        if (!operation || !entry)
          throw new AppError(
            "uncertain",
            "A journal creation has an unconfirmed result. Your notes are preserved. Check the campaign copy before refreshing; this entry will not be created again automatically.",
          );
        latest = acknowledgeJournalOperation(id, operation, entry);
      }
      const snapshot = [...latest.operations];
      let completed = 0;
      for (const original of snapshot) {
        assertScope();
        latest = loadJournalDraft(id)!;
        const operation = latest.operations.find(
          (row) => row.id === original.id,
        );
        if (!operation) continue;
        if (active())
          setJournalProgress({
            completed,
            total: snapshot.length,
            label: `Saving journal changes ${completed} of ${snapshot.length}`,
          });
        const baseline = latest.baseEntries.find(
          (row) => row.entryId === operation.entryId,
        );
        const server = remote.get(operation.entryId);
        if (
          operation.kind !== "create" &&
          baseline &&
          ((server &&
            (server.updatedAt !== baseline.updatedAt ||
              server.notes !== baseline.notes ||
              server.title !== baseline.title)) ||
            (!server && operation.kind === "update"))
        )
          throw new AppError(
            "conflict",
            "This journal entry changed in the campaign. Your notes are preserved. Review the campaign copy before replacing them.",
          );
        let response: SheetJournalEntry | undefined;
        if (operation.kind === "delete") {
          if (!operation.entryId.startsWith("local-") && server)
            await deleteJournalEntry({
              characterId: id,
              entryId: operation.entryId,
            });
          remote.delete(operation.entryId);
        } else if (operation.entry) {
          const input = {
            characterId: id,
            title: operation.entry.title,
            tags: operation.entry.category
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            notes: operation.entry.notes,
          };
          if (operation.kind === "create") {
            saveJournalDraft({
              ...latest,
              uncertain: [...(latest.uncertain || []), operation.id],
            });
            try {
              response = await saveJournalEntry({
                ...input,
                clientMutationId: operation.id,
              });
            } catch (reason) {
              if (getDraftScope() === scope && definitelyNotApplied(reason)) {
                const pending = loadJournalDraft(id)!;
                saveJournalDraft({
                  ...pending,
                  uncertain: pending.uncertain?.filter(
                    (value) => value !== operation.id,
                  ),
                });
              }
              throw reason;
            }
          } else
            response = await updateJournalEntry({
              ...input,
              entryId: operation.entryId,
            });
          remote.set(response.entryId, response);
        }
        assertScope();
        latest = acknowledgeJournalOperation(id, operation, response);
        completed++;
        if (active()) {
          setJournalEntries(latest.entries);
          setJournalDraftDirty(latest.operations.length > 0);
          setJournalProgress({
            completed,
            total: snapshot.length,
            label: `Saved journal changes ${completed} of ${snapshot.length}`,
          });
        }
      }
      latest = loadJournalDraft(id)!;
      if (!latest.operations.length) clearJournalDraft(id);
      const cache = loadCachedSheetData(id);
      if (cache)
        saveCachedSheetData({ ...cache, journal: latest.entries }, active());
      if (active()) persistJournalCache(latest.entries);
    } catch (reason) {
      if (active()) setJournalSyncError(errorMessage(reason));
      throw reason;
    } finally {
      lock.current.delete(id);
      setJournalSyncing(false);
    }
  }
  return {
    journalDraftDirty,
    setJournalDraftDirty,
    journalSyncing,
    journalSyncError,
    journalProgress,
    syncJournalToCampaign,
    persistJournalCache,
    saveCampaignJournalEntry,
    removeCampaignJournalEntry,
    journalEntries,
    setJournalEntries,
    editingJournalEntry,
    setEditingJournalEntry,
  };
}
