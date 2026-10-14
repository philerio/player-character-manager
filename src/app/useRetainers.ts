import type { AppModal } from "./core";

import { useState } from "react";
import {
  loadRetainerData,
  saveRetainer,
  updateRetainer,
  deleteRetainer,
  type SheetCharacter,
  type SheetRecurringExpense,
  type SheetRetainer,
  type FightingForceGroup,
} from "../google-sheets-api";
import { type CoinType } from "./core";
import {
  loadRetainerDraft,
  saveRetainerDraft,
  clearRetainerDraft,
  retainerChanged,
  retainerMutationInput,
} from "./retainerStorage";

import type { Dispatch, SetStateAction, RefObject } from "react";

type RetainersContext = {
  selectedCharacter: SheetCharacter | undefined;
  setModal: Dispatch<SetStateAction<AppModal>>;
  setRecurringExpenses: Dispatch<SetStateAction<SheetRecurringExpense[]>>;
  selectedCharacterIdRef: RefObject<string>;
};

export function useRetainers(getContext: () => RetainersContext) {
  const [retainers, setRetainers] = useState<SheetRetainer[]>([]);
  const [retainerDraftDirty, setRetainerDraftDirty] = useState(false);
  const [retainerSyncing, setRetainerSyncing] = useState(false);
  const [retainerSyncError, setRetainerSyncError] = useState("");
  const [retainerLastSyncedAt, setRetainerLastSyncedAt] = useState("");
  const [editingRetainer, setEditingRetainer] = useState<SheetRetainer | null>(
    null,
  );
  const [retainerKind, setRetainerKind] = useState<"individual" | "force">(
    "individual",
  );

  function persistLocalRetainers(
    characterId: string,
    nextRetainers: SheetRetainer[],
  ) {
    const existingDraft = loadRetainerDraft(characterId);
    const baseRetainers = existingDraft?.baseRetainers || retainers;
    saveRetainerDraft({
      characterId,
      baseRetainers,
      retainers: nextRetainers,
      updatedAt: new Date().toISOString(),
    });
    setRetainers(nextRetainers);
    setRetainerDraftDirty(true);
    setRetainerSyncError("");
  }

  async function saveRetainerRecord(input: {
    type: "individual" | "force";
    name: string;
    role: string;
    level?: number | "";
    amount: number;
    costCoin: CoinType;
    wageFrequency: "weekly" | "monthly" | "annually";
    hiringDate?: string;
    men?: number | "";
    roster?: FightingForceGroup[];
    clericFightingForce?: boolean;
  }) {
    const { selectedCharacter, setModal } = getContext();

    if (!selectedCharacter) return;
    const characterId = selectedCharacter.characterId;
    const now = new Date().toISOString();

    const nextRetainer: SheetRetainer = editingRetainer
      ? {
          ...editingRetainer,
          characterId,
          type: input.type,
          name: input.name,
          role: input.role,
          level: input.level,
          wageGp: input.amount,
          costCoin: input.costCoin,
          wageFrequency: input.wageFrequency,
          hiringDate: input.hiringDate,
          men: input.men,
          roster: input.roster,
          clericFightingForce:
            input.type === "force"
              ? Boolean(input.clericFightingForce)
              : undefined,
          updatedAt: now,
        }
      : {
          retainerId: `local-${crypto.randomUUID()}`,
          characterId,
          type: input.type,
          name: input.name,
          role: input.role,
          level: input.level,
          wageGp: input.amount,
          costCoin: input.costCoin,
          wageFrequency: input.wageFrequency,
          hiringDate: input.hiringDate,
          men: input.men,
          roster: input.roster,
          clericFightingForce:
            input.type === "force"
              ? Boolean(input.clericFightingForce)
              : undefined,
          status: "",
          createdAt: now,
          updatedAt: now,
          scheduleId: "",
        };

    const nextRetainers = editingRetainer
      ? retainers.map((item) =>
          item.retainerId === editingRetainer.retainerId ? nextRetainer : item,
        )
      : [nextRetainer, ...retainers];

    persistLocalRetainers(characterId, nextRetainers);
    setEditingRetainer(null);
    setModal(null);
  }

  async function removeRetainerRecord(retainer: SheetRetainer) {
    const { selectedCharacter } = getContext();

    if (!selectedCharacter) return;
    persistLocalRetainers(
      selectedCharacter.characterId,
      retainers.filter((item) => item.retainerId !== retainer.retainerId),
    );
  }

  async function syncRetainersToCampaign(forceOverwrite = false) {
    const { selectedCharacter, setRecurringExpenses, selectedCharacterIdRef } =
      getContext();

    if (!selectedCharacter || retainerSyncing) return;
    const characterId = selectedCharacter.characterId;
    const draft =
      loadRetainerDraft(characterId) ||
      (forceOverwrite
        ? {
            characterId,
            baseRetainers: [],
            retainers,
            updatedAt: new Date().toISOString(),
          }
        : null);
    if (!draft) {
      setRetainerDraftDirty(false);
      return;
    }

    setRetainerSyncing(true);
    setRetainerSyncError("");
    try {
      // Check for another-device edits using the lightweight Retainers-only
      // endpoint. Do not load/process Territories or scouting just to sync a
      // fighting force or individual retainer.
      const remote = await loadRetainerData(characterId);
      const remoteById = new Map(
        remote.retainers.map((item) => [item.retainerId, item]),
      );
      const baseById = new Map(
        draft.baseRetainers.map((item) => [item.retainerId, item]),
      );
      const localById = new Map(
        draft.retainers.map((item) => [item.retainerId, item]),
      );

      if (!forceOverwrite) {
        for (const local of draft.retainers) {
          if (local.retainerId.startsWith("local-")) continue;
          const base = baseById.get(local.retainerId);
          const currentRemote = remoteById.get(local.retainerId);
          if (
            base &&
            currentRemote &&
            retainerChanged(local, base) &&
            retainerChanged(currentRemote, base)
          ) {
            throw new Error(
              `${local.name} changed in the campaign after this device loaded it. Refresh Player Data before editing it again.`,
            );
          }
        }

        for (const base of draft.baseRetainers) {
          if (
            !localById.has(base.retainerId) &&
            remoteById.has(base.retainerId)
          ) {
            const currentRemote = remoteById.get(base.retainerId)!;
            if (retainerChanged(currentRemote, base)) {
              throw new Error(
                `${base.name} changed in the campaign after this device loaded it. Refresh Player Data before disbanding/removing it.`,
              );
            }
          }
        }
      }

      const deleteCandidates = forceOverwrite
        ? remote.retainers.filter((item) => !localById.has(item.retainerId))
        : draft.baseRetainers.filter(
            (base) =>
              !localById.has(base.retainerId) &&
              remoteById.has(base.retainerId),
          );

      for (const item of deleteCandidates) {
        await deleteRetainer(characterId, item.retainerId);
        remoteById.delete(item.retainerId);
      }

      const syncedRetainers: SheetRetainer[] = [];
      for (const local of draft.retainers) {
        if (local.retainerId.startsWith("local-")) {
          const result = await saveRetainer({
            characterId,
            ...retainerMutationInput(local),
          });
          syncedRetainers.push(result.retainer);
          if (selectedCharacterIdRef.current === characterId)
            setRecurringExpenses((items) => {
              const withoutLinked = items.filter(
                (item) =>
                  item.sourceType !== "retainer" ||
                  item.sourceId !== result.retainer.retainerId,
              );
              return result.schedule
                ? [result.schedule, ...withoutLinked]
                : withoutLinked;
            });
          continue;
        }

        const base = baseById.get(local.retainerId);
        const currentRemote = remoteById.get(local.retainerId);

        if (
          currentRemote &&
          (forceOverwrite || (base && retainerChanged(local, base)))
        ) {
          const result = await updateRetainer({
            characterId,
            retainerId: local.retainerId,
            ...retainerMutationInput(local),
          });
          syncedRetainers.push(result.retainer);
          if (selectedCharacterIdRef.current === characterId)
            setRecurringExpenses((items) => {
              const withoutLinked = items.filter(
                (item) =>
                  item.sourceType !== "retainer" ||
                  item.sourceId !== result.retainer.retainerId,
              );
              return result.schedule
                ? [result.schedule, ...withoutLinked]
                : withoutLinked;
            });
        } else if (!currentRemote && forceOverwrite) {
          const result = await saveRetainer({
            characterId,
            ...retainerMutationInput(local),
          });
          syncedRetainers.push(result.retainer);
          if (selectedCharacterIdRef.current === characterId)
            setRecurringExpenses((items) => {
              const withoutLinked = items.filter(
                (item) =>
                  item.sourceType !== "retainer" ||
                  item.sourceId !== result.retainer.retainerId,
              );
              return result.schedule
                ? [result.schedule, ...withoutLinked]
                : withoutLinked;
            });
        } else {
          syncedRetainers.push(currentRemote || local);
        }
      }

      clearRetainerDraft(characterId);
      if (selectedCharacterIdRef.current !== characterId) return;
      setRetainers(syncedRetainers);
      setRetainerDraftDirty(false);
      setRetainerLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (selectedCharacterIdRef.current === characterId)
        setRetainerSyncError(
          error instanceof Error ? error.message : "Could not sync retainers.",
        );
      throw error;
    } finally {
      setRetainerSyncing(false);
    }
  }

  async function refreshRetainersFromCampaign() {
    const { selectedCharacter, selectedCharacterIdRef } = getContext();

    if (!selectedCharacter) return;
    const characterId = selectedCharacter.characterId;
    if (
      retainerDraftDirty &&
      !window.confirm(
        "Refresh Player Data will discard the unsynced retainer/fighting-force changes on this device. Continue?",
      )
    )
      return;

    setRetainerSyncing(true);
    setRetainerSyncError("");
    try {
      const data = await loadRetainerData(characterId);
      if (selectedCharacterIdRef.current !== characterId) return;
      clearRetainerDraft(characterId);
      setRetainers(data.retainers || []);
      setRetainerDraftDirty(false);
      setRetainerLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (selectedCharacterIdRef.current === characterId)
        setRetainerSyncError(
          error instanceof Error
            ? error.message
            : "Could not refresh player data.",
        );
      throw error;
    } finally {
      setRetainerSyncing(false);
    }
  }
  return {
    persistLocalRetainers,
    saveRetainerRecord,
    removeRetainerRecord,
    syncRetainersToCampaign,
    refreshRetainersFromCampaign,
    retainers,
    setRetainers,
    retainerDraftDirty,
    setRetainerDraftDirty,
    retainerSyncing,
    setRetainerSyncing,
    retainerSyncError,
    setRetainerSyncError,
    retainerLastSyncedAt,
    setRetainerLastSyncedAt,
    editingRetainer,
    setEditingRetainer,
    retainerKind,
    setRetainerKind,
  };
}
