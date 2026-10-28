import { territoryHexKey } from "./territoryRules";
import { getDraftScope } from "../google-sheets-api";
import {
  AppError,
  errorMessage,
  definitelyNotApplied,
  type SyncProgress,
} from "./errors";
import {
  acknowledgeTerritoryOperation,
  checkpointTerritoryHex,
} from "./territoryStorage";
import { loadCachedSheetData } from "../google-sheets-api";
import type { AppModal } from "./core";
import { hasSheetsConnection } from "../google-sheets-api";
import { migrateExistingScoutingTimers } from "./territoryStorage";
import { appStorage } from "./storage";
import {
  loadAcceptedTabSyncRevisions,
  saveAcceptedTabSyncRevisions,
} from "./syncStorage";

import { useEffect, useRef, useState } from "react";
import {
  saveCachedSheetData,
  loadTerritoryStatus,
  loadTabSyncRevisions,
  saveTerritory,
  updateTerritory,
  updateTerritoryChurchTithe,
  deleteTerritory,
  uploadTerritoryMap,
  uploadTerritoryPoiMap,
  importTerritoryWorkbook,
  startScoutingMission,
  createCustomMission,
  completeDueScoutingMission,
  dismissScoutingMission,
  viewScoutingMissionResults,
  upsertTerritoryHex,
  saveTerritoryFieldAllocation,
  type SheetCharacter,
  type SheetBootstrap,
  type SheetRetainer,
  type SheetTerritory,
  type SheetScoutingMission,
  type SheetCustomMission,
  type SheetTerritoryHex,
  type TerritoryWorkbookRow,
} from "../google-sheets-api";
import { fileToDataUrl } from "./workbook";
import {
  type TerritoryLocalOperation,
  type TerritoryLocalDraft,
  loadTerritoryDraft,
  saveTerritoryDraft,
  clearTerritoryDraft,
  type LocalScoutingTimer,
  loadLocalScoutingTimers,
  upsertLocalScoutingTimer,
  removeLocalScoutingTimer,
  removeStaleScoutingLocalState,
  reconcileLocalScoutingTimersWithAuthoritative,
} from "./territoryStorage";
import {
  type RetainerLocalDraft,
  loadRetainerDraft,
  saveRetainerDraft,
} from "./retainerStorage";

import type { Dispatch, SetStateAction, RefObject } from "react";

type TerritoriesContext = {
  characterLoadRequestRef?: RefObject<number>;
  selectedCharacter: SheetCharacter | undefined;
  selectedCharacterIdRef: RefObject<string>;
  setRetainers: Dispatch<SetStateAction<SheetRetainer[]>>;
  retainerDraftDirty: boolean;
  setModal: Dispatch<SetStateAction<AppModal>>;
  permissions: {
    isDm: boolean;
    territories: boolean;
    retainers: boolean;
    playerManagement: boolean;
  };
  selectedCharacterId: string;
  cacheBaseRef: RefObject<SheetBootstrap | null>;
};

