import { appStorage } from "./storage";

import {
  getSessionToken,
  type SheetTerritory,
  type SheetScoutingMission,
  type SheetCustomMission,
  type SheetTerritoryHex,
} from "../google-sheets-api";

export type TerritoryLocalOperation =
  | { id: string; kind: "tithe"; territoryId: string; payChurchTithe: boolean }
  | {
      id: string;
      kind: "fields";
      territoryId: string;
      hexId: string;
      cerealFields: number;
      cottonFields: number;
      pastureFields: number;
    }
  | {
      id: string;
      kind: "hex";
      territoryId: string;
      localHexId: string;
      hexNumber: string;
      mapX: number;
      mapY: number;
      title?: string;
      contents?: string;
      dmRevealed?: boolean;
    }
  | {
      id: string;
      kind: "scouting-start";
      localMissionId: string;
      territoryId: string;
      hexNumber: string;
      mapX: number;
      mapY: number;
      allocations: Array<{
        retainerId: string;
        rosterGroupId?: string;
        soldierType: string;
        men: number;
      }>;
      officerRetainerId?: string;
      startedAt: string;
      durationDays: number;
    }
  | {
      id: string;
      kind: "custom-start";
      localMissionId: string;
      territoryId: string;
      objective: string;
      missionLocation: string;
      startDate: string;
      durationDays: number;
      allocations: Array<{
        retainerId: string;
        rosterGroupId?: string;
        soldierType: string;
        men: number;
      }>;
      officerRetainerId?: string;
      additionalNotes?: string;
    }
  | { id: string; kind: "scouting-view"; missionId: string }
  | { id: string; kind: "scouting-dismiss"; missionId: string };

export type TerritoryLocalDraft = {
  characterId: string;
  territories: SheetTerritory[];
  scoutingMissions: SheetScoutingMission[];
  customMissions: SheetCustomMission[];
  territoryHexes: SheetTerritoryHex[];
  operations: TerritoryLocalOperation[];
  updatedAt: string;
};

const TERRITORY_DRAFT_PREFIX = "pcm-territory-draft:v1:";

function territoryDraftKey(characterId: string) {
  return `${TERRITORY_DRAFT_PREFIX}${getSessionToken() || "anonymous"}:${characterId}`;
}

