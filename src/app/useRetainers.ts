import { getDraftScope } from "../google-sheets-api";
import {
  AppError,
  errorMessage,
  definitelyNotApplied,
  type SyncProgress,
} from "./errors";
import {
  acknowledgeRetainer,
  acknowledgeRetainerDelete,
  retainerDraftHasChanges,
} from "./retainerStorage";
import { loadCachedSheetData, saveCachedSheetData } from "../google-sheets-api";
import type { AppModal } from "./core";

import { useRef, useState } from "react";
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
  characterLoadRequestRef?: RefObject<number>;
  selectedCharacter: SheetCharacter | undefined;
  setModal: Dispatch<SetStateAction<AppModal>>;
  setRecurringExpenses: Dispatch<SetStateAction<SheetRecurringExpense[]>>;
  selectedCharacterIdRef: RefObject<string>;
};

export function useRetainers(getContext: () => RetainersContext) {
  const syncLock = useRef(new Set<string>());
  const [retainerProgress, setRetainerProgress] = useState<SyncProgress | null>(
    null,
  );
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
      creating: existingDraft?.creating,
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
    if (!selectedCharacter) return;
    const characterId = selectedCharacter.characterId;
    const scope = getDraftScope();
    const assertScope = () => {
      if (getDraftScope() !== scope)
        throw new AppError(
          "uncertain",
          "The account changed during synchronization. The original account’s draft is preserved for review when you sign in again.",
        );
    };
    if (syncLock.current.has(characterId))
      throw new AppError(
        "conflict",
        "Retainers are already syncing. Wait for the current operation to finish.",
      );
    let draft = loadRetainerDraft(characterId);
    if (!draft && forceOverwrite) {
      draft = {
        characterId,
        baseRetainers: [],
        retainers,
        updatedAt: new Date().toISOString(),
      };
      saveRetainerDraft(draft);
    }
    if (!draft) return;
    syncLock.current.add(characterId);
    setRetainerSyncing(true);
    setRetainerSyncError("");
    const active = () => selectedCharacterIdRef.current === characterId;
    try {
      const remote = await loadRetainerData(characterId);
      assertScope();
      if (draft.creating) {
        const confirmed = remote.retainers.find(
          (row) => row.clientMutationId === draft!.creating!.mutationId,
        );
        const sent = draft.retainers.find(
          (row) => row.retainerId === draft!.creating!.localId,
        );
        if (!confirmed || !sent)
          throw new AppError(
            "uncertain",
            "A retainer creation has an unconfirmed result. Your draft is preserved. Check the campaign roster before refreshing; this creation will not be sent again automatically.",
          );
        draft = acknowledgeRetainer(characterId, sent, confirmed);
      }
      const base = new Map(
        draft.baseRetainers.map((row) => [row.retainerId, row]),
      );
      const local = new Map(
        draft.retainers.map((row) => [row.retainerId, row]),
      );
      const remoteById = new Map(
        remote.retainers.map((row) => [row.retainerId, row]),
      );
      if (!forceOverwrite)
        for (const row of draft.baseRetainers) {
          const changed =
            !local.has(row.retainerId) ||
            retainerChanged(local.get(row.retainerId)!, row);
          const server = remoteById.get(row.retainerId);
          if (changed && (!server || retainerChanged(server, row)))
            throw new AppError(
              "conflict",
              `${row.name} changed or was removed in the campaign. Your edits are preserved. Review the campaign copy before replacing them.`,
            );
        }
      const deletes = forceOverwrite
        ? remote.retainers.filter((row) => !local.has(row.retainerId))
        : draft.baseRetainers.filter((row) => !local.has(row.retainerId));
      const writes = draft.retainers.filter(
        (row) =>
          row.retainerId.startsWith("local-") ||
          forceOverwrite ||
          (base.has(row.retainerId) &&
            retainerChanged(row, base.get(row.retainerId)!)),
      );
      const total = deletes.length + writes.length;
      let completed = 0;
      const progress = () => {
        if (active())
          setRetainerProgress({
            completed,
            total,
            label: `Saving retainers ${completed} of ${total}`,
          });
      };
      progress();
      for (const row of deletes) {
        assertScope();
        if (remoteById.has(row.retainerId))
          await deleteRetainer(characterId, row.retainerId);
        // force-overwrite removals need an acknowledgement base for safe retries.
        let latest = loadRetainerDraft(characterId)!;
        if (
          !latest.baseRetainers.some(
            (item) => item.retainerId === row.retainerId,
          )
        ) {
          latest = { ...latest, baseRetainers: [...latest.baseRetainers, row] };
          saveRetainerDraft(latest);
        }
        assertScope();
        acknowledgeRetainerDelete(characterId, row.retainerId);
        remoteById.delete(row.retainerId);
        completed++;
        progress();
      }
      for (const sent of writes) {
        assertScope();
        const create =
          sent.retainerId.startsWith("local-") ||
          !remoteById.has(sent.retainerId);
        const mutationId = `retainer:${sent.retainerId}`;
        if (create) {
          const latest = loadRetainerDraft(characterId)!;
          saveRetainerDraft({
            ...latest,
            creating: { localId: sent.retainerId, mutationId },
          });
        }
        let result: Awaited<ReturnType<typeof saveRetainer>>;
        try {
          result = create
            ? await saveRetainer({
                characterId,
                clientMutationId: mutationId,
                ...retainerMutationInput(sent),
              })
            : await updateRetainer({
                characterId,
                retainerId: sent.retainerId,
                ...retainerMutationInput(sent),
              });
        } catch (reason) {
          if (
            getDraftScope() === scope &&
            create &&
            definitelyNotApplied(reason)
          ) {
            const latest = loadRetainerDraft(characterId)!;
            saveRetainerDraft({ ...latest, creating: undefined });
          }
          throw reason;
        }
        assertScope();
        const latest = acknowledgeRetainer(characterId, sent, result.retainer);
        remoteById.set(result.retainer.retainerId, result.retainer);
        if (active()) {
          setRetainers(latest.retainers);
          setRecurringExpenses((items) => {
            const filtered = items.filter(
              (item) =>
                item.sourceType !== "retainer" ||
                (item.sourceId !== sent.retainerId &&
                  item.sourceId !== result.retainer.retainerId),
            );
            return result.schedule ? [result.schedule, ...filtered] : filtered;
          });
        }
        completed++;
        progress();
      }
      let latest = loadRetainerDraft(characterId)!;
      // Retain additions from other devices. Never replace concurrently edited rows.
      const changedIds = new Set(
        latest.baseRetainers
          .filter(
            (row) =>
              !latest.retainers.some(
                (item) => item.retainerId === row.retainerId,
              ),
          )
          .map((row) => row.retainerId),
      );
      const remaining = latest.retainers.map((row) => {
        const original = latest.baseRetainers.find(
          (item) => item.retainerId === row.retainerId,
        );
        return original && !retainerChanged(row, original)
          ? remoteById.get(row.retainerId) || row
          : row;
      });
      for (const row of remoteById.values())
        if (
          !remaining.some((item) => item.retainerId === row.retainerId) &&
          !changedIds.has(row.retainerId)
        )
          remaining.push(row);
      latest = {
        ...latest,
        retainers: remaining,
        baseRetainers: [...remoteById.values()],
        updatedAt: new Date().toISOString(),
      };
      const dirty = retainerDraftHasChanges(latest);
      saveRetainerDraft(latest);
      if (!dirty) clearRetainerDraft(characterId);
      const cache = loadCachedSheetData(characterId);
      if (cache)
        saveCachedSheetData({
          ...cache,
          retainers: dirty ? latest.baseRetainers : latest.retainers,
        });
      if (active()) {
        setRetainers(latest.retainers);
        setRetainerDraftDirty(dirty);
        setRetainerLastSyncedAt(new Date().toISOString());
      }
    } catch (error) {
      if (active()) {
        setRetainerDraftDirty(Boolean(loadRetainerDraft(characterId)));
        setRetainerSyncError(errorMessage(error));
      }
      throw error;
    } finally {
      syncLock.current.delete(characterId);
      if (active() || !syncLock.current.size) setRetainerSyncing(false);
    }
  }

  async function refreshRetainersFromCampaign() {
    const { selectedCharacter, selectedCharacterIdRef } = getContext();

    if (!selectedCharacter) return;
    const characterId = selectedCharacter.characterId;
    const generation = getContext().characterLoadRequestRef?.current;
    if (
      retainerDraftDirty &&
      !window.confirm(
        "Refresh Player Data will discard the unsynced retainer/fighting-force changes on this device. Continue?",
      )
    )
      return;

    const before = JSON.stringify(loadRetainerDraft(characterId));
    setRetainerSyncing(true);
    setRetainerSyncError("");
    try {
      const data = await loadRetainerData(characterId);
      if (JSON.stringify(loadRetainerDraft(characterId)) !== before)
        throw new AppError(
          "conflict",
          "New edits were made while refreshing. They are preserved; retry when editing is finished.",
        );
      if (
        selectedCharacterIdRef.current !== characterId ||
        getContext().characterLoadRequestRef?.current !== generation
      )
        return;
      clearRetainerDraft(characterId);
      const cache = loadCachedSheetData(characterId);
      if (cache) saveCachedSheetData({ ...cache, retainers: data.retainers });
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
    retainerProgress,
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