export function useTerritories(
  getContext: () => TerritoriesContext,
  {
    authenticated,
    selectedCharacterId,
  }: { authenticated: boolean; selectedCharacterId: string } = {
    authenticated: false,
    selectedCharacterId: "",
  },
) {
  const syncLock = useRef(new Set<string>());
  const [territoryProgress, setTerritoryProgress] =
    useState<SyncProgress | null>(null);
  const [territories, setTerritories] = useState<SheetTerritory[]>([]);
  const [managedTerritories, setManagedTerritories] = useState<
    SheetTerritory[]
  >([]);
  const [scoutingMissions, setScoutingMissions] = useState<
    SheetScoutingMission[]
  >([]);
  const [customMissions, setCustomMissions] = useState<SheetCustomMission[]>(
    [],
  );
  const [territoryHexes, setTerritoryHexes] = useState<SheetTerritoryHex[]>([]);
  const [territoryDraftDirty, setTerritoryDraftDirty] = useState(false);
  const [territorySyncing, setTerritorySyncing] = useState(false);
  const [territorySyncError, setTerritorySyncError] = useState("");
  const [territoryLastSyncedAt, setTerritoryLastSyncedAt] = useState("");
  const [editingTerritory, setEditingTerritory] =
    useState<SheetTerritory | null>(null);
  const scoutingAutoSubmitInFlightRef = useRef<Set<string>>(new Set());

  function persistLocalTerritoryState(
    characterId: string,
    next: {
      territories?: SheetTerritory[];
      scoutingMissions?: SheetScoutingMission[];
      customMissions?: SheetCustomMission[];
      territoryHexes?: SheetTerritoryHex[];
    },
    operation?: TerritoryLocalOperation,
  ) {
    const existing = loadTerritoryDraft(characterId);
    const nextDraft: TerritoryLocalDraft = {
      characterId,
      territories: next.territories ?? existing?.territories ?? territories,
      scoutingMissions:
        next.scoutingMissions ?? existing?.scoutingMissions ?? scoutingMissions,
      customMissions:
        next.customMissions ?? existing?.customMissions ?? customMissions,
      territoryHexes:
        next.territoryHexes ?? existing?.territoryHexes ?? territoryHexes,
      uncertainOperations: existing?.uncertainOperations,
      operations: operation
        ? [...(existing?.operations || []), operation]
        : existing?.operations || [],
      updatedAt: new Date().toISOString(),
    };
    if (existing && operation) {
      if (operation.kind === "tithe") {
        nextDraft.territories = existing.territories.map((row) =>
          row.territoryId === operation.territoryId
            ? {
                ...row,
                payChurchTithe: operation.payChurchTithe,
                updatedAt: nextDraft.updatedAt,
              }
            : row,
        );
      } else if (operation.kind === "hex" || operation.kind === "fields") {
        const target =
          operation.kind === "hex" ? operation.localHexId : operation.hexId;
        const incoming = nextDraft.territoryHexes.find(
          (row) => row.hexId === target,
        );
        const previous = existing.territoryHexes.find(
          (row) => row.hexId === target,
        );
        if (incoming) {
          const changed: SheetTerritoryHex =
            operation.kind === "fields"
              ? {
                  ...(previous || incoming),
                  cerealFields: operation.cerealFields,
                  cottonFields: operation.cottonFields,
                  pastureFields: operation.pastureFields,
                  updatedAt: nextDraft.updatedAt,
                }
              : {
                  ...(previous || incoming),
                  mapX: operation.mapX,
                  mapY: operation.mapY,
                  title: operation.title ?? previous?.title,
                  contents: operation.contents ?? previous?.contents,
                  dmRevealed: operation.dmRevealed ?? previous?.dmRevealed,
                  isDiscovered: true,
                  updatedAt: nextDraft.updatedAt,
                };
          nextDraft.territoryHexes = [
            changed,
            ...existing.territoryHexes.filter((row) => row.hexId !== target),
          ];
        }
      } else if (operation.kind === "scouting-start") {
        const mission = nextDraft.scoutingMissions.find(
          (row) => row.missionId === operation.localMissionId,
        );
        if (mission)
          nextDraft.scoutingMissions = [
            mission,
            ...existing.scoutingMissions.filter(
              (row) => row.missionId !== mission.missionId,
            ),
          ];
      } else if (operation.kind === "custom-start") {
        const mission = nextDraft.customMissions.find(
          (row) => row.missionId === operation.localMissionId,
        );
        if (mission)
          nextDraft.customMissions = [
            mission,
            ...existing.customMissions.filter(
              (row) => row.missionId !== mission.missionId,
            ),
          ];
      } else {
        const incoming = nextDraft.scoutingMissions.find(
          (row) => row.missionId === operation.missionId,
        );
        nextDraft.scoutingMissions = existing.scoutingMissions.map((row) =>
          row.missionId === operation.missionId && incoming
            ? {
                ...row,
                resultsViewedAt:
                  incoming.resultsViewedAt || row.resultsViewedAt,
                dismissedAt: incoming.dismissedAt || row.dismissedAt,
              }
            : row,
        );
      }
    }
    saveTerritoryDraft(nextDraft);
    if (getContext().selectedCharacterIdRef.current !== characterId) return;
    setTerritories(nextDraft.territories);
    setScoutingMissions(nextDraft.scoutingMissions);
    setCustomMissions(nextDraft.customMissions);
    setTerritoryHexes(nextDraft.territoryHexes);
    setTerritoryDraftDirty(nextDraft.operations.length > 0);
    setTerritorySyncError("");
  }

  function queueTerritoryOperation(
    operation: TerritoryLocalOperation,
    next: Parameters<typeof persistLocalTerritoryState>[1],
  ) {
    const { selectedCharacter } = getContext();

    if (!selectedCharacter) return;
    persistLocalTerritoryState(selectedCharacter.characterId, next, operation);
  }

  async function submitExpiredLocalScoutingTimer(timer: LocalScoutingTimer) {
    const { selectedCharacterIdRef, setRetainers } = getContext();

    const characterId = timer.characterId;
    if (!characterId) return;
    if (scoutingAutoSubmitInFlightRef.current.has(timer.clientMissionId))
      return;

    scoutingAutoSubmitInFlightRef.current.add(timer.clientMissionId);
    try {
      const result = timer.serverMissionId
        ? await completeDueScoutingMission({
            characterId,
            missionId: timer.serverMissionId,
          })
        : await startScoutingMission({
            characterId,
            territoryId: timer.territoryId,
            hexNumber: timer.hexNumber,
            mapX: timer.mapX,
            mapY: timer.mapY,
            allocations: timer.allocations,
            officerRetainerId: timer.officerRetainerId,
            clientMissionId: timer.clientMissionId,
            startedAt: timer.startedAt,
            durationDays: timer.durationDays,
          });

      if (["completed", "failed"].includes(result.mission.status)) {
        removeLocalScoutingTimer(characterId, timer.clientMissionId);
      } else {
        // Clock skew can make a request arrive a few seconds early. Keep the
        // timer and remember the server id so the next due check is idempotent.
        upsertLocalScoutingTimer({
          ...timer,
          serverMissionId: result.mission.missionId,
        });
      }

      // Replace only the matching scouting mission in any Territory draft.
      // Other unsynced Territory operations remain intact.
      const latestDraft = loadTerritoryDraft(characterId);
      if (latestDraft) {
        const nextMissions = latestDraft.scoutingMissions.map((mission) =>
          mission.missionId === timer.clientMissionId ||
          mission.missionId === timer.serverMissionId ||
          mission.clientMissionId === timer.clientMissionId
            ? result.mission
            : mission,
        );
        const nextOperations = latestDraft.operations.filter(
          (item) =>
            !(
              item.kind === "scouting-start" &&
              item.localMissionId === timer.clientMissionId
            ),
        );
        const nextDraft: TerritoryLocalDraft = {
          ...latestDraft,
          scoutingMissions: nextMissions,
          operations: nextOperations,
          updatedAt: new Date().toISOString(),
        };
        saveTerritoryDraft(nextDraft);
        if (selectedCharacterIdRef.current === characterId) {
          setScoutingMissions(nextMissions);
          setTerritoryDraftDirty(nextOperations.length > 0);
        }
      } else if (selectedCharacterIdRef.current === characterId) {
        setScoutingMissions((items) => {
          const replaced = items.map((mission) =>
            mission.missionId === timer.clientMissionId ||
            mission.missionId === timer.serverMissionId ||
            mission.clientMissionId === timer.clientMissionId
              ? result.mission
              : mission,
          );
          const matched = replaced.some(
            (mission) => mission.missionId === result.mission.missionId,
          );
          return matched ? replaced : [result.mission, ...replaced];
        });
      }

      // Casualties are authoritative results of adjudication. Merge only the
      // forces touched by this mission, not the whole Retainers tab.
      if (result.affectedRetainers?.length) {
        const affectedById = new Map(
          result.affectedRetainers.map((item) => [item.retainerId, item]),
        );
        const localRetainerDraft = loadRetainerDraft(characterId);
        if (localRetainerDraft) {
          const merge = (items: SheetRetainer[]) =>
            items.map((item) => affectedById.get(item.retainerId) || item);
          const mergedDraft: RetainerLocalDraft = {
            ...localRetainerDraft,
            baseRetainers: merge(localRetainerDraft.baseRetainers),
            retainers: merge(localRetainerDraft.retainers),
            updatedAt: new Date().toISOString(),
          };
          saveRetainerDraft(mergedDraft);
          if (selectedCharacterIdRef.current === characterId)
            setRetainers(mergedDraft.retainers);
        } else if (selectedCharacterIdRef.current === characterId) {
          setRetainers((items) =>
            items.map((item) => affectedById.get(item.retainerId) || item),
          );
        }
      }

      if (
        result.territoryPopulation &&
        selectedCharacterIdRef.current === characterId
      ) {
        const territoryPopulation = result.territoryPopulation;
        const applyPopulation = (items: SheetTerritory[]) =>
          items.map((territory) =>
            territory.territoryId === territoryPopulation.territoryId
              ? { ...territory, population: territoryPopulation.population }
              : territory,
          );
        setTerritories(applyPopulation);
        const latestDraft = loadTerritoryDraft(characterId);
        if (latestDraft) {
          saveTerritoryDraft({
            ...latestDraft,
            territories: applyPopulation(latestDraft.territories),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (selectedCharacterIdRef.current === characterId)
        setTerritorySyncError("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not complete the expired scouting mission.";
      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes("already been scouted") ||
        normalizedMessage.includes("already scouted")
      ) {
        // The Sheet already contains the authoritative completed result for
        // this hex. This local timer is stale (commonly after a DM Territories
        // push), so remove it and its queued scouting-start instead of retrying
        // every 30 seconds.
        removeStaleScoutingLocalState(characterId, timer.clientMissionId);
        if (selectedCharacterIdRef.current === characterId) {
          const latestDraft = loadTerritoryDraft(characterId);
          if (latestDraft) {
            setScoutingMissions(latestDraft.scoutingMissions);
            setTerritoryDraftDirty(latestDraft.operations.length > 0);
          }
          setTerritorySyncError("");
        }
      } else if (selectedCharacterIdRef.current === characterId) {
        setTerritorySyncError(message);
      }
    } finally {
      scoutingAutoSubmitInFlightRef.current.delete(timer.clientMissionId);
    }
  }

  async function syncTerritoryData() {
    const { selectedCharacter, selectedCharacterIdRef } = getContext();

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
        "Territories are already syncing. Wait for the current operation to finish.",
      );
    const draft = loadTerritoryDraft(characterId);
    if (!draft || !draft.operations.length) {
      setTerritoryDraftDirty(false);
      return;
    }

    if (draft.uncertainOperations?.length)
      throw new AppError(
        "uncertain",
        "A custom mission has an unconfirmed result. Your orders are preserved. Check the campaign copy before refreshing; the mission will not be sent again automatically.",
      );
    syncLock.current.add(characterId);
    const pendingReveals: Extract<TerritoryLocalOperation, { kind: "hex" }>[] =
      [];
    let completed = 0;
    const total = draft.operations.length;
    const active = () => selectedCharacterIdRef.current === characterId;
    const showProgress = () => {
      if (active())
        setTerritoryProgress({
          completed,
          total,
          label: `Saving territory changes ${completed} of ${total}`,
        });
    };
    showProgress();
    setTerritorySyncing(true);
    setTerritorySyncError("");
    try {
      for (const queued of draft.operations) {
        assertScope();
        const operation = loadTerritoryDraft(characterId)?.operations.find(
          (row) => row.id === queued.id,
        );
        if (!operation) continue;
        let confirmedMission:
          SheetScoutingMission | SheetCustomMission | undefined;
        if (operation.kind === "tithe") {
          await updateTerritoryChurchTithe({
            characterId,
            territoryId: operation.territoryId,
            payChurchTithe: operation.payChurchTithe,
          });
        } else if (operation.kind === "fields") {
          await saveTerritoryFieldAllocation({
            characterId,
            territoryId: operation.territoryId,
            hexId: operation.hexId,
            cerealFields: operation.cerealFields,
            cottonFields: operation.cottonFields,
            pastureFields: operation.pastureFields,
          });
        } else if (operation.kind === "hex") {
          const revealOnly =
            operation.revealOnly || operation.dmRevealed !== undefined;
          const result = await upsertTerritoryHex({
            characterId,
            territoryId: operation.territoryId,
            hexNumber: operation.hexNumber,
            mapX: operation.mapX,
            mapY: operation.mapY,
            title: revealOnly ? undefined : operation.title,
            contents: revealOnly ? undefined : operation.contents,
            dmRevealed: operation.dmRevealed,
            revealOnly,
            expectedUpdatedAt: revealOnly
              ? undefined
              : operation.expectedUpdatedAt,
          });
          assertScope();
          checkpointTerritoryHex(characterId, operation, result.hex);
        } else if (operation.kind === "scouting-start") {
          const startedMission = await startScoutingMission({
            characterId,
            territoryId: operation.territoryId,
            hexNumber: operation.hexNumber,
            mapX: operation.mapX,
            mapY: operation.mapY,
            allocations: operation.allocations,
            officerRetainerId: operation.officerRetainerId,
            clientMissionId: operation.localMissionId,
            startedAt: operation.startedAt,
            durationDays: operation.durationDays,
          } as Parameters<typeof startScoutingMission>[0]);
          confirmedMission = startedMission.mission;
          const existingTimer = loadLocalScoutingTimers(characterId).find(
            (timer) => timer.clientMissionId === operation.localMissionId,
          );
          if (existingTimer) {
            if (
              ["completed", "failed"].includes(startedMission.mission.status)
            ) {
              removeLocalScoutingTimer(characterId, operation.localMissionId);
            } else {
              upsertLocalScoutingTimer({
                ...existingTimer,
                serverMissionId: startedMission.mission.missionId,
              });
            }
          }
        } else if (operation.kind === "custom-start") {
          const latest = loadTerritoryDraft(characterId)!;
          saveTerritoryDraft({
            ...latest,
            uncertainOperations: [
              ...(latest.uncertainOperations || []),
              operation.id,
            ],
          });
          try {
            const result = await createCustomMission({
              clientMutationId: operation.id,
              characterId,
              territoryId: operation.territoryId,
              objective: operation.objective,
              missionLocation: operation.missionLocation,
              startDate: operation.startDate,
              durationDays: operation.durationDays,
              allocations: operation.allocations,
              officerRetainerId: operation.officerRetainerId,
              additionalNotes: operation.additionalNotes,
            });
            confirmedMission = result.mission;
          } catch (reason) {
            if (getDraftScope() === scope && definitelyNotApplied(reason)) {
              const pending = loadTerritoryDraft(characterId)!;
              saveTerritoryDraft({
                ...pending,
                uncertainOperations: pending.uncertainOperations?.filter(
                  (id) => id !== operation.id,
                ),
              });
            }
            throw reason;
          }
        } else if (operation.kind === "scouting-view") {
          await viewScoutingMissionResults({
            characterId,
            missionId: operation.missionId,
          });
        } else if (operation.kind === "scouting-dismiss") {
          await dismissScoutingMission({
            characterId,
            missionId: operation.missionId,
          });
        }
        assertScope();
        // An acknowledgement alone does not prove the reveal survived in Sheets.
        // Keep reveal operations queued until a fresh status read confirms the flag.
        const isReveal =
          operation.kind === "hex" && operation.dmRevealed === true;
        if (isReveal) pendingReveals.push(operation);
        const latest = isReveal
          ? loadTerritoryDraft(characterId)!
          : acknowledgeTerritoryOperation(
              characterId,
              operation,
              confirmedMission,
            );
        if (active()) {
          setTerritories(latest.territories);
          setTerritoryHexes(latest.territoryHexes);
          setScoutingMissions(latest.scoutingMissions);
          setCustomMissions(latest.customMissions);
          setTerritoryDraftDirty(latest.operations.length > 0);
        }
        completed++;
        showProgress();
      }

      // This read is intentionally the authoritative completion point. It also
      // adjudicates any scouting mission whose real-world timer has expired.
      const revisions = await loadTabSyncRevisions(characterId);
      assertScope();
      const data = await loadTerritoryStatus(characterId, true);
      assertScope();
      const missing: string[] = [];
      for (const operation of pendingReveals) {
        const confirmed = data.territoryHexes.some(
          (hex) =>
            hex.territoryId === operation.territoryId &&
            territoryHexKey(hex.hexNumber) ===
              territoryHexKey(operation.hexNumber) &&
            hex.dmRevealed === true,
        );
        if (confirmed) acknowledgeTerritoryOperation(characterId, operation);
        else missing.push(operation.hexNumber);
      }
      if (missing.length) {
        if (active()) setTerritoryDraftDirty(true);
        throw new AppError(
          "validation",
          `The campaign did not confirm hex ${missing.join(", ")} as revealed. Your local unlocks are kept. Retry the push; if this continues, the campaign service needs to be checked.`,
        );
      }
      const latest = loadTerritoryDraft(characterId);
      if (latest?.operations.length) {
        if (active()) setTerritoryDraftDirty(true);
        return;
      }
      const cache = loadCachedSheetData(characterId);
      if (cache)
        saveCachedSheetData({
          ...cache,
          territories: data.territories,
          territoryHexes: data.territoryHexes,
          scoutingMissions: data.scoutingMissions,
          customMissions: data.customMissions || [],
        });
      clearTerritoryDraft(characterId);
      saveAcceptedTabSyncRevisions(characterId, {
        ...loadAcceptedTabSyncRevisions(characterId),
        territories: revisions.territories,
      });
      reconcileLocalScoutingTimersWithAuthoritative(
        characterId,
        data.scoutingMissions || [],
      );
      if (selectedCharacterIdRef.current !== characterId) return;
      setTerritories(data.territories || []);
      setScoutingMissions(data.scoutingMissions || []);
      setCustomMissions(data.customMissions || []);
      setTerritoryHexes(data.territoryHexes || []);
      setTerritoryDraftDirty(false);
      setTerritoryLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (selectedCharacterIdRef.current === characterId)
        setTerritorySyncError(
          error instanceof Error
            ? error.message
            : "Could not sync territory data.",
        );
      throw error;
    } finally {
      syncLock.current.delete(characterId);
      if (active() || !syncLock.current.size) setTerritorySyncing(false);
    }
  }

  async function refreshTerritoryDataFromCampaign() {
    const {
      selectedCharacter,
      retainerDraftDirty,
      setRetainers,
      selectedCharacterIdRef,
    } = getContext();

    if (!selectedCharacter) return;
    const characterId = selectedCharacter.characterId;
    const generation = getContext().characterLoadRequestRef?.current;
    const scope = getDraftScope();
    if (
      Boolean(loadTerritoryDraft(characterId)?.operations.length) &&
      !window.confirm(
        "Refresh Player Data will discard the unsynced territory/scouting changes on this device. Continue?",
      )
    )
      return;

    const before = JSON.stringify(loadTerritoryDraft(characterId));
    setTerritorySyncing(true);
    setTerritorySyncError("");
    try {
      // Read the revision first: acknowledge only campaign changes included
      // in the fresh snapshot, never a revision published after that read.
      const revisions = await loadTabSyncRevisions(characterId);
      const data = await loadTerritoryStatus(characterId, true);
      if (
        getDraftScope() !== scope ||
        selectedCharacterIdRef.current !== characterId ||
        getContext().characterLoadRequestRef?.current !== generation
      )
        return;
      if (JSON.stringify(loadTerritoryDraft(characterId)) !== before)
        throw new AppError(
          "conflict",
          "New territory edits were made while refreshing. They are preserved; retry when editing is finished.",
        );
      clearTerritoryDraft(characterId);
      reconcileLocalScoutingTimersWithAuthoritative(
        characterId,
        data.scoutingMissions || [],
      );
      setTerritories(data.territories || []);
      setScoutingMissions(data.scoutingMissions || []);
      setCustomMissions(data.customMissions || []);
      setTerritoryHexes(data.territoryHexes || []);
      setTerritoryDraftDirty(false);
      setTerritoryLastSyncedAt(new Date().toISOString());
      persistTerritoryCache({
        territories: data.territories || [],
        scoutingMissions: data.scoutingMissions || [],
        customMissions: data.customMissions || [],
        territoryHexes: data.territoryHexes || [],
      });
      saveAcceptedTabSyncRevisions(characterId, {
        ...loadAcceptedTabSyncRevisions(characterId),
        territories: revisions.territories,
      });

      // DM refresh also picks up player-created recruits unless the DM has
      // deliberately kept a local unsynced Retainers working copy.
      if (!loadRetainerDraft(characterId)) setRetainers(data.retainers || []);
    } catch (error) {
      if (selectedCharacterIdRef.current === characterId)
        setTerritorySyncError(
          error instanceof Error
            ? error.message
            : "Could not refresh player data.",
        );
      throw error;
    } finally {
      setTerritorySyncing(false);
    }
  }

  async function saveTerritoryRecord(input: {
    name: string;
    hexNumber: string;
    scoutingWebhookUrl: string;
    mapFile?: File;
    poiMapFile?: File;
    workbookFile?: File;
    workbookRows?: TerritoryWorkbookRow[];
  }) {
    const { selectedCharacter, setModal } = getContext();

    if (!selectedCharacter) return;
    await saveTerritoryForCharacter(
      selectedCharacter.characterId,
      editingTerritory,
      input,
    );
    setEditingTerritory(null);
    setModal(null);
  }

  async function saveTerritoryForCharacter(
    characterId: string,
    existingTerritory: SheetTerritory | null,
    input: {
      name: string;
      hexNumber: string;
      scoutingWebhookUrl: string;
      mapFile?: File;
      poiMapFile?: File;
      workbookFile?: File;
      workbookRows?: TerritoryWorkbookRow[];
    },
  ) {
    const { permissions, selectedCharacterId } = getContext();

    const result = existingTerritory
      ? await updateTerritory({
          characterId,
          territoryId: existingTerritory.territoryId,
          name: input.name,
          hexNumber: input.hexNumber,
          scoutingWebhookUrl: input.scoutingWebhookUrl,
        })
      : await saveTerritory({
          characterId,
          name: input.name,
          hexNumber: input.hexNumber,
          scoutingWebhookUrl: input.scoutingWebhookUrl,
        });

    let territory = result.territory;
    if (input.mapFile && permissions.isDm) {
      const base64 = await fileToDataUrl(input.mapFile);
      const upload = await uploadTerritoryMap({
        characterId,
        territoryId: territory.territoryId,
        fileName: input.mapFile.name,
        mimeType: input.mapFile.type,
        base64,
      });
      territory = upload.territory;
    }
    if (input.poiMapFile && permissions.isDm) {
      const base64 = await fileToDataUrl(input.poiMapFile);
      const upload = await uploadTerritoryPoiMap({
        characterId,
        territoryId: territory.territoryId,
        fileName: input.poiMapFile.name,
        mimeType: input.poiMapFile.type,
        base64,
      });
      territory = upload.territory;
    }
    if (input.workbookFile && input.workbookRows && permissions.isDm) {
      const base64 = await fileToDataUrl(input.workbookFile);
      const imported = await importTerritoryWorkbook({
        characterId,
        territoryId: territory.territoryId,
        fileName: input.workbookFile.name,
        mimeType:
          input.workbookFile.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64,
        rows: input.workbookRows,
      });
      territory = imported.territory;
      if (characterId === selectedCharacterId) {
        setTerritoryHexes((items) => [
          ...items.filter((hex) => hex.territoryId !== territory.territoryId),
          ...imported.hexes,
        ]);
      }
    }

    setManagedTerritories((items) =>
      existingTerritory
        ? items.map((item) =>
            item.territoryId === territory.territoryId ? territory : item,
          )
        : [territory, ...items],
    );
    if (characterId === selectedCharacterId) {
      setTerritories((items) =>
        existingTerritory
          ? items.map((item) =>
              item.territoryId === territory.territoryId ? territory : item,
            )
          : [territory, ...items],
      );
    }
    return territory;
  }

  async function deleteTerritoryRecord(territory: SheetTerritory) {
    const { selectedCharacter, permissions, setModal } = getContext();

    if (!selectedCharacter || !permissions.isDm) return;
    await deleteTerritory(selectedCharacter.characterId, territory.territoryId);
    setTerritories((items) =>
      items.filter((item) => item.territoryId !== territory.territoryId),
    );
    setTerritoryHexes((items) =>
      items.filter((hex) => hex.territoryId !== territory.territoryId),
    );
    setScoutingMissions((items) =>
      items.filter((mission) => mission.territoryId !== territory.territoryId),
    );
    setCustomMissions((items) =>
      items.filter((mission) => mission.territoryId !== territory.territoryId),
    );
    appStorage.removeItem(`pcm-territory-tap-reveals:${territory.territoryId}`);
    setEditingTerritory(null);
    setModal(null);
  }

  function persistTerritoryCache(input: {
    territories: SheetTerritory[];
    scoutingMissions: SheetScoutingMission[];
    customMissions: SheetCustomMission[];
    territoryHexes: SheetTerritoryHex[];
  }) {
    const { cacheBaseRef } = getContext();

    const base = cacheBaseRef.current;
    if (!base) return;
    const updatedBase: SheetBootstrap = {
      ...base,
      territories: input.territories,
      scoutingMissions: input.scoutingMissions,
      customMissions: input.customMissions,
      territoryHexes: input.territoryHexes,
    };
    cacheBaseRef.current = updatedBase;
    saveCachedSheetData(updatedBase);
  }

  useEffect(() => {
    if (!authenticated || !hasSheetsConnection() || !selectedCharacterId)
      return;

    const checkExpiredLocalScouting = () => {
      // One-time compatibility path for missions that predate local scouting
      // timers. This is local-only; it does not contact the Sheet unless the
      // migrated mission is already due.
      migrateExistingScoutingTimers(selectedCharacterId, scoutingMissions);

      const now = Date.now();
      loadLocalScoutingTimers(selectedCharacterId).forEach((timer) => {
        if (new Date(timer.completesAt).getTime() <= now) {
          void submitExpiredLocalScoutingTimer(timer);
        }
      });
    };

    // This is the sole automatic Sheet exception: no request occurs unless a
    // locally tracked scouting mission has actually reached its completion
    // timestamp. Reopening after several days triggers this check immediately.
    checkExpiredLocalScouting();
    const interval = window.setInterval(checkExpiredLocalScouting, 30000);
    return () => window.clearInterval(interval);
  }, [authenticated, selectedCharacterId, scoutingMissions]);
  return {
    territoryProgress,
    persistLocalTerritoryState,
    queueTerritoryOperation,
    submitExpiredLocalScoutingTimer,
    syncTerritoryData,
    refreshTerritoryDataFromCampaign,
    saveTerritoryRecord,
    saveTerritoryForCharacter,
    deleteTerritoryRecord,
    persistTerritoryCache,
    territories,
    setTerritories,
    managedTerritories,
    setManagedTerritories,
    scoutingMissions,
    setScoutingMissions,
    customMissions,
    setCustomMissions,
    territoryHexes,
    setTerritoryHexes,
    territoryDraftDirty,
    setTerritoryDraftDirty,
    territorySyncing,
    setTerritorySyncing,
    territorySyncError,
    setTerritorySyncError,
    territoryLastSyncedAt,
    setTerritoryLastSyncedAt,
    editingTerritory,
    setEditingTerritory,
    scoutingAutoSubmitInFlightRef,
  };
}