export function loadTerritoryDraft(
  characterId: string,
): TerritoryLocalDraft | null {
  if (!characterId || typeof window === "undefined") return null;
  try {
    const raw = appStorage.getItem(territoryDraftKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TerritoryLocalDraft;
    if (
      parsed.characterId !== characterId ||
      !Array.isArray(parsed.territories) ||
      !Array.isArray(parsed.scoutingMissions) ||
      !Array.isArray(parsed.customMissions) ||
      !Array.isArray(parsed.territoryHexes) ||
      !Array.isArray(parsed.operations)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTerritoryDraft(draft: TerritoryLocalDraft) {
  if (typeof window === "undefined") return;
  appStorage.setItem(
    territoryDraftKey(draft.characterId),
    JSON.stringify(draft),
  );
}

export function clearTerritoryDraft(characterId: string) {
  if (!characterId || typeof window === "undefined") return;
  appStorage.removeItem(territoryDraftKey(characterId));
}

export function localMissionStamp() {
  return new Date().toISOString();
}

export type LocalScoutingTimer = {
  characterId: string;
  clientMissionId: string;
  serverMissionId?: string;
  territoryId: string;
  hexNumber: string;
  mapX: number;
  mapY: number;
  allocations: Array<{
    retainerId: string;
    rosterGroupId?: string;
    soldierType: string;
    men: number;
  }>;
  officerRetainerId?: string;
  startedAt: string;
  durationDays: number;
  completesAt: string;
};

const SCOUTING_TIMER_PREFIX = "pcm-scouting-timers:v1:";

function scoutingTimerKey(characterId: string) {
  return `${SCOUTING_TIMER_PREFIX}${getSessionToken() || "anonymous"}:${characterId}`;
}

export function loadLocalScoutingTimers(
  characterId: string,
): LocalScoutingTimer[] {
  if (!characterId || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      appStorage.getItem(scoutingTimerKey(characterId)) || "[]",
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalScoutingTimers(
  characterId: string,
  timers: LocalScoutingTimer[],
) {
  if (!characterId || typeof window === "undefined") return;
  if (!timers.length) {
    appStorage.removeItem(scoutingTimerKey(characterId));
    return;
  }
  appStorage.setItem(scoutingTimerKey(characterId), JSON.stringify(timers));
}

export function upsertLocalScoutingTimer(timer: LocalScoutingTimer) {
  const timers = loadLocalScoutingTimers(timer.characterId);
  const next = [
    timer,
    ...timers.filter((item) => item.clientMissionId !== timer.clientMissionId),
  ];
  saveLocalScoutingTimers(timer.characterId, next);
}

export function removeLocalScoutingTimer(
  characterId: string,
  clientMissionId: string,
) {
  saveLocalScoutingTimers(
    characterId,
    loadLocalScoutingTimers(characterId).filter(
      (item) => item.clientMissionId !== clientMissionId,
    ),
  );
}

export function removeStaleScoutingLocalState(
  characterId: string,
  clientMissionId: string,
) {
  removeLocalScoutingTimer(characterId, clientMissionId);

  const draft = loadTerritoryDraft(characterId);
  if (!draft) return;

  const nextOperations = draft.operations.filter(
    (operation) =>
      !(
        operation.kind === "scouting-start" &&
        operation.localMissionId === clientMissionId
      ),
  );
  const nextMissions = draft.scoutingMissions.filter(
    (mission) =>
      mission.missionId !== clientMissionId &&
      mission.clientMissionId !== clientMissionId,
  );

  const nextDraft: TerritoryLocalDraft = {
    ...draft,
    scoutingMissions: nextMissions,
    operations: nextOperations,
    updatedAt: new Date().toISOString(),
  };

  if (
    nextOperations.length ||
    nextMissions.length !== draft.scoutingMissions.length
  ) {
    saveTerritoryDraft(nextDraft);
  } else if (!nextOperations.length) {
    // Preserve the local Territory snapshot if there are no queued changes;
    // only the stale timer itself needed removal.
    saveTerritoryDraft(nextDraft);
  }
}

export function reconcileLocalScoutingTimersWithAuthoritative(
  characterId: string,
  missions: SheetScoutingMission[],
) {
  if (!characterId) return;

  const terminalMissions = missions.filter(
    (mission) =>
      mission.characterId === characterId &&
      ["completed", "failed", "cancelled"].includes(String(mission.status)),
  );
  if (!terminalMissions.length) return;

  const timers = loadLocalScoutingTimers(characterId);
  if (!timers.length) return;

  const staleClientIds = new Set<string>();

  timers.forEach((timer) => {
    const matchingTerminalMission = terminalMissions.find(
      (mission) =>
        (timer.serverMissionId &&
          mission.missionId === timer.serverMissionId) ||
        (mission.clientMissionId &&
          mission.clientMissionId === timer.clientMissionId) ||
        (mission.territoryId === timer.territoryId &&
          String(mission.hexNumber).trim().toLowerCase() ===
            String(timer.hexNumber).trim().toLowerCase()),
    );
    if (matchingTerminalMission) staleClientIds.add(timer.clientMissionId);
  });

  staleClientIds.forEach((clientMissionId) => {
    removeStaleScoutingLocalState(characterId, clientMissionId);
  });
}

export function migrateExistingScoutingTimers(
  characterId: string,
  missions: SheetScoutingMission[],
) {
  if (!characterId || typeof window === "undefined") return;

  const existingTimers = loadLocalScoutingTimers(characterId);
  const knownServerIds = new Set(
    existingTimers.map((timer) => timer.serverMissionId).filter(Boolean),
  );
  const knownClientIds = new Set(
    existingTimers.map((timer) => timer.clientMissionId),
  );
  let changed = false;
  const nextTimers = [...existingTimers];

  missions.forEach((mission) => {
    if (mission.characterId !== characterId || mission.status !== "active")
      return;
    if (!mission.missionId || knownServerIds.has(mission.missionId)) return;
    if (mission.clientMissionId && knownClientIds.has(mission.clientMissionId))
      return;

    const startedMs = mission.startedAt
      ? new Date(mission.startedAt).getTime()
      : NaN;
    const explicitCompletesMs = mission.completesAt
      ? new Date(mission.completesAt).getTime()
      : NaN;
    const durationDays = Math.max(0, Number(mission.durationDays) || 0);

    const completesMs =
      Number.isFinite(explicitCompletesMs) && explicitCompletesMs > 0
        ? explicitCompletesMs
        : Number.isFinite(startedMs) && startedMs > 0 && durationDays > 0
          ? startedMs + durationDays * 86400000
          : NaN;

    // Do not invent timing for legacy records that lack enough information.
    if (!Number.isFinite(completesMs) || completesMs <= 0) return;

    const effectiveDuration =
      durationDays > 0
        ? durationDays
        : Number.isFinite(startedMs) && startedMs > 0
          ? Math.max(1, Math.round((completesMs - startedMs) / 86400000))
          : 1;
    const effectiveStartedAt =
      Number.isFinite(startedMs) && startedMs > 0
        ? new Date(startedMs).toISOString()
        : new Date(completesMs - effectiveDuration * 86400000).toISOString();

    const clientMissionId =
      mission.clientMissionId || `existing-${mission.missionId}`;

    nextTimers.push({
      characterId,
      clientMissionId,
      serverMissionId: mission.missionId,
      territoryId: mission.territoryId,
      hexNumber: mission.hexNumber,
      mapX: Number(mission.mapX) || 0,
      mapY: Number(mission.mapY) || 0,
      allocations: (mission.allocations || []).map((allocation) => ({
        retainerId: allocation.retainerId,
        rosterGroupId: allocation.rosterGroupId,
        soldierType: allocation.soldierType,
        men: Number(allocation.men) || 0,
      })),
      startedAt: effectiveStartedAt,
      durationDays: effectiveDuration,
      completesAt: new Date(completesMs).toISOString(),
    });
    knownServerIds.add(mission.missionId);
    knownClientIds.add(clientMissionId);
    changed = true;
  });

  if (changed) saveLocalScoutingTimers(characterId, nextTimers);
}
