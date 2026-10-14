import type { AppModal } from "./core";

import { useState } from "react";
import {
  saveCachedSheetData,
  saveJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  type SheetCharacter,
  type SheetBootstrap,
  type SheetJournalEntry,
} from "../google-sheets-api";

import type { Dispatch, SetStateAction, RefObject } from "react";

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

  function persistJournalCache(nextJournal: SheetJournalEntry[]) {
    const { cacheBaseRef } = getContext();

    const base = cacheBaseRef.current;
    if (!base) return;
    const updatedBase: SheetBootstrap = {
      ...base,
      journal: nextJournal,
    };
    cacheBaseRef.current = updatedBase;
    saveCachedSheetData(updatedBase);
  }

  async function saveCampaignJournalEntry(input: {
    title: string;
    tags: string[];
    notes: string;
  }) {
    const { selectedCharacter, setModal, selectedCharacterIdRef } =
      getContext();

    if (!selectedCharacter) return;
    const entry = editingJournalEntry
      ? await updateJournalEntry({
          entryId: editingJournalEntry.entryId,
          characterId: selectedCharacter.characterId,
          ...input,
        })
      : await saveJournalEntry({
          characterId: selectedCharacter.characterId,
          ...input,
        });

    if (selectedCharacterIdRef.current !== selectedCharacter.characterId)
      return;
    setJournalEntries((current) => {
      const next = editingJournalEntry
        ? current.map((item) => (item.entryId === entry.entryId ? entry : item))
        : [entry, ...current];
      persistJournalCache(next);
      return next;
    });
    setEditingJournalEntry(null);
    setModal(null);
  }

  async function removeCampaignJournalEntry() {
    const { selectedCharacter, setModal, selectedCharacterIdRef } =
      getContext();

    if (!selectedCharacter || !editingJournalEntry) return;
    await deleteJournalEntry({
      entryId: editingJournalEntry.entryId,
      characterId: selectedCharacter.characterId,
    });
    if (selectedCharacterIdRef.current !== selectedCharacter.characterId)
      return;
    setJournalEntries((current) => {
      const next = current.filter(
        (item) => item.entryId !== editingJournalEntry.entryId,
      );
      persistJournalCache(next);
      return next;
    });
    setEditingJournalEntry(null);
    setModal(null);
  }
  return {
    persistJournalCache,
    saveCampaignJournalEntry,
    removeCampaignJournalEntry,
    journalEntries,
    setJournalEntries,
    editingJournalEntry,
    setEditingJournalEntry,
  };
}
