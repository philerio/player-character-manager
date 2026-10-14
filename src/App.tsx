"use client";

import {
  BookOpen,
  CalendarClock,
  Castle,
  ChevronDown,
  CircleDollarSign,
  Coins,
  Crown,
  Landmark,
  Leaf,
  LockKeyhole,
  Menu,
  Pencil,
  Pickaxe,
  Plus,
  ReceiptText,
  ScrollText,
  Shield,
  Send,
  ShoppingCart,
  Sprout,
  Sword,
  Timer,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
  Upload,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  deleteSheetCharacter,
  changeInitialPassword,
  clearSession,
  loadCachedSheetData,
  saveCachedSheetData,
  loadSharedRosterCache,
  saveSharedRosterCache,
  getSessionToken,
  hasSheetsConnection,
  loadLoginOptions,
  loadAccountRoster,
  loadPlayerRoster,
  loadRecoveryQuestion,
  loadSheetData,
  loadTerritoryStatus,
  loadRetainerData,
  loadJournalData,
  backupLocalWallet,
  loadLocalWalletBackup,
  loadTabSyncRevisions,
  markTabAuthoritative,
  login,
  logout,
  registerPlayer,
  resetForgottenPassword,
  saveSheetCharacter,
  saveJournalEntry,
  saveRetainer,
  updateRetainer,
  deleteRetainer,
  saveTerritory,
  updateTerritory,
  updateTerritoryChurchTithe,
  deleteTerritory,
  uploadTerritoryMap,
  uploadTerritoryPoiMap,
  importTerritoryWorkbook,
  uploadCharacterPortrait,
  deleteCharacterPortrait,
  notifyScoutingMissionStarted,
  startScoutingMission,
  createCustomMission,
  completeDueScoutingMission,
  completeScoutingMissionForTesting,
  dismissScoutingMission,
  promoteScoutingSerjeants,
  viewScoutingMissionResults,
  upsertTerritoryHex,
  rollTerritoryRecruitment,
  completeTerritoryRecruitment,
  denyTerritoryRecruitment,
  resetTerritoryRecruitment,
  saveTerritoryFieldAllocation,
  startSettlementFieldExpansion,
  startFarmlandDevelopment,
  updateJournalEntry,
  deleteJournalEntry,
  updateSheetCharacter,
  updateCampaignName,
  updatePlayerAccess,
  updateDiscordWebhook,
  updateCharacterDiscordThread,
  sendJournalEntryToDiscord,
  type SheetCharacter,
  type SheetBootstrap,
  type SheetPlayer,
  type SheetTransaction,
  type SheetJournalEntry,
  type SheetRecurringExpense,
  type SheetRetainer,
  type FightingForceGroup,
  type SheetTerritory,
  type SheetScoutingMission,
  type SheetCustomMission,
  type SheetTerritoryHex,
  type LoginOption,
  type TerritoryWorkbookRow,
  type TerritoryRecruitmentOffer,
  type SheetSyncTab,
  type SheetTabSyncRevisions,
} from "./google-sheets-api";
import { HEX_I2_CARDS, type HexCardDetails } from "./hex-i2-data";

type Section = "wallet" | "territories" | "journal" | "retainers" | "player-management";
type CoinType = "pp" | "gp" | "sp" | "cp";
type CoinBalances = Record<CoinType, number>;
const coinValueInCopper: CoinBalances = { pp: 1000, gp: 200, sp: 10, cp: 1 };

const CHARACTER_CLASSES = [
  "Cleric",
  "Druid",
  "Fighter",
  "Paladin",
  "Ranger",
  "Magic-User",
  "Illusionist",
  "Thief",
  "Assassin",
  "Monk",
  "Bard",
  "Other",
] as const;

function canonicalCharacterClass(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  if (normalized === "magic user" || normalized === "magic-user") return "Magic-User";
  return CHARACTER_CLASSES.find((className) => className.toLowerCase() === normalized) || "Other";
}

function domainTaxRateSp(character: Pick<SheetCharacter, "class" | "level"> | null | undefined) {
  if (!character) return 0;
  const className = canonicalCharacterClass(character.class);
  const level = Math.max(0, Math.floor(Number(character.level) || 0));
  if (className === "Fighter" && level >= 9) return 7;
  if (className === "Cleric" && level >= 9) return 9;
  if ((className === "Magic-User" || className === "Illusionist") && level >= 12) return 5;
  return 0;
}

const FORCE_ARMOR_OPTIONS = [
  { name: "None", ac: 10 },
  { name: "Leather or padded armor", ac: 8 },
  { name: "Studded leather or ring mail", ac: 7 },
  { name: "Scale mail", ac: 6 },
  { name: "Chain mail", ac: 5 },
  { name: "Splint or banded mail", ac: 4 },
  { name: "Plate mail", ac: 3 },
] as const;

const FORCE_WEAPON_OPTIONS = [
  ["Arrow", "1-6", "1-6"], ["Axe, Battle", "1-8", "1-4"], ["Axe, Hand or throwing", "1-6", "1-4"],
  ["Bardiche", "2-8", "3-12"], ["Bec de corbin", "1-8", "1-6"], ["Bill-Guisarme", "2-8", "1-10"],
  ["Bo Stick", "1-6", "1-3"], ["Club", "1-6", "1-3"], ["Dagger", "1-4", "1-3"], ["Dart", "1-3", "1-2"],
  ["Fauchard", "1-6", "1-8"], ["Fauchard-Fork", "1-8", "1-10"], ["Flail, footman’s", "2-7", "2-8"],
  ["Flail, horseman’s", "2-5", "2-5"], ["Fork, Military", "1-8", "2-8"], ["Glaive", "1-6", "1-10"],
  ["Glaive-Guisarme", "2-8", "2-12"], ["Guisarme", "2-8", "1-8"], ["Guisarme-Voulge", "2-8", "2-8"],
  ["Halberd", "1-10", "2-12"], ["Hammer, lucern", "2-8", "1-6"], ["Hammer", "2-5", "1-4"],
  ["Javelin", "1-6", "1-6"], ["Jo Stick", "1-6", "1-4"], ["Lance (light horse)", "1-6", "1-8"],
  ["Lance (medium horse)", "2-7", "2-12"], ["Lance (heavy horse)", "3-9", "3-18"],
  ["Mace, footman’s", "2-7", "1-6"], ["Mace, horseman’s", "1-6", "1-4"], ["Morning Star", "2-8", "2-7"],
  ["Partisan", "1-6", "2-7"], ["Pick, Military, footman’s", "2-7", "2-8"], ["Pick, Military, horseman’s", "2-5", "1-4"],
  ["Pike, Awl", "1-6", "1-12"], ["Quarrel (or Bolt), light", "1-4", "1-4"], ["Quarrel (or Bolt), heavy", "2-5", "2-7"],
  ["Ranseur", "2-8", "2-8"], ["Scimitar", "1-8", "1-8"], ["Sling bullet", "2-5", "2-7"],
  ["Sling stone", "1-4", "1-4"], ["Spear", "1-6", "1-8"], ["Spetum", "2-7", "2-12"],
  ["Staff, Quarter", "1-6", "1-6"], ["Sword, Bastard", "2-8", "2-16"], ["Sword, Broad", "2-8", "2-7"],
  ["Sword, Long", "1-8", "1-12"], ["Sword, Short", "1-6", "1-8"], ["Sword, Two-handed", "1-10", "3-18"],
  ["Trident", "2-7", "3-12"], ["Voulge", "2-8", "2-8"],
].map(([name, damageSmallMedium, damageLarge]) => ({ name, damageSmallMedium, damageLarge }));

function forceArmorClass(armor: string, shield: boolean) {
  const base = FORCE_ARMOR_OPTIONS.find((option) => option.name === armor)?.ac ?? 10;
  return Math.max(2, base - (shield ? 1 : 0));
}


function mergeIdenticalForceGroups(groups: FightingForceGroup[]): FightingForceGroup[] {
  const merged = new Map<string, FightingForceGroup>();

  for (const group of groups) {
    const soldierType = String(group.soldierType || "").trim();
    const armor = String(group.armor || "None");
    const shield = Boolean(group.shield);
    const weaponNames = (
      group.weaponNames?.length
        ? group.weaponNames
        : group.weapons?.map((weapon) => weapon.name) || []
    )
      .map((name) => String(name).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const key = JSON.stringify([
      soldierType.toLowerCase(),
      armor.toLowerCase(),
      shield,
      weaponNames.map((name) => name.toLowerCase()),
    ]);

    const existing = merged.get(key);
    if (existing) {
      existing.men = Number(existing.men || 0) + Number(group.men || 0);
      existing.missingSerjeants =
        Number(existing.missingSerjeants || 0) + Number(group.missingSerjeants || 0);
      continue;
    }

    merged.set(key, {
      ...group,
      rosterGroupId: group.rosterGroupId || crypto.randomUUID(),
      soldierType,
      armor,
      shield,
      armorClass: forceArmorClass(armor, shield),
      weaponNames,
      weapons: weaponNames.map((name) =>
        FORCE_WEAPON_OPTIONS.find((weapon) => weapon.name === name) || {
          name,
          damageSmallMedium: "",
          damageLarge: "",
        }
      ),
      men: Number(group.men || 0),
      missingSerjeants: Number(group.missingSerjeants || 0),
    });
  }

  return Array.from(merged.values());
}

function localCalendarDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function territoryWorkbookNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? "")
    .trim()
    .replace(/,/g, "");

  if (!text) return 0;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function readTerritoryWorkbook(file: File): Promise<TerritoryWorkbookRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === "inhabitants") || workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("The workbook does not contain an Inhabitants sheet.");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const requiredHeaders = ["Hex", "Terrain", "Inhabitants", "Dungeon?", "Settlement?", "Settlement Name", "Settlement Inhabitants?", "Potential Hostile Encounter Population", "Hex Population Values", "Reaction", "DM Only Information"];
  const headers = Object.keys(records[0] || {});
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`The hex workbook is missing: ${missing.join(", ")}.`);
  const rows = records.filter((record) => String(record.Hex || "").trim()).map((record) => {
    const hexValue = String(record.Hex || "").trim();
    return {
    hexNumber: /^\d+$/.test(hexValue) ? `${hexValue}.0` : hexValue,
    terrain: String(record.Terrain || "").trim(),
    inhabitants: String(record.Inhabitants || "").trim(),
    dungeon: String(record["Dungeon?"] || "").trim(),
    settlement: String(record["Settlement?"] || "").trim(),
    settlementName: String(record["Settlement Name"] || "").trim(),
    details: String(record["Settlement Inhabitants?"] || "").trim(),
    potentialHostileEncounterPopulation: Math.max(0, Math.floor(territoryWorkbookNumber(record["Potential Hostile Encounter Population"]))),
    reaction: String(record.Reaction || "").trim(),
    hexPopulationValue: Math.max(0, Math.floor(territoryWorkbookNumber(record["Hex Population Values"]))),
    dmOnlyInformation: String(record["DM Only Information"] || "").trim(),
  };});
  if (rows.length !== 61) throw new Error(`The hex workbook must contain exactly 61 populated hex rows; this file contains ${rows.length}.`);
  if (new Set(rows.map((row) => row.hexNumber.toLowerCase())).size !== rows.length) throw new Error("The hex workbook contains duplicate Hex values.");
  return rows;
}



type TerritoryLocalOperation =
  | { id: string; kind: "tithe"; territoryId: string; payChurchTithe: boolean }
  | { id: string; kind: "fields"; territoryId: string; hexId: string; cerealFields: number; cottonFields: number; pastureFields: number }
  | { id: string; kind: "hex"; territoryId: string; localHexId: string; hexNumber: string; mapX: number; mapY: number; title?: string; contents?: string; dmRevealed?: boolean }
  | { id: string; kind: "scouting-start"; localMissionId: string; territoryId: string; hexNumber: string; mapX: number; mapY: number; allocations: Array<{ retainerId: string; rosterGroupId?: string; soldierType: string; men: number }>; officerRetainerId?: string; startedAt: string; durationDays: number }
  | { id: string; kind: "custom-start"; localMissionId: string; territoryId: string; objective: string; missionLocation: string; startDate: string; durationDays: number; allocations: Array<{ retainerId: string; rosterGroupId?: string; soldierType: string; men: number }>; officerRetainerId?: string; additionalNotes?: string }
  | { id: string; kind: "scouting-view"; missionId: string }
  | { id: string; kind: "scouting-dismiss"; missionId: string };

type TerritoryLocalDraft = {
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

function loadTerritoryDraft(characterId: string): TerritoryLocalDraft | null {
  if (!characterId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(territoryDraftKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TerritoryLocalDraft;
    if (
      parsed.characterId !== characterId ||
      !Array.isArray(parsed.territories) ||
      !Array.isArray(parsed.scoutingMissions) ||
      !Array.isArray(parsed.customMissions) ||
      !Array.isArray(parsed.territoryHexes) ||
      !Array.isArray(parsed.operations)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveTerritoryDraft(draft: TerritoryLocalDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(territoryDraftKey(draft.characterId), JSON.stringify(draft));
}

function clearTerritoryDraft(characterId: string) {
  if (!characterId || typeof window === "undefined") return;
  window.localStorage.removeItem(territoryDraftKey(characterId));
}

function localMissionStamp() {
  return new Date().toISOString();
}

type LocalScoutingTimer = {
  characterId: string;
  clientMissionId: string;
  serverMissionId?: string;
  territoryId: string;
  hexNumber: string;
  mapX: number;
  mapY: number;
  allocations: Array<{ retainerId: string; rosterGroupId?: string; soldierType: string; men: number }>;
  officerRetainerId?: string;
  startedAt: string;
  durationDays: number;
  completesAt: string;
};

const SCOUTING_TIMER_PREFIX = "pcm-scouting-timers:v1:";

function scoutingTimerKey(characterId: string) {
  return `${SCOUTING_TIMER_PREFIX}${getSessionToken() || "anonymous"}:${characterId}`;
}

function loadLocalScoutingTimers(characterId: string): LocalScoutingTimer[] {
  if (!characterId || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(scoutingTimerKey(characterId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalScoutingTimers(characterId: string, timers: LocalScoutingTimer[]) {
  if (!characterId || typeof window === "undefined") return;
  if (!timers.length) {
    window.localStorage.removeItem(scoutingTimerKey(characterId));
    return;
  }
  window.localStorage.setItem(scoutingTimerKey(characterId), JSON.stringify(timers));
}

function upsertLocalScoutingTimer(timer: LocalScoutingTimer) {
  const timers = loadLocalScoutingTimers(timer.characterId);
  const next = [timer, ...timers.filter((item) => item.clientMissionId !== timer.clientMissionId)];
  saveLocalScoutingTimers(timer.characterId, next);
}

function removeLocalScoutingTimer(characterId: string, clientMissionId: string) {
  saveLocalScoutingTimers(
    characterId,
    loadLocalScoutingTimers(characterId).filter((item) => item.clientMissionId !== clientMissionId),
  );
}

function removeStaleScoutingLocalState(
  characterId: string,
  clientMissionId: string,
) {
  removeLocalScoutingTimer(characterId, clientMissionId);

  const draft = loadTerritoryDraft(characterId);
  if (!draft) return;

  const nextOperations = draft.operations.filter(
    (operation) =>
      !(operation.kind === "scouting-start" && operation.localMissionId === clientMissionId),
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

  if (nextOperations.length || nextMissions.length !== draft.scoutingMissions.length) {
    saveTerritoryDraft(nextDraft);
  } else if (!nextOperations.length) {
    // Preserve the local Territory snapshot if there are no queued changes;
    // only the stale timer itself needed removal.
    saveTerritoryDraft(nextDraft);
  }
}

function reconcileLocalScoutingTimersWithAuthoritative(
  characterId: string,
  missions: SheetScoutingMission[],
) {
  if (!characterId) return;

  const terminalMissions = missions.filter((mission) =>
    mission.characterId === characterId &&
    ["completed", "failed", "cancelled"].includes(String(mission.status)),
  );
  if (!terminalMissions.length) return;

  const timers = loadLocalScoutingTimers(characterId);
  if (!timers.length) return;

  const staleClientIds = new Set<string>();

  timers.forEach((timer) => {
    const matchingTerminalMission = terminalMissions.find((mission) =>
      (timer.serverMissionId && mission.missionId === timer.serverMissionId) ||
      (mission.clientMissionId && mission.clientMissionId === timer.clientMissionId) ||
      (
        mission.territoryId === timer.territoryId &&
        String(mission.hexNumber).trim().toLowerCase() ===
          String(timer.hexNumber).trim().toLowerCase()
      ),
    );
    if (matchingTerminalMission) staleClientIds.add(timer.clientMissionId);
  });

  staleClientIds.forEach((clientMissionId) => {
    removeStaleScoutingLocalState(characterId, clientMissionId);
  });
}

function migrateExistingScoutingTimers(
  characterId: string,
  missions: SheetScoutingMission[],
) {
  if (!characterId || typeof window === "undefined") return;

  const existingTimers = loadLocalScoutingTimers(characterId);
  const knownServerIds = new Set(
    existingTimers.map((timer) => timer.serverMissionId).filter(Boolean),
  );
  const knownClientIds = new Set(existingTimers.map((timer) => timer.clientMissionId));
  let changed = false;
  const nextTimers = [...existingTimers];

  missions.forEach((mission) => {
    if (mission.characterId !== characterId || mission.status !== "active") return;
    if (!mission.missionId || knownServerIds.has(mission.missionId)) return;
    if (mission.clientMissionId && knownClientIds.has(mission.clientMissionId)) return;

    const startedMs = mission.startedAt ? new Date(mission.startedAt).getTime() : NaN;
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

type RetainerLocalDraft = {
  characterId: string;
  baseRetainers: SheetRetainer[];
  retainers: SheetRetainer[];
  updatedAt: string;
};

const RETAINER_DRAFT_PREFIX = "pcm-retainer-draft:";

function retainerDraftKey(characterId: string) {
  return `${RETAINER_DRAFT_PREFIX}${getSessionToken() || "anonymous"}:${characterId}`;
}

function loadRetainerDraft(characterId: string): RetainerLocalDraft | null {
  if (!characterId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(retainerDraftKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RetainerLocalDraft;
    if (parsed.characterId !== characterId || !Array.isArray(parsed.retainers) || !Array.isArray(parsed.baseRetainers)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveRetainerDraft(draft: RetainerLocalDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(retainerDraftKey(draft.characterId), JSON.stringify(draft));
}

function clearRetainerDraft(characterId: string) {
  if (!characterId || typeof window === "undefined") return;
  window.localStorage.removeItem(retainerDraftKey(characterId));
}

function retainerComparable(retainer: SheetRetainer) {
  return {
    name: retainer.name,
    type: retainer.type,
    role: retainer.role,
    level: retainer.level || "",
    wageGp: Number(retainer.wageGp) || 0,
    costCoin: retainer.costCoin || "gp",
    wageFrequency: retainer.wageFrequency || "monthly",
    hiringDate: retainer.hiringDate || "",
    men: Number(retainer.men) || 0,
    roster: retainer.roster || [],
    status: retainer.status || "",
    clericFightingForce: Boolean(retainer.clericFightingForce),
  };
}

function retainerChanged(left: SheetRetainer, right: SheetRetainer) {
  return JSON.stringify(retainerComparable(left)) !== JSON.stringify(retainerComparable(right));
}

function retainerMutationInput(retainer: SheetRetainer) {
  const level: number | "" =
    retainer.level === "" || retainer.level === undefined || retainer.level === null
      ? ""
      : Number(retainer.level) || "";

  const men: number | "" =
    retainer.type === "force"
      ? Number(retainer.men) || 0
      : "";

  return {
    type: retainer.type,
    name: retainer.name,
    role: retainer.role || "",
    level,
    amount: Number(retainer.wageGp) || 0,
    costCoin: retainer.costCoin || "gp",
    wageFrequency: retainer.wageFrequency || "monthly",
    hiringDate: retainer.hiringDate || undefined,
    men,
    roster: retainer.type === "force" ? retainer.roster || [] : undefined,
    clericFightingForce: retainer.type === "force" ? Boolean(retainer.clericFightingForce) : undefined,
  };
}

function purseValueInCopper(balances: CoinBalances) {
  return (Object.keys(coinValueInCopper) as CoinType[]).reduce(
    (total, coin) => total + balances[coin] * coinValueInCopper[coin],
    0,
  );
}

function deductCostPreservingCoins(
  currentBalances: CoinBalances,
  costInCopper: number,
): CoinBalances | null {
  const cost = Math.max(0, Math.floor(costInCopper));
  if (purseValueInCopper(currentBalances) < cost) return null;

  const nextBalances = { ...currentBalances };
  let remainingCost = cost;
  const coinsLowToHigh: CoinType[] = ["cp", "sp", "gp", "pp"];

  for (let index = 0; index < coinsLowToHigh.length; index += 1) {
    const coin = coinsLowToHigh[index];
    const coinValue = coinValueInCopper[coin];
    const coinsToSpend = Math.min(
      nextBalances[coin],
      Math.floor(remainingCost / coinValue),
    );

    nextBalances[coin] -= coinsToSpend;
    remainingCost -= coinsToSpend * coinValue;

    if (remainingCost === 0) return nextBalances;

    if (index < coinsLowToHigh.length - 1 && remainingCost < coinValueInCopper[coinsLowToHigh[index + 1]]) {
      continue;
    }
  }

  const coinToBreak = coinsLowToHigh.find(
    (coin) => nextBalances[coin] > 0 && coinValueInCopper[coin] > remainingCost,
  );
  if (!coinToBreak) return null;

  nextBalances[coinToBreak] -= 1;
  let change = coinValueInCopper[coinToBreak] - remainingCost;

  (["gp", "sp", "cp"] as CoinType[]).forEach((coin) => {
    if (coinValueInCopper[coin] >= coinValueInCopper[coinToBreak]) return;
    const changeCoins = Math.floor(change / coinValueInCopper[coin]);
    nextBalances[coin] += changeCoins;
    change %= coinValueInCopper[coin];
  });

  return nextBalances;
}

type EquipmentItem = {
  name: string;
  category: string;
  amount: number;
  coin: CoinType;
  encumbrance: string;
};
type Transaction = {
  id: number;
  label: string;
  coins: CoinBalances;
  kind: "income" | "expense";
  note?: string;
  timestamp: string;
  source?: "pending" | "sheet" | "local";
  transactionId?: string;
  clientId?: string;
};

type PendingWalletMutation = {
  clientId: string;
  characterId: string;
  label: string;
  kind: "income" | "expense";
  pp: number;
  gp: number;
  sp: number;
  cp: number;
  note?: string;
  preserveSigns?: boolean;
  createdAt: string;
};

const PENDING_WALLET_MUTATIONS_STORAGE_PREFIX = "pcm-pending-wallet:v1:";

function pendingWalletMutationsStorageKey() {
  return `${PENDING_WALLET_MUTATIONS_STORAGE_PREFIX}${getSessionToken() || "guest"}`;
}

function loadPendingWalletMutations() {
  try {
    const raw = localStorage.getItem(pendingWalletMutationsStorageKey());
    if (!raw) return [] as PendingWalletMutation[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PendingWalletMutation[] : [];
  } catch {
    return [] as PendingWalletMutation[];
  }
}

function savePendingWalletMutations(items: PendingWalletMutation[]) {
  try {
    localStorage.setItem(pendingWalletMutationsStorageKey(), JSON.stringify(items));
  } catch {
    // A full or unavailable cache must never prevent the live app from working.
  }
}

function signedCoinsForPendingWalletMutation(mutation: PendingWalletMutation): CoinBalances {
  if (mutation.preserveSigns) {
    return {
      pp: Number(mutation.pp) || 0,
      gp: Number(mutation.gp) || 0,
      sp: Number(mutation.sp) || 0,
      cp: Number(mutation.cp) || 0,
    };
  }
  const multiplier = mutation.kind === "income" ? 1 : -1;
  return {
    pp: (Number(mutation.pp) || 0) * multiplier,
    gp: (Number(mutation.gp) || 0) * multiplier,
    sp: (Number(mutation.sp) || 0) * multiplier,
    cp: (Number(mutation.cp) || 0) * multiplier,
  };
}

function mapPendingWalletMutation(mutation: PendingWalletMutation): Transaction {
  return {
    id: hashId(mutation.clientId),
    label: mutation.label,
    coins: signedCoinsForPendingWalletMutation(mutation),
    kind: mutation.kind,
    note: mutation.note?.trim() || undefined,
    timestamp: formatLedgerDate(mutation.createdAt),
    source: "pending",
    clientId: mutation.clientId,
  };
}

function applyPendingWalletMutationsToWallet(
  balance: { pp: number; gp: number; sp: number; cp: number },
  sheetTransactions: SheetTransaction[],
  pendingMutations: PendingWalletMutation[],
) {
  const adjustedBalance = {
    pp: Number(balance.pp) || 0,
    gp: Number(balance.gp) || 0,
    sp: Number(balance.sp) || 0,
    cp: Number(balance.cp) || 0,
  };

  pendingMutations.forEach((mutation) => {
    const signed = signedCoinsForPendingWalletMutation(mutation);
    adjustedBalance.pp += signed.pp;
    adjustedBalance.gp += signed.gp;
    adjustedBalance.sp += signed.sp;
    adjustedBalance.cp += signed.cp;
  });

  const pendingTransactions = [...pendingMutations]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map(mapPendingWalletMutation);

  return {
    balance: adjustedBalance,
    transactions: [...pendingTransactions, ...mapSheetTransactions(sheetTransactions)],
  };
}

function mapSheetTransactions(sheetTransactions: SheetTransaction[]): Transaction[] {
  return sheetTransactions.map((transaction) => {
    return {
      id: hashId(transaction.transactionId),
      label: transaction.label,
      coins: {
        pp: Number(transaction.pp) || 0,
        gp: Number(transaction.gp) || 0,
        sp: Number(transaction.sp) || 0,
        cp: Number(transaction.cp) || 0,
      },
      kind: transaction.type,
      note: transaction.note?.trim() || undefined,
      timestamp: formatLedgerDate(transaction.timestamp),
      source: "sheet",
      transactionId: transaction.transactionId,
    };
  });
}

type LocalWalletState = {
  version: 1;
  characterId: string;
  balance: CoinBalances;
  transactions: Transaction[];
  recurringExpenses: SheetRecurringExpense[];
  savedAt: string;
};

function walletBalanceFromTransactions(transactions: Transaction[]): CoinBalances {
  return transactions.reduce(
    (total, transaction) => {
      total.pp += Number(transaction.coins?.pp) || 0;
      total.gp += Number(transaction.coins?.gp) || 0;
      total.sp += Number(transaction.coins?.sp) || 0;
      total.cp += Number(transaction.coins?.cp) || 0;
      return total;
    },
    { pp: 0, gp: 0, sp: 0, cp: 0 } as CoinBalances,
  );
}

const LOCAL_WALLET_STORAGE_PREFIX = "pcm-local-wallet:v1:";

function localWalletStorageKey(characterId: string) {
  return `${LOCAL_WALLET_STORAGE_PREFIX}${characterId}`;
}

function loadLocalWalletState(characterId: string): LocalWalletState | null {
  if (!characterId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localWalletStorageKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalWalletState>;
    if (parsed.version !== 1 || parsed.characterId !== characterId) return null;
    const transactions = Array.isArray(parsed.transactions)
      ? parsed.transactions as Transaction[]
      : [];
    return {
      version: 1,
      characterId,
      // The ledger is the wallet's single source of truth. Never trust a
      // separately persisted balance, because it can drift from the ledger.
      balance: walletBalanceFromTransactions(transactions),
      transactions,
      recurringExpenses: Array.isArray(parsed.recurringExpenses) ? parsed.recurringExpenses as SheetRecurringExpense[] : [],
      savedAt: String(parsed.savedAt || ""),
    };
  } catch {
    return null;
  }
}

function saveLocalWalletState(state: LocalWalletState) {
  if (!state.characterId || typeof window === "undefined") return;
  try {
    const canonicalState: LocalWalletState = {
      ...state,
      balance: walletBalanceFromTransactions(state.transactions),
    };
    window.localStorage.setItem(
      localWalletStorageKey(state.characterId),
      JSON.stringify(canonicalState),
    );
  } catch {
    // Local wallet persistence must never crash the UI.
  }
}

function deleteLocalWalletState(characterId: string) {
  if (!characterId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(localWalletStorageKey(characterId));
  } catch {
    // Ignore unavailable local storage.
  }
}

function migrateLegacyWalletToLocal(
  characterId: string,
  balance: CoinBalances,
  sheetTransactions: SheetTransaction[],
  recurringExpenses: SheetRecurringExpense[],
) {
  const existing = loadLocalWalletState(characterId);
  if (existing) return existing;

  // The old character cache already stored the displayed purse total, so do
  // not add pending mutations to the balance again. Pending entries are only
  // used to recover ledger rows that were still waiting in the old outbox.
  const allPending = loadPendingWalletMutations();
  const pendingForCharacter = allPending.filter((item) => item.characterId === characterId);
  const recoveredPending = pendingForCharacter.map((item) => ({
    ...mapPendingWalletMutation(item),
    source: "local" as const,
    clientId: undefined,
  }));
  const recoveredSheet = mapSheetTransactions(sheetTransactions || []).map((item) => ({
    ...item,
    source: "local" as const,
  }));
  const recoveredTransactions = [...recoveredPending, ...recoveredSheet].filter(
    (item, index, items) => items.findIndex((other) => other.id === item.id) === index,
  );

  // Preserve the exact purse total that was visible before this migration,
  // even if the old ledger was incomplete. Any unexplained difference becomes
  // one explicit local carry-forward entry so the new ledger and purse agree.
  const recoveredTotals = recoveredTransactions.reduce((total, item) => {
    total.pp += Number(item.coins.pp) || 0;
    total.gp += Number(item.coins.gp) || 0;
    total.sp += Number(item.coins.sp) || 0;
    total.cp += Number(item.coins.cp) || 0;
    return total;
  }, { pp: 0, gp: 0, sp: 0, cp: 0 } as CoinBalances);
  const carryForwardCoins: CoinBalances = {
    pp: (Number(balance.pp) || 0) - recoveredTotals.pp,
    gp: (Number(balance.gp) || 0) - recoveredTotals.gp,
    sp: (Number(balance.sp) || 0) - recoveredTotals.sp,
    cp: (Number(balance.cp) || 0) - recoveredTotals.cp,
  };
  const hasCarryForward = Object.values(carryForwardCoins).some((value) => value !== 0);
  const transactions = hasCarryForward
    ? [
        {
          id: hashId(`local-wallet-carry-forward:${characterId}`),
          label: "Local wallet balance carried forward",
          coins: carryForwardCoins,
          kind: "income" as const,
          note: "Created automatically when the wallet was converted to local-only storage.",
          timestamp: formatLedgerDate(new Date().toISOString()),
          source: "local" as const,
          transactionId: `local-wallet-carry-forward:${characterId}`,
        },
        ...recoveredTransactions,
      ]
    : recoveredTransactions;

  const state: LocalWalletState = {
    version: 1,
    characterId,
    balance: walletBalanceFromTransactions(transactions),
    transactions,
    recurringExpenses: recurringExpenses || [],
    savedAt: new Date().toISOString(),
  };
  saveLocalWalletState(state);

  // The wallet no longer has a Sheet outbox. Remove migrated entries so they
  // can never be uploaded by old sync code.
  const remainingPending = allPending.filter((item) => item.characterId !== characterId);
  savePendingWalletMutations(remainingPending);
  return state;
}

function recurringOccurrenceDate(startDate: string, frequency: "weekly" | "monthly" | "annually", occurrenceIndex: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + occurrenceIndex * 7);
  if (frequency === "monthly") date.setUTCMonth(date.getUTCMonth() + occurrenceIndex);
  if (frequency === "annually") date.setUTCFullYear(date.getUTCFullYear() + occurrenceIndex);
  return date;
}

function transactionCoinText(transaction: Transaction) {
  return (["pp", "gp", "sp", "cp"] as CoinType[])
    .filter((coin) => transaction.coins[coin] !== 0)
    .map((coin) => {
      const amount = transaction.coins[coin];
      return `${amount > 0 ? "+" : "−"}${Math.abs(amount).toLocaleString()} ${coin}`;
    })
    .join(", ");
}


const TAB_SYNC_REVISION_PREFIX = "pcm-tab-sync-revisions:v1:";
const EMPTY_TAB_SYNC_REVISIONS: SheetTabSyncRevisions = {
  wallet: 0,
  journal: 0,
  retainers: 0,
  territories: 0,
};

function tabSyncRevisionStorageKey(characterId: string) {
  return `${TAB_SYNC_REVISION_PREFIX}${getSessionToken() || "guest"}:${characterId}`;
}

function loadAcceptedTabSyncRevisions(characterId: string): SheetTabSyncRevisions {
  if (!characterId || typeof window === "undefined") return { ...EMPTY_TAB_SYNC_REVISIONS };
  try {
    const raw = window.localStorage.getItem(tabSyncRevisionStorageKey(characterId));
    if (!raw) return { ...EMPTY_TAB_SYNC_REVISIONS };
    const parsed = JSON.parse(raw) as Partial<SheetTabSyncRevisions>;
    return {
      wallet: Math.max(0, Number(parsed.wallet) || 0),
      journal: Math.max(0, Number(parsed.journal) || 0),
      retainers: Math.max(0, Number(parsed.retainers) || 0),
      territories: Math.max(0, Number(parsed.territories) || 0),
    };
  } catch {
    return { ...EMPTY_TAB_SYNC_REVISIONS };
  }
}

function saveAcceptedTabSyncRevisions(characterId: string, revisions: SheetTabSyncRevisions) {
  if (!characterId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tabSyncRevisionStorageKey(characterId), JSON.stringify(revisions));
  } catch {
    // Revision tracking must never stop the app from working.
  }
}

const navItems: {
  id: Section;
  label: string;
  icon: typeof WalletCards;
}[] = [
  { id: "wallet", label: "Wallet", icon: WalletCards },
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "retainers", label: "Hirelings", icon: UsersRound },
  { id: "territories", label: "Territories", icon: Castle },
];

const RECRUITMENT_SOLDIER_TYPES = [
  { value: "archer (longbow)", label: "Archer (Longbow)" },
  { value: "archer (shortbow)", label: "Archer (Shortbow)" },
  { value: "artillerist", label: "Artillerist" },
  { value: "crossbowman", label: "Crossbowman" },
  { value: "footman, heavy", label: "Footman, Heavy" },
  { value: "footman, light", label: "Footman, Light" },
  { value: "footman, pikeman", label: "Footman, Pikeman" },
  { value: "hobilar, heavy", label: "Hobilar, Heavy" },
  { value: "hobilar, light", label: "Hobilar, Light" },
  { value: "horseman, archer", label: "Horseman, Archer" },
  { value: "horseman, crossbowman", label: "Horseman, Crossbowman" },
  { value: "horseman, heavy", label: "Horseman, Heavy" },
  { value: "horseman, light", label: "Horseman, Light" },
  { value: "horseman, medium", label: "Horseman, Medium" },
  { value: "sapper/miner", label: "Sapper/Miner" },
  { value: "slinger", label: "Slinger" },
] as const;

const SOLDIER_MONTHLY_WAGES_GP: Record<string, number> = {
  "archer (longbow)": 4,
  "archer (shortbow)": 2,
  artillerist: 5,
  crossbowman: 2,
  "footman, heavy": 2,
  "footman, light": 1,
  "footman, pikeman": 3,
  "hobilar, heavy": 3,
  "hobilar, light": 2,
  "horseman, archer": 6,
  "horseman, crossbowman": 4,
  "horseman, heavy": 6,
  "horseman, light": 3,
  "horseman, medium": 4,
  "sapper/miner": 4,
  slinger: 3,
};

function soldierWageBreakdown(soldierType: string, menValue: string | number) {
  const men = Math.max(0, Math.floor(Number(menValue) || 0));
  const normalizedType = soldierType.trim().toLowerCase();
  const baseWage = SOLDIER_MONTHLY_WAGES_GP[normalizedType];
  if (!men || baseWage === undefined) return null;
  const serjeants = Math.ceil(men / 10);
  const ordinary = men - serjeants;
  const monthlyTotal = ordinary * baseWage + serjeants * baseWage * 10;
  return { men, ordinary, serjeants, baseWage, monthlyTotal };
}

const equipmentCatalog: EquipmentItem[] = [
  { category: "Armor", name: "Banded mail", amount: 90, coin: "gp", encumbrance: "350 coin" },
  { category: "Armor", name: "Chain mail", amount: 75, coin: "gp", encumbrance: "300 coin" },
  { category: "Armor", name: "Helmet, great", amount: 15, coin: "gp", encumbrance: "100 coin" },
  { category: "Armor", name: "Helmet, small", amount: 10, coin: "gp", encumbrance: "45 coin" },
  { category: "Armor", name: "Leather armor", amount: 5, coin: "gp", encumbrance: "150 coin" },
  { category: "Armor", name: "Padded armor", amount: 4, coin: "gp", encumbrance: "100 coin" },
  { category: "Armor", name: "Plate mail", amount: 400, coin: "gp", encumbrance: "450 coin" },
  { category: "Armor", name: "Ring mail", amount: 30, coin: "gp", encumbrance: "250 coin" },
  { category: "Armor", name: "Scale mail", amount: 45, coin: "gp", encumbrance: "400 coin" },
  { category: "Armor", name: "Shield, large", amount: 15, coin: "gp", encumbrance: "100 coin" },
  { category: "Armor", name: "Shield, small", amount: 10, coin: "gp", encumbrance: "50 coin" },
  { category: "Armor", name: "Shield, small wooden", amount: 1, coin: "gp", encumbrance: "30 coin" },
  { category: "Armor", name: "Splint mail", amount: 80, coin: "gp", encumbrance: "400 coin" },
  { category: "Armor", name: "Studded leather", amount: 15, coin: "gp", encumbrance: "200 coin" },
  { category: "Arms", name: "Arrow, normal (single)", amount: 2, coin: "sp", encumbrance: "2 coin" },
  { category: "Arms", name: "Arrows, normal (dozen)", amount: 1, coin: "gp", encumbrance: "24 coin" },
  { category: "Arms", name: "Arrow, silver (single)", amount: 1, coin: "gp", encumbrance: "2 coin" },
  { category: "Arms", name: "Axe, battle", amount: 5, coin: "gp", encumbrance: "75 coin" },
  { category: "Arms", name: "Axe, hand or throwing", amount: 1, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Club", amount: 0, coin: "gp", encumbrance: "30 coin" },
  { category: "Arms", name: "Bardiche", amount: 7, coin: "gp", encumbrance: "125 coin" },
  { category: "Arms", name: "Bec de corbin", amount: 6, coin: "gp", encumbrance: "100 coin" },
  { category: "Arms", name: "Bill-guisarme", amount: 6, coin: "gp", encumbrance: "150 coin" },
  { category: "Arms", name: "Bow, composite short", amount: 75, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Bow, composite long", amount: 100, coin: "gp", encumbrance: "80 coin" },
  { category: "Arms", name: "Bow, long", amount: 60, coin: "gp", encumbrance: "100 coin" },
  { category: "Arms", name: "Bow, short", amount: 15, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Crossbow, heavy", amount: 20, coin: "gp", encumbrance: "80 coin" },
  { category: "Arms", name: "Crossbow, light", amount: 12, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Dagger and scabbard", amount: 2, coin: "gp", encumbrance: "10 coin" },
  { category: "Arms", name: "Dart", amount: 5, coin: "sp", encumbrance: "5 coin" },
  { category: "Arms", name: "Fauchard", amount: 3, coin: "gp", encumbrance: "60 coin" },
  { category: "Arms", name: "Fauchard-fork", amount: 8, coin: "gp", encumbrance: "80 coin" },
  { category: "Arms", name: "Flail, footman’s", amount: 3, coin: "gp", encumbrance: "150 coin" },
  { category: "Arms", name: "Flail, horseman’s", amount: 8, coin: "gp", encumbrance: "35 coin" },
  { category: "Arms", name: "Fork, military", amount: 4, coin: "gp", encumbrance: "75 coin" },
  { category: "Arms", name: "Glaive", amount: 6, coin: "gp", encumbrance: "75 coin" },
  { category: "Arms", name: "Glaive-guisarme", amount: 10, coin: "gp", encumbrance: "100 coin" },
  { category: "Arms", name: "Guisarme", amount: 5, coin: "gp", encumbrance: "80 coin" },
  { category: "Arms", name: "Guisarme-voulge", amount: 7, coin: "gp", encumbrance: "150 coin" },
  { category: "Arms", name: "Halberd", amount: 9, coin: "gp", encumbrance: "175 coin" },
  { category: "Arms", name: "Hammer, lucern", amount: 7, coin: "gp", encumbrance: "150 coin" },
  { category: "Arms", name: "Hammer", amount: 1, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Javelin", amount: 10, coin: "sp", encumbrance: "20 coin" },
  { category: "Arms", name: "Lance", amount: 6, coin: "gp", encumbrance: "50–150 coin" },
  { category: "Arms", name: "Mace, footman’s", amount: 8, coin: "gp", encumbrance: "100 coin" },
  { category: "Arms", name: "Mace, horseman’s", amount: 4, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Morning star", amount: 5, coin: "gp", encumbrance: "125 coin" },
  { category: "Arms", name: "Partisan", amount: 10, coin: "gp", encumbrance: "80 coin" },
  { category: "Arms", name: "Pick, military, footman’s", amount: 8, coin: "gp", encumbrance: "60 coin" },
  { category: "Arms", name: "Pick, military, horseman’s", amount: 5, coin: "gp", encumbrance: "40 coin" },
  { category: "Arms", name: "Pike, awl", amount: 3, coin: "gp", encumbrance: "80 coin" },
  { category: "Arms", name: "Quarrel (bolt), light (single)", amount: 1, coin: "sp", encumbrance: "1 coin" },
  { category: "Arms", name: "Quarrels (bolts), heavy (score)", amount: 2, coin: "gp", encumbrance: "40 coin" },
  { category: "Arms", name: "Ranseur", amount: 4, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Scimitar", amount: 15, coin: "gp", encumbrance: "40 coin" },
  { category: "Arms", name: "Sling and bullets (dozen)", amount: 15, coin: "sp", encumbrance: "24 coin" },
  { category: "Arms", name: "Sling bullets (score)", amount: 10, coin: "sp", encumbrance: "40 coin" },
  { category: "Arms", name: "Spear", amount: 1, coin: "gp", encumbrance: "40–60 coin" },
  { category: "Arms", name: "Spetum", amount: 3, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Sword, bastard and scabbard", amount: 25, coin: "gp", encumbrance: "100 coin" },
  { category: "Arms", name: "Sword, broad and scabbard", amount: 10, coin: "gp", encumbrance: "75 coin" },
  { category: "Arms", name: "Sword, long and scabbard", amount: 15, coin: "gp", encumbrance: "60 coin" },
  { category: "Arms", name: "Sword, short and scabbard", amount: 8, coin: "gp", encumbrance: "35 coin" },
  { category: "Arms", name: "Sword, two-handed", amount: 30, coin: "gp", encumbrance: "250 coin" },
  { category: "Arms", name: "Trident", amount: 4, coin: "gp", encumbrance: "50 coin" },
  { category: "Arms", name: "Voulge", amount: 2, coin: "gp", encumbrance: "125 coin" },
  { category: "Clothing", name: "Belt", amount: 3, coin: "sp", encumbrance: "3 coin" },
  { category: "Clothing", name: "Boots, high, hard", amount: 2, coin: "gp", encumbrance: "60 coin" },
  { category: "Clothing", name: "Boots, high, soft", amount: 1, coin: "gp", encumbrance: "30 coin" },
  { category: "Clothing", name: "Boots, low, hard", amount: 1, coin: "gp", encumbrance: "60 coin" },
  { category: "Clothing", name: "Boots, low, soft", amount: 8, coin: "sp", encumbrance: "30 coin" },
  { category: "Clothing", name: "Cap", amount: 1, coin: "sp", encumbrance: "—" },
  { category: "Clothing", name: "Cloak", amount: 5, coin: "sp", encumbrance: "25 coin worn / 50 coin folded" },
  { category: "Clothing", name: "Girdle, broad", amount: 2, coin: "gp", encumbrance: "—" },
  { category: "Clothing", name: "Girdle, normal", amount: 10, coin: "sp", encumbrance: "—" },
  { category: "Clothing", name: "Hat", amount: 7, coin: "sp", encumbrance: "—" },
  { category: "Clothing", name: "Robe", amount: 6, coin: "sp", encumbrance: "25 coin worn / 50 coin folded" },
  { category: "Herbs", name: "Belladonna, sprig", amount: 4, coin: "sp", encumbrance: "—" },
  { category: "Herbs", name: "Garlic, bud", amount: 5, coin: "cp", encumbrance: "—" },
  { category: "Herbs", name: "Wolfsbane, sprig", amount: 10, coin: "sp", encumbrance: "—" },
  { category: "Livestock", name: "Chicken", amount: 3, coin: "cp", encumbrance: "—" },
  { category: "Livestock", name: "Cow", amount: 10, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Dog, guard", amount: 25, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Dog, hunting", amount: 17, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Donkey", amount: 8, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Goat", amount: 1, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Hawk, large", amount: 40, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Hawk, small", amount: 18, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Horse, draft", amount: 30, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Horse, heavy war", amount: 300, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Horse, light war", amount: 150, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Horse, medium war", amount: 225, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Horse, riding (light)", amount: 25, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Mule", amount: 20, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Ox", amount: 15, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Pigeon", amount: 2, coin: "cp", encumbrance: "—" },
  { category: "Livestock", name: "Piglet", amount: 1, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Pig", amount: 3, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Pony", amount: 15, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Sheep", amount: 2, coin: "gp", encumbrance: "—" },
  { category: "Livestock", name: "Songbird", amount: 4, coin: "cp", encumbrance: "—" },
  { category: "Miscellaneous", name: "Backpack, leather", amount: 2, coin: "gp", encumbrance: "20 coin" },
  { category: "Miscellaneous", name: "Box, iron, large", amount: 28, coin: "gp", encumbrance: "1,000–5,000 coin" },
  { category: "Miscellaneous", name: "Box, iron, small", amount: 9, coin: "gp", encumbrance: "200–500 coin" },
  { category: "Miscellaneous", name: "Candle, tallow", amount: 1, coin: "cp", encumbrance: "5 coin" },
  { category: "Miscellaneous", name: "Candle, wax", amount: 1, coin: "sp", encumbrance: "5 coin" },
  { category: "Miscellaneous", name: "Case, bone, map or scroll", amount: 5, coin: "gp", encumbrance: "50 coin" },
  { category: "Miscellaneous", name: "Case, leather, map or scroll", amount: 15, coin: "sp", encumbrance: "25 coin" },
  { category: "Miscellaneous", name: "Chest, wooden, large", amount: 17, coin: "sp", encumbrance: "500–1,500 coin" },
  { category: "Miscellaneous", name: "Chest, wooden, small", amount: 8, coin: "sp", encumbrance: "100–250 coin" },
  { category: "Miscellaneous", name: "Lantern, bullseye", amount: 12, coin: "gp", encumbrance: "60 coin" },
  { category: "Miscellaneous", name: "Lantern, hooded", amount: 7, coin: "gp", encumbrance: "60 coin" },
  { category: "Miscellaneous", name: "Mirror, large metal", amount: 10, coin: "gp", encumbrance: "5 coin" },
  { category: "Miscellaneous", name: "Mirror, small, silver", amount: 20, coin: "gp", encumbrance: "5 coin" },
  { category: "Miscellaneous", name: "Oil, flask", amount: 1, coin: "gp", encumbrance: "20 coin" },
  { category: "Miscellaneous", name: "Pole, 10 feet", amount: 3, coin: "cp", encumbrance: "100 coin" },
  { category: "Miscellaneous", name: "Pouch, belt, large", amount: 1, coin: "gp", encumbrance: "10 coin" },
  { category: "Miscellaneous", name: "Pouch, belt, small", amount: 15, coin: "sp", encumbrance: "5 coin" },
  { category: "Miscellaneous", name: "Quiver, 1 dozen arrows", amount: 8, coin: "sp", encumbrance: "30 coin" },
  { category: "Miscellaneous", name: "Quiver, 1 score arrows", amount: 12, coin: "sp", encumbrance: "30 coin" },
  { category: "Miscellaneous", name: "Quiver, 1 score bolts", amount: 15, coin: "sp", encumbrance: "30 coin" },
  { category: "Miscellaneous", name: "Quiver, 2 score bolts", amount: 1, coin: "gp", encumbrance: "30 coin" },
  { category: "Miscellaneous", name: "Rope, 50 feet", amount: 4, coin: "sp", encumbrance: "75 coin" },
  { category: "Miscellaneous", name: "Sack, large", amount: 16, coin: "cp", encumbrance: "20 coin" },
  { category: "Miscellaneous", name: "Sack, small", amount: 10, coin: "cp", encumbrance: "5 coin" },
  { category: "Miscellaneous", name: "Skin for water or wine", amount: 15, coin: "sp", encumbrance: "5 coin empty / 50 coin full" },
  { category: "Miscellaneous", name: "Spike, iron, large", amount: 1, coin: "cp", encumbrance: "10 coin" },
  { category: "Miscellaneous", name: "Thieves’ picks and tools", amount: 30, coin: "gp", encumbrance: "—" },
  { category: "Miscellaneous", name: "Tinderbox with flint and steel", amount: 1, coin: "gp", encumbrance: "2 coin" },
  { category: "Miscellaneous", name: "Torch", amount: 1, coin: "cp", encumbrance: "25 coin" },
  { category: "Provisions", name: "Ale, pint", amount: 1, coin: "sp", encumbrance: "—" },
  { category: "Provisions", name: "Beer, small, pint", amount: 5, coin: "cp", encumbrance: "—" },
  { category: "Provisions", name: "Food, merchant’s meal", amount: 1, coin: "sp", encumbrance: "—" },
  { category: "Provisions", name: "Food, rich meal", amount: 1, coin: "gp", encumbrance: "—" },
  { category: "Provisions", name: "Grain, horse meal (1 day)", amount: 1, coin: "sp", encumbrance: "—" },
  { category: "Provisions", name: "Mead, pint", amount: 5, coin: "sp", encumbrance: "—" },
  { category: "Provisions", name: "Rations, iron (1 week)", amount: 5, coin: "gp", encumbrance: "75 coin" },
  { category: "Provisions", name: "Rations, standard (1 week)", amount: 3, coin: "gp", encumbrance: "200 coin" },
  { category: "Provisions", name: "Wine, pint, good", amount: 10, coin: "sp", encumbrance: "—" },
  { category: "Provisions", name: "Wine, pint, watered", amount: 5, coin: "sp", encumbrance: "—" },
  { category: "Tack and Harness", name: "Barding, chain", amount: 250, coin: "gp", encumbrance: "—" },
  { category: "Tack and Harness", name: "Barding, leather", amount: 100, coin: "gp", encumbrance: "—" },
  { category: "Tack and Harness", name: "Barding, plate", amount: 500, coin: "gp", encumbrance: "—" },
  { category: "Tack and Harness", name: "Bit and bridle", amount: 15, coin: "sp", encumbrance: "—" },
  { category: "Tack and Harness", name: "Harness", amount: 12, coin: "sp", encumbrance: "—" },
  { category: "Tack and Harness", name: "Saddle", amount: 10, coin: "gp", encumbrance: "250–500 coin" },
  { category: "Tack and Harness", name: "Saddle bags, large", amount: 4, coin: "gp", encumbrance: "150 coin" },
  { category: "Tack and Harness", name: "Saddle bags, small", amount: 3, coin: "gp", encumbrance: "150 coin" },
  { category: "Tack and Harness", name: "Saddle blanket", amount: 3, coin: "sp", encumbrance: "20 coin" },
  { category: "Religious", name: "Prayer beads", amount: 1, coin: "gp", encumbrance: "—" },
  { category: "Religious", name: "Incense, stick", amount: 1, coin: "gp", encumbrance: "—" },
  { category: "Religious", name: "Holy or unholy symbol, iron", amount: 2, coin: "gp", encumbrance: "—" },
  { category: "Religious", name: "Holy or unholy symbol, silver", amount: 50, coin: "gp", encumbrance: "—" },
  { category: "Religious", name: "Holy or unholy symbol, wooden", amount: 7, coin: "sp", encumbrance: "—" },
  { category: "Religious", name: "Holy or unholy water, vial", amount: 25, coin: "gp", encumbrance: "25 coin" },

];

const RECRUIT_ARMOR_AC: Record<string, number> = {
  "Unarmored": 10,
  "Leather armor": 8,
  "Padded armor": 8,
  "Studded leather": 7,
  "Ring mail": 7,
  "Scale mail": 6,
  "Chain mail": 5,
  "Splint mail": 4,
  "Banded mail": 4,
  "Plate mail": 3,
};

const RECRUIT_LIGHT_ARMOR = ["Unarmored","Leather armor","Padded armor","Studded leather","Ring mail"];
const RECRUIT_MEDIUM_ARMOR = [...RECRUIT_LIGHT_ARMOR,"Scale mail","Chain mail"];
const RECRUIT_HEAVY_ARMOR = [...RECRUIT_MEDIUM_ARMOR,"Splint mail","Banded mail","Plate mail"];
const RECRUIT_SHIELDS = ["Shield, large","Shield, small","Shield, small wooden"];
const RECRUIT_SHORTBOWS = ["Bow, short","Bow, composite short"];
const RECRUIT_LONGBOWS = ["Bow, long","Bow, composite long"];
const RECRUIT_CROSSBOWS = ["Crossbow, light","Crossbow, heavy"];
const RECRUIT_PIKEMAN_WEAPONS = ['Pike, awl', 'Spear'].map(String);
const RECRUIT_AMMO = [
  "Arrow, normal (single)","Arrows, normal (dozen)","Arrow, silver (single)",
  "Quarrel (bolt), light (single)","Quarrels (bolts), heavy (score)","Sling bullets (score)",
];
const RECRUIT_MISSILE_ONLY = [
  ...RECRUIT_SHORTBOWS,...RECRUIT_LONGBOWS,...RECRUIT_CROSSBOWS,
  "Sling and bullets (dozen)","Dart",
];
const RECRUIT_LIGHT_HORSE_THROWING_WEAPONS = [
  "Axe, hand or throwing",
  "Javelin",
  "Dart",
];
const RECRUIT_WEAPON_ITEMS = equipmentCatalog.filter(
  (item) => item.category === "Arms" && !RECRUIT_AMMO.includes(item.name),
);
const RECRUIT_MELEE_WEAPONS = RECRUIT_WEAPON_ITEMS
  .filter((item) => !RECRUIT_MISSILE_ONLY.includes(item.name))
  .map((item) => item.name);

type RecruitEquipmentRules = {
  armor: string[];
  weaponMode: "melee" | "shortbow" | "longbow" | "crossbow" | "other";
  shieldAllowed: boolean;
  requireMelee: boolean;
  requiredMissileWeapons?: string[];
  additionalWeapons?: string[];
};

function recruitEquipmentRules(value: string): RecruitEquipmentRules {
  const type = value.trim().toLowerCase();

  if (type === "archer (shortbow)" || type === "horseman, archer") {
    return { armor: RECRUIT_LIGHT_ARMOR, weaponMode: "shortbow", shieldAllowed: false, requireMelee: true, requiredMissileWeapons: RECRUIT_SHORTBOWS };
  }
  if (type === "archer (longbow)") {
    return { armor: RECRUIT_LIGHT_ARMOR, weaponMode: "longbow", shieldAllowed: false, requireMelee: true, requiredMissileWeapons: RECRUIT_LONGBOWS };
  }
  if (type === "crossbowman" || type === "horseman, crossbowman") {
    return { armor: RECRUIT_LIGHT_ARMOR, weaponMode: "crossbow", shieldAllowed: false, requireMelee: true, requiredMissileWeapons: RECRUIT_CROSSBOWS };
  }
  if (["footman, heavy","hobilar, heavy","horseman, heavy"].includes(type)) {
    return { armor: RECRUIT_HEAVY_ARMOR, weaponMode: "melee", shieldAllowed: true, requireMelee: true };
  }
  if (type === "horseman, medium") {
    return { armor: RECRUIT_MEDIUM_ARMOR, weaponMode: "melee", shieldAllowed: true, requireMelee: true };
  }
  if (type === "footman, pikeman") {
    return { armor: RECRUIT_LIGHT_ARMOR, weaponMode: "melee", shieldAllowed: true, requireMelee: true, requiredMissileWeapons: RECRUIT_PIKEMAN_WEAPONS };
  }
  if (type === "horseman, light") {
    return {
      armor: RECRUIT_LIGHT_ARMOR,
      weaponMode: "melee",
      shieldAllowed: true,
      requireMelee: true,
      additionalWeapons: RECRUIT_LIGHT_HORSE_THROWING_WEAPONS,
    };
  }
  if (["footman, light","hobilar, light"].includes(type)) {
    return { armor: RECRUIT_LIGHT_ARMOR, weaponMode: "melee", shieldAllowed: true, requireMelee: true };
  }

  return { armor: RECRUIT_HEAVY_ARMOR, weaponMode: "other", shieldAllowed: true, requireMelee: false };
}

function recruitWeaponOptions(rules: RecruitEquipmentRules) {
  if (!rules.requiredMissileWeapons) return RECRUIT_WEAPON_ITEMS;
  return RECRUIT_WEAPON_ITEMS.filter(
    (item) =>
      rules.requiredMissileWeapons?.includes(item.name) ||
      rules.additionalWeapons?.includes(item.name) ||
      RECRUIT_MELEE_WEAPONS.includes(item.name),
  );
}

function recruitGearValidation(rules: RecruitEquipmentRules, armor: string, weapons: string[], shield: string) {
  if (!rules.armor.includes(armor)) return "Select armor permitted for this troop type.";
  if (weapons.length > 3) return "Recruits can carry no more than three weapons.";
  if (rules.requireMelee && !weapons.some((name) => RECRUIT_MELEE_WEAPONS.includes(name))) {
    return "These recruits must carry at least one melee weapon.";
  }
  if (rules.requiredMissileWeapons && !weapons.some((name) => rules.requiredMissileWeapons?.includes(name))) {
    if (rules.requiredMissileWeapons === RECRUIT_PIKEMAN_WEAPONS) return "Pikemen must carry a spear or pike.";
    if (rules.weaponMode === "shortbow") return "Shortbowmen must carry a shortbow.";
    if (rules.weaponMode === "longbow") return "Longbowmen must carry a longbow.";
    return "Crossbowmen must carry a light or heavy crossbow.";
  }
  if (shield && !rules.shieldAllowed) return "This troop type cannot carry a shield.";
  return "";
}


function forceEditorArmorOptions(soldierType: string) {
  if (!soldierType) return FORCE_ARMOR_OPTIONS;
  const rules = recruitEquipmentRules(soldierType);
  const allowedAcs = new Set(rules.armor.map((armor) => RECRUIT_ARMOR_AC[armor]).filter((ac) => ac !== undefined));
  return FORCE_ARMOR_OPTIONS.filter((option) => allowedAcs.has(option.ac));
}

function forceEditorWeaponNames(soldierType: string) {
  if (!soldierType) return FORCE_WEAPON_OPTIONS.map((weapon) => weapon.name);
  const rules = recruitEquipmentRules(soldierType);

  if (rules.weaponMode === "other") {
    return FORCE_WEAPON_OPTIONS.map((weapon) => weapon.name);
  }

  const allowed = new Set<string>();
  RECRUIT_MELEE_WEAPONS.forEach((name) => allowed.add(name));
  (rules.requiredMissileWeapons || []).forEach((name) => allowed.add(name));
  (rules.additionalWeapons || []).forEach((name) => allowed.add(name));

  return Array.from(allowed);
}

function forceEditorWeaponOptions(soldierType: string) {
  const allowedNames = new Set(forceEditorWeaponNames(soldierType));
  const allNames = [
    ...FORCE_WEAPON_OPTIONS.map((weapon) => weapon.name),
    ...RECRUIT_WEAPON_ITEMS.map((weapon) => weapon.name),
  ];
  return Array.from(new Set(allNames))
    .filter((name) => allowedNames.has(name))
    .map((name) => FORCE_WEAPON_OPTIONS.find((weapon) => weapon.name === name) || {
      name,
      damageSmallMedium: "",
      damageLarge: "",
    });
}

function forceEditorGearValidation(
  soldierType: string,
  armor: string,
  shield: boolean,
  weaponNames: string[],
) {
  if (!soldierType) return "";
  const rules = recruitEquipmentRules(soldierType);

  // Legacy/unknown troop types remain editable without imposing recruitment
  // restrictions that were never defined for them.
  if (rules.weaponMode === "other") return weaponNames.length > 3
    ? "A soldier group can carry no more than three weapons."
    : "";

  const allowedArmorNames = new Set<string>(
    forceEditorArmorOptions(soldierType).map((option) => String(option.name)),
  );
  if (!allowedArmorNames.has(armor)) return "Select armor permitted for this troop type.";
  if (shield && !rules.shieldAllowed) return "This troop type cannot carry a shield.";
  if (weaponNames.length > 3) return "A soldier group can carry no more than three weapons.";

  const allowedWeapons = new Set(forceEditorWeaponNames(soldierType));
  if (weaponNames.some((name) => !allowedWeapons.has(name))) {
    return "Remove weapons that are not permitted for this troop type.";
  }

  if (rules.requireMelee && !weaponNames.some((name) => RECRUIT_MELEE_WEAPONS.includes(name))) {
    return "This troop type must carry at least one melee weapon.";
  }

  if (
    rules.requiredMissileWeapons &&
    !weaponNames.some((name) => rules.requiredMissileWeapons?.includes(name))
  ) {
    if (rules.requiredMissileWeapons === RECRUIT_PIKEMAN_WEAPONS) return "Pikemen must carry a spear or pike.";
    if (rules.weaponMode === "shortbow") return "Shortbowmen must carry a shortbow.";
    if (rules.weaponMode === "longbow") return "Longbowmen must carry a longbow.";
    return "Crossbowmen must carry a light or heavy crossbow.";
  }

  return "";
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getSessionToken()));
  const [loginOptions, setLoginOptions] = useState<LoginOption[]>([]);
  const [passwordChangeToken, setPasswordChangeToken] = useState("");
  const [section, setSection] = useState<Section>("wallet");
  const [platinum, setPlatinum] = useState(0);
  const [gold, setGold] = useState(0);
  const [silver, setSilver] = useState(0);
  const [copper, setCopper] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journalEntries, setJournalEntries] = useState<SheetJournalEntry[]>([]);
  const [editingJournalEntry, setEditingJournalEntry] = useState<SheetJournalEntry | null>(null);
  const [recurringExpenses, setRecurringExpenses] = useState<SheetRecurringExpense[]>([]);
  const [retainers, setRetainers] = useState<SheetRetainer[]>([]);
  const [retainerDraftDirty, setRetainerDraftDirty] = useState(false);
  const [retainerSyncing, setRetainerSyncing] = useState(false);
  const [retainerSyncError, setRetainerSyncError] = useState("");
  const [retainerLastSyncedAt, setRetainerLastSyncedAt] = useState("");
  const [territories, setTerritories] = useState<SheetTerritory[]>([]);
  const [managedTerritories, setManagedTerritories] = useState<SheetTerritory[]>([]);
  const [scoutingMissions, setScoutingMissions] = useState<SheetScoutingMission[]>([]);
  const [customMissions, setCustomMissions] = useState<SheetCustomMission[]>([]);
  const [territoryHexes, setTerritoryHexes] = useState<SheetTerritoryHex[]>([]);
  const [territoryDraftDirty, setTerritoryDraftDirty] = useState(false);
  const [territorySyncing, setTerritorySyncing] = useState(false);
  const [territorySyncError, setTerritorySyncError] = useState("");
  const [territoryLastSyncedAt, setTerritoryLastSyncedAt] = useState("");
  const [editingTerritory, setEditingTerritory] = useState<SheetTerritory | null>(null);
  const [editingRetainer, setEditingRetainer] = useState<SheetRetainer | null>(null);
  const [retainerKind, setRetainerKind] = useState<"individual" | "force">("individual");
  const [modal, setModal] = useState<"funds" | "expense" | "purchase" | "character" | "edit-character" | "delete-character" | "ledger" | "journal-entry" | "recurring-expenses" | "retainer" | "territory" | null>(null);
  const [characterMenu, setCharacterMenu] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState("");
  const [characters, setCharacters] = useState<SheetCharacter[]>(() =>
    loadSharedRosterCache()?.characters || [],
  );
  const [campaignName, setCampaignName] = useState("Evermoor Campaign");
  const [discordWebhookConfigured, setDiscordWebhookConfigured] = useState(false);
  const [editingCampaignName, setEditingCampaignName] = useState(false);
  const [players, setPlayers] = useState<SheetPlayer[]>(() =>
    loadSharedRosterCache()?.players || [],
  );
  const [currentPlayer, setCurrentPlayer] = useState<SheetPlayer | null>(() =>
    loadSharedRosterCache()?.currentPlayer || null,
  );
  const [permissions, setPermissions] = useState({
    isDm: false,
    territories: false,
    retainers: true,
    playerManagement: false,
  });
  function accountPermissions(player: SheetPlayer | null | undefined) {
    const isDm = String(player?.role || "").toLowerCase() === "dm";
    return {
      isDm,
      territories: isDm || Boolean(player?.territoriesEnabled),
      retainers: true,
      playerManagement: isDm,
    };
  }

  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [portraitViewer, setPortraitViewer] = useState<SheetCharacter | null>(null);
  const [dataStatus, setDataStatus] = useState<"demo" | "loading" | "cached" | "connected" | "error">(
    hasSheetsConnection() ? "loading" : "demo",
  );
  const cacheBaseRef = useRef<SheetBootstrap | null>(null);
  const selectedCharacterIdRef = useRef("");
  const characterLoadRequestRef = useRef(0);
  const walletLoadedCharacterIdRef = useRef("");
  const scoutingAutoSubmitInFlightRef = useRef<Set<string>>(new Set());
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState("");
  const [profileLastSyncedAt, setProfileLastSyncedAt] = useState("");
  const [profileSyncSuccess, setProfileSyncSuccess] = useState(false);
  const [walletBackupBusy, setWalletBackupBusy] = useState<"backup" | "restore" | "">("");
  const [walletBackupMessage, setWalletBackupMessage] = useState("");
  const [walletBackupError, setWalletBackupError] = useState("");
  const [rosterRefreshing, setRosterRefreshing] = useState(false);
  const [rosterRefreshError, setRosterRefreshError] = useState("");
  const [dmTabPushing, setDmTabPushing] = useState<SheetSyncTab | "">("");
  const [dmTabPushSuccess, setDmTabPushSuccess] = useState<SheetSyncTab | "">("");
  const [dmTabPushError, setDmTabPushError] = useState("");

  const selectedCharacter =
    characters.find((character) => character.characterId === selectedCharacterId) ||
    characters[0];

  const dmOwnsSelectedCharacter = Boolean(
    permissions.isDm &&
    currentPlayer &&
    selectedCharacter &&
    selectedCharacter.playerId === currentPlayer.playerId,
  );

  // DM-owned characters automatically use the player-style presentation.
  // This does NOT downgrade permissions: DM-only actions still check the real
  // permissions.isDm flag and remain available.
  const dmViewAsPlayer = dmOwnsSelectedCharacter;
  const interfaceIsDm = permissions.isDm;

  const characterPlayers = useMemo(() => {
    const knownPlayers = [...players].sort((left, right) =>
      (left.displayName || left.playerId).localeCompare(right.displayName || right.playerId),
    );
    const knownIds = new Set(knownPlayers.map((player) => player.playerId));
    const missingPlayers = characters
      .filter((character, index, items) =>
        !knownIds.has(character.playerId) &&
        items.findIndex((item) => item.playerId === character.playerId) === index,
      )
      .map((character) => ({
        playerId: character.playerId,
        displayName: character.playerId,
        role: "player" as const,
        active: true,
        territoriesEnabled: true,
        retainersEnabled: true,
      }));
    return [...knownPlayers, ...missingPlayers];
  }, [players, characters]);

  const applySheetData = useCallback((data: SheetBootstrap, openEmptyCharacterModal = true) => {
    cacheBaseRef.current = data;
    setCharacters(data.characters);
    setCampaignName(data.campaignName || "Evermoor Campaign");
    setDiscordWebhookConfigured(Boolean(data.discordWebhookConfigured));
    setPlayers(data.players || []);
    setCurrentPlayer(data.currentPlayer || null);
    setManagedTerritories(data.managedTerritories || []);
    setPermissions(data.permissions || {
      isDm: false,
      territories: false,
      retainers: true,
      playerManagement: false,
    });
    if (data.characters.length) {
      selectedCharacterIdRef.current = data.selectedCharacterId;
      setSelectedCharacterId(data.selectedCharacterId);
      const localWallet = migrateLegacyWalletToLocal(
        data.selectedCharacterId,
        {
          pp: Number(data.balance.pp) || 0,
          gp: Number(data.balance.gp) || 0,
          sp: Number(data.balance.sp) || 0,
          cp: Number(data.balance.cp) || 0,
        },
        data.transactions || [],
        data.recurringExpenses || [],
      );
      walletLoadedCharacterIdRef.current = data.selectedCharacterId;
      setPlatinum(localWallet.balance.pp);
      setGold(localWallet.balance.gp);
      setSilver(localWallet.balance.sp);
      setCopper(localWallet.balance.cp);
      setTransactions(localWallet.transactions);
      setJournalEntries(data.journal || []);
      setRecurringExpenses(localWallet.recurringExpenses);
      const savedRetainerDraft = loadRetainerDraft(data.selectedCharacterId);
      if (savedRetainerDraft) {
        setRetainers(savedRetainerDraft.retainers);
        setRetainerDraftDirty(true);
      } else {
        {
                  const localDraft = loadRetainerDraft(selectedCharacterIdRef.current);
                  if (localDraft) {
                    setRetainers(localDraft.retainers);
                    setRetainerDraftDirty(true);
                  } else {
                    setRetainers(data.retainers || []);
                  }
                }
        setRetainerDraftDirty(false);
      }
      const savedTerritoryDraft = loadTerritoryDraft(data.selectedCharacterId);
      if (savedTerritoryDraft) {
        setTerritories(savedTerritoryDraft.territories);
        setScoutingMissions(savedTerritoryDraft.scoutingMissions);
        setCustomMissions(savedTerritoryDraft.customMissions);
        setTerritoryHexes(savedTerritoryDraft.territoryHexes);
        setTerritoryDraftDirty(savedTerritoryDraft.operations.length > 0);
      } else {
        setTerritories(data.territories || []);
        setScoutingMissions(data.scoutingMissions || []);
        setCustomMissions(data.customMissions || []);
        setTerritoryHexes(data.territoryHexes || []);
        setTerritoryDraftDirty(false);
      }
    } else {
      selectedCharacterIdRef.current = "";
      walletLoadedCharacterIdRef.current = "";
      setSelectedCharacterId("");
      setPlatinum(0);
      setGold(0);
      setSilver(0);
      setCopper(0);
      setTransactions([]);
      setJournalEntries([]);
      setRecurringExpenses([]);
      setRetainers([]);
      setRetainerDraftDirty(false);
      setTerritories([]);
      setScoutingMissions([]);
      setCustomMissions([]);
      setTerritoryHexes([]);
      setTerritoryDraftDirty(false);
      if (openEmptyCharacterModal) setModal("character");
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    // PLAYER DATA STARTUP IS LOCAL-ONLY.
    // Do not contact Google Sheets here. The player explicitly chose a
    // local-first workflow: Sheet communication is permitted only when an
    // explicit sync/refresh/push action is pressed.
    const cached = loadCachedSheetData();

    if (cached) {
      applySheetData(cached, false);
      setDataStatus(hasSheetsConnection() ? "cached" : "demo");
      return;
    }

    // Character-specific data may be absent, but account identity and the
    // character roster are cached independently. Never erase a valid roster
    // merely because this account has not cached a character bootstrap yet.
    cacheBaseRef.current = null;
    const accountState = loadSharedRosterCache();
    const accountCharacters = accountState?.characters || [];
    const initialCharacterId = accountCharacters[0]?.characterId || "";
    selectedCharacterIdRef.current = initialCharacterId;
    setCharacters(accountCharacters);
    setPlayers(accountState?.players || []);
    setCurrentPlayer(accountState?.currentPlayer || null);
    setPermissions(accountPermissions(accountState?.currentPlayer || null));
    setSelectedCharacterId(initialCharacterId);
    const initialLocalWallet = initialCharacterId ? loadLocalWalletState(initialCharacterId) : null;
    walletLoadedCharacterIdRef.current = initialCharacterId;
    setPlatinum(initialLocalWallet?.balance.pp || 0);
    setGold(initialLocalWallet?.balance.gp || 0);
    setSilver(initialLocalWallet?.balance.sp || 0);
    setCopper(initialLocalWallet?.balance.cp || 0);
    setTransactions(initialLocalWallet?.transactions || []);
    setJournalEntries([]);
    setRecurringExpenses(initialLocalWallet?.recurringExpenses || []);
    setRetainers([]);
    setRetainerDraftDirty(false);
    setTerritories([]);
    setManagedTerritories([]);
    setScoutingMissions([]);
    setCustomMissions([]);
    setTerritoryHexes([]);
    setTerritoryDraftDirty(false);
    setDataStatus(hasSheetsConnection() ? "cached" : "demo");

    if (!accountState && hasSheetsConnection()) {
      // Migration/recovery path for a session created before account-level
      // roster caching existed (or after local storage was cleared). This is a
      // small roster-only read, not a character bootstrap, and runs only until
      // the account cache has been established.
      void loadAccountRoster()
        .then((roster) => {
          setCurrentPlayer(roster.currentPlayer);
          setPlayers(roster.players || []);
          setCharacters(roster.characters || []);
          setPermissions(accountPermissions(roster.currentPlayer));
          const firstCharacterId = roster.characters?.[0]?.characterId || "";
          selectedCharacterIdRef.current = firstCharacterId;
          setSelectedCharacterId(firstCharacterId);
          const recoveredWallet = firstCharacterId ? loadLocalWalletState(firstCharacterId) : null;
          walletLoadedCharacterIdRef.current = firstCharacterId;
          setPlatinum(recoveredWallet?.balance.pp || 0);
          setGold(recoveredWallet?.balance.gp || 0);
          setSilver(recoveredWallet?.balance.sp || 0);
          setCopper(recoveredWallet?.balance.cp || 0);
          setTransactions(recoveredWallet?.transactions || []);
          setRecurringExpenses(recoveredWallet?.recurringExpenses || []);
          setDataStatus("connected");
        })
        .catch((error) => {
          if (String(error).toLowerCase().includes("session")) {
            clearSession();
            setAuthenticated(false);
          }
        });
    }
  }, [authenticated, applySheetData]);

  useEffect(() => {
    if ((dataStatus !== "connected" && dataStatus !== "cached") || !cacheBaseRef.current) return;
    const timeout = window.setTimeout(() => {
      const base = cacheBaseRef.current;
      if (!base) return;
      saveCachedSheetData({
        ...base,
        campaignName,
        discordWebhookConfigured,
        players,
        managedTerritories,
        permissions,
        characters,
        selectedCharacterId,
        balance: { pp: platinum, gp: gold, sp: silver, cp: copper },
        transactions: base.transactions,
        journal: journalEntries,
        recurringExpenses,
        retainers,
        territories,
        scoutingMissions,
        customMissions,
        territoryHexes,
      });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [dataStatus, campaignName, discordWebhookConfigured, players, permissions, characters,
    selectedCharacterId, platinum, gold, silver, copper, journalEntries, recurringExpenses,
    retainers, territories, managedTerritories, scoutingMissions, customMissions, territoryHexes]);

  useEffect(() => {
    if (!selectedCharacterId || walletLoadedCharacterIdRef.current !== selectedCharacterId) return;

    const canonicalBalance = walletBalanceFromTransactions(transactions);

    // Keep the visible purse synchronized to the ledger. Reopening the app
    // cannot change the purse unless the ledger itself changed.
    if (platinum !== canonicalBalance.pp) setPlatinum(canonicalBalance.pp);
    if (gold !== canonicalBalance.gp) setGold(canonicalBalance.gp);
    if (silver !== canonicalBalance.sp) setSilver(canonicalBalance.sp);
    if (copper !== canonicalBalance.cp) setCopper(canonicalBalance.cp);

    saveLocalWalletState({
      version: 1,
      characterId: selectedCharacterId,
      balance: canonicalBalance,
      transactions,
      recurringExpenses,
      savedAt: new Date().toISOString(),
    });
  }, [selectedCharacterId, platinum, gold, silver, copper, transactions, recurringExpenses]);

  useEffect(() => {
    if (!selectedCharacterId || walletLoadedCharacterIdRef.current !== selectedCharacterId) return;
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    const dueTransactions: Transaction[] = [];
    const coinDeltas: CoinBalances = { pp: 0, gp: 0, sp: 0, cp: 0 };
    let changed = false;

    const nextSchedules = recurringExpenses.map((schedule) => {
      if (!schedule.active) return schedule;
      let occurrenceCount = Math.max(0, Number(schedule.occurrenceCount) || 0);
      let safety = 0;
      while (safety < 500) {
        const dueAt = recurringOccurrenceDate(schedule.startDate, schedule.frequency, occurrenceCount);
        if (!dueAt || dueAt.getTime() > todayUtc) break;
        const occurrenceNumber = occurrenceCount + 1;
        const localTransactionId = `local-recurring:${schedule.scheduleId}:${occurrenceNumber}`;
        if (!transactions.some((item) => item.transactionId === localTransactionId) &&
            !dueTransactions.some((item) => item.transactionId === localTransactionId)) {
          const coins: CoinBalances = {
            pp: -(Math.abs(Number(schedule.pp) || 0)),
            gp: -(Math.abs(Number(schedule.gp) || 0)),
            sp: -(Math.abs(Number(schedule.sp) || 0)),
            cp: -(Math.abs(Number(schedule.cp) || 0)),
          };
          coinDeltas.pp += coins.pp;
          coinDeltas.gp += coins.gp;
          coinDeltas.sp += coins.sp;
          coinDeltas.cp += coins.cp;
          dueTransactions.push({
            id: hashId(localTransactionId),
            label: schedule.label,
            coins,
            kind: "expense",
            note: schedule.note?.trim() || "Recurring expense",
            timestamp: formatLedgerDate(dueAt.toISOString()),
            source: "local",
            transactionId: localTransactionId,
          });
        }
        occurrenceCount += 1;
        safety += 1;
        changed = true;
      }
      return occurrenceCount === Number(schedule.occurrenceCount || 0)
        ? schedule
        : { ...schedule, occurrenceCount };
    });

    if (!changed) return;
    setRecurringExpenses(nextSchedules);
    if (dueTransactions.length) {
      setPlatinum((current) => Math.max(0, current + coinDeltas.pp));
      setGold((current) => Math.max(0, current + coinDeltas.gp));
      setSilver((current) => Math.max(0, current + coinDeltas.sp));
      setCopper((current) => Math.max(0, current + coinDeltas.cp));
      setTransactions((current) => [...dueTransactions.reverse(), ...current]);
    }
  }, [selectedCharacterId, recurringExpenses, transactions]);

  useEffect(() => {
    if (!hasSheetsConnection() || authenticated) return;
    loadLoginOptions().then(setLoginOptions).catch(() => setLoginOptions([]));
  }, [authenticated]);

  const coinWeight = useMemo(
    () => ((platinum + gold + silver + copper) / 10).toFixed(1),
    [platinum, gold, silver, copper],
  );
  const profileHasUnsyncedChanges =
    retainerDraftDirty ||
    territoryDraftDirty;
  const visibleNavItems = useMemo(() => {
    const items = navItems.filter((item) => {
      if (item.id === "territories") return permissions.territories;
      if (item.id === "retainers") return permissions.retainers;
      return true;
    });
    if (permissions.playerManagement) {
      items.push({ id: "player-management", label: "Player Management", icon: LockKeyhole });
    }
    return items;
  }, [permissions]);

  async function refreshPlayerRoster() {
    const roster = await loadPlayerRoster();
    setCurrentPlayer(roster.currentPlayer);
    setPlayers(roster.players || []);
    setCharacters(roster.characters || []);
    setPermissions(accountPermissions(roster.currentPlayer));
    saveSharedRosterCache({
      currentPlayer: roster.currentPlayer,
      players: roster.players || [],
      characters: roster.characters || [],
    });

    // Refresh only account/character membership. Do not replace the currently
    // open character's wallet, retainers, territories, journal, or local drafts.
    const base = cacheBaseRef.current;
    if (base) {
      const selectedStillExists = roster.characters.some(
        (character) => character.characterId === selectedCharacterIdRef.current,
      );
      const nextSelectedCharacterId = selectedStillExists
        ? selectedCharacterIdRef.current
        : roster.characters[0]?.characterId || "";
      const updatedBase: SheetBootstrap = {
        ...base,
        players: roster.players || [],
        characters: roster.characters || [],
        selectedCharacterId: nextSelectedCharacterId,
      };
      cacheBaseRef.current = updatedBase;
      saveCachedSheetData(updatedBase);
    }
  }

  async function saveCampaignName(nextName: string) {
    const trimmedName = nextName.trim();
    setEditingCampaignName(false);
    if (!trimmedName || trimmedName === campaignName) return;
    const result = await updateCampaignName(trimmedName);
    setCampaignName(result.campaignName);
  }

  async function changePlayerAccess(
    targetPlayerId: string,
    enabled: boolean,
  ) {
    const current = players.find((player) => player.playerId === targetPlayerId);
    if (!current) return;
    const result = await updatePlayerAccess({
      targetPlayerId,
      territoriesEnabled: enabled,
    });
    setPlayers((items) =>
      items.map((player) =>
        player.playerId === result.player.playerId ? result.player : player,
      ),
    );
  }

  async function saveDiscordWebhook(targetPlayerId: string, webhookUrl: string) {
    const result = await updateDiscordWebhook(targetPlayerId, webhookUrl);
    setPlayers((items) => items.map((player) =>
      player.playerId === targetPlayerId
        ? { ...player, discordWebhookConfigured: result.configured }
        : player,
    ));
    setCharacters((items) => items.map((character) =>
      character.playerId === targetPlayerId
        ? { ...character, discordConfigured: Boolean(result.configured && character.discordThreadId) }
        : character,
    ));
    if (selectedCharacter?.playerId === targetPlayerId) {
      setDiscordWebhookConfigured(result.configured);
    }
  }

  async function saveCharacterDiscordThread(characterId: string, threadId: string) {
    const result = await updateCharacterDiscordThread({ characterId, threadId });
    setCharacters((items) => items.map((character) =>
      character.characterId === result.character.characterId ? result.character : character,
    ));
  }

  function applySystemWalletTransactionLocally(transaction: SheetTransaction | null | undefined) {
    if (!transaction) return;
    const externalId = String(transaction.transactionId || "");
    if (externalId && transactions.some((item) => item.transactionId === externalId)) return;

    const localTransaction: Transaction = {
      id: hashId(externalId || `system-${Date.now()}-${Math.random()}`),
      label: transaction.label,
      coins: {
        pp: Number(transaction.pp) || 0,
        gp: Number(transaction.gp) || 0,
        sp: Number(transaction.sp) || 0,
        cp: Number(transaction.cp) || 0,
      },
      kind: transaction.type,
      note: transaction.note?.trim() || undefined,
      timestamp: formatLedgerDate(transaction.timestamp || new Date().toISOString()),
      source: "local",
      transactionId: externalId || `local-system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    setPlatinum((current) => Math.max(0, current + localTransaction.coins.pp));
    setGold((current) => Math.max(0, current + localTransaction.coins.gp));
    setSilver((current) => Math.max(0, current + localTransaction.coins.sp));
    setCopper((current) => Math.max(0, current + localTransaction.coins.cp));
    setTransactions((current) => [localTransaction, ...current]);
  }

  async function recordTransaction(
    label: string,
    amount: number,
    coin: CoinType,
    kind: "income" | "expense",
    note: string,
    recurrence?: {
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
    },
  ) {
    const activeCharacterId = selectedCharacterIdRef.current || selectedCharacter?.characterId || "";
    if (!activeCharacterId) return;

    if (recurrence) {
      const schedule: SheetRecurringExpense = {
        scheduleId: `local-recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        characterId: activeCharacterId,
        label,
        pp: coin === "pp" ? amount : 0,
        gp: coin === "gp" ? amount : 0,
        sp: coin === "sp" ? amount : 0,
        cp: coin === "cp" ? amount : 0,
        note,
        frequency: recurrence.frequency,
        startDate: recurrence.startDate,
        occurrenceCount: 0,
        active: true,
      };
      setRecurringExpenses((current) => [schedule, ...current]);
      setModal(null);
      setSection("wallet");
      return;
    }

    const signedAmount = kind === "income" ? amount : -amount;
    const setters = { pp: setPlatinum, gp: setGold, sp: setSilver, cp: setCopper };
    setters[coin]((current) => Math.max(0, current + signedAmount));

    const visibleTransaction: Transaction = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      label,
      coins: {
        pp: coin === "pp" ? signedAmount : 0,
        gp: coin === "gp" ? signedAmount : 0,
        sp: coin === "sp" ? signedAmount : 0,
        cp: coin === "cp" ? signedAmount : 0,
      },
      kind,
      note,
      timestamp: formatLedgerDate(new Date().toISOString()),
      source: "local",
      transactionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    setTransactions((current) => [visibleTransaction, ...current]);
    setModal(null);
    setSection("wallet");
  }

  async function deleteWalletTransaction(transaction: Transaction) {
    const characterId = selectedCharacterIdRef.current || selectedCharacter?.characterId || "";
    if (!characterId) return;

    setPlatinum((current) => Math.max(0, current - (Number(transaction.coins.pp) || 0)));
    setGold((current) => Math.max(0, current - (Number(transaction.coins.gp) || 0)));
    setSilver((current) => Math.max(0, current - (Number(transaction.coins.sp) || 0)));
    setCopper((current) => Math.max(0, current - (Number(transaction.coins.cp) || 0)));
    setTransactions((current) => current.filter((item) => item.id !== transaction.id));
  }

  async function recordPurchase(
    item: EquipmentItem,
    quantity: number,
    note: string,
  ) {
    const activeCharacterId = selectedCharacterIdRef.current || selectedCharacter?.characterId || "";
    if (!activeCharacterId) return;

    const currentBalances: CoinBalances = {
      pp: platinum,
      gp: gold,
      sp: silver,
      cp: copper,
    };
    const costInCopper =
      item.amount * quantity * coinValueInCopper[item.coin];
    const nextBalances = deductCostPreservingCoins(
      currentBalances,
      costInCopper,
    );
    if (!nextBalances) return;
    const deltas: CoinBalances = {
      pp: nextBalances.pp - currentBalances.pp,
      gp: nextBalances.gp - currentBalances.gp,
      sp: nextBalances.sp - currentBalances.sp,
      cp: nextBalances.cp - currentBalances.cp,
    };
    const label = quantity === 1 ? item.name : `${item.name} ×${quantity}`;

    setPlatinum(nextBalances.pp);
    setGold(nextBalances.gp);
    setSilver(nextBalances.sp);
    setCopper(nextBalances.cp);
    setTransactions((current) => [
      {
        id: Date.now(),
        label,
        coins: deltas,
        kind: "expense",
        note,
        timestamp: formatLedgerDate(new Date().toISOString()),
        source: "local",
        transactionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      ...current,
    ]);
    setModal(null);
    setSection("wallet");
  }

  async function createCharacter(input: {
    playerName: string;
    targetPlayerId?: string;
    name: string;
    className: string;
    level: number;
  }) {
    const character = await saveSheetCharacter(input);

    // Character creation is itself the explicit Sheet write. Do NOT follow it
    // with a full bootstrap request: that second request is expensive and can
    // time out even though the character row was created successfully.
    const nextCharacters = [
      ...characters.filter((item) => item.characterId !== character.characterId),
      character,
    ];

    characterLoadRequestRef.current += 1;
    selectedCharacterIdRef.current = character.characterId;
    setCharacters(nextCharacters);
    setSelectedCharacterId(character.characterId);
    const accountPlayer = currentPlayer || loadSharedRosterCache()?.currentPlayer || null;
    if (accountPlayer) {
      saveSharedRosterCache({
        currentPlayer: accountPlayer,
        players,
        characters: nextCharacters,
      });
    }

    // A brand-new character has no character-specific campaign data yet.
    walletLoadedCharacterIdRef.current = character.characterId;
    const emptyWallet: LocalWalletState = {
      version: 1,
      characterId: character.characterId,
      balance: { pp: 0, gp: 0, sp: 0, cp: 0 },
      transactions: [],
      recurringExpenses: [],
      savedAt: new Date().toISOString(),
    };
    saveLocalWalletState(emptyWallet);
    setPlatinum(0);
    setGold(0);
    setSilver(0);
    setCopper(0);
    setTransactions([]);
    setJournalEntries([]);
    setRecurringExpenses([]);
    setRetainers([]);
    setRetainerDraftDirty(false);
    setTerritories([]);
    setScoutingMissions([]);
    setCustomMissions([]);
    setTerritoryHexes([]);
    setTerritoryDraftDirty(false);
    setProfileSyncError("");
    setProfileSyncSuccess(false);

    // Update the existing cached bootstrap locally so the newly-created
    // character remains visible after switching characters or syncing later.
    const base = cacheBaseRef.current;
    if (base) {
      const updatedBase: SheetBootstrap = {
        ...base,
        characters: nextCharacters,
        selectedCharacterId: character.characterId,
        balance: { pp: 0, gp: 0, sp: 0, cp: 0 },
        transactions: [],
        journal: [],
        recurringExpenses: [],
        retainers: [],
        territories: [],
        scoutingMissions: [],
        customMissions: [],
        territoryHexes: [],
      };
      cacheBaseRef.current = updatedBase;
      saveCachedSheetData(updatedBase);
    }

    setCharacterMenu(false);
    setModal(null);
    setDataStatus("connected");
  }

  async function saveCharacterPortrait(file: File) {
    if (!selectedCharacter) throw new Error("Select a character first.");
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Portraits must be 5 MB or smaller.");
    const result = await uploadCharacterPortrait({
      characterId: selectedCharacter.characterId,
      fileName: file.name,
      mimeType: file.type,
      base64: await fileToDataUrl(file),
    });
    setCharacters((items) => items.map((character) =>
      character.characterId === result.character.characterId ? result.character : character,
    ));
  }

  async function removeCharacterPortrait() {
    if (!selectedCharacter?.portraitUrl) return;
    const result = await deleteCharacterPortrait(selectedCharacter.characterId);
    setPortraitViewer(null);
    setCharacters((items) => items.map((character) =>
      character.characterId === result.character.characterId ? result.character : character,
    ));
  }

  async function selectCharacter(characterId: string) {
    if (characterId === selectedCharacterIdRef.current) {
      setCharacterMenu(false);
      return;
    }

    // Character selection is deliberately local-only. Opening a character must
    // never contact Google Sheets. Sheet communication happens only through
    // explicit Sync Character / Refresh Player Data / Push to Sheet actions.
    characterLoadRequestRef.current += 1;
    selectedCharacterIdRef.current = characterId;
    setSelectedCharacterId(characterId);
    setCharacterMenu(false);
    setProfileSyncError("");
    setProfileSyncSuccess(false);

    const cached = loadCachedSheetData(characterId);
    cacheBaseRef.current = cached;

    if (cached) {
      applySheetData(cached, false);

      // applySheetData uses the snapshot's selectedCharacterId. Reassert the
      // character the user actually selected in case an older cache envelope
      // contains stale selection metadata.
      selectedCharacterIdRef.current = characterId;
      setSelectedCharacterId(characterId);
    } else {
      // No server request is made when this device has never cached the
      // character. Preserve any local working drafts that do exist.
      const localWallet = loadLocalWalletState(characterId);
      walletLoadedCharacterIdRef.current = characterId;
      setPlatinum(localWallet?.balance.pp || 0);
      setGold(localWallet?.balance.gp || 0);
      setSilver(localWallet?.balance.sp || 0);
      setCopper(localWallet?.balance.cp || 0);
      setTransactions(localWallet?.transactions || []);
      setJournalEntries([]);
      setRecurringExpenses(localWallet?.recurringExpenses || []);

      const localRetainers = loadRetainerDraft(characterId);
      if (localRetainers) {
        setRetainers(localRetainers.retainers);
        setRetainerDraftDirty(true);
      } else {
        setRetainers([]);
        setRetainerDraftDirty(false);
      }

      const localTerritory = loadTerritoryDraft(characterId);
      if (localTerritory) {
        setTerritories(localTerritory.territories);
        setScoutingMissions(localTerritory.scoutingMissions);
        setCustomMissions(localTerritory.customMissions);
        setTerritoryHexes(localTerritory.territoryHexes);
        setTerritoryDraftDirty(localTerritory.operations.length > 0);
      } else {
        setTerritories([]);
        setScoutingMissions([]);
        setCustomMissions([]);
        setTerritoryHexes([]);
        setTerritoryDraftDirty(false);
      }
    }

    // Do not leave the UI saying "Updating…" after a cache-only switch.
    setDataStatus(hasSheetsConnection() ? "connected" : "demo");
  }

  async function deleteCharacter() {
    if (!selectedCharacter) return;
    const deletedCharacterId = selectedCharacter.characterId;
    await deleteSheetCharacter(deletedCharacterId);
    deleteLocalWalletState(deletedCharacterId);

    const remainingCharacters = characters.filter(
      (character) => character.characterId !== deletedCharacterId,
    );
    setCharacters(remainingCharacters);
    const accountPlayer = currentPlayer || loadSharedRosterCache()?.currentPlayer || null;
    if (accountPlayer) {
      saveSharedRosterCache({
        currentPlayer: accountPlayer,
        players,
        characters: remainingCharacters,
      });
    }
    setCharacterMenu(false);
    setModal(null);

    if (!remainingCharacters.length) {
      characterLoadRequestRef.current += 1;
      selectedCharacterIdRef.current = "";
      walletLoadedCharacterIdRef.current = "";
      setSelectedCharacterId("");
      setPlatinum(0);
      setGold(0);
      setSilver(0);
      setCopper(0);
      setTransactions([]);
      setJournalEntries([]);
      setRecurringExpenses([]);
      setRetainers([]);
      setTerritories([]);
      setScoutingMissions([]);
      setCustomMissions([]);
      setTerritoryHexes([]);
      setModal("character");
      return;
    }

    const nextCharacterId = remainingCharacters[0].characterId;
    const requestId = characterLoadRequestRef.current + 1;
    characterLoadRequestRef.current = requestId;
    selectedCharacterIdRef.current = nextCharacterId;
    setSelectedCharacterId(nextCharacterId);
    const data = await loadSheetData(nextCharacterId);
    if (
      requestId !== characterLoadRequestRef.current ||
      selectedCharacterIdRef.current !== nextCharacterId
    ) return;
    const nextLocalWallet = loadLocalWalletState(nextCharacterId);
    walletLoadedCharacterIdRef.current = nextCharacterId;
    setPlatinum(nextLocalWallet?.balance.pp || 0);
    setGold(nextLocalWallet?.balance.gp || 0);
    setSilver(nextLocalWallet?.balance.sp || 0);
    setCopper(nextLocalWallet?.balance.cp || 0);
    setTransactions(nextLocalWallet?.transactions || []);
    setJournalEntries(data.journal || []);
    setRecurringExpenses(nextLocalWallet?.recurringExpenses || []);
    const savedRetainerDraft = loadRetainerDraft(nextCharacterId);
    setRetainers(savedRetainerDraft ? savedRetainerDraft.retainers : (data.retainers || []));
    setRetainerDraftDirty(Boolean(savedRetainerDraft));
    const localTerritoryDraft = loadTerritoryDraft(nextCharacterId);
    if (localTerritoryDraft) {
      setTerritories(localTerritoryDraft.territories);
      setScoutingMissions(localTerritoryDraft.scoutingMissions);
      setCustomMissions(localTerritoryDraft.customMissions);
      setTerritoryHexes(localTerritoryDraft.territoryHexes);
      setTerritoryDraftDirty(localTerritoryDraft.operations.length > 0);
    } else {
      setTerritories(data.territories || []);
      setScoutingMissions(data.scoutingMissions || []);
      setCustomMissions(data.customMissions || []);
      setTerritoryHexes(data.territoryHexes || []);
      setTerritoryDraftDirty(false);
    }
  }

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
      scoutingMissions: next.scoutingMissions ?? existing?.scoutingMissions ?? scoutingMissions,
      customMissions: next.customMissions ?? existing?.customMissions ?? customMissions,
      territoryHexes: next.territoryHexes ?? existing?.territoryHexes ?? territoryHexes,
      operations: operation ? [...(existing?.operations || []), operation] : (existing?.operations || []),
      updatedAt: new Date().toISOString(),
    };
    saveTerritoryDraft(nextDraft);
    setTerritories(nextDraft.territories);
    setScoutingMissions(nextDraft.scoutingMissions);
    setCustomMissions(nextDraft.customMissions);
    setTerritoryHexes(nextDraft.territoryHexes);
    setTerritoryDraftDirty(nextDraft.operations.length > 0);
    setTerritorySyncError("");
  }

  function queueTerritoryOperation(operation: TerritoryLocalOperation, next: Parameters<typeof persistLocalTerritoryState>[1]) {
    if (!selectedCharacter) return;
    persistLocalTerritoryState(selectedCharacter.characterId, next, operation);
  }

  async function submitExpiredLocalScoutingTimer(timer: LocalScoutingTimer) {
    const characterId = timer.characterId;
    if (!characterId) return;
    if (scoutingAutoSubmitInFlightRef.current.has(timer.clientMissionId)) return;

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
        upsertLocalScoutingTimer({ ...timer, serverMissionId: result.mission.missionId });
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
          (item) => !(item.kind === "scouting-start" && item.localMissionId === timer.clientMissionId),
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
          const matched = replaced.some((mission) => mission.missionId === result.mission.missionId);
          return matched ? replaced : [result.mission, ...replaced];
        });
      }

      // Casualties are authoritative results of adjudication. Merge only the
      // forces touched by this mission, not the whole Retainers tab.
      if (result.affectedRetainers?.length) {
        const affectedById = new Map(result.affectedRetainers.map((item) => [item.retainerId, item]));
        const localRetainerDraft = loadRetainerDraft(characterId);
        if (localRetainerDraft) {
          const merge = (items: SheetRetainer[]) => items.map((item) => affectedById.get(item.retainerId) || item);
          const mergedDraft: RetainerLocalDraft = {
            ...localRetainerDraft,
            baseRetainers: merge(localRetainerDraft.baseRetainers),
            retainers: merge(localRetainerDraft.retainers),
            updatedAt: new Date().toISOString(),
          };
          saveRetainerDraft(mergedDraft);
          if (selectedCharacterIdRef.current === characterId) setRetainers(mergedDraft.retainers);
        } else if (selectedCharacterIdRef.current === characterId) {
          setRetainers((items) => items.map((item) => affectedById.get(item.retainerId) || item));
        }
      }

      if (result.territoryPopulation && selectedCharacterIdRef.current === characterId) {
        const territoryPopulation = result.territoryPopulation;
        const applyPopulation = (items: SheetTerritory[]) => items.map((territory) =>
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

      if (selectedCharacterIdRef.current === characterId) setTerritorySyncError("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not complete the expired scouting mission.";
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

  useEffect(() => {
    if (!authenticated || !hasSheetsConnection() || !selectedCharacterId) return;

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

  async function syncTerritoryData() {
    if (!selectedCharacter || !territoryDraftDirty || territorySyncing) return;
    const characterId = selectedCharacter.characterId;
    const draft = loadTerritoryDraft(characterId);
    if (!draft || !draft.operations.length) {
      setTerritoryDraftDirty(false);
      return;
    }

    setTerritorySyncing(true);
    setTerritorySyncError("");
    try {
      for (const operation of draft.operations) {
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
          await upsertTerritoryHex({
            characterId,
            territoryId: operation.territoryId,
            hexNumber: operation.hexNumber,
            mapX: operation.mapX,
            mapY: operation.mapY,
            title: operation.title,
            contents: operation.contents,
            dmRevealed: operation.dmRevealed,
          });
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
          const existingTimer = loadLocalScoutingTimers(characterId).find(
            (timer) => timer.clientMissionId === operation.localMissionId,
          );
          if (existingTimer) {
            if (["completed", "failed"].includes(startedMission.mission.status)) {
              removeLocalScoutingTimer(characterId, operation.localMissionId);
            } else {
              upsertLocalScoutingTimer({
                ...existingTimer,
                serverMissionId: startedMission.mission.missionId,
              });
            }
          }
        } else if (operation.kind === "custom-start") {
          await createCustomMission({
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
        } else if (operation.kind === "scouting-view") {
          await viewScoutingMissionResults({ characterId, missionId: operation.missionId });
        } else if (operation.kind === "scouting-dismiss") {
          await dismissScoutingMission({ characterId, missionId: operation.missionId });
        }
      }

      // This read is intentionally the authoritative completion point. It also
      // adjudicates any scouting mission whose real-world timer has expired.
      const data = await loadTerritoryStatus(characterId);
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
    } catch (error) {
      setTerritorySyncError(error instanceof Error ? error.message : "Could not sync territory data.");
      throw error;
    } finally {
      setTerritorySyncing(false);
    }
  }

  async function refreshTerritoryDataFromCampaign() {
    if (!selectedCharacter) return;
    const characterId = selectedCharacter.characterId;
    if (
      territoryDraftDirty &&
      !window.confirm("Refresh Player Data will discard the unsynced territory/scouting changes on this device. Continue?")
    ) return;

    setTerritorySyncing(true);
    setTerritorySyncError("");
    try {
      const data = await loadTerritoryStatus(characterId);
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

      // DM refresh also picks up player-created recruits unless the DM has
      // deliberately kept a local unsynced Retainers working copy.
      if (!retainerDraftDirty) setRetainers(data.retainers || []);
    } catch (error) {
      setTerritorySyncError(error instanceof Error ? error.message : "Could not refresh player data.");
      throw error;
    } finally {
      setTerritorySyncing(false);
    }
  }

  async function pushDmTabToSheet(tab: SheetSyncTab) {
    if (!selectedCharacter || !permissions.isDm || dmTabPushing) return;
    const characterId = selectedCharacter.characterId;

    setDmTabPushing(tab);
    setDmTabPushError("");
    setDmTabPushSuccess("");

    try {
      if (tab === "wallet") {
        throw new Error("Wallet data is local-only and is never sent to the Sheet.");
      } else if (tab === "retainers") {
        await syncRetainersToCampaign(true);
      } else if (tab === "territories") {
        if (loadTerritoryDraft(characterId)?.operations.length) {
          await syncTerritoryData();
        }
      }

      const pushed = await markTabAuthoritative({ characterId, tab });
      const accepted = loadAcceptedTabSyncRevisions(characterId);
      saveAcceptedTabSyncRevisions(characterId, { ...accepted, [tab]: pushed.revision });

      setDmTabPushSuccess(tab);
      window.setTimeout(() => {
        setDmTabPushSuccess((current) => current === tab ? "" : current);
      }, 4000);
      setDataStatus("connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not push ${tab} to the Sheet.`;
      setDmTabPushError(message);
      throw error;
    } finally {
      setDmTabPushing("");
    }
  }

  async function refreshRoster() {
    if (rosterRefreshing || !hasSheetsConnection()) return;

    setRosterRefreshing(true);
    setRosterRefreshError("");
    try {
      const accountState = await loadAccountRoster();

      setCurrentPlayer(accountState.currentPlayer);
      setPlayers(accountState.players || []);
      setCharacters(accountState.characters || []);
      setPermissions(accountPermissions(accountState.currentPlayer));
      saveSharedRosterCache({
        currentPlayer: accountState.currentPlayer,
        players: accountState.players || [],
        characters: accountState.characters || [],
      });

      const currentCharacterStillExists = accountState.characters.some(
        (character) => character.characterId === selectedCharacterIdRef.current,
      );
      const nextCharacterId = currentCharacterStillExists
        ? selectedCharacterIdRef.current
        : accountState.characters[0]?.characterId || "";

      selectedCharacterIdRef.current = nextCharacterId;
      setSelectedCharacterId(nextCharacterId);
      setCharacterMenu(false);
      setDataStatus("connected");
    } catch (error) {
      setRosterRefreshError(
        error instanceof Error ? error.message : "Could not refresh the character roster.",
      );
      throw error;
    } finally {
      setRosterRefreshing(false);
    }
  }

  async function backUpCurrentWallet() {
    if (!selectedCharacter || walletBackupBusy) return;
    const characterId = selectedCharacter.characterId;

    setWalletBackupBusy("backup");
    setWalletBackupMessage("");
    setWalletBackupError("");
    try {
      const result = await backupLocalWallet({
        characterId,
        transactions: transactions as unknown as Array<Record<string, unknown>>,
        recurringExpenses: recurringExpenses as unknown as Array<Record<string, unknown>>,
      });
      const when = result.backedUpAt ? new Date(result.backedUpAt).toLocaleString() : "just now";
      setWalletBackupMessage(`Ledger backup saved ${when}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not back up this wallet.";
      setWalletBackupError(message);
      throw error;
    } finally {
      setWalletBackupBusy("");
    }
  }

  async function restoreCurrentWalletBackup() {
    if (!selectedCharacter || walletBackupBusy) return;
    if (!window.confirm(
      "Restore this character's wallet backup? This will replace the local ledger and recurring wallet expenses on this device."
    )) return;

    const characterId = selectedCharacter.characterId;
    setWalletBackupBusy("restore");
    setWalletBackupMessage("");
    setWalletBackupError("");

    try {
      const result = await loadLocalWalletBackup(characterId);
      const restoredTransactions = Array.isArray(result.transactions)
        ? result.transactions as unknown as Transaction[]
        : [];
      const restoredRecurring = Array.isArray(result.recurringExpenses)
        ? result.recurringExpenses as unknown as SheetRecurringExpense[]
        : [];

      const restoredBalance = walletBalanceFromTransactions(restoredTransactions);
      const restoredState: LocalWalletState = {
        version: 1,
        characterId,
        balance: restoredBalance,
        transactions: restoredTransactions,
        recurringExpenses: restoredRecurring,
        savedAt: new Date().toISOString(),
      };

      saveLocalWalletState(restoredState);
      walletLoadedCharacterIdRef.current = characterId;
      setTransactions(restoredTransactions);
      setRecurringExpenses(restoredRecurring);
      setPlatinum(restoredBalance.pp);
      setGold(restoredBalance.gp);
      setSilver(restoredBalance.sp);
      setCopper(restoredBalance.cp);

      const when = result.backedUpAt ? new Date(result.backedUpAt).toLocaleString() : "the saved backup";
      setWalletBackupMessage(`Wallet restored from ${when}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not restore this wallet backup.";
      setWalletBackupError(message);
      throw error;
    } finally {
      setWalletBackupBusy("");
    }
  }

  async function syncWholeProfile() {
    if (!selectedCharacter || profileSyncing) return;

    const characterId = selectedCharacter.characterId;
    const readOnlyDmRefresh = permissions.isDm && !dmOwnsSelectedCharacter;

    if (
      readOnlyDmRefresh &&
      (retainerDraftDirty || territoryDraftDirty) &&
      !window.confirm(
        "Sync Character on another player's character is read-only and will refresh from the workbook. " +
        "Unsynced Retainer/Territory changes on this device will be discarded. Continue?"
      )
    ) return;

    setProfileSyncing(true);
    setProfileSyncError("");
    setProfileSyncSuccess(false);

    try {
      if (readOnlyDmRefresh) {
        // A DM viewing another player's character must never use the player's
        // write-sync path. Instead perform an authoritative read-only refresh
        // and cache that character so reopening the app does not come back empty.
        clearRetainerDraft(characterId);
        clearTerritoryDraft(characterId);

        const refreshed = await loadSheetData(characterId);
        applySheetData(refreshed, false);
        saveCachedSheetData(refreshed);

        selectedCharacterIdRef.current = characterId;
        setSelectedCharacterId(characterId);
        setProfileLastSyncedAt(new Date().toISOString());
        setProfileSyncSuccess(true);
        window.setTimeout(() => setProfileSyncSuccess(false), 4000);
        setDataStatus("connected");
        return;
      }
      // Account permissions are account-level state, not character-tab state.
      // Refresh them first so a DM change such as enabling Territories becomes
      // effective on the player's next explicit Sync Character.
      const accountState = await loadAccountRoster();
      setCurrentPlayer(accountState.currentPlayer);
      setPlayers(accountState.players || []);
      setCharacters(accountState.characters || []);
      setPermissions(accountPermissions(accountState.currentPlayer));
      saveSharedRosterCache({
        currentPlayer: accountState.currentPlayer,
        players: accountState.players || [],
        characters: accountState.characters || [],
      });

      // Some characters (most noticeably DM-owned characters created/used
      // before the per-character cache existed) can have no bootstrap cache at
      // all. Partial Sync Character reads update the screen, but all of the
      // cache persistence helpers previously no-op'd when cacheBaseRef was null.
      //
      // Seed a valid character-specific cache before the tab refreshes below.
      // Journal/Retainers/Territories then overwrite their portions with the
      // authoritative results from this sync.
      if (!cacheBaseRef.current || cacheBaseRef.current.selectedCharacterId !== characterId) {
        const localWallet = loadLocalWalletState(characterId);
        const seededBase: SheetBootstrap = {
          ok: true,
          campaignName,
          coinWeightPerPound: 10,
          discordWebhookConfigured,
          currentPlayer: accountState.currentPlayer,
          players: accountState.players || [],
          permissions: accountPermissions(accountState.currentPlayer),
          customMissions: customMissions || [],
          characters: accountState.characters || [],
          selectedCharacterId: characterId,
          balance: localWallet?.balance || { pp: 0, gp: 0, sp: 0, cp: 0 },
          transactions: [],
          territories: territories || [],
          managedTerritories: managedTerritories || [],
          retainers: retainers || [],
          scoutingMissions: scoutingMissions || [],
          territoryHexes: territoryHexes || [],
          journal: journalEntries || [],
          recurringExpenses: localWallet?.recurringExpenses || [],
        };
        cacheBaseRef.current = seededBase;
        saveCachedSheetData(seededBase);
      }

      const remoteRevisions = await loadTabSyncRevisions(characterId);
      const acceptedRevisions = loadAcceptedTabSyncRevisions(characterId);
      const dmOverrides = {
        wallet: false,
        journal: remoteRevisions.journal > acceptedRevisions.journal,
        retainers: remoteRevisions.retainers > acceptedRevisions.retainers,
        territories: remoteRevisions.territories > acceptedRevisions.territories,
      };

      let overrideData: SheetBootstrap | null = null;
      if (dmOverrides.journal || dmOverrides.retainers || dmOverrides.territories) {
        overrideData = await loadSheetData(characterId);
      }

      // Journal is Sheet-backed. Refresh it on every explicit Sync Character
      // instead of only when a DM revision changed, otherwise entries created
      // on another device or lost from local cache never return.
      const refreshedJournal = dmOverrides.journal && overrideData
        ? { journal: overrideData.journal || [] }
        : await loadJournalData(characterId);
      setJournalEntries(refreshedJournal.journal || []);
      persistJournalCache(refreshedJournal.journal || []);

      if (dmOverrides.retainers && overrideData) {
        clearRetainerDraft(characterId);
        setRetainers(overrideData.retainers || []);
        setRetainerDraftDirty(false);
        setRetainerLastSyncedAt(new Date().toISOString());
        if (cacheBaseRef.current) {
          const updatedBase: SheetBootstrap = {
            ...cacheBaseRef.current,
            retainers: overrideData.retainers || [],
          };
          cacheBaseRef.current = updatedBase;
          saveCachedSheetData(updatedBase);
        }
      }

      if (dmOverrides.territories && overrideData) {
        clearTerritoryDraft(characterId);
        reconcileLocalScoutingTimersWithAuthoritative(
          characterId,
          overrideData.scoutingMissions || [],
        );
        const refreshedTerritories = overrideData.territories || [];
        const refreshedScouting = overrideData.scoutingMissions || [];
        const refreshedCustom = overrideData.customMissions || [];
        const refreshedHexes = overrideData.territoryHexes || [];
        setTerritories(refreshedTerritories);
        setScoutingMissions(refreshedScouting);
        setCustomMissions(refreshedCustom);
        setTerritoryHexes(refreshedHexes);
        setTerritoryDraftDirty(false);
        setTerritoryLastSyncedAt(new Date().toISOString());
        persistTerritoryCache({
          territories: refreshedTerritories,
          scoutingMissions: refreshedScouting,
          customMissions: refreshedCustom,
          territoryHexes: refreshedHexes,
        });
      }

      saveAcceptedTabSyncRevisions(characterId, remoteRevisions);

      if (!dmOverrides.retainers && loadRetainerDraft(characterId)) {
        await syncRetainersToCampaign();
      }

      if (!dmOverrides.retainers) {
        const refreshedRetainers = await loadRetainerData(characterId);
        clearRetainerDraft(characterId);
        setRetainers(refreshedRetainers.retainers || []);
        setRetainerDraftDirty(false);
        setRetainerLastSyncedAt(new Date().toISOString());

        // Save the Sheet-backed result immediately. If the player closes the
        // app right after Sync Character, startup must not restore an older
        // cached Retainers/Fighting Forces snapshot.
        if (cacheBaseRef.current) {
          const updatedBase: SheetBootstrap = {
            ...cacheBaseRef.current,
            retainers: refreshedRetainers.retainers || [],
          };
          cacheBaseRef.current = updatedBase;
          saveCachedSheetData(updatedBase);
        }
      }

      if (!dmOverrides.territories) {
        const territoryDraft = loadTerritoryDraft(characterId);
        if (territoryDraft?.operations.length) {
          // syncTerritoryData() sends queued local operations and finishes with
          // an authoritative Territory-status read.
          await syncTerritoryData();
        } else {
          // Territory is Sheet-backed. An explicit Sync Character must always
          // refresh it, even when no DM revision changed. This is especially
          // important for DM-owned characters whose local cache may be absent
          // or stale after reopening.
          const refreshedTerritoryData = await loadTerritoryStatus(characterId);
          clearTerritoryDraft(characterId);
          reconcileLocalScoutingTimersWithAuthoritative(
            characterId,
            refreshedTerritoryData.scoutingMissions || [],
          );
          const refreshedTerritories = refreshedTerritoryData.territories || [];
          const refreshedScouting = refreshedTerritoryData.scoutingMissions || [];
          const refreshedCustom = refreshedTerritoryData.customMissions || [];
          const refreshedHexes = refreshedTerritoryData.territoryHexes || [];
          setTerritories(refreshedTerritories);
          setScoutingMissions(refreshedScouting);
          setCustomMissions(refreshedCustom);
          setTerritoryHexes(refreshedHexes);
          setTerritoryDraftDirty(false);
          setTerritoryLastSyncedAt(new Date().toISOString());
          persistTerritoryCache({
            territories: refreshedTerritories,
            scoutingMissions: refreshedScouting,
            customMissions: refreshedCustom,
            territoryHexes: refreshedHexes,
          });
        }
      }

      setProfileLastSyncedAt(new Date().toISOString());
      setProfileSyncSuccess(true);
      window.setTimeout(() => setProfileSyncSuccess(false), 4000);
      setDataStatus("connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync this profile.";
      setProfileSyncError(message);
      throw error;
    } finally {
      setProfileSyncing(false);
    }
  }

  async function saveTerritoryRecord(input: { name: string; hexNumber: string; scoutingWebhookUrl: string; mapFile?: File; poiMapFile?: File; workbookFile?: File; workbookRows?: TerritoryWorkbookRow[] }) {
    if (!selectedCharacter) return;
    await saveTerritoryForCharacter(selectedCharacter.characterId, editingTerritory, input);
    setEditingTerritory(null);
    setModal(null);
  }

  async function saveTerritoryForCharacter(characterId: string, existingTerritory: SheetTerritory | null, input: { name: string; hexNumber: string; scoutingWebhookUrl: string; mapFile?: File; poiMapFile?: File; workbookFile?: File; workbookRows?: TerritoryWorkbookRow[] }) {
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
        mimeType: input.workbookFile.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
        ? items.map((item) => item.territoryId === territory.territoryId ? territory : item)
        : [territory, ...items],
    );
    if (characterId === selectedCharacterId) {
      setTerritories((items) =>
        existingTerritory
          ? items.map((item) => item.territoryId === territory.territoryId ? territory : item)
          : [territory, ...items],
      );
    }
    return territory;
  }

  async function deleteTerritoryRecord(territory: SheetTerritory) {
    if (!selectedCharacter || !permissions.isDm) return;
    await deleteTerritory(selectedCharacter.characterId, territory.territoryId);
    setTerritories((items) => items.filter((item) => item.territoryId !== territory.territoryId));
    setTerritoryHexes((items) => items.filter((hex) => hex.territoryId !== territory.territoryId));
    setScoutingMissions((items) => items.filter((mission) => mission.territoryId !== territory.territoryId));
    setCustomMissions((items) => items.filter((mission) => mission.territoryId !== territory.territoryId));
    localStorage.removeItem(`pcm-territory-tap-reveals:${territory.territoryId}`);
    setEditingTerritory(null);
    setModal(null);
  }

  function persistLocalRetainers(characterId: string, nextRetainers: SheetRetainer[]) {
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
          clericFightingForce: input.type === "force" ? Boolean(input.clericFightingForce) : undefined,
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
          clericFightingForce: input.type === "force" ? Boolean(input.clericFightingForce) : undefined,
          status: "",
          createdAt: now,
          updatedAt: now,
          scheduleId: "",
        };

    const nextRetainers = editingRetainer
      ? retainers.map((item) => item.retainerId === editingRetainer.retainerId ? nextRetainer : item)
      : [nextRetainer, ...retainers];

    persistLocalRetainers(characterId, nextRetainers);
    setEditingRetainer(null);
    setModal(null);
  }

  async function removeRetainerRecord(retainer: SheetRetainer) {
    if (!selectedCharacter) return;
    persistLocalRetainers(
      selectedCharacter.characterId,
      retainers.filter((item) => item.retainerId !== retainer.retainerId),
    );
  }

  async function syncRetainersToCampaign(forceOverwrite = false) {
    if (!selectedCharacter || retainerSyncing) return;
    const characterId = selectedCharacter.characterId;
    const draft = loadRetainerDraft(characterId) || (
      forceOverwrite
        ? {
            characterId,
            baseRetainers: [],
            retainers,
            updatedAt: new Date().toISOString(),
          }
        : null
    );
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
      const remoteById = new Map(remote.retainers.map((item) => [item.retainerId, item]));
      const baseById = new Map(draft.baseRetainers.map((item) => [item.retainerId, item]));
      const localById = new Map(draft.retainers.map((item) => [item.retainerId, item]));

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
            throw new Error(`${local.name} changed in the campaign after this device loaded it. Refresh Player Data before editing it again.`);
          }
        }

        for (const base of draft.baseRetainers) {
          if (!localById.has(base.retainerId) && remoteById.has(base.retainerId)) {
            const currentRemote = remoteById.get(base.retainerId)!;
            if (retainerChanged(currentRemote, base)) {
              throw new Error(`${base.name} changed in the campaign after this device loaded it. Refresh Player Data before disbanding/removing it.`);
            }
          }
        }
      }

      const deleteCandidates = forceOverwrite
        ? remote.retainers.filter((item) => !localById.has(item.retainerId))
        : draft.baseRetainers.filter((base) => !localById.has(base.retainerId) && remoteById.has(base.retainerId));

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
          setRecurringExpenses((items) => {
            const withoutLinked = items.filter(
              (item) => item.sourceType !== "retainer" || item.sourceId !== result.retainer.retainerId,
            );
            return result.schedule ? [result.schedule, ...withoutLinked] : withoutLinked;
          });
          continue;
        }

        const base = baseById.get(local.retainerId);
        const currentRemote = remoteById.get(local.retainerId);

        if (currentRemote && (forceOverwrite || (base && retainerChanged(local, base)))) {
          const result = await updateRetainer({
            characterId,
            retainerId: local.retainerId,
            ...retainerMutationInput(local),
          });
          syncedRetainers.push(result.retainer);
          setRecurringExpenses((items) => {
            const withoutLinked = items.filter(
              (item) => item.sourceType !== "retainer" || item.sourceId !== result.retainer.retainerId,
            );
            return result.schedule ? [result.schedule, ...withoutLinked] : withoutLinked;
          });
        } else if (!currentRemote && forceOverwrite) {
          const result = await saveRetainer({
            characterId,
            ...retainerMutationInput(local),
          });
          syncedRetainers.push(result.retainer);
          setRecurringExpenses((items) => {
            const withoutLinked = items.filter(
              (item) => item.sourceType !== "retainer" || item.sourceId !== result.retainer.retainerId,
            );
            return result.schedule ? [result.schedule, ...withoutLinked] : withoutLinked;
          });
        } else {
          syncedRetainers.push(currentRemote || local);
        }
      }

      clearRetainerDraft(characterId);
      setRetainers(syncedRetainers);
      setRetainerDraftDirty(false);
      setRetainerLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setRetainerSyncError(error instanceof Error ? error.message : "Could not sync retainers.");
      throw error;
    } finally {
      setRetainerSyncing(false);
    }
  }

  async function refreshRetainersFromCampaign() {
    if (!selectedCharacter) return;
    const characterId = selectedCharacter.characterId;
    if (
      retainerDraftDirty &&
      !window.confirm("Refresh Player Data will discard the unsynced retainer/fighting-force changes on this device. Continue?")
    ) return;

    setRetainerSyncing(true);
    setRetainerSyncError("");
    try {
      const data = await loadTerritoryStatus(characterId);
      clearRetainerDraft(characterId);
      {
                  const localDraft = loadRetainerDraft(selectedCharacterIdRef.current);
                  if (localDraft) {
                    setRetainers(localDraft.retainers);
                    setRetainerDraftDirty(true);
                  } else {
                    setRetainers(data.retainers || []);
                  }
                }
      setRetainerDraftDirty(false);
      setRetainerLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setRetainerSyncError(error instanceof Error ? error.message : "Could not refresh player data.");
      throw error;
    } finally {
      setRetainerSyncing(false);
    }
  }

  async function cancelSchedule(scheduleId: string) {
    setRecurringExpenses((items) => items.filter((item) => item.scheduleId !== scheduleId));
  }

  async function updateSchedule(
    scheduleId: string,
    input: {
      label: string;
      amount: number;
      coin: CoinType;
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
      note: string;
    },
  ) {
    const amounts: CoinBalances = { pp: 0, gp: 0, sp: 0, cp: 0 };
    amounts[input.coin] = input.amount;
    setRecurringExpenses((items) => items.map((item) =>
      item.scheduleId === scheduleId
        ? {
            ...item,
            label: input.label,
            ...amounts,
            frequency: input.frequency,
            startDate: input.startDate,
            note: input.note,
            active: true,
          }
        : item,
    ));
  }

  function persistTerritoryCache(input: {
    territories: SheetTerritory[];
    scoutingMissions: SheetScoutingMission[];
    customMissions: SheetCustomMission[];
    territoryHexes: SheetTerritoryHex[];
  }) {
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

  function persistJournalCache(nextJournal: SheetJournalEntry[]) {
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
    if (!selectedCharacter || !editingJournalEntry) return;
    await deleteJournalEntry({
      entryId: editingJournalEntry.entryId,
      characterId: selectedCharacter.characterId,
    });
    setJournalEntries((current) => {
      const next = current.filter((item) => item.entryId !== editingJournalEntry.entryId);
      persistJournalCache(next);
      return next;
    });
    setEditingJournalEntry(null);
    setModal(null);
  }

  async function updateCharacter(input: {
    name: string;
    className: string;
    level: number;
  }) {
    if (!selectedCharacter) return;
    const character = await updateSheetCharacter({
      characterId: selectedCharacter.characterId,
      ...input,
    });
    setCharacters((current) => {
      const nextCharacters = current.map((item) =>
        item.characterId === character.characterId ? { ...item, ...character } : item,
      );
      const accountPlayer = currentPlayer || loadSharedRosterCache()?.currentPlayer || null;
      if (accountPlayer) {
        saveSharedRosterCache({
          currentPlayer: accountPlayer,
          players,
          characters: nextCharacters,
        });
      }
      return nextCharacters;
    });
    setModal(null);
  }

  if (hasSheetsConnection() && !authenticated) {
    return passwordChangeToken ? (
      <FirstPasswordScreen
        onSave={async ({ newPassword, recoveryQuestion, recoveryAnswer }) => {
          const result = await changeInitialPassword({
            passwordChangeToken,
            newPassword,
            recoveryQuestion,
            recoveryAnswer,
          });
          setCurrentPlayer(result.currentPlayer);
          setPlayers(result.players || []);
          setCharacters(result.characters || []);
          const firstCharacterId = result.characters?.[0]?.characterId || "";
          selectedCharacterIdRef.current = firstCharacterId;
          setSelectedCharacterId(firstCharacterId);
          setPasswordChangeToken("");
          setAuthenticated(true);
        }}
      />
    ) : (
      <LoginScreen
        players={loginOptions}
        onLogin={async (credentials) => {
          const result = await login(credentials);
          if (result.mustChangePassword && result.passwordChangeToken) {
            setPasswordChangeToken(result.passwordChangeToken);
          } else {
            if (result.currentPlayer) {
              setCurrentPlayer(result.currentPlayer);
              setPermissions(accountPermissions(result.currentPlayer));
            }
            setPlayers(result.players || []);
            setCharacters(result.characters || []);
            const firstCharacterId = result.characters?.[0]?.characterId || "";
            selectedCharacterIdRef.current = firstCharacterId;
            setSelectedCharacterId(firstCharacterId);
            setAuthenticated(true);
          }
        }}
        onRegister={async (registration) => {
          const result = await registerPlayer(registration);
          setPasswordChangeToken(result.passwordChangeToken);
        }}
        onLoadRecoveryQuestion={loadRecoveryQuestion}
        onResetPassword={async (input) => {
          await resetForgottenPassword(input);
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="campaign-mark" aria-label="Player Character Manager">
          <div className="seal">
            <img
              src="/player-character-manager-icon-192.png"
              alt=""
              className="seal-icon"
            />
          </div>
          <span>Player Character</span>
          <strong>Manager</strong>
        </div>

        <nav className="desktop-nav" aria-label="Main navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={section === item.id ? "nav-link active" : "nav-link"}
                onClick={() => setSection(item.id)}
              >
                <Icon size={22} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-flourish">
          <Shield size={28} />
          {permissions.isDm && editingCampaignName ? (
            <input
              className="campaign-name-input"
              defaultValue={campaignName}
              autoFocus
              maxLength={120}
              aria-label="Campaign name"
              onBlur={(event) => void saveCampaignName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setEditingCampaignName(false);
              }}
            />
          ) : (
            <button
              className={permissions.isDm ? "campaign-name editable" : "campaign-name"}
              disabled={!permissions.isDm}
              title={permissions.isDm ? "Click to edit campaign name" : undefined}
              onClick={() => setEditingCampaignName(true)}
            >
              {campaignName}
              {permissions.isDm && <Pencil size={12} />}
            </button>
          )}
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setSection("wallet")}
          >
            <Menu />
          </button>
          <div className="character-wrap">
            {selectedCharacter?.portraitUrl ? (
              <button
                className="character-crest has-portrait"
                type="button"
                aria-label={`View ${selectedCharacter.name} portrait full size`}
                title="View portrait full size"
                onClick={() => setPortraitViewer(selectedCharacter)}
              >
                <img src={selectedCharacter.portraitUrl} alt={`${selectedCharacter.name} portrait`} />
              </button>
            ) : (
              <div className="character-crest" aria-hidden="true">
                <Sword size={22} />
              </div>
            )}
            <div className="character-heading">
              <button
                className="character-button"
                aria-expanded={characterMenu}
                onClick={() => setCharacterMenu((open) => !open)}
              >
                <span>{selectedCharacter?.name || "Choose character"}</span>
                <ChevronDown size={18} />
              </button>
              {selectedCharacter && (
                <button
                  className="edit-character-button"
                  aria-label={`Edit ${selectedCharacter.name}`}
                  title={`Edit ${selectedCharacter.name}`}
                  onClick={() => {
                    setCharacterMenu(false);
                    setModal("edit-character");
                  }}
                >
                  <Pencil size={17} />
                </button>
              )}
            </div>
            {characterMenu && (
              permissions.isDm ? (
                <div className="character-menu dm-character-menu">
                  {selectedCharacter && hasSheetsConnection() && (
                    <div className="character-menu-sync-header">
                      <div className="character-menu-sync-name">
                        <strong>{selectedCharacter.name}</strong>
                        <span>{selectedCharacter.class} · Level {selectedCharacter.level}</span>
                      </div>
                      <button
                        className={`character-sync-button ${profileHasUnsyncedChanges ? "has-changes" : ""}`}
                        type="button"
                        disabled={profileSyncing || (permissions.isDm && !dmOwnsSelectedCharacter)}
                        title={
                          permissions.isDm && !dmOwnsSelectedCharacter
                            ? "Sync Character is used by the character's player. Use Refresh Player Data for another player's character."
                            : profileSyncError
                              ? profileSyncError
                              : profileSyncSuccess
                                ? "Sync successful"
                                : "Synchronize this character with the campaign Sheet"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          void syncWholeProfile().catch(() => undefined);
                        }}
                      >
                        {profileSyncing ? "Syncing…" : "Sync Character"}
                      </button>
                    </div>
                  )}
                  {characterPlayers.map((player) => {
                    const playerCharacters = characters.filter((character) => character.playerId === player.playerId);
                    const expanded = expandedPlayerId === player.playerId;
                    return (
                      <div className="dm-player-character-group" key={player.playerId}>
                        <button
                          className="dm-player-button"
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setExpandedPlayerId(expanded ? "" : player.playerId)}
                        >
                          <span>
                            <strong>{player.displayName || "Unnamed player"}</strong>
                            <small>{playerCharacters.length} character{playerCharacters.length === 1 ? "" : "s"}</small>
                          </span>
                          <ChevronDown size={17} />
                        </button>
                        {expanded && (
                          <div className="dm-player-characters">
                            {playerCharacters.length ? playerCharacters.map((character) => {
                              const selected = character.characterId === selectedCharacterId;
                              return (
                                <div
                                  className={selected ? "character-menu-row selected" : "character-menu-row"}
                                  key={character.characterId}
                                >
                                  <button
                                    className="character-menu-select"
                                    type="button"
                                    onClick={() => void selectCharacter(character.characterId)}
                                  >
                                    <strong>{character.name}</strong>
                                    <span>{character.class} · Level {character.level}</span>
                                  </button>
                                </div>
                              );
                            }) : <p>No characters</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    className="add-character"
                    type="button"
                    onClick={() => {
                      setCharacterMenu(false);
                      setModal("character");
                    }}
                  >
                    <Plus size={15} /> Add character
                  </button>
                </div>
              ) : (
                <div className="character-menu">
                  {selectedCharacter && hasSheetsConnection() && (
                    <div className="character-menu-sync-header">
                      <div className="character-menu-sync-name">
                        <strong>{selectedCharacter.name}</strong>
                        <span>{selectedCharacter.class} · Level {selectedCharacter.level}</span>
                      </div>
                      <button
                        className={`character-sync-button ${profileHasUnsyncedChanges ? "has-changes" : ""}`}
                        type="button"
                        disabled={profileSyncing}
                        title={
                          profileSyncError
                            ? profileSyncError
                            : profileSyncSuccess
                              ? "Sync successful"
                              : "Synchronize this character with the campaign Sheet"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          void syncWholeProfile().catch(() => undefined);
                        }}
                      >
                        {profileSyncing ? "Syncing…" : "Sync Character"}
                      </button>
                    </div>
                  )}
                  {characters.map((character) => {
                    const selected = character.characterId === selectedCharacterId;
                    return (
                      <div
                        className={selected ? "character-menu-row selected" : "character-menu-row"}
                        key={character.characterId}
                      >
                        <button
                          className="character-menu-select"
                          type="button"
                          onClick={() => void selectCharacter(character.characterId)}
                        >
                          <strong>{character.name}</strong>
                          <span>{character.class} · Level {character.level}</span>
                        </button>
                      </div>
                    );
                  })}
                  {characters.length === 0 && hasSheetsConnection() && (
                    <>
                      <button
                        className="add-character"
                        type="button"
                        disabled={rosterRefreshing}
                        title={rosterRefreshError || "Reload your character roster from the campaign Sheet"}
                        onClick={() => void refreshRoster().catch(() => undefined)}
                      >
                        {rosterRefreshing ? "Refreshing…" : "Refresh Roster"}
                      </button>
                      {rosterRefreshError && (
                        <p className="form-error" role="alert">{rosterRefreshError}</p>
                      )}
                    </>
                  )}
                  <button
                    className="add-character"
                    onClick={() => {
                      setCharacterMenu(false);
                      setModal("character");
                    }}
                  >
                    <Plus size={15} /> Add character
                  </button>
                </div>
              )
            )}
          </div>

          <div className="topbar-actions">
            <div className="player-chip">
              <UserRound size={21} />
              <span>
                {dataStatus === "connected"
                  ? "Sheet connected"
                  : dataStatus === "cached"
                    ? "Local copy"
                  : dataStatus === "loading"
                    ? "Connecting…"
                    : dataStatus === "error"
                      ? "Sheet unavailable"
                      : "Demo data"}
              </span>
            </div>
            {hasSheetsConnection() && (
              <button
                className="sign-out-button"
                onClick={() => void logout().finally(() => {
                  setAuthenticated(false);
                  setCharacters([]);
                })}
              >
                Sign out
              </button>
            )}
          </div>
        </header>

        <div className="page-content">
          {section === "wallet" && (
            <WalletView
              platinum={platinum}
              gold={gold}
              silver={silver}
              copper={copper}
              coinWeight={coinWeight}
              transactions={transactions}
              onAction={setModal}
              onSeeFullLedger={() => setModal("ledger")}
              onManageRecurringExpenses={() => setModal("recurring-expenses")}
              backupEnabled={Boolean(selectedCharacter && hasSheetsConnection())}
              backupBusy={walletBackupBusy}
              backupMessage={walletBackupMessage}
              backupError={walletBackupError}
              onBackup={backUpCurrentWallet}
              onRestore={restoreCurrentWalletBackup}
            />
          )}
          {section === "territories" && (
            <TerritoriesView
              territories={territories}
              fightingForces={retainers.filter((item) => item.type === "force")}
              officerRetainers={retainers.filter((item) => item.type === "individual")}
              scoutingMissions={scoutingMissions}
              customMissions={customMissions}
              territoryHexes={territoryHexes}
              characterName={selectedCharacter?.name || ""}
              character={selectedCharacter}
              characterId={selectedCharacter?.characterId || ""}
              balances={{ pp: platinum, gp: gold, sp: silver, cp: copper }}
              isDm={interfaceIsDm}
              hasUnsyncedChanges={territoryDraftDirty}
              syncing={territorySyncing}
              syncError={territorySyncError}
              lastSyncedAt={territoryLastSyncedAt}
              onRefresh={refreshTerritoryDataFromCampaign}
              pushingToSheet={dmTabPushing === "territories"}
              pushToSheetSuccess={dmTabPushSuccess === "territories"}
              onPushToSheet={() => pushDmTabToSheet("territories")}
              onRecruitmentComplete={async (walletTransaction, recurringSchedule) => {
                if (!selectedCharacter) return;
                applySystemWalletTransactionLocally(walletTransaction);
                if (recurringSchedule) {
                  setRecurringExpenses((items) => [
                    recurringSchedule,
                    ...items.filter((item) => item.scheduleId !== recurringSchedule.scheduleId),
                  ]);
                }
                const data = await loadSheetData(selectedCharacter.characterId);
                if (!retainerDraftDirty) {
                  {
                  const localDraft = loadRetainerDraft(selectedCharacterIdRef.current);
                  if (localDraft) {
                    setRetainers(localDraft.retainers);
                    setRetainerDraftDirty(true);
                  } else {
                    setRetainers(data.retainers || []);
                  }
                }
                }
                if (!territoryDraftDirty) setTerritories(data.territories || []);
              }}
              onFieldAllocationSaved={(updatedHex) => {
                if (!selectedCharacter) return;
                const previous = territoryHexes.find((hex) => hex.hexId === updatedHex.hexId);
                const nextHexes = territoryHexes.map((hex) => hex.hexId === updatedHex.hexId ? updatedHex : hex);
                const fieldsChanged = previous && (
                  Number(previous.cerealFields || 0) !== Number(updatedHex.cerealFields || 0) ||
                  Number(previous.cottonFields || 0) !== Number(updatedHex.cottonFields || 0) ||
                  Number(previous.pastureFields || 0) !== Number(updatedHex.pastureFields || 0)
                );
                if (fieldsChanged) {
                  queueTerritoryOperation(
                    {
                      id: crypto.randomUUID(),
                      kind: "fields",
                      territoryId: updatedHex.territoryId,
                      hexId: updatedHex.hexId,
                      cerealFields: Number(updatedHex.cerealFields || 0),
                      cottonFields: Number(updatedHex.cottonFields || 0),
                      pastureFields: Number(updatedHex.pastureFields || 0),
                    },
                    { territoryHexes: nextHexes },
                  );
                } else {
                  persistLocalTerritoryState(selectedCharacter.characterId, { territoryHexes: nextHexes });
                }
              }}
              onTitheChanged={(updatedTerritory) => {
                if (!selectedCharacter) return;
                const nextTerritories = territories.map((item) =>
                  item.territoryId === updatedTerritory.territoryId ? updatedTerritory : item
                );
                queueTerritoryOperation(
                  { id: crypto.randomUUID(), kind: "tithe", territoryId: updatedTerritory.territoryId, payChurchTithe: Boolean(updatedTerritory.payChurchTithe) },
                  { territories: nextTerritories },
                );
              }}
              onAdd={() => {
                setEditingTerritory(null);
                setModal("territory");
              }}
              onEdit={(territory) => {
                setEditingTerritory(territory);
                setModal("territory");
              }}
              onRevealHex={async (input) => {
                if (!selectedCharacter) return;
                const existing = territoryHexes.find((hex) =>
                  hex.territoryId === input.territoryId &&
                  territoryHexKey(hex.hexNumber) === territoryHexKey(input.hexNumber)
                );
                const localHexId = existing?.hexId || `local-${crypto.randomUUID()}`;
                const updatedHex: SheetTerritoryHex = {
                  ...(existing || {
                    hexId: localHexId,
                    characterId: selectedCharacter.characterId,
                    territoryId: input.territoryId,
                    hexNumber: input.hexNumber,
                    mapX: input.mapX,
                    mapY: input.mapY,
                    createdAt: new Date().toISOString(),
                  }),
                  mapX: input.mapX,
                  mapY: input.mapY,
                  isDiscovered: true,
                  dmRevealed: true,
                  updatedAt: new Date().toISOString(),
                };
                const nextHexes = [
                  updatedHex,
                  ...territoryHexes.filter((item) =>
                    !(
                      item.territoryId === input.territoryId &&
                      territoryHexKey(item.hexNumber) === territoryHexKey(input.hexNumber)
                    )
                  ),
                ];
                queueTerritoryOperation(
                  {
                    id: crypto.randomUUID(),
                    kind: "hex",
                    territoryId: input.territoryId,
                    localHexId,
                    hexNumber: input.hexNumber,
                    mapX: input.mapX,
                    mapY: input.mapY,
                    title: existing?.title,
                    contents: existing?.contents,
                    dmRevealed: true,
                  },
                  { territoryHexes: nextHexes },
                );
              }}
              onStartScouting={async (input) => {
                if (!selectedCharacter) return;
                const localMissionId = `local-${crypto.randomUUID()}`;
                const now = localMissionStamp();
                const durationDays = Math.floor(Math.random() * 3) + 1;
                const completesAt = new Date(new Date(now).getTime() + durationDays * 86400000).toISOString();
                const forceNames = new Map(retainers.filter((item) => item.type === "force").map((item) => [item.retainerId, item.name]));
                const localMission: SheetScoutingMission = {
                  missionId: localMissionId,
                  clientMissionId: localMissionId,
                  characterId: selectedCharacter.characterId,
                  territoryId: input.territoryId,
                  hexNumber: input.hexNumber,
                  mapX: input.mapX,
                  mapY: input.mapY,
                  allocations: input.allocations.map((allocation) => ({
                    ...allocation,
                    forceName: forceNames.get(allocation.retainerId) || "Fighting force",
                  })),
                  men: input.allocations.reduce((sum, allocation) => sum + Number(allocation.men || 0), 0),
                  status: "active",
                  startedAt: now,
                  durationDays,
                  completesAt,
                };
                // Scouting remains local-only at dispatch. This targeted request
                // sends the DM Discord notification but does not create or
                // update a Scouting Missions row in the campaign Sheet.
                await notifyScoutingMissionStarted({
                  characterId: selectedCharacter.characterId,
                  territoryId: input.territoryId,
                  clientMissionId: localMissionId,
                  hexNumber: input.hexNumber,
                  mapX: input.mapX,
                  mapY: input.mapY,
                  allocations: input.allocations,
                  startedAt: now,
                  durationDays,
                  completesAt,
                });
                upsertLocalScoutingTimer({
                  characterId: selectedCharacter.characterId,
                  clientMissionId: localMissionId,
                  territoryId: input.territoryId,
                  hexNumber: input.hexNumber,
                  mapX: input.mapX,
                  mapY: input.mapY,
                  allocations: input.allocations,
                  officerRetainerId: input.officerRetainerId,
                  startedAt: now,
                  durationDays,
                  completesAt,
                });
                queueTerritoryOperation(
                  {
                    id: crypto.randomUUID(),
                    kind: "scouting-start",
                    localMissionId,
                    territoryId: input.territoryId,
                    hexNumber: input.hexNumber,
                    mapX: input.mapX,
                    mapY: input.mapY,
                    allocations: input.allocations,
                    officerRetainerId: input.officerRetainerId,
                    startedAt: now,
                    durationDays,
                  },
                  { scoutingMissions: [localMission, ...scoutingMissions] },
                );
              }}
              onCreateCustomMission={async (input) => {
                if (!selectedCharacter) throw new Error("Select a character first.");
                const localMissionId = `local-${crypto.randomUUID()}`;
                const now = localMissionStamp();
                const forceNames = new Map(retainers.filter((item) => item.type === "force").map((item) => [item.retainerId, item.name]));
                const localMission: SheetCustomMission = {
                  missionId: localMissionId,
                  characterId: selectedCharacter.characterId,
                  territoryId: input.territoryId,
                  objective: input.objective,
                  missionLocation: input.missionLocation,
                  startDate: input.startDate,
                  durationDays: input.durationDays,
                  allocations: input.allocations.map((allocation) => ({
                    ...allocation,
                    forceName: forceNames.get(allocation.retainerId) || "Fighting force",
                  })),
                  men: input.allocations.reduce((sum, allocation) => sum + Number(allocation.men || 0), 0),
                  status: "scheduled",
                  additionalNotes: input.additionalNotes,
                  createdAt: now,
                } as SheetCustomMission;
                queueTerritoryOperation(
                  {
                    id: crypto.randomUUID(),
                    kind: "custom-start",
                    localMissionId,
                    territoryId: input.territoryId,
                    objective: input.objective,
                    missionLocation: input.missionLocation,
                    startDate: input.startDate,
                    durationDays: input.durationDays,
                    allocations: input.allocations,
                    additionalNotes: input.additionalNotes,
                  },
                  { customMissions: [localMission, ...customMissions] },
                );
              }}
              onCompleteScoutingForTesting={async (missionId) => {
                if (!selectedCharacter) return;
                const result = await completeScoutingMissionForTesting({
                  characterId: selectedCharacter.characterId,
                  missionId,
                });
                // Reveal immediately from the authoritative completion response.
                // The following bootstrap refresh supplies population/hex changes.
                setScoutingMissions((items) => items.map((mission) =>
                  mission.missionId === result.mission.missionId
                    ? { ...mission, ...result.mission, allocations: result.mission.allocations || mission.allocations || [] }
                    : mission,
                ));
                const data = await loadSheetData(selectedCharacter.characterId);
                setScoutingMissions(data.scoutingMissions || []);
                setTerritories(data.territories || []);
                setTerritoryHexes(data.territoryHexes || []);
              }}
              onPromoteScoutingSerjeants={async (missionId) => {
                if (!selectedCharacter) return;
                const promotionResult = await promoteScoutingSerjeants({
                  characterId: selectedCharacter.characterId,
                  missionId,
                  walletBalance: { pp: platinum, gp: gold, sp: silver, cp: copper },
                });
                applySystemWalletTransactionLocally(promotionResult.transaction);
                const data = await loadSheetData(selectedCharacter.characterId);
                setScoutingMissions(data.scoutingMissions || []);
                {
                  const localDraft = loadRetainerDraft(selectedCharacterIdRef.current);
                  if (localDraft) {
                    setRetainers(localDraft.retainers);
                    setRetainerDraftDirty(true);
                  } else {
                    setRetainers(data.retainers || []);
                  }
                }
              }}
              onViewScoutingResults={async (missionId) => {
                if (!selectedCharacter) throw new Error("Select a character first.");
                const existingMission = scoutingMissions.find((mission) => mission.missionId === missionId);
                if (!existingMission) throw new Error("The scouting mission could not be found.");
                const optimisticMission: SheetScoutingMission = {
                  ...existingMission,
                  resultsViewedAt: existingMission.resultsViewedAt || new Date().toISOString(),
                };
                const nextMissions = scoutingMissions.map((mission) =>
                  mission.missionId === missionId ? optimisticMission : mission
                );
                queueTerritoryOperation(
                  { id: crypto.randomUUID(), kind: "scouting-view", missionId },
                  { scoutingMissions: nextMissions },
                );
                return optimisticMission;
              }}
              onDismissScoutingResult={async (missionId) => {
                if (!selectedCharacter) return;
                const nextMissions = scoutingMissions.map((mission) =>
                  mission.missionId === missionId
                    ? { ...mission, dismissedAt: new Date().toISOString() }
                    : mission
                );
                queueTerritoryOperation(
                  { id: crypto.randomUUID(), kind: "scouting-dismiss", missionId },
                  { scoutingMissions: nextMissions },
                );
              }}
              onSaveHex={async (input) => {
                if (!selectedCharacter) return;
                const existing = territoryHexes.find((hex) =>
                  hex.territoryId === input.territoryId &&
                  territoryHexKey(hex.hexNumber) === territoryHexKey(input.hexNumber)
                );
                const localHexId = existing?.hexId || `local-${crypto.randomUUID()}`;
                const updatedHex: SheetTerritoryHex = {
                  ...(existing || {
                    hexId: localHexId,
                    characterId: selectedCharacter.characterId,
                    territoryId: input.territoryId,
                    hexNumber: input.hexNumber,
                    mapX: input.mapX,
                    mapY: input.mapY,
                    createdAt: new Date().toISOString(),
                  }),
                  title: input.title,
                  contents: input.contents,
                  mapX: input.mapX,
                  mapY: input.mapY,
                  updatedAt: new Date().toISOString(),
                  isDiscovered: true,
                };
                const nextHexes = [updatedHex, ...territoryHexes.filter((item) => item.hexId !== localHexId)];
                queueTerritoryOperation(
                  {
                    id: crypto.randomUUID(),
                    kind: "hex",
                    territoryId: input.territoryId,
                    localHexId,
                    hexNumber: input.hexNumber,
                    mapX: input.mapX,
                    mapY: input.mapY,
                    title: input.title,
                    contents: input.contents,
                  },
                  { territoryHexes: nextHexes },
                );
              }}
            />
          )}
          {section === "journal" && (
            <JournalView
              characterName={selectedCharacter?.name || ""}
              discordEnabled={Boolean(selectedCharacter?.discordConfigured)}
              entries={journalEntries}
              onAdd={() => {
                setEditingJournalEntry(null);
                setModal("journal-entry");
              }}
              onEdit={(entry) => {
                setEditingJournalEntry(entry);
                setModal("journal-entry");
              }}
              onSend={async (entry) => {
                if (!selectedCharacter) throw new Error("Select a character first.");
                await sendJournalEntryToDiscord({
                  characterId: selectedCharacter.characterId,
                  entryId: entry.entryId,
                });
              }}
              isDm={permissions.isDm}
              pushingToSheet={dmTabPushing === "journal"}
              pushToSheetSuccess={dmTabPushSuccess === "journal"}
              onPushToSheet={() => pushDmTabToSheet("journal")}
            />
          )}
          {section === "retainers" && (
            <RetainersView
              retainers={retainers}
              onAdd={(kind) => {
                setEditingRetainer(null);
                setRetainerKind(kind);
                setModal("retainer");
              }}
              onEdit={(retainer) => {
                setEditingRetainer(retainer);
                setRetainerKind(retainer.type);
                setModal("retainer");
              }}
              onDelete={removeRetainerRecord}
              isDm={permissions.isDm}
              hasUnsyncedChanges={retainerDraftDirty}
              syncing={retainerSyncing}
              syncError={retainerSyncError}
              lastSyncedAt={retainerLastSyncedAt}
              onRefresh={refreshRetainersFromCampaign}
              pushingToSheet={dmTabPushing === "retainers"}
              pushToSheetSuccess={dmTabPushSuccess === "retainers"}
              onPushToSheet={() => pushDmTabToSheet("retainers")}
            />
          )}
          {section === "player-management" && permissions.playerManagement && (
            <PlayerManagementView
              players={players}
              characters={characters}
              webhookConfigured={discordWebhookConfigured}
              onRefresh={refreshPlayerRoster}
              onChangeAccess={changePlayerAccess}
              onSaveWebhook={saveDiscordWebhook}
              onSaveThread={saveCharacterDiscordThread}
            />
          )}
        </div>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}
              aria-label={item.label}
            >
              <Icon size={22} />
              <span>{item.id === "player-management" ? "Players" : item.label}</span>
            </button>
          );
        })}
      </nav>

      {modal && (
        modal === "character" ? (
          <CharacterModal
            canClose={characters.length > 0}
            isDm={permissions.isDm}
            players={characterPlayers}
            currentPlayer={currentPlayer}
            onClose={() => setModal(null)}
            onSave={createCharacter}
          />
        ) : modal === "edit-character" ? (
          selectedCharacter ? (
          <EditCharacterModal
              character={selectedCharacter}
              onClose={() => setModal(null)}
              onSave={updateCharacter}
              onDelete={() => setModal("delete-character")}
              onPortraitUpload={saveCharacterPortrait}
              onPortraitDelete={removeCharacterPortrait}
            />
          ) : null
        ) : modal === "delete-character" ? (
          selectedCharacter ? (
            <DeleteCharacterModal
              character={selectedCharacter}
              onClose={() => setModal(null)}
              onDelete={deleteCharacter}
            />
          ) : null
        ) : modal === "ledger" ? (
          <FullLedgerModal
            transactions={transactions}
            onDelete={deleteWalletTransaction}
            onClose={() => setModal(null)}
          />
        ) : modal === "recurring-expenses" ? (
          <RecurringExpensesModal
            schedules={recurringExpenses}
            retainers={retainers}
            onCancel={cancelSchedule}
            onUpdate={updateSchedule}
            onEditLinkedRetainer={(retainer) => {
              setRetainerKind(retainer.type === "force" ? "force" : "individual");
              setEditingRetainer(retainer);
              setModal("retainer");
            }}
            onClose={() => setModal(null)}
          />
        ) : modal === "purchase" ? (
          <PurchaseModal
            balances={{ pp: platinum, gp: gold, sp: silver, cp: copper }}
            onClose={() => setModal(null)}
            onPurchase={recordPurchase}
          />
        ) : modal === "journal-entry" ? (
          <JournalEntryModal
            entry={editingJournalEntry}
            onClose={() => {
              setEditingJournalEntry(null);
              setModal(null);
            }}
            onSave={saveCampaignJournalEntry}
            onDelete={editingJournalEntry ? removeCampaignJournalEntry : undefined}
          />
        ) : modal === "retainer" ? (
          <RetainerModal
            kind={retainerKind}
            retainer={editingRetainer}
            isDm={interfaceIsDm}
            onClose={() => {
              setEditingRetainer(null);
              setModal(null);
            }}
            onSave={saveRetainerRecord}
          />
        ) : modal === "territory" ? (
          <TerritoryModal
            territory={editingTerritory}
            isDm={interfaceIsDm}
            onClose={() => {
              setEditingTerritory(null);
              setModal(null);
            }}
            onSave={saveTerritoryRecord}
            onDelete={deleteTerritoryRecord}
          />
        ) : (
          <TransactionModal
            mode={modal}
            characterName={selectedCharacter?.name || "Selected character"}
            onClose={() => setModal(null)}
            onSave={recordTransaction}
          />
        )
      )}
      {profileSyncSuccess && (!permissions.isDm || dmOwnsSelectedCharacter) && (
        <div className="profile-sync-success-toast" role="status" aria-live="polite">
          <strong>Character synced successfully</strong>
          <span>Your latest character data has been synchronized with the campaign Sheet.</span>
        </div>
      )}
      {dmTabPushSuccess && permissions.isDm && (
        <div className="profile-sync-success-toast" role="status" aria-live="polite">
          <strong>{dmTabPushSuccess.charAt(0).toUpperCase() + dmTabPushSuccess.slice(1)} pushed to Sheet</strong>
          <span>The player will receive this tab as authoritative data on their next Sync with Sheet.</span>
        </div>
      )}
      {portraitViewer?.portraitUrl && (
        <PortraitViewer
          character={portraitViewer}
          onClose={() => setPortraitViewer(null)}
        />
      )}
    </main>
  );
}

function PortraitViewer({
  character,
  onClose,
}: {
  character: SheetCharacter;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="portrait-viewer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="portrait-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`${character.name} portrait`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="portrait-viewer-close" type="button" aria-label="Close portrait" onClick={onClose}>
          <X />
        </button>
        <img src={character.portraitUrl} alt={`${character.name} portrait, full size`} />
      </section>
    </div>
  );
}

function LoginScreen({
  players,
  onLogin,
  onRegister,
  onLoadRecoveryQuestion,
  onResetPassword,
}: {
  players: LoginOption[];
  onLogin: (input: { playerId: string; email: string; password: string }) => Promise<void>;
  onRegister: (input: { displayName: string; email: string; setupPassword: string }) => Promise<void>;
  onLoadRecoveryQuestion: (input: { playerId: string; email: string }) => Promise<{ recoveryQuestion: string }>;
  onResetPassword: (input: {
    playerId: string;
    email: string;
    recoveryAnswer: string;
    newPassword: string;
  }) => Promise<void>;
}) {
  const [registering, setRegistering] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryQuestion, setRecoveryQuestion] = useState("");
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (registering) {
        await onRegister({ displayName, email, setupPassword: password });
      } else if (recovering && !recoveryQuestion) {
        const result = await onLoadRecoveryQuestion({ playerId, email });
        setRecoveryQuestion(result.recoveryQuestion);
      } else if (recovering) {
        if (password.length < 10) throw new Error("Use a password of at least 10 characters.");
        if (password !== confirmation) throw new Error("The passwords do not match.");
        await onResetPassword({
          playerId,
          email,
          recoveryAnswer,
          newPassword: password,
        });
        setRecovering(false);
        setRecoveryQuestion("");
        setRecoveryAnswer("");
        setConfirmation("");
        setPassword("");
        setError("Password reset. You can now sign in.");
      } else {
        await onLogin({ playerId, email, password });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="seal auth-seal">
          <img
            src="/player-character-manager-icon-192.png"
            alt=""
            className="seal-icon"
          />
        </div>
        <p className="eyebrow">Player Character Manager</p>
        <h1>{registering ? "Set up your account" : recovering ? "Reset your password" : "Sign in"}</h1>
        {registering ? (
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
        ) : (
          <label>
            Display name
            <select value={playerId} onChange={(event) => setPlayerId(event.target.value)} required>
              <option value="">Select your name</option>
              {players.map((player) => (
                <option value={player.playerId} key={player.playerId}>{player.displayName}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {recovering && recoveryQuestion && (
          <label>
            {recoveryQuestion}
            <input value={recoveryAnswer} onChange={(event) => setRecoveryAnswer(event.target.value)} autoComplete="off" required />
          </label>
        )}
        {(!recovering || recoveryQuestion) && (
          <label>
            {registering ? "Shared setup password" : recovering ? "New password" : "Password"}
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={recovering ? "new-password" : "current-password"} required />
          </label>
        )}
        {recovering && recoveryQuestion && (
          <label>
            Confirm new password
            <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>
          {busy
            ? "Please wait…"
            : registering
              ? "Create account"
              : recovering && !recoveryQuestion
                ? "Continue"
                : recovering
                  ? "Reset password"
                  : "Sign in"}
        </button>
        {!registering && !recovering && (
          <button
            className="auth-switch-button"
            type="button"
            onClick={() => {
              setRecovering(true);
              setError("");
              setPassword("");
            }}
          >
            Forgot password?
          </button>
        )}
        <button
          className="auth-switch-button"
          type="button"
          onClick={() => {
            if (recovering) {
              setRecovering(false);
              setRecoveryQuestion("");
              setRecoveryAnswer("");
              setConfirmation("");
            } else {
              setRegistering((current) => !current);
            }
            setError("");
            setPassword("");
          }}
        >
          {recovering
            ? "Back to sign in"
            : registering
              ? "Already have an account? Sign in"
              : "First time here? Set up your account"}
        </button>
      </form>
    </main>
  );
}

function FirstPasswordScreen({
  onSave,
}: {
  onSave: (input: {
    newPassword: string;
    recoveryQuestion: string;
    recoveryAnswer: string;
  }) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryQuestion, setRecoveryQuestion] = useState("");
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirmation) return setError("The passwords do not match.");
    if (recoveryQuestion.trim().length < 5) return setError("Enter a recovery question.");
    if (recoveryAnswer.trim().length < 2) return setError("Enter an answer to your recovery question.");
    setBusy(true);
    setError("");
    try {
      await onSave({
        newPassword: password,
        recoveryQuestion: recoveryQuestion.trim(),
        recoveryAnswer,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="seal auth-seal"><LockKeyhole size={28} /></div>
        <p className="eyebrow">First sign-in</p>
        <h1>Create your password</h1>
        <p>Your temporary password worked. Replace it before continuing.</p>
        <label>
          New password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          Confirm new password
          <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          Password recovery question
          <input value={recoveryQuestion} onChange={(event) => setRecoveryQuestion(event.target.value)} placeholder="e.g. What was your first character's name?" required />
        </label>
        <label>
          Recovery answer
          <input value={recoveryAnswer} onChange={(event) => setRecoveryAnswer(event.target.value)} autoComplete="off" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </main>
  );
}

function EditCharacterModal({
  character,
  onClose,
  onSave,
  onDelete,
  onPortraitUpload,
  onPortraitDelete,
}: {
  character: SheetCharacter;
  onClose: () => void;
  onSave: (input: { name: string; className: string; level: number }) => Promise<void>;
  onDelete: () => void;
  onPortraitUpload: (file: File) => Promise<void>;
  onPortraitDelete: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadingPortrait, setUploadingPortrait] = useState(false);
  const [deletingPortrait, setDeletingPortrait] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: String(data.get("name") || "").trim(),
        className: String(data.get("className") || "").trim(),
        level: Math.max(1, Number(data.get("level")) || 1),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the character.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal character-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-character-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          <X />
        </button>
        <p className="eyebrow">Character details</p>
        <h2 id="edit-character-title">Edit Character</h2>
        <form onSubmit={submit}>
          <div className="portrait-editor">
            <div className={character.portraitUrl ? "portrait-preview has-image" : "portrait-preview"}>
              {character.portraitUrl
                ? <img src={character.portraitUrl} alt={`${character.name} portrait`} />
                : <UserRound size={34} />}
            </div>
            <div className="portrait-editor-actions">
              <label className="portrait-upload-button">
                {uploadingPortrait ? "Uploading…" : character.portraitUrl ? "Replace portrait" : "Upload portrait"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploadingPortrait}
                  onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    setUploadingPortrait(true);
                    setError("");
                    try {
                      await onPortraitUpload(file);
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Could not upload the portrait.");
                    } finally {
                      setUploadingPortrait(false);
                      event.currentTarget.value = "";
                    }
                  }}
                />
              </label>
              {character.portraitUrl && (
                <button
                  className="portrait-delete-button"
                  type="button"
                  disabled={uploadingPortrait || deletingPortrait}
                  onClick={async () => {
                    if (!window.confirm("Delete this character portrait? The sword marker will be restored.")) return;
                    setDeletingPortrait(true);
                    setError("");
                    try {
                      await onPortraitDelete();
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Could not delete the portrait.");
                    } finally {
                      setDeletingPortrait(false);
                    }
                  }}
                >
                  <Trash2 size={16} />
                  {deletingPortrait ? "Deleting…" : "Delete portrait"}
                </button>
              )}
            </div>
            <small>PNG, JPG, WebP, or GIF · maximum 5 MB</small>
          </div>
          <label>
            Character name
            <input name="name" defaultValue={character.name} autoFocus required maxLength={120} />
          </label>
          <div className="character-fields">
            <label>
              Class
              <select name="className" defaultValue={canonicalCharacterClass(character.class)} required>
                {CHARACTER_CLASSES.map((className) => <option value={className} key={className}>{className}</option>)}
              </select>
            </label>
            <label>
              Level
              <input name="level" type="number" min="1" max="99" defaultValue={character.level} required />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="edit-character-actions">
            <button className="primary-action" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              className="edit-delete-button"
              type="button"
              aria-label={`Delete ${character.name}`}
              title={`Delete ${character.name}`}
              onClick={onDelete}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DeleteCharacterModal({
  character,
  onClose,
  onDelete,
}: {
  character: SheetCharacter;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const matches = confirmation.trim() === character.name;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the character.");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal delete-character-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-character-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          <X />
        </button>
        <p className="eyebrow">Permanent deletion</p>
        <h2 id="delete-character-title">Delete {character.name}?</h2>
        <p className="modal-intro">
          This permanently removes the character and all of their wallet transactions,
          territories, retainers, and journal entries.
        </p>
        <form onSubmit={submit}>
          <label>
            Type <strong>{character.name}</strong> to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoFocus
              autoComplete="off"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="delete-actions">
            <button type="button" className="secondary-action" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="danger-action" disabled={!matches || deleting}>
              <Trash2 size={17} />
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CharacterModal({
  canClose,
  isDm,
  players,
  currentPlayer,
  onClose,
  onSave,
}: {
  canClose: boolean;
  isDm: boolean;
  players: SheetPlayer[];
  currentPlayer: SheetPlayer | null;
  onClose: () => void;
  onSave: (input: {
    playerName: string;
    targetPlayerId?: string;
    name: string;
    className: string;
    level: number;
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const targetPlayerId = String(data.get("targetPlayerId") || "").trim();
      const selectedOwner = players.find((player) => player.playerId === targetPlayerId);
      await onSave({
        playerName: isDm
          ? selectedOwner?.displayName || currentPlayer?.displayName || ""
          : String(data.get("playerName") || "").trim(),
        targetPlayerId: isDm ? targetPlayerId || currentPlayer?.playerId : undefined,
        name: String(data.get("name") || "").trim(),
        className: String(data.get("className") || "").trim(),
        level: Math.max(1, Number(data.get("level")) || 1),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the character.");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={canClose ? onClose : undefined}
    >
      <section
        className="modal character-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {canClose && (
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        )}
        <p className="eyebrow">Character creator · Step 1</p>
        <h2 id="character-modal-title">Create a Character</h2>
        <p className="modal-intro">
          Add the character’s basic identity now. Ability scores, race, alignment,
          and the full AD&amp;D creation sequence will follow in later steps.
        </p>
        <form onSubmit={submit}>
          {isDm ? (
            <label>
              Player
              <select
                name="targetPlayerId"
                defaultValue={currentPlayer?.playerId || players[0]?.playerId || ""}
                autoFocus
                required
              >
                <option value="" disabled>Select a player</option>
                {players.map((player) => (
                  <option value={player.playerId} key={player.playerId}>
                    {player.displayName || player.playerId}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Player name
              <input
                name="playerName"
                defaultValue={currentPlayer?.displayName || ""}
                placeholder="Your name"
                autoFocus
                required
                maxLength={120}
              />
            </label>
          )}
          <label>
            Character name
            <input name="name" placeholder="Character name" required maxLength={120} />
          </label>
          <div className="character-fields">
            <label>
              Class
              <select name="className" defaultValue="" required>
                <option value="" disabled>Select a class</option>
                {CHARACTER_CLASSES.map((className) => <option value={className} key={className}>{className}</option>)}
              </select>
            </label>
            <label>
              Starting level
              <input name="level" type="number" min="1" max="99" defaultValue="1" required />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create Character"}
          </button>
        </form>
      </section>
    </div>
  );
}

function hashId(value: string) {
  return value.split("").reduce((hash, character) => {
    return (hash * 31 + character.charCodeAt(0)) | 0;
  }, 0);
}

function formatLedgerDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function formatCalendarDate(value: string) {
  const calendarDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (calendarDate) {
    const [, year, month, day] = calendarDate;
    return `${month}/${day}/${year}`;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
}

function WalletView({
  platinum,
  gold,
  silver,
  copper,
  coinWeight,
  transactions,
  onAction,
  onSeeFullLedger,
  onManageRecurringExpenses,
  backupEnabled,
  backupBusy,
  backupMessage,
  backupError,
  onBackup,
  onRestore,
}: {
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  coinWeight: string;
  transactions: Transaction[];
  onAction: (action: "funds" | "expense" | "purchase") => void;
  onSeeFullLedger: () => void;
  onManageRecurringExpenses: () => void;
  backupEnabled: boolean;
  backupBusy: "backup" | "restore" | "";
  backupMessage: string;
  backupError: string;
  onBackup: () => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  const formatCoinAmount = (amount: number) => amount.toLocaleString();
  const coinAmountClass = (amount: number) => {
    const digits = Math.abs(Math.trunc(amount)).toString().length;
    if (digits >= 8) return "coin-amount coin-amount-xlong";
    if (digits >= 5) return "coin-amount coin-amount-long";
    return "coin-amount";
  };

  return (
    <>
      <section className="wallet-hero ornamental-card">
        <div className="watermark-coins">
          <Coins size={146} strokeWidth={0.7} />
        </div>
        <div className="balance-column">
          <p className="eyebrow">Character purse</p>
          <div className="coin-balances" aria-label="Current balance">
            <div className="coin-balance platinum">
              <span className="coin coin-platinum">pp</span>
              <strong className={coinAmountClass(platinum)}>{formatCoinAmount(platinum)}</strong>
              <span className="coin-type">pp</span>
            </div>
            <div className="coin-balance gold">
              <span className="coin coin-gold">gp</span>
              <strong className={coinAmountClass(gold)}>{formatCoinAmount(gold)}</strong>
              <span className="coin-type">gp</span>
            </div>
            <div className="coin-balance">
              <span className="coin coin-silver">sp</span>
              <strong className={coinAmountClass(silver)}>{formatCoinAmount(silver)}</strong>
              <span className="coin-type">sp</span>
            </div>
            <div className="coin-balance">
              <span className="coin coin-copper">cp</span>
              <strong className={coinAmountClass(copper)}>{formatCoinAmount(copper)}</strong>
              <span className="coin-type">cp</span>
            </div>
          </div>
          <div className="coin-weight">
            <ShoppingCart size={22} />
            <span>Coin weight</span>
            <span className="dot-leader" />
            <strong>{coinWeight} lb</strong>
          </div>
        </div>

        <div className="wallet-actions">
          <button className="primary-action" onClick={() => onAction("funds")}>
            <Plus size={21} /> Add Funds
          </button>
          <button onClick={() => onAction("expense")}>
            <ReceiptText size={20} /> Record Expense
          </button>
          <button onClick={() => onAction("purchase")}>
            <ShoppingCart size={20} /> Purchase
          </button>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="ornamental-card ledger-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Last activity</p>
              <h2>Recent Ledger</h2>
            </div>
            <div className="ledger-heading-actions">
              <button
                className="manage-recurring-button"
                onClick={onManageRecurringExpenses}
              >
                <ReceiptText size={15} />
                <span>Manage Recurring Expenses</span>
              </button>
              <button
                className="manage-recurring-button"
                disabled={!backupEnabled || Boolean(backupBusy)}
                onClick={() => void onBackup().catch((error) =>
                  window.alert(error instanceof Error ? error.message : "Could not back up the ledger.")
                )}
                title="Save this local ledger to the workbook as a backup"
              >
                <Upload size={15} />
                <span>{backupBusy === "backup" ? "Backing up…" : "Back Up Ledger"}</span>
              </button>
              <button
                className="manage-recurring-button"
                disabled={!backupEnabled || Boolean(backupBusy)}
                onClick={() => void onRestore().catch((error) =>
                  window.alert(error instanceof Error ? error.message : "Could not restore the ledger backup.")
                )}
                title="Replace this device's local ledger with the saved workbook backup"
              >
                <ScrollText size={15} />
                <span>{backupBusy === "restore" ? "Restoring…" : "Restore Backup"}</span>
              </button>
              <ScrollText size={24} />
            </div>
          </div>
          {backupError && <p className="form-error">{backupError}</p>}
          {backupMessage && <p className="sync-success">{backupMessage}</p>}
          <div className="transaction-list">
            {transactions.slice(0, 4).map((item) => (
              <div className="transaction" key={item.id}>
                <span className={`transaction-icon ${item.kind}`}>
                  {item.kind === "income" ? <CircleDollarSign /> : <ReceiptText />}
                </span>
                <span className="transaction-name">
                  <strong>{item.label}</strong>
                  <small className="transaction-date">{item.timestamp}</small>
                  {item.note && <small className="transaction-note">{item.note}</small>}
                </span>
                <strong className={item.kind}>
                  {transactionCoinText(item)}
                </strong>
              </div>
            ))}
            {!transactions.length && (
              <p className="empty-ledger">No transactions have been recorded.</p>
            )}
          </div>
          <button className="full-ledger-button" onClick={onSeeFullLedger}>
            <ScrollText size={18} />
            See full ledger
          </button>
        </section>

      </div>
    </>
  );
}

function RecurringExpensesModal({
  schedules,
  retainers,
  onCancel,
  onUpdate,
  onEditLinkedRetainer,
  onClose,
}: {
  schedules: SheetRecurringExpense[];
  retainers: SheetRetainer[];
  onCancel: (scheduleId: string) => Promise<void>;
  onUpdate: (
    scheduleId: string,
    input: {
      label: string;
      amount: number;
      coin: CoinType;
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
      note: string;
    },
  ) => Promise<void>;
  onEditLinkedRetainer: (retainer: SheetRetainer) => void;
  onClose: () => void;
}) {
  const [cancellingId, setCancellingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [editError, setEditError] = useState("");
  const frequencyLabel = {
    weekly: "Weekly",
    monthly: "Monthly",
    annually: "Annually",
  };
  const amountLabel = (schedule: SheetRecurringExpense) => {
    const amounts = (["pp", "gp", "sp", "cp"] as CoinType[])
      .filter((coin) => Number(schedule[coin]) > 0)
      .map((coin) => `${Number(schedule[coin]).toLocaleString()} ${coin}`);
    return amounts.join(", ");
  };

  async function cancel(scheduleId: string) {
    setCancellingId(scheduleId);
    try {
      await onCancel(scheduleId);
    } finally {
      setCancellingId("");
    }
  }

  function editableCoin(schedule: SheetRecurringExpense): CoinType {
    return (["pp", "gp", "sp", "cp"] as CoinType[]).find(
      (coin) => Number(schedule[coin]) > 0,
    ) || "gp";
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, scheduleId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    if (!(amount > 0)) return;
    setSavingId(scheduleId);
    setEditError("");
    try {
      await onUpdate(scheduleId, {
        label: String(data.get("label") || "").trim(),
        amount,
        coin: String(data.get("coin") || "gp") as CoinType,
        frequency: String(data.get("frequency") || "monthly") as
          | "weekly"
          | "monthly"
          | "annually",
        startDate: String(data.get("startDate") || ""),
        note: String(data.get("note") || "").trim(),
      });
      setEditingId("");
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update the expense.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal recurring-expenses-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-expenses-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X />
        </button>
        <p className="eyebrow">Character wallet</p>
        <h2 id="recurring-expenses-title">Manage Recurring Expenses</h2>
        <div className="recurring-expense-list">
          {schedules.map((schedule) => (
            <div className="recurring-expense-row" key={schedule.scheduleId}>
              <div className="recurring-expense-summary">
                <strong>{schedule.label}</strong>
                <small>
                  {amountLabel(schedule)} · {frequencyLabel[schedule.frequency]} · starts{" "}
                  {formatCalendarDate(schedule.startDate)}
                </small>
                {schedule.note && <small>{schedule.note}</small>}
              </div>
              <div className="recurring-expense-actions">
                <button
                  className="edit-recurring-button"
                  disabled={cancellingId === schedule.scheduleId}
                  onClick={() => {
                    setEditError("");
                    const linkedRetainer = schedule.sourceType === "retainer"
                      ? retainers.find((retainer) => retainer.retainerId === schedule.sourceId)
                      : undefined;
                    if (linkedRetainer) {
                      onEditLinkedRetainer(linkedRetainer);
                    } else {
                      setEditingId(schedule.scheduleId);
                    }
                  }}
                >
                  Edit
                </button>
                {schedule.sourceType !== "retainer" && (
                  <button
                    className="cancel-recurring-button"
                    disabled={cancellingId === schedule.scheduleId}
                    onClick={() => void cancel(schedule.scheduleId)}
                  >
                    {cancellingId === schedule.scheduleId ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </div>
              {editingId === schedule.scheduleId && (
                <form
                  className="recurring-expense-edit-form"
                  onSubmit={(event) => void saveEdit(event, schedule.scheduleId)}
                >
                  <label>
                    Expense
                    <input name="label" defaultValue={schedule.label} required autoFocus />
                  </label>
                  <div className="coin-entry">
                    <label>
                      Amount
                      <input
                        name="amount"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={schedule[editableCoin(schedule)]}
                        required
                      />
                    </label>
                    <label>
                      Coin
                      <select name="coin" defaultValue={editableCoin(schedule)}>
                        <option value="pp">Platinum pieces (pp)</option>
                        <option value="gp">Gold pieces (gp)</option>
                        <option value="sp">Silver pieces (sp)</option>
                        <option value="cp">Copper pieces (cp)</option>
                      </select>
                    </label>
                  </div>
                  <div className="coin-entry">
                    <label>
                      Repeats
                      <select name="frequency" defaultValue={schedule.frequency}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="annually">Annually</option>
                      </select>
                    </label>
                    <label>
                      Schedule date
                      <input
                        name="startDate"
                        type="date"
                        defaultValue={String(schedule.startDate).slice(0, 10)}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Note
                    <input name="note" defaultValue={schedule.note || ""} maxLength={500} />
                  </label>
                  {editError && <p className="form-error">{editError}</p>}
                  <div className="recurring-edit-actions">
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => setEditingId("")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-action"
                      type="submit"
                      disabled={savingId === schedule.scheduleId}
                    >
                      {savingId === schedule.scheduleId ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {!schedules.length && (
            <p className="empty-ledger">No active recurring expenses.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function FullLedgerModal({
  transactions,
  onDelete,
  onClose,
}: {
  transactions: Transaction[];
  onDelete: (transaction: Transaction) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal full-ledger-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="full-ledger-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close full ledger" onClick={onClose}>
          <X size={20} />
        </button>
        <p className="eyebrow">Transaction history</p>
        <h2 id="full-ledger-title">Full Ledger</h2>
        <p className="modal-intro">
          Review every transaction recorded for this character.
        </p>
        <div className="full-ledger-list">
          {transactions.map((item) => (
            <div className="transaction" key={item.id}>
              <span className={`transaction-icon ${item.kind}`}>
                {item.kind === "income" ? <CircleDollarSign /> : <ReceiptText />}
              </span>
              <span className="transaction-name">
                <strong>{item.label}</strong>
                <small className="transaction-date">{item.timestamp}</small>
                {item.note && <small className="transaction-note">{item.note}</small>}
              </span>
              <span
                className="ledger-amount-actions"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.45rem",
                  marginLeft: "auto",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <strong className={item.kind}>
                  {transactionCoinText(item)}
                </strong>
                <button
                  type="button"
                  className="edit-delete-button"
                  style={{ margin: 0, flex: "0 0 auto" }}
                  aria-label={`Delete ${item.label}`}
                  title="Delete transaction"
                  onClick={() => {
                    if (window.confirm(`Delete "${item.label}"?`)) {
                      void onDelete(item);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          ))}
          {!transactions.length && (
            <p className="empty-ledger">No transactions have been recorded.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function TerritoriesView({
  territories,
  fightingForces,
  officerRetainers,
  scoutingMissions,
  customMissions,
  territoryHexes,
  characterName,
  character,
  isDm,
  onAdd,
  onEdit,
  onRevealHex,
  onStartScouting,
  onCreateCustomMission,
  onCompleteScoutingForTesting,
  onPromoteScoutingSerjeants,
  onViewScoutingResults,
  onDismissScoutingResult,
  onSaveHex,
  characterId,
  balances,
  onRecruitmentComplete,
  onFieldAllocationSaved,
  onTitheChanged,
  hasUnsyncedChanges,
  syncing,
  syncError,
  lastSyncedAt,
  onRefresh,
  pushingToSheet,
  pushToSheetSuccess,
  onPushToSheet,
}: {
  territories: SheetTerritory[];
  fightingForces: SheetRetainer[];
  officerRetainers: SheetRetainer[];
  scoutingMissions: SheetScoutingMission[];
  customMissions: SheetCustomMission[];
  territoryHexes: SheetTerritoryHex[];
  characterName: string;
  character: SheetCharacter | null;
  isDm: boolean;
  onAdd: () => void;
  onEdit: (territory: SheetTerritory) => void;
  onRevealHex: (input: {
    territoryId: string;
    hexNumber: string;
    mapX: number;
    mapY: number;
  }) => Promise<void>;
  onStartScouting: (input: {
    territoryId: string;
    hexNumber: string;
    mapX: number;
    mapY: number;
    allocations: Array<{ retainerId: string; soldierType: string; men: number }>;
    officerRetainerId?: string;
  }) => Promise<void>;
  onCreateCustomMission: (input: {
    territoryId: string;
    objective: string;
    missionLocation: string;
    startDate: string;
    durationDays: number;
    allocations: Array<{ retainerId: string; soldierType: string; men: number }>;
    additionalNotes?: string;
  }) => Promise<void>;
  onCompleteScoutingForTesting: (missionId: string) => Promise<void>;
  onPromoteScoutingSerjeants: (missionId: string) => Promise<void>;
  onViewScoutingResults: (missionId: string) => Promise<SheetScoutingMission>;
  onDismissScoutingResult: (missionId: string) => Promise<void>;
  onSaveHex: (input: {
    territoryId: string;
    hexNumber: string;
    mapX: number;
    mapY: number;
    title?: string;
    contents?: string;
  }) => Promise<void>;
  characterId: string;
  balances: CoinBalances;
  onRecruitmentComplete: (transaction?: SheetTransaction, schedule?: SheetRecurringExpense) => Promise<void>;
  onFieldAllocationSaved: (hex: SheetTerritoryHex) => void;
  onTitheChanged: (territory: SheetTerritory) => void;
  hasUnsyncedChanges: boolean;
  syncing: boolean;
  syncError: string;
  lastSyncedAt: string;
  onRefresh: () => Promise<void>;
  pushingToSheet: boolean;
  pushToSheetSuccess: boolean;
  onPushToSheet: () => Promise<void>;
}) {
  const [viewingMap, setViewingMap] = useState<SheetTerritory | null>(null);
  const [viewingMissions, setViewingMissions] = useState<SheetTerritory | null>(null);
  const [managingTerritory, setManagingTerritory] = useState<SheetTerritory | null>(null);
  const [recruitingTerritory, setRecruitingTerritory] = useState<SheetTerritory | null>(null);
  const [savingTitheId, setSavingTitheId] = useState("");

  async function changeChurchTithe(territory: SheetTerritory, payChurchTithe: boolean) {
    if (Boolean(territory.payChurchTithe) === payChurchTithe) return;
    setSavingTitheId(territory.territoryId);
    try {
      onTitheChanged({ ...territory, payChurchTithe, updatedAt: new Date().toISOString() });
    } finally {
      setSavingTitheId("");
    }
  }

  return (
    <section>
      <div className="page-title">
        <div>
          <p className="eyebrow">Lands & holdings</p>
          <h1>Territories</h1>
          <p>Manage the territories attached to {characterName || "this character"}.</p>
        </div>
        {isDm && (
          <button className="primary-action" onClick={onAdd}><Plus size={19} /> Add Territory</button>
        )}
      </div>
      <div className="territory-sync-bar" aria-live="polite">
        <div className="territory-sync-status">
          <strong>{hasUnsyncedChanges ? "Unsynced territory changes" : "Territory data synced"}</strong>
          <small>
            {hasUnsyncedChanges
              ? isDm ? "Local territory changes have not been sent." : "Changes and new orders are stored on this device until you press Sync with Sheet."
              : lastSyncedAt
                ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Working copy matches the campaign data."}
          </small>
        </div>
        <div className="territory-sync-actions">
          {isDm && (
            <>
              <button className="secondary-action" disabled={syncing || pushingToSheet}
                onClick={() => void onRefresh().catch((error) => window.alert(error instanceof Error ? error.message : "Could not refresh player data."))}>
                Refresh Player Data
              </button>
              <button className="secondary-action" disabled={syncing || pushingToSheet}
                onClick={() => void onPushToSheet().catch((error) => window.alert(error instanceof Error ? error.message : "Could not push Territories to the Sheet."))}>
                <Upload size={16} /> {pushingToSheet ? "Pushing…" : pushToSheetSuccess ? "Pushed" : "Push to Sheet"}
              </button>
            </>
          )}
        </div>
        {syncError && <p className="form-error territory-sync-error">{syncError}</p>}
      </div>
      <div className="territory-list">
        {territories.map((territory) => (
          <article className="ornamental-card territory-card" key={territory.territoryId}>
            {isDm && (
              <button
                className="territory-edit-pencil"
                onClick={() => onEdit(territory)}
                aria-label={`Edit ${territory.name}`}
                title="Edit territory"
              >
                <Pencil size={15} aria-hidden="true" />
              </button>
            )}
            <div className="territory-card-body">
              {territory.mapUrl ? (
                <button
                  className="territory-map-hit-area"
                  onClick={() => setViewingMap(territory)}
                  aria-label={`Open map for ${territory.name}`}
                  title="Open territory map"
                >
                  <span className="large-crest" aria-hidden="true"><Landmark size={28} /></span>
                  <span className="territory-name">
                    <span>{territory.hexNumber ? `Hex ${territory.hexNumber}` : "Hex not assigned"}</span>
                    <strong>{territory.name}</strong>
                  </span>
                </button>
              ) : (
                <div className="territory-map-hit-area territory-map-hit-area-static">
                  <div className="large-crest"><Landmark size={28} /></div>
                  <div className="territory-name">
                    <span>{territory.hexNumber ? `Hex ${territory.hexNumber}` : "Hex not assigned"}</span>
                  <h2>{territory.name}</h2>
                  </div>
                </div>
              )}
              <div className="territory-card-actions">
                <div className="territory-tithe-control">
                  <span>Pay Church Tithe?</span>
                  <div className="territory-tithe-toggle" role="group" aria-label={`Pay church tithe for ${territory.name}?`}>
                    <button type="button" className={!territory.payChurchTithe ? "active" : ""} disabled={savingTitheId === territory.territoryId} onClick={() => void changeChurchTithe(territory, false)}>No</button>
                    <button type="button" className={territory.payChurchTithe ? "active" : ""} disabled={savingTitheId === territory.territoryId} onClick={() => void changeChurchTithe(territory, true)}>Yes</button>
                  </div>
                </div>
                <button className="primary-action territory-missions" onClick={() => setViewingMissions(territory)}>
                  <Timer size={16} /> <span>Active Missions</span>
                </button>
                <button className="primary-action territory-manage" onClick={() => setManagingTerritory(territory)}>
                  <Landmark size={16} /> <span>Manage Territory</span>
                </button>
                <button className="primary-action territory-recruit" onClick={() => setRecruitingTerritory(territory)}>
                  <Sword size={16} /> <span>Recruit Fighting Men</span>
                </button>
              </div>
            </div>
          </article>
        ))}
        {!territories.length && (
          <div className="ornamental-card territory-empty">
            <Castle size={34} />
            <h2>No territories yet</h2>
            <p>{isDm ? "Add the territory’s name and optional hex number to begin." : "No territories are assigned to this character."}</p>
            {isDm && (
              <button className="primary-action" onClick={onAdd}><Plus size={18} /> Add Territory</button>
            )}
          </div>
        )}
      </div>
      {!isDm && territories.some((territory) => !territory.mapUrl) && (
        <p className="territory-map-note">Only the Dungeon Master can upload territory maps.</p>
      )}
      {viewingMap && (
        <TapRevealTerritoryMap
          territory={viewingMap}
          territoryHexes={territoryHexes.filter((hex) => hex.territoryId === viewingMap.territoryId)}
          fightingForces={fightingForces}
          missions={scoutingMissions.filter((mission) => mission.territoryId === viewingMap.territoryId)}
          customMissions={customMissions}
          isDm={isDm}
          onRevealHex={onRevealHex}
          onStartScouting={onStartScouting}
          onViewResults={onViewScoutingResults}
          onClose={() => setViewingMap(null)}
        />
      )}
      {viewingMissions && (
        <ScoutingMissionsPanel
          territory={viewingMissions}
          missions={scoutingMissions.filter((mission) => mission.territoryId === viewingMissions.territoryId && mission.status !== "cancelled")}
          customMissions={customMissions}
          fightingForces={fightingForces}
          officerRetainers={officerRetainers}
          isDm={isDm}
          onCompleteForTesting={onCompleteScoutingForTesting}
          onPromoteSerjeants={onPromoteScoutingSerjeants}
          onViewResults={onViewScoutingResults}
          onDismissResult={onDismissScoutingResult}
          onCreateCustomMission={onCreateCustomMission}
          onClose={() => setViewingMissions(null)}
        />
      )}
      {managingTerritory && (
        <TerritoryManagementPanel
          mode="assets"
          territory={managingTerritory}
          character={character}
          characterId={characterId}
          fightingForces={fightingForces}
          balances={balances}
          isDm={isDm}
          territoryHexes={territoryHexes.filter((hex) =>
            hex.territoryId === managingTerritory.territoryId &&
            (
              Boolean(hex.isDiscovered) ||
              Boolean(hex.dmRevealed) ||
              territoryHexKey(hex.hexNumber) === territoryHexKey("4.4") ||
              territoryHexKey(hex.hexNumber) === territoryHexKey(managingTerritory.hexNumber) ||
              scoutingMissions.some((mission) =>
                mission.territoryId === hex.territoryId &&
                mission.status === "completed" &&
                Boolean(mission.resultsViewedAt) &&
                territoryHexKey(mission.hexNumber) === territoryHexKey(hex.hexNumber),
              )
            )
          )}
          onFieldAllocationSaved={onFieldAllocationSaved}
          onClose={() => setManagingTerritory(null)}
          onSaved={(territory) => {
            setManagingTerritory(territory);
            Object.assign(managingTerritory, territory);
          }}
          onRecruitmentComplete={onRecruitmentComplete}
          hasUnsyncedChanges={hasUnsyncedChanges}
        />
      )}
      {recruitingTerritory && (
        <TerritoryManagementPanel
          mode="recruitment"
          territory={recruitingTerritory}
          character={character}
          characterId={characterId}
          fightingForces={fightingForces}
          balances={balances}
          isDm={isDm}
          territoryHexes={[]}
          onFieldAllocationSaved={() => undefined}
          onClose={() => setRecruitingTerritory(null)}
          onSaved={() => undefined}
          onRecruitmentComplete={onRecruitmentComplete}
          hasUnsyncedChanges={hasUnsyncedChanges}
        />
      )}
    </section>
  );
}

function exactTimeRemaining(completesAt: string | undefined, now: number) {
  if (!completesAt) return "Completion time unavailable";
  const remaining = Math.max(0, new Date(completesAt).getTime() - now);
  if (!remaining) return "Due now";
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`].filter(Boolean).join(" ");
}

function TerritoryManagementPanel({ mode, territory, character, characterId, fightingForces, balances, isDm, territoryHexes, onFieldAllocationSaved, onClose, onSaved, onRecruitmentComplete, hasUnsyncedChanges }: {
  mode: "assets" | "recruitment";
  territory: SheetTerritory;
  character: SheetCharacter | null;
  characterId: string;
  fightingForces: SheetRetainer[];
  balances: CoinBalances;
  isDm: boolean;
  territoryHexes: SheetTerritoryHex[];
  onFieldAllocationSaved: (hex: SheetTerritoryHex) => void;
  onClose: () => void;
  onSaved: (territory: SheetTerritory) => void;
  onRecruitmentComplete: (transaction?: SheetTransaction, schedule?: SheetRecurringExpense) => Promise<void>;
  hasUnsyncedChanges: boolean;
}) {
  const assets = territory.assets || [];
  const [offer, setOffer] = useState<TerritoryRecruitmentOffer | null>(null);
  const [recruitmentRollConsumed, setRecruitmentRollConsumed] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decisionAction, setDecisionAction] = useState<"recruit" | "deny" | null>(null);
  const [forceId, setForceId] = useState("");
  const [newForceName, setNewForceName] = useState("");
  const [chosenSoldierType, setChosenSoldierType] = useState("");
  const [recruitArmor, setRecruitArmor] = useState("Unarmored");
  const [recruitWeapons, setRecruitWeapons] = useState<string[]>([]);
  const [recruitWeaponSelection, setRecruitWeaponSelection] = useState("");
  const [recruitShield, setRecruitShield] = useState("");
  const [error, setError] = useState("");
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, { cereal: number; cotton: number; pasture: number }>>({});
  const [savingHexId, setSavingHexId] = useState("");
  const [expandingHexId, setExpandingHexId] = useState("");
  const [developingPlainsHexId, setDevelopingPlainsHexId] = useState("");
  const [developmentSettlementHexId, setDevelopmentSettlementHexId] = useState("");
  const effectiveRecruitSoldierType =
    offer?.soldierType.startsWith("Select any") ? chosenSoldierType : offer?.soldierType || "";
  const recruitRules = recruitEquipmentRules(effectiveRecruitSoldierType);
  const recruitWeaponOptionsList = recruitWeaponOptions(recruitRules);
  const selectedEquipmentNames = [
    ...(recruitArmor !== "Unarmored" ? [recruitArmor] : []),
    ...recruitWeapons,
    ...(recruitShield ? [recruitShield] : []),
  ];
  const selectedEquipment = equipmentCatalog.filter((item) => selectedEquipmentNames.includes(item.name));
  const equipmentCopper = selectedEquipment.reduce(
    (sum, item) => sum + item.amount * coinValueInCopper[item.coin] * Number(offer?.quantity || 0),
    0,
  );
  const recruitGearError = recruitGearValidation(recruitRules, recruitArmor, recruitWeapons, recruitShield);
  const selectedRecruitForce = fightingForces.find((force) => force.retainerId === forceId);
  const effectiveRecruitWageGp =
    Number(offer?.wageGpPerSoldier) ||
    SOLDIER_MONTHLY_WAGES_GP[(effectiveRecruitSoldierType || offer?.soldierType || "").trim().toLowerCase()] ||
    0;

  useEffect(() => {
    setRecruitArmor((current) => recruitRules.armor.includes(current) ? current : "Unarmored");
    setRecruitWeapons((current) => {
      const allowed = new Set(recruitWeaponOptionsList.map((item) => item.name));
      return current.filter((name) => allowed.has(name)).slice(0, 3);
    });
    setRecruitShield((current) => recruitRules.shieldAllowed ? current : "");
  }, [effectiveRecruitSoldierType]);

  async function roll() {
    if (hasUnsyncedChanges) { setError("Press Sync with Sheet before making a recruitment roll."); return; }
    setRolling(true); setError("");
    try {
      const result = await rollTerritoryRecruitment({ characterId, territoryId: territory.territoryId });
      setOffer(result.offer);
      setRecruitmentRollConsumed(Boolean(result.consumed));
      if (result.consumed) setError("This territory's recruitment roll has already been used today. The DM can reset it.");
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not roll recruitment."); }
    finally { setRolling(false); }
  }

  async function recruit() {
    if (!offer) return;
    if (!forceId && !newForceName.trim()) { setError("Choose a fighting force or enter a name for a new force."); return; }
    if (
      selectedRecruitForce?.clericFightingForce &&
      Number(selectedRecruitForce.men || 0) + Number(offer.quantity || 0) > 200
    ) {
      setError("A cleric fighting force cannot exceed 200 soldiers.");
      return;
    }
    if (recruitGearError) { setError(recruitGearError); return; }
    if (!selectedEquipment.length && recruitRules.requireMelee) { setError("Select the required weapons for these soldiers."); return; }
    if (purseValueInCopper(balances) < equipmentCopper) { setError("The character wallet cannot cover the required equipment purchase."); return; }
    setDecisionAction("recruit"); setSaving(true); setError("");
    try {
      const recruitmentResult = await completeTerritoryRecruitment({
        characterId, territoryId: territory.territoryId, offerId: offer.offerId,
        walletBalance: balances,
        forceId: forceId || undefined, newForceName: forceId ? undefined : newForceName.trim(),
        chosenSoldierType: chosenSoldierType || undefined,
        equipment: selectedEquipment.map((item) => ({
          name: item.name,
          quantityPerSoldier: 1,
          amount: item.amount,
          coin: item.coin,
        })),
      });
      await onRecruitmentComplete(recruitmentResult.transaction, recruitmentResult.schedule);
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not recruit these soldiers."); }
    finally { setSaving(false); setDecisionAction(null); }
  }

  async function deny() {
    if (!offer) return;
    setDecisionAction("deny"); setSaving(true); setError("");
    try {
      await denyTerritoryRecruitment({ characterId, territoryId: territory.territoryId, offerId: offer.offerId });
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not deny these recruits."); }
    finally { setSaving(false); setDecisionAction(null); }
  }

  async function resetRoll() {
    setSaving(true); setError("");
    try {
      await resetTerritoryRecruitment({ characterId, territoryId: territory.territoryId });
      setOffer(null);
      setRecruitmentRollConsumed(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reset today's recruitment roll."); }
    finally { setSaving(false); }
  }

  const isRecruitment = mode === "recruitment";
  const assetQuantity = (type: string) => assets
    .filter((asset) => asset.type.toLowerCase() === type.toLowerCase())
    .reduce((total, asset) => total + (Number(asset.quantity) || 0), 0);
  const developedFarmland = assetQuantity("Farmland");
  const mines = assets.filter((asset) => asset.type.toLowerCase() === "mine");
  const populatedHexes = territoryHexes.filter((hex) => Number(hex.hexPopulationValue || 0) > 0);
  const displayedPopulation = populatedHexes.reduce((sum, hex) => sum + Math.max(0, Math.floor(Number(hex.hexPopulationValue) || 0)), 0);
  const monthlyTaxRateSp = domainTaxRateSp(character);
  const monthlyTaxSp = displayedPopulation * monthlyTaxRateSp;
  const monthlyTaxGp = monthlyTaxSp / (coinValueInCopper.gp / coinValueInCopper.sp);
  const currentMonth = new Date().getMonth() + 1;
  const isFieldIncomeSeason = currentMonth >= 5 && currentMonth <= 10;
  const supportablePopulation = populatedHexes.reduce((sum, hex) => sum + Math.max(0, Math.floor(Number(hex.cerealFields) || 0)) * 61 + Math.max(0, Math.floor(Number(hex.pastureFields) || 0)) * 32, 0);
  const availableWorkers = Math.floor(displayedPopulation * 0.5);
  // The parent supplies only the starting sub-hex and successfully revealed
  // scouting results. Do not filter this list again by the transient
  // isDiscovered response flag: rows returned by an update action do not carry
  // that presentation-only flag and would otherwise disappear from both
  // development selectors until a full reload.
  const discoveredHexes = territoryHexes;
  const knownSettlements = discoveredHexes.filter((hex) => Boolean(String(hex.settlementName || "").trim()));
  const plainsHexes = discoveredHexes.filter((hex) => /(^|\b)plains?(\b|$)/i.test(String(hex.terrain || "")));
  const activeFarmlandProjects = plainsHexes.filter((hex) => Boolean(hex.farmlandStartedAt && !hex.farmlandCompletedAt));
  const hasExistingFarmland = (hex: SheetTerritoryHex) =>
    Number(hex.hexPopulationValue || 0) > 0 ||
    Number(hex.cerealFields || 0) + Number(hex.cottonFields || 0) + Number(hex.pastureFields || 0) > 0;
  const developedPlainsHexes = plainsHexes.filter((hex) => Boolean(hex.farmlandCompletedAt) || hasExistingFarmland(hex));
  const availablePlainsHexes = plainsHexes.filter((hex) =>
    !hex.farmlandStartedAt && !hex.farmlandCompletedAt && !hasExistingFarmland(hex)
  );
  const reservedWorkers = activeFarmlandProjects.length * 50;
  const unallocatedWorkers = Math.max(0, availableWorkers - reservedWorkers);
  const allocationMonthOpen = [0, 1, 2, 3, 10, 11].includes(new Date().getMonth());
  const allocationFor = (hex: SheetTerritoryHex) => fieldDrafts[hex.hexId] || {
    cereal: Number(hex.cerealFields || 0), cotton: Number(hex.cottonFields || 0), pasture: Number(hex.pastureFields || 0),
  };
  const fieldTotals = populatedHexes.reduce((sum, hex) => {
    const allocation = allocationFor(hex);
    return { cereal: sum.cereal + allocation.cereal, cotton: sum.cotton + allocation.cotton, pasture: sum.pasture + allocation.pasture };
  }, { cereal: 0, cotton: 0, pasture: 0 });
  // Workbook monthly values: cereal 16 gp gross; cotton 6,400 gp gross per
  // field slot; pasture 1,008 gp gross including proportional wool. The
  // player character receives the workbook's 10% lord's share.
  const farmingValueGp = fieldTotals.cereal * 16 + fieldTotals.cotton * 6400 + fieldTotals.pasture * 1008;
  const monthlyFieldIncomeGp = farmingValueGp * 0.1;
  const onSeasonIncomeGp = monthlyTaxGp + monthlyFieldIncomeGp;
  const offSeasonIncomeGp = monthlyTaxGp;
  const currentMonthlyIncomeGp = isFieldIncomeSeason ? onSeasonIncomeGp : offSeasonIncomeGp;
  const churchIncomeGp = territory.payChurchTithe ? currentMonthlyIncomeGp * 0.1 : 0;
  const postTitheIncomeGp = currentMonthlyIncomeGp - churchIncomeGp;
  const formatGp = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });

  async function saveHexFields(hex: SheetTerritoryHex) {
    const allocation = allocationFor(hex);
    const originalTotal = Number(hex.cerealFields || 0) + Number(hex.cottonFields || 0) + Number(hex.pastureFields || 0);
    const fieldCapacity = Math.max(originalTotal, Number(hex.fieldCapacity || 0));
    const requestedTotal = allocation.cereal + allocation.cotton + allocation.pasture;
    if (requestedTotal > fieldCapacity) {
      setError(`Sub-hex ${hex.hexNumber} cannot allocate more than its ${fieldCapacity}-field capacity.`); return;
    }
    setSavingHexId(hex.hexId); setError("");
    try {
      onFieldAllocationSaved({
        ...hex,
        cerealFields: allocation.cereal,
        cottonFields: allocation.cotton,
        pastureFields: allocation.pasture,
        updatedAt: new Date().toISOString(),
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the field allocation."); }
    finally { setSavingHexId(""); }
  }

  async function expandSettlementFields(hex: SheetTerritoryHex) {
    if (hasUnsyncedChanges) { setError("Press Sync with Sheet before beginning a paid development project."); return; }
    const activeFields = Number(hex.cerealFields || 0) + Number(hex.cottonFields || 0) + Number(hex.pastureFields || 0);
    const fieldCapacity = Math.max(activeFields, Number(hex.fieldCapacity || 0));
    const fieldsToDevelop = Math.max(0, 8 - fieldCapacity);
    const settlementLabel = String(hex.settlementName || "").trim() || `sub-hex ${hex.hexNumber}`;
    if (!window.confirm(
      `Develop ${fieldsToDevelop} more field${fieldsToDevelop === 1 ? "" : "s"} for ${settlementLabel}?\n\n` +
      `Cost: 200 gp\nTime: 4 months\n\n` +
      "The project will begin immediately, and the payment will be taken from this character's wallet."
    )) return;
    setExpandingHexId(hex.hexId); setError("");
    try {
      const result = await startSettlementFieldExpansion({
        characterId, territoryId: territory.territoryId, hexId: hex.hexId, walletBalance: balances,
      });
      onFieldAllocationSaved(result.hex);
      await onRecruitmentComplete(result.transaction);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not begin settlement field development."); }
    finally { setExpandingHexId(""); }
  }

  async function developPlains() {
    if (hasUnsyncedChanges) { setError("Press Sync with Sheet before beginning a paid development project."); return; }
    if (!developingPlainsHexId || !developmentSettlementHexId) { setError("Choose an available plains sub-hex and a known settlement."); return; }
    const plainsHex = availablePlainsHexes.find((hex) => hex.hexId === developingPlainsHexId);
    const settlementHex = knownSettlements.find((hex) => hex.hexId === developmentSettlementHexId);
    const plainsLabel = plainsHex?.hexNumber || "selected";
    const settlementLabel = String(settlementHex?.settlementName || "").trim() || `sub-hex ${settlementHex?.hexNumber || "selected"}`;
    if (!window.confirm(
      `Develop 8 fields from plains sub-hex ${plainsLabel} for ${settlementLabel}?\n\n` +
      `Cost: 500 gp\nWorkers reserved: 50\nTime: 8 months\n\n` +
      "The project will begin immediately, and the payment and workers will be committed."
    )) return;
    setSavingHexId(developingPlainsHexId); setError("");
    try {
      const result = await startFarmlandDevelopment({
        characterId, territoryId: territory.territoryId, plainsHexId: developingPlainsHexId,
        settlementHexId: developmentSettlementHexId, walletBalance: balances,
      });
      onFieldAllocationSaved(result.plainsHex);
      onFieldAllocationSaved(result.settlementHex);
      setDevelopingPlainsHexId(""); setDevelopmentSettlementHexId("");
      await onRecruitmentComplete(result.transaction);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not begin farmland development."); }
    finally { setSavingHexId(""); }
  }

  const canCloseRecruitment = !isRecruitment || !offer || recruitmentRollConsumed;

  return <div className="modal-backdrop territory-management-backdrop" onMouseDown={(event) => canCloseRecruitment && event.target === event.currentTarget && onClose()}>
    <section className="modal ornamental-card territory-management-modal" role="dialog" aria-modal="true" aria-label={isRecruitment ? `Recruit fighting men for ${territory.name}` : `Manage ${territory.name}`}>
      {canCloseRecruitment && <button className="modal-close" aria-label="Close" onClick={onClose}><X /></button>}
      <p className="eyebrow">Lands & holdings</p><h2>{isRecruitment ? `Recruit Fighting Men · ${territory.name}` : `Manage ${territory.name}`}</h2>
      {!isRecruitment && <div className="territory-development-layout">
        <p className="territory-layout-note">Layout preview · development controls and calculations will be connected in the next stage.</p>

        <div className="territory-overview-grid" aria-label="Territory overview">
          <article><UsersRound size={18}/><span>Population</span><strong>{displayedPopulation.toLocaleString()}</strong><small>people living in the hex</small></article>
          <article><Sprout size={18}/><span>Developed plains</span><strong>{developedPlainsHexes.length.toLocaleString()} mi.</strong><small>{(developedPlainsHexes.length * 8).toLocaleString()} fields unlocked</small></article>
          <article><Landmark size={18}/><span>Monthly income</span><strong>{formatGp(postTitheIncomeGp)} gp</strong><small>{territory.payChurchTithe ? "after church tithe" : isFieldIncomeSeason ? "fields and domain taxes" : "domain taxes"}</small></article>
          <article><CalendarClock size={18}/><span>Next territory update</span><strong>30 days</strong><small>development advances monthly</small></article>
        </div>

        <section className="territory-development-card">
          <div className="territory-card-heading"><span className="territory-section-icon"><Sprout size={19}/></span><div><h3>Land Development</h3><p>Expand the amount of usable farmland within the territory.</p></div></div>
          <div className="territory-development-row">
            <div className="territory-development-fields">
              <label>Available plains<select value={developingPlainsHexId} onChange={(event) => setDevelopingPlainsHexId(event.target.value)}><option value="">{availablePlainsHexes.length ? "Choose sub-hex" : "No available discovered plains"}</option>{availablePlainsHexes.map((hex) => <option value={hex.hexId} key={hex.hexId}>Sub-hex {hex.hexNumber}</option>)}</select></label>
              <label>Develop fields for settlement<select value={developmentSettlementHexId} onChange={(event) => setDevelopmentSettlementHexId(event.target.value)}><option value="">{knownSettlements.length ? "Choose settlement" : "No discovered named settlements"}</option>{knownSettlements.map((hex) => <option value={hex.hexId} key={hex.hexId}>{hex.settlementName} · {hex.hexNumber}</option>)}</select></label>
            </div>
            <button className="primary-action" disabled={!developingPlainsHexId || !developmentSettlementHexId || unallocatedWorkers < 50 || Boolean(savingHexId)} onClick={() => void developPlains()}>{Boolean(developingPlainsHexId) && savingHexId === developingPlainsHexId ? "Starting…" : "Develop Land · 500 gp"}</button>
          </div>
          <p className="territory-progress-note"><UsersRound size={16}/> {unallocatedWorkers.toLocaleString()} unallocated workers · {availablePlainsHexes.length} discovered plains sub-hex{availablePlainsHexes.length === 1 ? "" : "es"} available</p>
          {activeFarmlandProjects.length ? activeFarmlandProjects.map((hex) => { const target = territoryHexes.find((candidate) => candidate.hexId === hex.farmlandSettlementHexId); return <div className="territory-progress-block" key={hex.hexId}><div><span>Sub-hex {hex.hexNumber} · 50 workers</span><strong>Completes {new Date(String(hex.farmlandCompletesAt)).toLocaleDateString()}</strong></div><small>8 fields are being developed for {target?.settlementName || `settlement sub-hex ${target?.hexNumber || ""}`} and can be allocated November–April.</small></div>; }) : <div className="territory-progress-block"><div><span>Development in progress</span><strong>No active project</strong></div></div>}
        </section>

        <section className="territory-development-card">
          <div className="territory-card-heading"><span className="territory-section-icon"><Leaf size={19}/></span><div><h3>Fields & Pastures</h3><p>Allocate developed fields to food, commodities, or grazing land.</p></div></div>
          <div className="territory-allocation-summary"><span>Active fields <strong>{(fieldTotals.cereal + fieldTotals.cotton + fieldTotals.pasture).toLocaleString()}</strong></span><span>Cereal / Cotton / Pasture <strong>{fieldTotals.cereal} / {fieldTotals.cotton} / {fieldTotals.pasture}</strong></span></div>
          {!allocationMonthOpen && <p className="territory-season-lock"><LockKeyhole size={16}/> Field allocations are locked until November–April.</p>}
          <div className="territory-hex-field-list">
            {populatedHexes.map((hex) => { const allocation = allocationFor(hex); const savedTotal = Number(hex.cerealFields || 0) + Number(hex.cottonFields || 0) + Number(hex.pastureFields || 0); const capacity = Math.max(savedTotal, Number(hex.fieldCapacity || 0)); const draftTotal = allocation.cereal + allocation.cotton + allocation.pasture; const fieldBank = Math.max(0, capacity - draftTotal); const allocationChanged = allocation.cereal !== Number(hex.cerealFields || 0) || allocation.cotton !== Number(hex.cottonFields || 0) || allocation.pasture !== Number(hex.pastureFields || 0); const expansionActive = Boolean(hex.fieldExpansionStartedAt && !hex.fieldExpansionCompletedAt); const expansionComplete = Boolean(hex.fieldExpansionCompletedAt); const isSettlement = Boolean(String(hex.settlementName || "").trim()); const allocationDisabled = !allocationMonthOpen || Boolean(savingHexId); const adjustField = (key: 'cereal' | 'cotton' | 'pasture', change: number) => setFieldDrafts((current) => ({...current, [hex.hexId]: {...allocation, [key]: Math.max(0, allocation[key] + change)}})); return <article className="territory-hex-fields" key={hex.hexId}>
              <header><div><strong>{String(hex.settlementName || "").trim() || `Sub-hex ${hex.hexNumber}`}</strong><small>{Number(hex.hexPopulationValue || 0).toLocaleString()} people · {draftTotal} allocated fields · {fieldBank} in field bank</small></div></header>
              <div className="territory-field-inputs">
                {([['cereal','Cereal'],['cotton','Cotton'],['pasture','Pasture']] as const).map(([key,label]) => <div className="territory-field-stepper" key={key}><span>{label}</span><div><button className="territory-field-step territory-field-step-minus" type="button" aria-label={`Remove one ${label.toLowerCase()} field from sub-hex ${hex.hexNumber}`} disabled={allocationDisabled || allocation[key] <= 0} onClick={() => adjustField(key, -1)}>−</button><output aria-live="polite">{allocation[key]}</output><button className="territory-field-step territory-field-step-plus" type="button" aria-label={`Allocate one ${label.toLowerCase()} field in sub-hex ${hex.hexNumber}`} disabled={allocationDisabled || fieldBank <= 0} onClick={() => adjustField(key, 1)}>+</button></div></div>)}
              </div>
              <div className="territory-field-bank"><span>Field bank</span><strong>{fieldBank}</strong><small>unallocated field{fieldBank === 1 ? "" : "s"} in this sub-hex</small></div>
              <button className="secondary-action" disabled={allocationDisabled || !allocationChanged || draftTotal > capacity} onClick={() => void saveHexFields(hex)}>{savingHexId === hex.hexId ? "Saving…" : "Save Allocation"}</button>
              {isSettlement && capacity < 8 && !expansionActive && <button className="primary-action territory-develop-fields-action" disabled={Boolean(expandingHexId)} onClick={() => void expandSettlementFields(hex)}>{expandingHexId === hex.hexId ? "Starting…" : `Develop ${8 - capacity} More Field${8 - capacity === 1 ? "" : "s"} - 200 gp`}</button>}
              {expansionActive && <p className="territory-progress-note"><CalendarClock size={16}/> Development completes {new Date(String(hex.fieldExpansionCompletesAt)).toLocaleDateString()}.</p>}
              {expansionComplete && capacity >= 8 && fieldBank > 0 && <p className="territory-progress-note"><Leaf size={16}/> Development complete. {allocationMonthOpen ? `${fieldBank} fields are available in the bank.` : "Banked fields can be allocated during November–April."}</p>}
            </article>; })}
            {!populatedHexes.length && <div className="territory-empty-resource"><Leaf size={24}/><div><strong>No populated sub-hexes discovered</strong><span>Fields will appear after a scouting mission discovers a Hex Population Value.</span></div></div>}
          </div>
          <div className="territory-prudent-note"><strong>Discovery allocation</strong><span>65% cereal crops · 35% pasture · no cotton</span></div>
        </section>

        <section className="territory-development-card">
          <div className="territory-card-heading"><span className="territory-section-icon"><Pickaxe size={19}/></span><div><h3>Mines</h3><p>Assign miners and track the yield of known deposits.</p></div></div>
          {mines.length ? <div className="territory-resource-table">{mines.map((mine, index) => <div className="territory-mine-row" key={`${mine.name}-${index}`}><div><strong>{mine.name || "Unnamed mine"}</strong><small>Ore deposit</small></div><select disabled aria-label={`Ore type for ${mine.name || "mine"}`}><option>Select ore</option></select><label>Miners<input disabled value="0" /></label><span>— gp</span></div>)}</div> : <div className="territory-empty-resource"><Pickaxe size={24}/><div><strong>No developed mines</strong><span>A discovered deposit can be developed into a working mine.</span></div></div>}
          <button className="secondary-action territory-wide-action" disabled><Plus size={16}/> Develop a Mine</button>
        </section>

        <section className="territory-development-card territory-income-card">
          <div className="territory-card-heading"><span className="territory-section-icon"><Coins size={19}/></span><div><h3>Income & Population</h3><p>Projected results from the current development and allocations.</p></div></div>
          <div className="territory-income-grid">
            <div><span>Mining value</span><strong>— gp</strong></div><div><span>Farming value</span><strong>{formatGp(farmingValueGp)} gp</strong></div><div><span>On-season income (fields + taxes)</span><strong>{formatGp(onSeasonIncomeGp)} gp</strong></div><div><span>Off-season income (taxes)</span><strong>{formatGp(offSeasonIncomeGp)} gp</strong></div><div><span>Post-tithe income ({isFieldIncomeSeason ? "on-season" : "off-season"})</span><strong>{formatGp(postTitheIncomeGp)} gp</strong></div><div><span>Church income</span><strong>{formatGp(churchIncomeGp)} gp</strong></div>
          </div>
          <div className="territory-population-breakdown"><span><small>Supportable population</small><strong>{supportablePopulation.toLocaleString()} people</strong></span><span><small>Available workers (50%)</small><strong>{unallocatedWorkers.toLocaleString()} people</strong></span><span><small>Current population</small><strong>{displayedPopulation.toLocaleString()} people</strong></span></div>
          <p className="territory-season-note">Field income is paid May–October. Field allocation is open November–April. All recurring character income is deposited on the last day of each month; harvested food is stockpiled through winter.</p>
        </section>
      </div>}
      {isRecruitment && <div className="territory-management-section recruitment-section">
        <div className="recruitment-heading"><h3>Available Fighting Men</h3>{isDm && <button className="secondary-action recruitment-reset" disabled={saving} onClick={() => void resetRoll()}>Reset Today’s Roll</button>}</div>
        {!offer ? <><p>One availability roll is allowed per real-world calendar day.</p><button className="primary-action" disabled={rolling} onClick={() => void roll()}>{rolling ? "Rolling…" : "Roll for Available Soldiers"}</button></> : offer.status !== "available" ? <div className="recruitment-result"><strong>Today’s Recruitment Roll Has Been Used</strong></div> : <>
          <div className="recruitment-result"><span>Today’s result · d100 {String(offer.percentileRoll).padStart(2,"0")} · d10 {offer.quantityRoll}</span><strong>{offer.quantity} {offer.soldierType}</strong><small>{effectiveRecruitWageGp ? `${effectiveRecruitWageGp} gp each per month · ${offer.quantity * effectiveRecruitWageGp} gp total monthly wages` : "Special wage — the DM must set the rate before recruitment."}</small></div>
          {offer.soldierType.startsWith("Select any") && <label>Soldier type<input value={chosenSoldierType} onChange={(e)=>setChosenSoldierType(e.target.value)} placeholder="Enter the selected troop type" /></label>}
          <label className="recruitment-force-field">Add to fighting force<select value={forceId} onChange={(e)=>setForceId(e.target.value)}><option value="">Create a new fighting force</option>{fightingForces.map((force)=><option value={force.retainerId} key={force.retainerId}>{force.name}</option>)}</select></label>
          {!forceId && <label>New fighting force name<input value={newForceName} onChange={(e)=>setNewForceName(e.target.value)} placeholder="Choose fighting force name" /></label>}
          <h4>Recruit Equipment</h4>
          <div className="recruitment-equipment-list">
            <label>
              <span><strong>Armor</strong><small>Allowed for {effectiveRecruitSoldierType || "this troop type"}</small></span>
              <select value={recruitArmor} onChange={(event) => setRecruitArmor(event.target.value)}>
                {recruitRules.armor.map((armorName) => (
                  <option value={armorName} key={armorName}>{armorName} · AC {RECRUIT_ARMOR_AC[armorName]}</option>
                ))}
              </select>
            </label>

            <label>
              <span>
                <strong>Weapons</strong>
                <small>
                  {recruitRules.requiredMissileWeapons
                    ? "Required missile weapon + melee weapon · maximum 3"
                    : recruitRules.requireMelee
                      ? "At least 1 melee weapon · maximum 3"
                      : "Maximum 3 weapons"}
                </small>
              </span>
              <select
                value={recruitWeaponSelection}
                disabled={recruitWeapons.length >= 2}
                onChange={(event) => {
                  const name = event.target.value;
                  setRecruitWeaponSelection("");
                  if (!name) return;
                  setRecruitWeapons((current) =>
                    current.includes(name) || current.length >= 3 ? current : [...current, name]
                  );
                }}
              >
                <option value="">{recruitWeapons.length >= 2 ? "Three-weapon limit reached" : "Add weapon…"}</option>
                {recruitWeaponOptionsList
                  .filter((item) => !recruitWeapons.includes(item.name))
                  .map((item) => <option value={item.name} key={item.name}>{item.name} · {item.amount} {item.coin} each</option>)}
              </select>
            </label>

            {recruitWeapons.map((weaponName) => {
              const weapon = equipmentCatalog.find((item) => item.name === weaponName);
              return (
                <div key={weaponName}>
                  <span><strong>{weaponName}</strong><small>{weapon ? `${weapon.amount} ${weapon.coin} each · ${offer.quantity} required` : `${offer.quantity} required`}</small></span>
                  <button className="secondary-action" type="button" onClick={() => setRecruitWeapons((current) => current.filter((name) => name !== weaponName))}>Remove</button>
                </div>
              );
            })}

            {recruitRules.shieldAllowed && (
              <label>
                <span><strong>Shield</strong><small>Optional · one per recruit</small></span>
                <select value={recruitShield} onChange={(event) => setRecruitShield(event.target.value)}>
                  <option value="">No shield</option>
                  {RECRUIT_SHIELDS.map((shieldName) => {
                    const shield = equipmentCatalog.find((item) => item.name === shieldName);
                    return <option value={shieldName} key={shieldName}>{shieldName}{shield ? ` · ${shield.amount} ${shield.coin} each` : ""}</option>;
                  })}
                </select>
              </label>
            )}
          </div>
          {recruitGearError && <p className="form-error" role="alert">{recruitGearError}</p>}
          <div className="equipment-total"><span>One-time equipment total</span><strong>{(equipmentCopper / coinValueInCopper.gp).toLocaleString(undefined, { maximumFractionDigits: 2 })} gp</strong></div>
          <div className="recruitment-decision-actions">
            <button className="primary-action" disabled={saving || !effectiveRecruitWageGp || Boolean(recruitGearError)} onClick={() => void recruit()}>{decisionAction === "recruit" ? "Recruiting…" : `Recruit ${offer.quantity} Soldiers`}</button>
            <button className="secondary-action deny-recruits" disabled={saving} onClick={() => void deny()}>{decisionAction === "deny" ? "Sending them away…" : "Deny"}</button>
          </div>
        </>}
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <span className="territory-management-corner" aria-hidden="true" />
    </section>
  </div>;
}

function ScoutingMissionsPanel({ territory, missions, customMissions, fightingForces, officerRetainers, isDm, onCompleteForTesting, onPromoteSerjeants, onViewResults, onDismissResult, onCreateCustomMission, onClose }: {
  territory: SheetTerritory;
  missions: SheetScoutingMission[];
  customMissions: SheetCustomMission[];
  fightingForces: SheetRetainer[];
  officerRetainers: SheetRetainer[];
  isDm: boolean;
  onCompleteForTesting: (missionId: string) => Promise<void>;
  onPromoteSerjeants: (missionId: string) => Promise<void>;
  onViewResults: (missionId: string) => Promise<SheetScoutingMission>;
  onDismissResult: (missionId: string) => Promise<void>;
  onCreateCustomMission: (input: { territoryId: string; objective: string; missionLocation: string; startDate: string; durationDays: number; allocations: Array<{ retainerId: string; soldierType: string; men: number }>; officerRetainerId?: string; additionalNotes?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [completingMissionId, setCompletingMissionId] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [payingMissionId, setPayingMissionId] = useState("");
  const [viewingMissionId, setViewingMissionId] = useState("");
  const [viewingMissionResult, setViewingMissionResult] = useState<SheetScoutingMission | null>(null);
  const [dismissingMissionId, setDismissingMissionId] = useState("");
  const [issuingOrders, setIssuingOrders] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [objective, setObjective] = useState("");
  const [missionLocation, setMissionLocation] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationDays, setDurationDays] = useState(1);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [orderAllocations, setOrderAllocations] = useState<Record<string, number>>({});
  const [officerRetainerId, setOfficerRetainerId] = useState("");
  const territoryCustomMissions = customMissions.filter((mission) => mission.territoryId === territory.territoryId && ["scheduled", "active"].includes(mission.status));
  const reserved = useMemo(() => {
    const totals: Record<string, number> = {};
    [...missions.filter((mission) => mission.status === "active"), ...customMissions].forEach((mission) => (mission.allocations || []).forEach((item) => {
      const key = `${item.retainerId}::${item.soldierType}`;
      totals[key] = (totals[key] || 0) + Number(item.men || 0);
    }));
    return totals;
  }, [missions, customMissions]);
  const availableTroops = fightingForces.flatMap((force) => (force.roster || []).map((troop) => {
    const key = `${force.retainerId}::${troop.soldierType}`;
    const leaderlessMen = Math.max(0, Number(troop.missingSerjeants || 0)) * 9;
    return { key, force, troop, available: Math.max(0, Number(troop.men || 0) - leaderlessMen - (reserved[key] || 0)) };
  }).filter((item) => item.available > 0));
  const orderedMen = Object.values(orderAllocations).reduce((sum, value) => sum + Number(value || 0), 0);
  const reservedOfficerIds = useMemo(() => new Set(customMissions.filter((mission) => ["scheduled", "active"].includes(mission.status)).map((mission) => mission.officerRetainerId).filter(Boolean)), [customMissions]);
  const availableOfficers = officerRetainers.filter((retainer) => /^(lieutenant|captain)$/i.test(retainer.role.trim()) && !reservedOfficerIds.has(retainer.retainerId));

  useEffect(() => {
    if (!isDm) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [isDm]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function acknowledgeViewedMissionResult() {
    if (!viewingMissionResult || viewingMissionId) return;
    const missionId = viewingMissionResult.missionId;
    setCompletionError("");
    setViewingMissionId(missionId);
    try {
      await onViewResults(missionId);
      setViewingMissionResult(null);
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : "Could not acknowledge the mission results.");
    } finally {
      setViewingMissionId("");
    }
  }

  return (
    <div className="modal-backdrop scouting-missions-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal ornamental-card scouting-missions-modal" role="dialog" aria-modal="true" aria-label={`Active missions for ${territory.name}`}>
        <button className="modal-close" aria-label="Close active missions" onClick={onClose}><X size={22} /></button>
        <p className="eyebrow">{territory.name}</p>
        <div className="active-missions-heading"><h2>Active Missions</h2><button className="primary-action" onClick={() => setIssuingOrders(true)}><ScrollText size={17} /> Issue Orders</button></div>
        {!missions.length && !territoryCustomMissions.length ? (
          <div className="scouting-missions-empty">
            <Timer size={28} />
            <p>No missions are currently underway.</p>
          </div>
        ) : (
          <div className="scouting-missions-list">
            {territoryCustomMissions.map((mission) => (
              <article className="scouting-mission-card custom-mission-card" key={mission.missionId}>
                <div className="scouting-mission-heading"><div><span>Orders</span><strong>{mission.objective}</strong></div><span className={`scouting-underway scouting-status-${mission.status}`}>{mission.status === "scheduled" ? "Scheduled" : "Underway"}</span></div>
                <dl className="custom-mission-facts"><div><dt>Location</dt><dd>{mission.missionLocation}</dd></div><div><dt>Start</dt><dd>{new Date(`${mission.startDate}T00:00:00`).toLocaleDateString()}</dd></div><div><dt>Duration</dt><dd>{mission.durationDays} day{mission.durationDays === 1 ? "" : "s"}</dd></div><div><dt>Soldiers</dt><dd>{mission.men}</dd></div></dl>
                <div className="scouting-mission-party">{(mission.allocations || []).map((allocation, index) => <p key={`${allocation.retainerId}-${allocation.soldierType}-${index}`}><strong>{allocation.men} {allocation.soldierType}</strong> · {allocation.forceName}</p>)}</div>
                {mission.officerName && <p className="custom-mission-officer"><strong>Attached officer:</strong> {mission.officerName} ({mission.officerRole})</p>}
                {mission.additionalNotes && <p className="custom-mission-notes">{mission.additionalNotes}</p>}
              </article>
            ))}
            {missions.filter((mission) => !mission.dismissedAt).map((mission) => (
              <article className="scouting-mission-card" key={mission.missionId}>
                <div className="scouting-mission-heading">
                  <div><span>Target sub-hex</span><strong>{mission.hexNumber}</strong></div>
                  <span className={`scouting-underway scouting-status-${mission.status}`}>{mission.status === "failed" ? "Failed" : mission.status === "completed" ? "Completed" : "Underway"}</span>
                </div>
                <div className="scouting-mission-party">
                  <span>Scouting party</span>
                  {(mission.allocations || []).map((allocation, index) => (
                    <p key={`${allocation.retainerId}-${allocation.soldierType}-${index}`}>
                      <strong>{allocation.men} {allocation.soldierType}</strong> · {allocation.forceName}
                    </p>
                  ))}
                  <small>{mission.men} soldiers total</small>
                </div>
                {mission.status !== "active" && (!mission.resultsViewedAt ? <button className="scouting-results-card scouting-results-button" disabled={Boolean(viewingMissionId)} onClick={() => { setCompletionError(""); setViewingMissionResult(mission); }}><span>View Results</span><strong>Scouting report ready</strong></button> : <div className="scouting-results-card"><span>Mission Results</span><strong>{mission.missionOutcome || (mission.status === "completed" ? "Mission completed." : "The mission failed.")}</strong>{mission.encounterKnownToPlayer && mission.encounteredInhabitants && <small>Encountered: {mission.encounteredInhabitants}</small>}{Number(mission.scoutsKilled || 0) > 0 && <small>{mission.scoutsKilled} scouts were killed; {mission.survivors || 0} returned.</small>}{Number(mission.strandedMen || 0) > 0 && <><small><b>{mission.strandedMen} surviving soldiers are still committed to this mission</b> because their serjeant was killed.</small><button className="secondary-action scouting-promotion-payment" disabled={Boolean(payingMissionId)} onClick={async () => { setCompletionError(""); setPayingMissionId(mission.missionId); try { await onPromoteSerjeants(mission.missionId); } catch (error) { setCompletionError(error instanceof Error ? error.message : "Could not pay the serjeant promotion fee."); } finally { setPayingMissionId(""); } }}>{payingMissionId === mission.missionId ? "Paying…" : `Pay ${mission.promotionFeeGp || 0} gp to promote ${Number(mission.serjeantsKilled || 0) === 1 ? "a new serjeant" : "new serjeants"}`}</button></>}{mission.status === "completed" && <button className="secondary-action scouting-dismiss-result" disabled={Boolean(dismissingMissionId)} onClick={async () => { setCompletionError(""); setDismissingMissionId(mission.missionId); try { await onDismissResult(mission.missionId); } catch (error) { setCompletionError(error instanceof Error ? error.message : "Could not dismiss the mission."); } finally { setDismissingMissionId(""); } }}>{dismissingMissionId === mission.missionId ? "Dismissing…" : "Dismiss"}</button>}</div>)}
                {isDm && mission.status === "active" ? (
                  <><dl className="scouting-dm-timing">
                    <div><dt>Rolled duration</dt><dd>{mission.durationDays} day{mission.durationDays === 1 ? "" : "s"}</dd></div>
                    <div><dt>Exact time remaining</dt><dd>{exactTimeRemaining(mission.completesAt, now)}</dd></div>
                    <div><dt>Started</dt><dd>{mission.startedAt ? new Date(mission.startedAt).toLocaleString() : "Unavailable"}</dd></div>
                    <div><dt>Completes</dt><dd>{mission.completesAt ? new Date(mission.completesAt).toLocaleString() : "Unavailable"}</dd></div>
                  </dl>
                  <button
                    className="secondary-action scouting-complete-test"
                    disabled={Boolean(completingMissionId)}
                    onClick={async () => {
                      setCompletionError("");
                      setCompletingMissionId(mission.missionId);
                      try {
                        await onCompleteForTesting(mission.missionId);
                      } catch (error) {
                        setCompletionError(error instanceof Error ? error.message : "Could not complete the scouting mission.");
                      } finally {
                        setCompletingMissionId("");
                      }
                    }}
                  >
                    {completingMissionId === mission.missionId ? "Completing…" : "Complete Mission"}
                  </button></>
                ) : mission.status === "active" ? (
                  <div className="scouting-player-timing">
                    <span>Mission duration</span>
                    <strong>1–3 real-world days</strong>
                    <small>The timer continues while the app is closed. When it expires, this scouting mission will contact the campaign automatically for adjudication.</small>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
        {completionError && <p className="form-error" role="alert">{completionError}</p>}
        {issuingOrders && (
          <div className="modal-backdrop hex-choice-backdrop custom-orders-backdrop">
            <form className="scouting-mission-panel custom-orders-panel" onSubmit={async (event) => {
              event.preventDefault();
              setCompletionError("");
              setSavingOrders(true);
              try {
                await onCreateCustomMission({
                  territoryId: territory.territoryId,
                  objective,
                  missionLocation,
                  startDate,
                  durationDays,
                  allocations: availableTroops.filter(({ key }) => Number(orderAllocations[key] || 0) > 0).map(({ key, force, troop }) => ({ retainerId: force.retainerId, soldierType: troop.soldierType, men: Number(orderAllocations[key]) })),
                  officerRetainerId: officerRetainerId || undefined,
                  additionalNotes,
                });
                setIssuingOrders(false);
                setObjective("");
                setMissionLocation("");
                setDurationDays(1);
                setAdditionalNotes("");
                setOrderAllocations({});
                setOfficerRetainerId("");
              } catch (error) {
                setCompletionError(error instanceof Error ? error.message : "Could not issue these orders.");
              } finally {
                setSavingOrders(false);
              }
            }}>
              <button type="button" className="modal-close" aria-label="Close orders" onClick={() => setIssuingOrders(false)}><X size={22} /></button>
              <p className="eyebrow">Custom mission</p><h2>Issue Orders</h2>
              <label>Objective<textarea required value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="What must the soldiers accomplish?" /></label>
              <label>Mission location<input required value={missionLocation} onChange={(event) => setMissionLocation(event.target.value)} placeholder="Where will the mission take place?" /></label>
              <div className="custom-orders-grid"><label>Date to start<input type="date" required min={new Date().toISOString().slice(0, 10)} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Number of days<input type="number" min="1" max="365" required value={durationDays} onChange={(event) => setDurationDays(Math.max(1, Number(event.target.value) || 1))} /></label></div>
              <fieldset className="custom-orders-soldiers"><legend>Soldier squads</legend>{availableTroops.length ? availableTroops.map(({ key, force, troop, available }) => { const deployable = Math.floor(available / 10) * 10; return deployable > 0 ? <label key={key}><span><strong>{troop.soldierType}</strong><small>{force.name} · {deployable} available in complete squads</small></span><input type="number" min="0" max={deployable} step="10" value={orderAllocations[key] || ""} placeholder="0" onChange={(event) => { const requested = Math.floor((Number(event.target.value) || 0) / 10) * 10; setOrderAllocations((current) => ({ ...current, [key]: Math.max(0, Math.min(deployable, requested)) })); }} /></label> : null; }) : <p>No complete, uncommitted 10-man squads are available.</p>}<small>{orderedMen} soldiers assigned · {orderedMen / 10} squad{orderedMen === 10 ? "" : "s"}</small></fieldset>
              <label>Attach an officer<select value={officerRetainerId} onChange={(event) => setOfficerRetainerId(event.target.value)}><option value="">No lieutenant or captain</option>{availableOfficers.map((officer) => <option key={officer.retainerId} value={officer.retainerId}>{officer.name} — {officer.role}</option>)}</select></label>
              <label>Additional notes<textarea value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="Optional instructions or details" /></label>
              {completionError && <p className="form-error" role="alert">{completionError}</p>}
              <button className="primary-action" type="submit" disabled={savingOrders || orderedMen < 1}>{savingOrders ? "Finalizing…" : "Finalize Orders"}</button>
            </form>
          </div>
        )}
        {viewingMissionResult && (
          <div className="modal-backdrop hex-choice-backdrop scouting-result-backdrop">
            <div className="scouting-mission-panel scouting-map-result-panel" role="dialog" aria-modal="true" aria-label="Scouting mission results">
              <p className="eyebrow">Scouting report</p>
              <h2>Hex {viewingMissionResult.hexNumber || "—"}</h2>
              <strong>{viewingMissionResult.missionOutcome || (viewingMissionResult.status === "completed" ? "The scouting mission succeeded." : "The scouting mission failed.")}</strong>
              {viewingMissionResult.encounterKnownToPlayer && viewingMissionResult.encounteredInhabitants && <p>Encountered: {viewingMissionResult.encounteredInhabitants}</p>}
              {Number(viewingMissionResult.scoutsKilled || 0) > 0 && <p>{viewingMissionResult.scoutsKilled} scouts were killed; {viewingMissionResult.survivors || 0} returned.</p>}
              <p className="scouting-result-next-step">{viewingMissionResult.status === "completed" ? "Continue to clear the fog of war and reveal the hex." : "Continue to return the hex to the fogged map so it can be scouted again."}</p>
              <button className="primary-action" disabled={Boolean(viewingMissionId)} onClick={() => void acknowledgeViewedMissionResult()}>{viewingMissionId ? "Continuing…" : "Continue"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type TapRevealPoint = { id: string; x: number; y: number };

// Google Sheets can return a hex number as either text or a number. Keep every
// map/card/mission comparison on the same normalized key so a completed mission
// cannot remain fogged merely because Sheets changed the cell's value type or
// retained surrounding whitespace.
function territoryHexKey(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";

  // Google Sheets may coerce a coordinate such as "2.0" into the numeric
  // value 2. Normalize numeric-looking hex coordinates exactly as the Apps
  // Script backend does so "2.0", "2.00", and 2 all refer to the same hex.
  const numeric = Number(text);
  return Number.isFinite(numeric) ? String(numeric) : text;
}

// The territory maps use one large, point-topped hex made from 61 equal
// point-topped sub-hexes. These percentages are derived from the actual map
// canvas: five cells on the first row, expanding to nine, then contracting.
// Keeping one canonical grid makes the reveal mask independent of where in a
// sub-hex the player happens to tap.
const TAP_REVEAL_ROW_COUNTS = [5, 6, 7, 8, 9, 8, 7, 6, 5];
const TAP_REVEAL_HEX_WIDTH = 100 / 9;
const TAP_REVEAL_HEX_HEIGHT = 100 / 7;
const TAP_REVEAL_ROW_STEP = TAP_REVEAL_HEX_HEIGHT * 0.75;
const TAP_REVEAL_HEXES: TapRevealPoint[] = TAP_REVEAL_ROW_COUNTS.flatMap((count, row) => {
  const startX = ((9 - count) * TAP_REVEAL_HEX_WIDTH) / 2 + TAP_REVEAL_HEX_WIDTH / 2;
  const y = TAP_REVEAL_HEX_HEIGHT / 2 + row * TAP_REVEAL_ROW_STEP;
  return Array.from({ length: count }, (_, column) => ({
    id: `${row}-${column}`,
    x: startX + column * TAP_REVEAL_HEX_WIDTH,
    y,
  }));
});
const TAP_REVEAL_CENTER_HEX = TAP_REVEAL_HEXES.find((hex) => hex.id === "4-4")!;

function tapRevealHexPolygon(hex: TapRevealPoint) {
  return `${hex.x},${hex.y - TAP_REVEAL_HEX_HEIGHT / 2} ${hex.x + TAP_REVEAL_HEX_WIDTH / 2},${hex.y - TAP_REVEAL_HEX_HEIGHT / 4} ${hex.x + TAP_REVEAL_HEX_WIDTH / 2},${hex.y + TAP_REVEAL_HEX_HEIGHT / 4} ${hex.x},${hex.y + TAP_REVEAL_HEX_HEIGHT / 2} ${hex.x - TAP_REVEAL_HEX_WIDTH / 2},${hex.y + TAP_REVEAL_HEX_HEIGHT / 4} ${hex.x - TAP_REVEAL_HEX_WIDTH / 2},${hex.y - TAP_REVEAL_HEX_HEIGHT / 4}`;
}

function nearestTapRevealHex(point: { x: number; y: number }) {
  return TAP_REVEAL_HEXES.reduce((nearest, hex) => {
    const distance = Math.hypot(
      (hex.x - point.x) / (TAP_REVEAL_HEX_WIDTH / 2),
      (hex.y - point.y) / (TAP_REVEAL_HEX_HEIGHT / 2),
    );
    return distance < nearest.distance ? { hex, distance } : nearest;
  }, { hex: TAP_REVEAL_HEXES[0], distance: Number.POSITIVE_INFINITY });
}

function normalizeTapReveals(value: unknown): TapRevealPoint[] {
  if (!Array.isArray(value)) return [TAP_REVEAL_CENTER_HEX];
  const unique = new globalThis.Map<string, TapRevealPoint>();
  value.forEach((saved) => {
    if (!saved || typeof saved !== "object") return;
    const candidate = saved as Partial<TapRevealPoint>;
    const exact = typeof candidate.id === "string"
      ? TAP_REVEAL_HEXES.find((hex) => hex.id === candidate.id)
      : undefined;
    const snapped = exact || (
      typeof candidate.x === "number" && typeof candidate.y === "number"
        ? nearestTapRevealHex({ x: candidate.x, y: candidate.y }).hex
        : undefined
    );
    if (snapped) unique.set(snapped.id, snapped);
  });
  unique.set(TAP_REVEAL_CENTER_HEX.id, TAP_REVEAL_CENTER_HEX);
  return [...unique.values()];
}

function driveImageSources(url?: string, fileId?: string, width = 2400) {
  const sources = [
    fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}` : "",
    url || "",
    fileId ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}` : "",
  ];
  return sources.filter((source, index) => source && sources.indexOf(source) === index);
}

function TapRevealTerritoryMap({
  territory,
  territoryHexes,
  fightingForces,
  missions,
  customMissions,
  isDm,
  onRevealHex,
  onStartScouting,
  onViewResults,
  onClose,
}: {
  territory: SheetTerritory;
  territoryHexes: SheetTerritoryHex[];
  fightingForces: SheetRetainer[];
  missions: SheetScoutingMission[];
  customMissions: SheetCustomMission[];
  isDm: boolean;
  onRevealHex: (input: {
    territoryId: string;
    hexNumber: string;
    mapX: number;
    mapY: number;
  }) => Promise<void>;
  onStartScouting: (input: {
    territoryId: string;
    hexNumber: string;
    mapX: number;
    mapY: number;
    allocations: Array<{ retainerId: string; soldierType: string; men: number }>;
  }) => Promise<void>;
  onViewResults: (missionId: string) => Promise<SheetScoutingMission>;
  onClose: () => void;
}) {
  const activeMissions = missions.filter((mission) => mission.status === "active");
  const completedMissions = missions.filter((mission) => mission.status === "completed");
  const pendingResultMissions = missions.filter((mission) => ["completed", "failed"].includes(mission.status) && !mission.resultsViewedAt);
  const revealedMissions = completedMissions.filter((mission) => Boolean(mission.resultsViewedAt));
  const reveals = useMemo(() => {
    const revealed = new globalThis.Map<string, TapRevealPoint>();
    revealed.set(TAP_REVEAL_CENTER_HEX.id, TAP_REVEAL_CENTER_HEX);

    territoryHexes.forEach((territoryHex) => {
      if (!territoryHex.isDiscovered && !territoryHex.dmRevealed) return;
      const hexKey = territoryHexKey(territoryHex.hexNumber);
      const point = TAP_REVEAL_HEXES.find(
        (hex) => territoryHexKey(HEX_I2_CARDS[hex.id]?.hex) === hexKey,
      );
      if (point) revealed.set(point.id, point);
    });

    revealedMissions.forEach((mission) => {
      const missionHexKey = territoryHexKey(mission.hexNumber);
      const point = TAP_REVEAL_HEXES.find((hex) => territoryHexKey(HEX_I2_CARDS[hex.id]?.hex) === missionHexKey);
      if (point) revealed.set(point.id, point);
    });
    return [...revealed.values()];
  }, [territoryHexes, revealedMissions]);
  const reserved = useMemo(() => {
    const totals: Record<string, number> = {};
    [...activeMissions, ...customMissions.filter((mission) => ["scheduled", "active"].includes(mission.status))].forEach((mission) => (mission.allocations || []).forEach((item) => {
      const key = `${item.retainerId}::${item.soldierType}`;
      totals[key] = (totals[key] || 0) + Number(item.men || 0);
    }));
    return totals;
  }, [activeMissions, customMissions]);
  const availableTroops = fightingForces.flatMap((force) =>
    (force.roster || []).map((troop) => {
      const key = `${force.retainerId}::${troop.soldierType}`;
      const leaderlessMen = Math.max(0, Number(troop.missingSerjeants || 0)) * 9;
      const available = Math.floor(Math.max(0, Number(troop.men) - leaderlessMen - (reserved[key] || 0)) / 10) * 10;
      return { key, force, troop, available };
    }).filter((item) => item.available >= 10),
  );
  const availableMen = availableTroops.reduce((sum, item) => sum + item.available, 0);
  const [missionHex, setMissionHex] = useState<TapRevealPoint | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [startingMission, setStartingMission] = useState(false);
  const [revealingHex, setRevealingHex] = useState(false);
  const [missionError, setMissionError] = useState("");
  const selectedMen = Object.values(allocations).reduce((sum, men) => sum + Number(men || 0), 0);
  const [playerMapSize, setPlayerMapSize] = useState<{ width: number; height: number } | null>(null);
  const [secondaryMapSize, setSecondaryMapSize] = useState<{ width: number; height: number } | null>(null);
  // Large Drive thumbnails can fail to decode without firing a useful error on
  // memory-constrained mobile browsers.  The scouting overlay is never wider
  // than the phone viewport there, so request a smaller (but still crisp) copy.
  const requestedMapWidth = typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches
    ? 1400
    : 2400;
  const playerMapSources = driveImageSources(territory.mapUrl, territory.mapFileId, requestedMapWidth);
  const secondaryMapSources = driveImageSources(territory.poiMapUrl, territory.poiMapFileId, requestedMapWidth);
  const [playerMapSourceIndex, setPlayerMapSourceIndex] = useState(0);
  const [secondaryMapSourceIndex, setSecondaryMapSourceIndex] = useState(0);
  const [viewingHexCard, setViewingHexCard] = useState<HexCardDetails | null>(null);
  const [viewingDmInformation, setViewingDmInformation] = useState("");
  const [viewingDmScoutingResult, setViewingDmScoutingResult] = useState<SheetScoutingMission | null>(null);
  const [viewingMissionResult, setViewingMissionResult] = useState<SheetScoutingMission | null>(null);
  const [loadingResultId, setLoadingResultId] = useState("");
  const [mapNow, setMapNow] = useState(Date.now());
  const playerMapSource = playerMapSources[playerMapSourceIndex] || "";
  const secondaryMapSource = secondaryMapSources[secondaryMapSourceIndex] || "";
  const playerMapFailed = Boolean(playerMapSources.length && playerMapSourceIndex >= playerMapSources.length);
  const secondaryMapFailed = Boolean(secondaryMapSources.length && secondaryMapSourceIndex >= secondaryMapSources.length);

  const playerMapRatio = playerMapSize ? playerMapSize.width / playerMapSize.height : 0;
  const secondaryMapRatio = secondaryMapSize ? secondaryMapSize.width / secondaryMapSize.height : 0;
  const dimensionsMatch = Boolean(
    playerMapSize &&
    secondaryMapSize &&
    Math.abs(playerMapRatio - secondaryMapRatio) <= 0.001,
  );

  useEffect(() => {
    setPlayerMapSourceIndex(0);
    setSecondaryMapSourceIndex(0);
    setPlayerMapSize(null);
    setSecondaryMapSize(null);
  }, [territory.mapFileId, territory.mapUrl, territory.poiMapFileId, territory.poiMapUrl]);

  useEffect(() => {
    if (!isDm) return;
    const timer = window.setInterval(() => setMapNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [isDm]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function acknowledgeMapMissionResult() {
    if (!viewingMissionResult || loadingResultId) return;

    const mission = viewingMissionResult;
    const missionId = mission.missionId;
    setMissionError("");

    // onViewResults applies the successful reveal locally before its background
    // network acknowledgement, so the hex is selectable immediately.
    const acknowledgement = onViewResults(missionId);

    // Close the scouting report immediately rather than blocking on the
    // acknowledgement/bootstrap refresh.
    setViewingMissionResult(null);

    // A successful scouting mission should flow directly into the newly
    // revealed hex card. Failed missions simply return to the fogged map.
    if (mission.status === "completed") {
      const missionHexKey = territoryHexKey(mission.hexNumber);
      const revealedHex = TAP_REVEAL_HEXES.find(
        (hex) => territoryHexKey(HEX_I2_CARDS[hex.id]?.hex) === missionHexKey,
      );
      if (revealedHex) openHexCard(revealedHex);
    }

    void acknowledgement.catch((error) => {
      // The parent restores the mission to result-ready if the backend
      // acknowledgement fails. Close any optimistically opened hex card so the
      // player can retry Continue from the mission result.
      setViewingHexCard(null);
      setMissionError(error instanceof Error ? error.message : "Could not acknowledge the mission results.");
    });
  }

  function selectHex(event: React.MouseEvent<HTMLDivElement>) {
    if (!dimensionsMatch) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
    const { hex, distance } = nearestTapRevealHex(point);
    // The normalized point-top hex equation rejects taps in the transparent
    // corners outside the 61-cell map while accepting the complete hex edge.
    const normalizedX = Math.abs(point.x - hex.x) / (TAP_REVEAL_HEX_WIDTH / 2);
    const normalizedY = Math.abs(point.y - hex.y) / (TAP_REVEAL_HEX_HEIGHT / 2);
    if (distance > 1.25 || normalizedY > 1 || normalizedX + normalizedY * 2 > 2) return;
    const isRevealed = reveals.some((reveal) => reveal.id === hex.id);
    if (isRevealed) {
      openHexCard(hex);
      return;
    }
    const selectedHexKey = territoryHexKey(HEX_I2_CARDS[hex.id]?.hex);
    const hasPendingResult = pendingResultMissions.some(
      (mission) => territoryHexKey(mission.hexNumber) === selectedHexKey,
    );
    const hasActiveMission = activeMissions.some(
      (mission) => territoryHexKey(mission.hexNumber) === selectedHexKey,
    );
    if (!isDm && (hasPendingResult || hasActiveMission)) return;
    setAllocations({});
    setMissionError("");
    setMissionHex(hex);
  }

  function openHexCard(hex: TapRevealPoint) {
    const fallback = HEX_I2_CARDS[hex.id];
    const selectedHexKey = territoryHexKey(fallback?.hex || hex.id);
    const imported = territoryHexes.find((hex) => territoryHexKey(hex.hexNumber) === selectedHexKey);
    setViewingHexCard(imported ? {
      hex: imported.hexNumber,
      terrain: imported.terrain || "Unknown",
      inhabitants: imported.inhabitants || "none",
      dungeon: imported.dungeon || "no",
      settlement: imported.settlement || "no",
      details: imported.details || imported.contents || "No details have been recorded for this hex.",
    } : fallback || {
      hex: hex.id,
      terrain: "Unknown",
      inhabitants: "none",
      dungeon: "no",
      settlement: "no",
      details: "No details have been recorded for this hex.",
    });
    setViewingDmInformation(isDm ? imported?.dmOnlyInformation || "" : "");
    setViewingDmScoutingResult(isDm
      ? completedMissions.find((mission) => territoryHexKey(mission.hexNumber) === selectedHexKey) || null
      : null);
  }

  return (
    <div className="modal-backdrop territory-map-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="territory-map-viewer tap-reveal-map-viewer" role="dialog" aria-modal="true" aria-label={`Map of ${territory.name}`}>
        <div className="territory-map-viewer-header">
          <div>
            <span>Territory scouting map</span>
            <h2>{territory.name}</h2>
          </div>
          <button className="modal-close territory-map-close" aria-label="Close map" onClick={onClose}><X size={24} /></button>
        </div>
        <div className="territory-map-canvas tap-reveal-map-canvas">
          {!playerMapSize && !playerMapFailed && (
            <div className="territory-map-loading" role="status">Loading territory map…</div>
          )}
          <div
            className={`territory-map-image-wrap tap-reveal-image-wrap ${dimensionsMatch ? "is-ready" : ""}`}
            onClick={selectHex}
            role={dimensionsMatch ? "button" : undefined}
            tabIndex={dimensionsMatch ? 0 : undefined}
            aria-label={dimensionsMatch ? "Tap a sub-hex to reveal it or open its options" : undefined}
          >
            <img
              className="tap-reveal-base-map"
              src={playerMapSource}
              alt={`Player map of ${territory.name}`}
              draggable={false}
              onLoad={(event) => setPlayerMapSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })}
              onError={() => setPlayerMapSourceIndex((index) => index + 1)}
            />
            {secondaryMapSources.length > 0 && !secondaryMapFailed && (
              <img
                className="tap-reveal-dimension-probe"
                src={secondaryMapSource}
                alt=""
                aria-hidden="true"
                onLoad={(event) => setSecondaryMapSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
                onError={() => setSecondaryMapSourceIndex((index) => index + 1)}
              />
            )}
            {dimensionsMatch && reveals.map((reveal, index) => (
              <img
                className="tap-reveal-secondary-map"
                key={reveal.id || `${reveal.x}-${reveal.y}-${index}`}
                src={secondaryMapSource}
                alt=""
                aria-hidden="true"
                draggable={false}
                style={{
                  clipPath: `polygon(${reveal.x}% ${reveal.y - TAP_REVEAL_HEX_HEIGHT / 2}%, ${reveal.x + TAP_REVEAL_HEX_WIDTH / 2}% ${reveal.y - TAP_REVEAL_HEX_HEIGHT / 4}%, ${reveal.x + TAP_REVEAL_HEX_WIDTH / 2}% ${reveal.y + TAP_REVEAL_HEX_HEIGHT / 4}%, ${reveal.x}% ${reveal.y + TAP_REVEAL_HEX_HEIGHT / 2}%, ${reveal.x - TAP_REVEAL_HEX_WIDTH / 2}% ${reveal.y + TAP_REVEAL_HEX_HEIGHT / 4}%, ${reveal.x - TAP_REVEAL_HEX_WIDTH / 2}% ${reveal.y - TAP_REVEAL_HEX_HEIGHT / 4}%)`,
                }}
              />
            ))}
            {dimensionsMatch && (
              <svg
                className="tap-reveal-fog"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {TAP_REVEAL_HEXES.filter((hex) => !reveals.some((reveal) => reveal.id === hex.id)).map((hex) => (
                  <polygon key={hex.id} points={tapRevealHexPolygon(hex)} />
                ))}
              </svg>
            )}
            {activeMissions.map((mission) => {
              const missionHexKey = territoryHexKey(mission.hexNumber);
              const point = TAP_REVEAL_HEXES.find((hex) => territoryHexKey(HEX_I2_CARDS[hex.id]?.hex) === missionHexKey);
              return point ? (
                <span
                  className="scouting-marker active tap-reveal-mission-marker"
                  key={mission.missionId}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  title={isDm && mission.completesAt ? `Scouting completes ${formatCalendarDate(mission.completesAt)}` : "Scouting mission underway"}
                >⌛{isDm ? ` ${exactTimeRemaining(mission.completesAt, mapNow)}` : ""}</span>
              ) : null;
            })}
            {pendingResultMissions.map((mission) => {
              const missionHexKey = territoryHexKey(mission.hexNumber);
              const point = TAP_REVEAL_HEXES.find((hex) => territoryHexKey(HEX_I2_CARDS[hex.id]?.hex) === missionHexKey);
              return point ? <button
                type="button"
                className="scouting-marker result-ready tap-reveal-result-marker"
                key={`result-${mission.missionId}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                aria-label={`View scouting results for hex ${mission.hexNumber}`}
                disabled={Boolean(loadingResultId)}
                onClick={(event) => {
                  event.stopPropagation();
                  setMissionError("");
                  setViewingMissionResult(mission);
                }}
              >!</button> : null;
            })}
          </div>
        </div>
        <div className="scouting-map-footer tap-reveal-footer">
          {playerMapFailed ? (
            <strong>The player map file could not be loaded. Replace the player map to restore it.</strong>
          ) : secondaryMapFailed ? (
            <strong>The secondary map file could not be loaded. Replace the secondary map to restore it.</strong>
          ) : !secondaryMapSources.length ? (
            <strong>Upload a secondary map to test sub-hex reveals.</strong>
          ) : playerMapSize && secondaryMapSize && !dimensionsMatch ? (
            <strong>Map proportions do not match: player map is {playerMapSize.width} × {playerMapSize.height}; secondary map is {secondaryMapSize.width} × {secondaryMapSize.height}.</strong>
          ) : (
            <div>
              <strong>{availableMen >= 10 ? "Tap a fog-covered sub-hex to begin a scouting mission." : "At least one available squad of 10 soldiers is required to scout."}</strong>
              <span>{reveals.length} of 61 revealed · {activeMissions.length} mission{activeMissions.length === 1 ? "" : "s"} underway · center hex always revealed</span>
            </div>
          )}
        </div>
        {missionHex && (
          <div className="modal-backdrop hex-choice-backdrop scouting-mission-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMissionHex(null)}>
            <div className="scouting-mission-panel scouting-start-panel" role="dialog" aria-modal="true" aria-label="Begin scouting mission">
              <button className="modal-close" aria-label="Close scouting form" onClick={() => setMissionHex(null)}><X size={22} /></button>
              <p className="eyebrow">Scouting mission</p>
              <h2>Scout Hex {HEX_I2_CARDS[missionHex.id]?.hex || missionHex.id}</h2>
              <p>Choose one or more complete groups of 10 soldiers. Assigned soldiers remain unavailable until the mission finishes.</p>
              <div className="scouting-allocation-list">
                {availableTroops.map(({ key, force, troop, available }) => (
                  <label className="scouting-allocation-row" key={key}>
                    <span><strong>{troop.soldierType}</strong><small>{force.name} · {available / 10} squad{available === 10 ? "" : "s"} available</small></span>
                    <select
                      value={allocations[key] || 0}
                      onChange={(event) => setAllocations((current) => ({ ...current, [key]: Number(event.target.value) }))}
                      aria-label={`Squads from ${force.name}, ${troop.soldierType}`}
                    >
                      {Array.from({ length: available / 10 + 1 }, (_, index) => <option key={index} value={index * 10}>{index} squad{index === 1 ? "" : "s"}</option>)}
                    </select>
                  </label>
                ))}
                {!availableTroops.length && <p className="empty-ledger">No complete, unassigned squads of 10 are available.</p>}
              </div>
              <div className={`scouting-total ${selectedMen >= 10 && selectedMen % 10 === 0 ? "ready" : ""}`}>
                <span>Mission strength</span><strong>{selectedMen} soldiers · {selectedMen / 10 || 0} squad{selectedMen === 10 ? "" : "s"}</strong>
              </div>
              <p className="scouting-duration-note">Duration is rolled locally: 1d3 real-world days. The timer continues while the app is closed; when it expires, the mission is sent for adjudication.</p>
              {missionError && <p className="form-error">{missionError}</p>}
              <div className="territory-modal-actions">
                <button className="secondary-action" onClick={() => setMissionHex(null)}>Cancel</button>
                {isDm && (
                  <button
                    className="secondary-action"
                    disabled={revealingHex}
                    onClick={async () => {
                      setRevealingHex(true);
                      setMissionError("");
                      try {
                        await onRevealHex({
                          territoryId: territory.territoryId,
                          hexNumber: HEX_I2_CARDS[missionHex.id]?.hex || missionHex.id,
                          mapX: missionHex.x,
                          mapY: missionHex.y,
                        });
                        setMissionHex(null);
                        setAllocations({});
                      } catch (error) {
                        setMissionError(error instanceof Error ? error.message : "Could not reveal this hex.");
                      } finally {
                        setRevealingHex(false);
                      }
                    }}
                  >
                    {revealingHex ? "Revealing…" : "Reveal Hex"}
                  </button>
                )}
                <button
                  className="primary-action"
                  disabled={
                    startingMission ||
                    revealingHex ||
                    selectedMen < 10 ||
                    selectedMen % 10 !== 0 ||
                    activeMissions.some((mission) =>
                      territoryHexKey(mission.hexNumber) === territoryHexKey(HEX_I2_CARDS[missionHex.id]?.hex || missionHex.id)
                    ) ||
                    pendingResultMissions.some((mission) =>
                      territoryHexKey(mission.hexNumber) === territoryHexKey(HEX_I2_CARDS[missionHex.id]?.hex || missionHex.id)
                    )
                  }
                  onClick={async () => {
                    setStartingMission(true);
                    setMissionError("");
                    try {
                      await onStartScouting({
                        territoryId: territory.territoryId,
                        hexNumber: HEX_I2_CARDS[missionHex.id]?.hex || missionHex.id,
                        mapX: missionHex.x,
                        mapY: missionHex.y,
                        allocations: availableTroops.filter(({ key }) => Number(allocations[key] || 0) > 0).map(({ key, force, troop }) => ({
                          retainerId: force.retainerId,
                          soldierType: troop.soldierType,
                          men: Number(allocations[key]),
                        })),
                      });
                      setMissionHex(null);
                      setAllocations({});
                    } catch (error) {
                      setMissionError(error instanceof Error ? error.message : "Could not begin the scouting mission.");
                    } finally {
                      setStartingMission(false);
                    }
                  }}
                >
                  {startingMission ? "Beginning…" : "Begin Mission"}
                </button>
              </div>
            </div>
          </div>
        )}
        {viewingMissionResult && <div className="modal-backdrop hex-choice-backdrop scouting-result-backdrop"><div className="scouting-mission-panel scouting-map-result-panel" role="dialog" aria-modal="true" aria-label="Scouting mission results"><p className="eyebrow">Scouting report</p><h2>Hex {viewingMissionResult.hexNumber}</h2><strong>{viewingMissionResult.missionOutcome || (viewingMissionResult.status === "completed" ? "The scouting mission succeeded." : "The scouting mission failed.")}</strong>{viewingMissionResult.encounterKnownToPlayer && viewingMissionResult.encounteredInhabitants && <p>Encountered: {viewingMissionResult.encounteredInhabitants}</p>}{Number(viewingMissionResult.scoutsKilled || 0) > 0 && <p>{viewingMissionResult.scoutsKilled} scouts were killed; {viewingMissionResult.survivors || 0} returned.</p>}<p className="scouting-result-next-step">{viewingMissionResult.status === "completed" ? "Continue to clear the fog of war and reveal the hex." : "Continue to return the hex to the fogged map so it can be scouted again."}</p><button className="primary-action" onClick={acknowledgeMapMissionResult}>Continue</button></div></div>}
        {viewingHexCard && (
          <div className="modal-backdrop hex-choice-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setViewingHexCard(null)}>
            <article className="hex-card-dialog" role="dialog" aria-modal="true" aria-label={`Hex ${viewingHexCard.hex} card`}>
              <button className="modal-close" aria-label="Close hex card" onClick={() => setViewingHexCard(null)}><X size={22} /></button>
              <p className="eyebrow">Scouted hex</p>
              <h2>Hex {viewingHexCard.hex}</h2>
              <dl className="hex-card-facts">
                <div><dt>Terrain</dt><dd>{viewingHexCard.terrain}</dd></div>
                <div><dt>Inhabitants</dt><dd>{viewingHexCard.inhabitants}</dd></div>
                <div><dt>Dungeon</dt><dd>{viewingHexCard.dungeon}</dd></div>
                <div><dt>Settlement</dt><dd>{viewingHexCard.settlement}</dd></div>
              </dl>
              <section className="hex-card-details">
                <h3>What is happening here</h3>
                <p>{viewingHexCard.details === "N/A" ? "Nothing notable has been recorded here." : viewingHexCard.details}</p>
              </section>
              {isDm && viewingDmInformation && (
                <section className="hex-card-details hex-card-dm-only">
                  <h3>DM Only Information</h3>
                  <p>{viewingDmInformation}</p>
                </section>
              )}
              {isDm && viewingDmScoutingResult && (
                <section className="hex-card-details hex-card-dm-only">
                  <h3>Scouting Adjudication</h3>
                  <p><strong>Encounter:</strong> {viewingDmScoutingResult.reactionResult === "No potential hostile encounter" || viewingDmScoutingResult.reactionResult === "No inhabitants" ? "No potential hostile encounter population (no roll)" : <>{viewingDmScoutingResult.encounterOccurred ? "Yes" : "No"} (1d6: {Number.isInteger(Number(viewingDmScoutingResult.encounterRoll)) && Number(viewingDmScoutingResult.encounterRoll) >= 1 && Number(viewingDmScoutingResult.encounterRoll) <= 6 ? Number(viewingDmScoutingResult.encounterRoll) : "pending repair"})</>}</p>
                  {viewingDmScoutingResult.encounterOccurred && (
                    <><p><strong>Reaction:</strong> {viewingDmScoutingResult.reactionRoll ?? "—"} {Number(viewingDmScoutingResult.reactionModifier || 0) >= 0 ? "+" : "−"} {Math.abs(Number(viewingDmScoutingResult.reactionModifier || 0))} ({viewingDmScoutingResult.reactionDisposition || "not set"}) = <strong>{viewingDmScoutingResult.adjustedReactionRoll ?? "—"}</strong><br />{viewingDmScoutingResult.reactionResult}</p>
                    {Number(viewingDmScoutingResult.adjustedReactionRoll) <= 25 && <p><strong>Hostile attack:</strong> d20 {viewingDmScoutingResult.attackRoll ?? "—"} vs. THAC0 {viewingDmScoutingResult.attackThac0 ?? 18}, targeting {viewingDmScoutingResult.attackTargetSoldierType || "a scout"} (AC {viewingDmScoutingResult.attackTargetArmorClass ?? "—"}; {viewingDmScoutingResult.attackNeeded ?? "—"} needed) — {viewingDmScoutingResult.attackHit ? "hit" : "miss"}.<br />{viewingDmScoutingResult.attackHit && <><strong>Morale:</strong> Scouts {viewingDmScoutingResult.scoutMoraleRoll ?? "—"}{Number(viewingDmScoutingResult.scoutMoraleBonus || 0) ? ` + ${viewingDmScoutingResult.scoutMoraleBonus}` : ""} ({viewingDmScoutingResult.scoutMoralePassed ? "pass" : "fail"}); attackers {viewingDmScoutingResult.attackerMoraleRoll ?? "—"}{Number(viewingDmScoutingResult.attackerMoraleBonus || 0) ? ` + ${viewingDmScoutingResult.attackerMoraleBonus}` : ""} ({viewingDmScoutingResult.attackerMoralePassed ? "pass" : "fail"}).<br /></>}<strong>Outcome:</strong> {viewingDmScoutingResult.missionOutcome || "Pending adjudication"}{Number(viewingDmScoutingResult.scoutsKilled || 0) > 0 ? ` ${viewingDmScoutingResult.scoutsKilled} scouts KIA (${viewingDmScoutingResult.serjeantsKilled || 0} serjeants).` : ""}</p>}
                    </>
                  )}
                  {Number(viewingDmScoutingResult.populationAdded || 0) > 0 && <p><strong>Subjects added:</strong> {Number(viewingDmScoutingResult.populationAdded).toLocaleString()}</p>}
                </section>
              )}
            </article>
          </div>
        )}
      </div>
    </div>
  );
}

function TerritoryMapViewer({
  territory,
  isDm,
  fightingForces,
  missions,
  hexes,
  onStartScouting,
  onSaveHex,
  onClose,
}: {
  territory: SheetTerritory;
  isDm: boolean;
  fightingForces: SheetRetainer[];
  missions: SheetScoutingMission[];
  hexes: SheetTerritoryHex[];
  onStartScouting: (input: {
    territoryId: string;
    hexNumber: string;
    mapX: number;
    mapY: number;
    allocations: Array<{ retainerId: string; soldierType: string; men: number }>;
  }) => Promise<void>;
  onSaveHex: (input: {
    territoryId: string;
    hexNumber: string;
    mapX: number;
    mapY: number;
    title?: string;
    contents?: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<{ x: number; y: number } | null>(null);
  const [reviewingHex, setReviewingHex] = useState<SheetTerritoryHex | null>(null);
  const [hexNumber, setHexNumber] = useState("");
  const [hexTitle, setHexTitle] = useState("");
  const [hexContents, setHexContents] = useState("");
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mapNow, setMapNow] = useState(Date.now());
  const activeMissions = missions.filter((mission) => mission.status === "active");
  const completedMissions = missions.filter((mission) => mission.status === "completed");
  const reserved = useMemo(() => {
    const totals: Record<string, number> = {};
    activeMissions.forEach((mission) => mission.allocations.forEach((item) => {
      const key = `${item.retainerId}::${item.soldierType}`;
      totals[key] = (totals[key] || 0) + Number(item.men || 0);
    }));
    return totals;
  }, [activeMissions]);
  const availableTroops = fightingForces.flatMap((force) =>
    (force.roster || []).map((troop) => {
      const key = `${force.retainerId}::${troop.soldierType}`;
      const leaderlessMen = Math.max(0, Number(troop.missingSerjeants || 0)) * 9;
      return { key, force, troop, available: Math.max(0, Number(troop.men) - leaderlessMen - (reserved[key] || 0)) };
    }).filter((item) => item.available > 0),
  );
  const availableMen = availableTroops.reduce((sum, item) => sum + item.available, 0);
  const selectedMen = Object.values(allocations).reduce((sum, men) => sum + Number(men || 0), 0);
  useEffect(() => {
    if (!isDm) return;
    const timer = window.setInterval(() => setMapNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [isDm]);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop territory-map-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="territory-map-viewer scouting-map-viewer" role="dialog" aria-modal="true" aria-label={`Map of ${territory.name}`}>
        <div className="territory-map-viewer-header">
          <div>
            <span>{isDm ? "Territory map & hidden hex records" : "Territory map & scouting"}</span>
            <h2>{territory.name}</h2>
          </div>
          <button className="modal-close territory-map-close" aria-label="Close map" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <div
          className="territory-map-canvas scouting-map-canvas"
          onClick={(event) => {
            if (!isDm && availableMen < 10) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setSelection({
              x: ((event.clientX - bounds.left) / bounds.width) * 100,
              y: ((event.clientY - bounds.top) / bounds.height) * 100,
            });
            setHexNumber("");
            setHexTitle("");
            setHexContents("");
            setReviewingHex(null);
            setError("");
          }}
        >
          <div className="territory-map-image-wrap">
            <img src={territory.mapUrl} alt={`Map of ${territory.name}`} />
            {!isDm && (
              <svg className="fog-of-war" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <mask id={`fog-${territory.territoryId}`}>
                    <rect width="100" height="100" fill="white" />
                    {completedMissions.map((mission) => (
                      <polygon
                        key={mission.missionId}
                        points={`${mission.mapX},${mission.mapY - 6} ${mission.mapX + 5},${mission.mapY - 3} ${mission.mapX + 5},${mission.mapY + 3} ${mission.mapX},${mission.mapY + 6} ${mission.mapX - 5},${mission.mapY + 3} ${mission.mapX - 5},${mission.mapY - 3}`}
                        fill="black"
                      />
                    ))}
                  </mask>
                </defs>
                <rect width="100" height="100" mask={`url(#fog-${territory.territoryId})`} />
              </svg>
            )}
            {activeMissions.map((mission) => (
              <span
                className="scouting-marker active"
                key={mission.missionId}
                style={{ left: `${mission.mapX}%`, top: `${mission.mapY}%` }}
                title={isDm && mission.completesAt ? `Hex ${mission.hexNumber} completes ${formatCalendarDate(mission.completesAt)}` : `Hex ${mission.hexNumber} scouting underway`}
              >⌛{isDm ? ` ${exactTimeRemaining(mission.completesAt, mapNow)}` : ""}</span>
            ))}
            {completedMissions.map((mission) => {
              const details = hexes.find((hex) => hex.hexNumber.toLowerCase() === mission.hexNumber.toLowerCase());
              return (
                <button
                  type="button"
                  className="scouting-marker revealed"
                  key={`revealed-${mission.missionId}`}
                  style={{ left: `${mission.mapX}%`, top: `${mission.mapY}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setReviewingHex(details || {
                      hexId: mission.missionId,
                      characterId: mission.characterId,
                      territoryId: mission.territoryId,
                      hexNumber: mission.hexNumber,
                      mapX: mission.mapX,
                      mapY: mission.mapY,
                      title: "",
                      contents: "",
                      createdAt: mission.completedAt || mission.startedAt || "",
                    });
                  }}
                >{mission.hexNumber}</button>
              );
            })}
            {isDm && hexes.map((hex) => (
              <button
                type="button"
                className="scouting-marker dm-hex"
                key={hex.hexId}
                style={{ left: `${hex.mapX}%`, top: `${hex.mapY}%` }}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelection({ x: hex.mapX, y: hex.mapY });
                  setHexNumber(hex.hexNumber);
                  setHexTitle(hex.title || "");
                  setHexContents(hex.contents || "");
                }}
              >{hex.hexNumber}</button>
            ))}
            {selection && <span className="scouting-marker selected" style={{ left: `${selection.x}%`, top: `${selection.y}%` }}>+</span>}
          </div>
        </div>
        <div className="scouting-map-footer">
          <div>
            <strong>
              {isDm
                ? "Tap a hex to add or edit its hidden contents."
                : availableMen >= 10
                  ? "Tap an unrevealed numbered hex to allocate a scouting party."
                  : "At least 10 available soldiers are required to scout."}
            </strong>
            <span>
              {isDm
                ? `${hexes.length} hidden hex record${hexes.length === 1 ? "" : "s"}`
                : `${availableMen} uncommitted men · ${activeMissions.length} scouting · ${completedMissions.length} revealed`}
            </span>
          </div>
        </div>
      </div>
      {!isDm && selection && (
        <div className="scouting-mission-panel scouting-start-panel" role="dialog" aria-modal="true" aria-label="Begin scouting mission">
          <button className="modal-close" aria-label="Close scouting form" onClick={() => setSelection(null)}><X size={22} /></button>
          <p className="eyebrow">Scouting mission</p>
          <h2>Allocate 10 Men</h2>
          <label>
            Numbered hex
            <input value={hexNumber} onChange={(event) => setHexNumber(event.target.value)} maxLength={40} placeholder="Enter the number printed on the hex" autoFocus />
          </label>
          <div className="scouting-allocation-list">
            {availableTroops.map(({ key, force, troop, available }) => (
              <label className="scouting-allocation-row" key={key}>
                <span><strong>{troop.soldierType}</strong><small>{force.name} · {available} available</small></span>
                <input
                  type="number"
                  min="0"
                  max={Math.min(available, 10)}
                  value={allocations[key] || ""}
                  onChange={(event) => setAllocations((current) => ({ ...current, [key]: Math.max(0, Number(event.target.value)) }))}
                  aria-label={`Men from ${force.name}, ${troop.soldierType}`}
                />
              </label>
            ))}
          </div>
          <div className={`scouting-total ${selectedMen === 10 ? "ready" : ""}`}>
            <span>Mission strength</span><strong>{selectedMen} / 10 men</strong>
          </div>
          <p className="scouting-duration-note">Travel time is rolled automatically: 1d3 real-world days.</p>
          {error && <p className="form-error">{error}</p>}
          <div className="territory-modal-actions">
            <button className="secondary-action" onClick={() => setSelection(null)}>Cancel</button>
            <button
              className="primary-action"
              disabled={saving || selectedMen !== 10 || !hexNumber.trim()}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  await onStartScouting({
                    territoryId: territory.territoryId,
                    hexNumber: hexNumber.trim(),
                    mapX: selection.x,
                    mapY: selection.y,
                    allocations: availableTroops
                      .filter(({ key }) => Number(allocations[key] || 0) > 0)
                      .map(({ key, force, troop }) => ({
                        retainerId: force.retainerId,
                        soldierType: troop.soldierType,
                        men: Number(allocations[key]),
                      })),
                  });
                  setSelection(null);
                  setAllocations({});
                } catch (startError) {
                  setError(startError instanceof Error ? startError.message : "Could not begin the scouting mission.");
                } finally {
                  setSaving(false);
                }
              }}
            >{saving ? "Beginning…" : "Begin Mission"}</button>
          </div>
        </div>
      )}
      {isDm && selection && (
        <div className="scouting-mission-panel" role="dialog" aria-modal="true" aria-label="Edit hidden hex contents">
          <button className="modal-close" aria-label="Close hex form" onClick={() => setSelection(null)}><X size={22} /></button>
          <p className="eyebrow">Dungeon Master only</p>
          <h2>Hidden Hex Contents</h2>
          <label>
            Numbered hex
            <input value={hexNumber} onChange={(event) => setHexNumber(event.target.value)} maxLength={40} placeholder="Number printed on the map" autoFocus />
          </label>
          <label>
            Title <span className="optional-label">Optional</span>
            <input value={hexTitle} onChange={(event) => setHexTitle(event.target.value)} maxLength={160} placeholder="Ruined watchtower" />
          </label>
          <label>
            Contents
            <textarea value={hexContents} onChange={(event) => setHexContents(event.target.value)} rows={7} placeholder="What the scouting party discovers…" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="territory-modal-actions">
            <button className="secondary-action" onClick={() => setSelection(null)}>Cancel</button>
            <button
              className="primary-action"
              disabled={saving || !hexNumber.trim()}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  await onSaveHex({
                    territoryId: territory.territoryId,
                    hexNumber: hexNumber.trim(),
                    mapX: selection.x,
                    mapY: selection.y,
                    title: hexTitle.trim(),
                    contents: hexContents.trim(),
                  });
                  setSelection(null);
                } catch (saveError) {
                  setError(saveError instanceof Error ? saveError.message : "Could not save the hex.");
                } finally {
                  setSaving(false);
                }
              }}
            >{saving ? "Saving…" : "Save Hex"}</button>
          </div>
        </div>
      )}
      {reviewingHex && (
        <div className="scouting-mission-panel revealed-hex-panel" role="dialog" aria-modal="true" aria-label={`Hex ${reviewingHex.hexNumber}`}>
          <button className="modal-close" aria-label="Close hex details" onClick={() => setReviewingHex(null)}><X size={22} /></button>
          <p className="eyebrow">Scouted territory</p>
          <h2>Hex {reviewingHex.hexNumber}</h2>
          {reviewingHex.title && <h3>{reviewingHex.title}</h3>}
          <p>{reviewingHex.contents || "No notable contents were recorded for this hex."}</p>
          <button className="primary-action full-width-action" onClick={() => setReviewingHex(null)}>Close</button>
        </div>
      )}
    </div>
  );
}

function TerritoryModal({
  territory,
  isDm,
  onClose,
  onSave,
  onDelete,
}: {
  territory: SheetTerritory | null;
  isDm: boolean;
  onClose: () => void;
  onSave: (input: { name: string; hexNumber: string; scoutingWebhookUrl: string; mapFile?: File; poiMapFile?: File; workbookFile?: File; workbookRows?: TerritoryWorkbookRow[] }) => Promise<void>;
  onDelete: (territory: SheetTerritory) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  async function removeTerritory() {
    if (!territory) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(territory);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the territory.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("mapFile");
    const mapFile = file instanceof File && file.size ? file : undefined;
    const poiFile = form.get("poiMapFile");
    const poiMapFile = poiFile instanceof File && poiFile.size ? poiFile : undefined;
    const workbook = form.get("workbookFile");
    const workbookFile = workbook instanceof File && workbook.size ? workbook : undefined;
    if ((mapFile && mapFile.size > 5 * 1024 * 1024) || (poiMapFile && poiMapFile.size > 5 * 1024 * 1024) || (workbookFile && workbookFile.size > 5 * 1024 * 1024)) {
      setError("Maps and workbooks must be 5 MB or smaller.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const workbookRows = workbookFile ? await readTerritoryWorkbook(workbookFile) : undefined;
      await onSave({
        name: String(form.get("name") || "").trim(),
        hexNumber: String(form.get("hexNumber") || "").trim(),
        scoutingWebhookUrl: String(form.get("scoutingWebhookUrl") || "").trim(),
        mapFile,
        poiMapFile,
        workbookFile,
        workbookRows,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the territory.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal ornamental-card territory-modal">
        <button className="modal-close" aria-label="Close territory form" onClick={onClose}><X size={24} /></button>
        <p className="eyebrow">Lands & holdings</p>
        <h2>{territory ? "Edit Territory" : "Add Territory"}</h2>
        <form onSubmit={submit}>
          <label>
            Territory name
            <input name="name" defaultValue={territory?.name || ""} required maxLength={120} placeholder="Mansfeld" />
          </label>
          <label>
            Hex number <span className="optional-label">Optional</span>
            <input name="hexNumber" defaultValue={territory?.hexNumber || ""} maxLength={40} placeholder="I2" />
          </label>
          {isDm ? (
            <>
              <label>
                Scouting Discord webhook <span className="optional-label">Optional</span>
                <input name="scoutingWebhookUrl" type="url" placeholder={territory?.scoutingWebhookConfigured ? "Webhook configured — paste a new URL to replace it" : "https://discord.com/api/webhooks/…"} autoComplete="off" />
                <small>Mission-start notifications for this territory are sent here. Leave blank to keep the current webhook.</small>
              </label>
              <label>
                {territory?.mapUrl ? "Replace player map" : "Upload player map"} <span className="optional-label">Optional</span>
                <input className="territory-file-input" name="mapFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
                <small>The ordinary territory map. Maximum 5 MB.</small>
              </label>
              <label>
                {territory?.poiMapUrl ? "Replace secondary reveal map" : "Upload secondary reveal map"} <span className="optional-label">Optional</span>
                <input className="territory-file-input" name="poiMapFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
                <small>Must have the same proportions and grid alignment as the player map. It may use a different pixel resolution. Maximum 5 MB.</small>
              </label>
              <label>
                {territory?.workbookFileName ? "Replace hex details workbook" : "Upload hex details workbook"} <span className="optional-label">Optional</span>
                <input className="territory-file-input" name="workbookFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
                <small>Imports all 61 sub-hex cards. “DM Only Information” is visible only to the DM. Maximum 5 MB.</small>
              </label>
            </>
          ) : (
            <div className="territory-dm-notice"><Shield size={18} /> Only the Dungeon Master can upload or replace the map.</div>
          )}
          {territory?.mapFileName && <p className="territory-current-map">Current map: {territory.mapFileName}</p>}
          {territory?.poiMapFileName && <p className="territory-current-map">Current secondary map: {territory.poiMapFileName}</p>}
          {territory?.workbookFileName && <p className="territory-current-map">Current hex workbook: {territory.workbookFileName}</p>}
          {isDm && territory && (
            <div className="territory-delete-area">
              {!confirmingDelete ? (
                <button type="button" className="danger-action" onClick={() => setConfirmingDelete(true)} disabled={saving || deleting}>
                  <Trash2 size={17} /> Delete Territory
                </button>
              ) : (
                <div className="territory-delete-confirm" role="alert">
                  <p>Delete <strong>{territory.name}</strong> and all of its maps, hex cards, workbook data, and scouting records?</p>
                  <div>
                    <button type="button" className="secondary-action" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Keep Territory</button>
                    <button type="button" className="danger-action" onClick={removeTerritory} disabled={deleting}>
                      <Trash2 size={17} /> {deleting ? "Deleting…" : "Yes, Delete Territory"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="territory-modal-actions">
            <button type="button" className="secondary-action" onClick={onClose} disabled={saving || deleting}>Cancel</button>
            <button className="primary-action" disabled={saving || deleting}>{saving ? "Saving…" : "Save Territory"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JournalView({
  characterName,
  discordEnabled,
  entries,
  onAdd,
  onEdit,
  onSend,
  isDm,
  pushingToSheet,
  pushToSheetSuccess,
  onPushToSheet,
}: {
  characterName: string;
  discordEnabled: boolean;
  entries: SheetJournalEntry[];
  onAdd: () => void;
  onEdit: (entry: SheetJournalEntry) => void;
  onSend: (entry: SheetJournalEntry) => Promise<void>;
  isDm: boolean;
  pushingToSheet: boolean;
  pushToSheetSuccess: boolean;
  onPushToSheet: () => Promise<void>;
}) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [sendingEntryId, setSendingEntryId] = useState("");
  const [sentEntryId, setSentEntryId] = useState("");
  const [sendError, setSendError] = useState("");
  const [confirmEntry, setConfirmEntry] = useState<SheetJournalEntry | null>(null);

  useEffect(() => {
    setExpandedEntries(new Set());
  }, [characterName]);

  useEffect(() => {
    if (!confirmEntry) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sendingEntryId) setConfirmEntry(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmEntry, sendingEntryId]);

  return (
    <section>
      <div className="page-title">
        <div><p className="eyebrow">Player notes</p><h1>Campaign Journal</h1><p>Notes recorded for {characterName || "this character"}.</p></div>
        <div className="page-title-actions">
          {isDm && (
            <button className="secondary-action" disabled={pushingToSheet} onClick={() => void onPushToSheet().catch((error) => window.alert(error instanceof Error ? error.message : "Could not push Journal to the Sheet."))}>
              <Upload size={17} /> {pushingToSheet ? "Pushing…" : pushToSheetSuccess ? "Pushed" : "Push to Sheet"}
            </button>
          )}
          <button className="primary-action" onClick={onAdd}><Plus size={19} /> Add Entry</button>
        </div>
      </div>
      {entries.length ? (
        <div className="journal-grid">
          {entries.map((entry) => {
            const tags = entry.category.split(",").map((tag) => tag.trim()).filter(Boolean);
            const isLong = entry.notes.length > 240;
            const expanded = expandedEntries.has(entry.entryId);
            return (
              <article className="ornamental-card journal-entry" key={entry.entryId}>
                <div className="journal-entry-heading">
                  <div className="entry-tags">
                    {tags.map((tag) => <span className="entry-tag" key={tag}>{tag}</span>)}
                  </div>
                  <button className="journal-edit-button" aria-label={`Edit ${entry.title}`} onClick={() => onEdit(entry)}>
                    <Pencil size={16} />
                  </button>
                </div>
                <h2>{entry.title}</h2>
                <p className={expanded ? "journal-note expanded" : "journal-note"}>
                  {expanded || !isLong ? entry.notes : `${entry.notes.slice(0, 240).trimEnd()}…`}
                </p>
                {isLong && (
                  <button
                    className="text-button"
                    onClick={() => setExpandedEntries((current) => {
                      const next = new Set(current);
                      if (next.has(entry.entryId)) next.delete(entry.entryId);
                      else next.add(entry.entryId);
                      return next;
                    })}
                  >
                    {expanded ? "Show less ↑" : "Read note →"}
                  </button>
                )}
                {discordEnabled && (
                  <button
                    className="journal-discord-button"
                    aria-label={`Send ${entry.title} to Discord character thread`}
                    title="Send to Discord"
                    disabled={Boolean(sendingEntryId)}
                    onClick={() => setConfirmEntry(entry)}
                  >
                    <Send size={16} />
                    <span className="sr-only">{sentEntryId === entry.entryId ? "Sent" : "Send to Discord"}</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ornamental-card empty-journal">
          <BookOpen size={34} />
          <h2>No journal entries yet</h2>
          <p>Add the first note for {characterName || "this character"}.</p>
        </div>
      )}
      {sendError && <p className="form-error journal-send-error" role="alert">{sendError}</p>}
      {confirmEntry && (
        <div className="modal-backdrop discord-confirm-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget && !sendingEntryId) setConfirmEntry(null);
        }}>
          <section className="modal-card discord-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="discord-confirm-title">
            <button
              className="discord-confirm-close"
              type="button"
              aria-label="Close send confirmation"
              disabled={Boolean(sendingEntryId)}
              onClick={() => setConfirmEntry(null)}
            >
              <X size={20} />
            </button>
            <h2 id="discord-confirm-title">Send to Discord character thread?</h2>
            <div className="discord-confirm-actions">
              <button className="secondary-action" type="button" disabled={Boolean(sendingEntryId)} onClick={() => setConfirmEntry(null)}>Cancel</button>
              <button className="primary-action" type="button" disabled={Boolean(sendingEntryId)} onClick={async () => {
                const entry = confirmEntry;
                setSendingEntryId(entry.entryId);
                setSentEntryId("");
                setSendError("");
                try {
                  await onSend(entry);
                  setSentEntryId(entry.entryId);
                  setConfirmEntry(null);
                } catch (caught) {
                  setSendError(caught instanceof Error ? caught.message : "Could not send the note to Discord.");
                } finally {
                  setSendingEntryId("");
                }
              }}>{sendingEntryId ? "Sending…" : "Send"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function JournalEntryModal({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: SheetJournalEntry | null;
  onClose: () => void;
  onSave: (input: { title: string; tags: string[]; notes: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const tags = String(data.get("tags") || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: String(data.get("title") || "").trim(),
        tags,
        notes: String(data.get("notes") || "").trim(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the journal entry.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete || !window.confirm(`Delete “${entry?.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the journal entry.");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal journal-modal ornamental-card" role="dialog" aria-modal="true" aria-labelledby="journal-entry-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}><X /></button>
        <p className="eyebrow">Campaign journal</p>
        <h2 id="journal-entry-title">{entry ? "Edit Note" : "Add Note"}</h2>
        <form onSubmit={submit}>
          <label>
            Title
            <input name="title" defaultValue={entry?.title || ""} autoFocus required maxLength={160} />
          </label>
          <label>
            Tags
            <input name="tags" defaultValue={entry?.category || ""} placeholder="NPC, Location, Quest" maxLength={240} />
            <small>Separate multiple tags with commas.</small>
          </label>
          <label>
            Note
            <textarea name="notes" defaultValue={entry?.notes || ""} required maxLength={12000} rows={9} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="journal-modal-actions">
            <button className="primary-action" type="submit" disabled={saving || deleting}>
              {saving ? "Saving…" : entry ? "Save Changes" : "Add Note"}
            </button>
            {onDelete && (
              <button className="edit-delete-button" type="button" aria-label="Delete note" title="Delete note" onClick={() => void remove()} disabled={saving || deleting}>
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function RetainersView({
  retainers,
  onAdd,
  onEdit,
  onDelete,
  isDm,
  hasUnsyncedChanges,
  syncing,
  syncError,
  lastSyncedAt,
  onRefresh,
  pushingToSheet,
  pushToSheetSuccess,
  onPushToSheet,
}: {
  retainers: SheetRetainer[];
  onAdd: (kind: "individual" | "force") => void;
  onEdit: (retainer: SheetRetainer) => void;
  onDelete: (retainer: SheetRetainer) => Promise<void>;
  isDm: boolean;
  hasUnsyncedChanges: boolean;
  syncing: boolean;
  syncError: string;
  lastSyncedAt: string;
  onRefresh: () => Promise<void>;
  pushingToSheet: boolean;
  pushToSheetSuccess: boolean;
  onPushToSheet: () => Promise<void>;
}) {
  const individuals = retainers.filter((retainer) => retainer.type !== "force");
  const forces = retainers.filter((retainer) => retainer.type === "force");
  const frequencyLabel = (frequency: SheetRetainer["wageFrequency"]) =>
    frequency === "annually" ? "year" : frequency.replace("ly", "");

  const section = (
    kind: "individual" | "force",
    title: string,
    description: string,
    records: SheetRetainer[],
  ) => (
    <section className="retainer-category">
      <div className="retainer-category-heading">
        <div>
          <p className="eyebrow">{kind === "individual" ? "Named Personnel" : "Military Units"}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button className="primary-action retainer-add-button" onClick={() => onAdd(kind)}>
          <Plus size={18} /> {kind === "individual" ? "Add Retainer" : "Add Fighting Force"}
        </button>
      </div>
      {records.length ? (
        <div className="retainer-list">
          {records.map((retainer) => (
            <article className="ornamental-card retainer-record" key={retainer.retainerId}>
              <div className="retainer-record-icon">
                {kind === "individual" ? <Crown size={24} /> : <Shield size={24} />}
              </div>
              <div className="retainer-record-name">
                <h3>
                  {retainer.name}
                </h3>
                {kind === "force" ? (
                  <>
                  {retainer.clericFightingForce && (
                    <small className="force-loadout-summary"><strong>Cleric fighting force</strong> · troop upkeep waived · 200-soldier maximum</small>
                  )}
                  <ul className="force-roster-summary">
                    {(retainer.roster?.length
                      ? retainer.roster
                      : [{ soldierType: retainer.role, men: Number(retainer.men || 0) }]
                    ).map((entry, index) => (
                      <li key={entry.rosterGroupId || `${entry.soldierType}-${index}`}>
                        <span>{Number(entry.men).toLocaleString()} {entry.soldierType}</span>
                        {(entry.armor || entry.shield || entry.weapons?.length || entry.weaponNames?.length) && (
                          <small className="force-loadout-summary">
                            AC {entry.armorClass ?? forceArmorClass(entry.armor || "None", Boolean(entry.shield))}
                            {` · ${entry.armor || "No armor"}${entry.shield ? " + shield" : ""}`}
                            {entry.weapons?.length
                              ? ` · ${entry.weapons.map((weapon) => `${weapon.name} ${weapon.damageSmallMedium}/${weapon.damageLarge}`).join(", ")}`
                              : entry.weaponNames?.length
                                ? ` · ${entry.weaponNames.join(", ")}`
                                : ""}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                  </>
                ) : (
                  <p>{retainer.role}{retainer.level ? ` · Level ${retainer.level}` : ""}</p>
                )}
              </div>
              {kind === "force" && (
                <div className="retainer-record-stat">
                  <span>Strength</span>
                  <strong>{Number(retainer.men || 0).toLocaleString()} men</strong>
                </div>
              )}
              <div className="retainer-record-stat">
                <span>{kind === "force" ? "Upkeep" : "Recurring cost"}</span>
                <strong>
                  {kind === "force" && retainer.clericFightingForce
                    ? "No troop upkeep"
                    : <>
                        {Number(retainer.wageGp || 0).toLocaleString()} {retainer.costCoin || "gp"}
                        {` / ${frequencyLabel(retainer.wageFrequency || "monthly")}`}
                      </>}
                </strong>
                {kind === "force" && retainer.hiringDate && (
                  <small>Hired {formatCalendarDate(retainer.hiringDate)}</small>
                )}
              </div>
              <div className="retainer-record-actions">
                <button className="secondary-action" onClick={() => onEdit(retainer)}>
                  <Pencil size={16} /> Edit
                </button>
                <button
                  className="cancel-recurring-button retainer-end-button"
                  onClick={() => {
                    const action = kind === "force" ? "Disband" : "Fire";
                    if (window.confirm(`${action} ${retainer.name}? This will stop future recurring costs.`)) {
                      void onDelete(retainer);
                    }
                  }}
                >
                  {kind === "force" ? "Disband" : "Fire"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="ornamental-card retainer-empty">
          {kind === "individual" ? <Crown size={28} /> : <Shield size={28} />}
          <div>
            <h3>No {title.toLowerCase()} added</h3>
            <p>{kind === "individual" ? "Add a henchman, hireling, specialist, or other named retainer." : "Add an army, levy, militia, guard force, or mercenary company."}</p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <section className="retainers-view">
      <div className="page-title">
        <div>
          <p className="eyebrow">Household & Command</p>
          <h1>Hirelings</h1>
          <p>Manage named retainers and fighting forces.</p>
        </div>
      </div>
      <div className="retainer-sync-bar" aria-live="polite">
        <div className="retainer-sync-status">
          <strong>{hasUnsyncedChanges ? "Unsynced changes" : "Retainers synced"}</strong>
          <small>
            {hasUnsyncedChanges
              ? isDm ? "Local changes have not been sent." : "Changes are stored on this device until you press Sync with Sheet."
              : lastSyncedAt
                ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Working copy matches the campaign data."}
          </small>
        </div>
        <div className="retainer-sync-actions">
          {isDm && (
            <>
              <button
                className="secondary-action"
                disabled={syncing || pushingToSheet}
                onClick={() => void onRefresh().catch((error) => window.alert(error instanceof Error ? error.message : "Could not refresh player data."))}
              >
                Refresh Player Data
              </button>
              <button
                className="secondary-action"
                disabled={syncing || pushingToSheet}
                onClick={() => void onPushToSheet().catch((error) => window.alert(error instanceof Error ? error.message : "Could not push Hirelings to the Sheet."))}
              >
                <Upload size={16} /> {pushingToSheet ? "Pushing…" : pushToSheetSuccess ? "Pushed" : "Push to Sheet"}
              </button>
            </>
          )}
        </div>
        {syncError && <p className="form-error retainer-sync-error">{syncError}</p>}
      </div>
      {section("individual", "Individual Retainers", "Henchmen, hirelings, specialists, officials, and other named followers.", individuals)}
      {section("force", "Fighting Forces", "Armies, levies, militia, guards, and other organized bodies of soldiers.", forces)}
    </section>
  );
}

function RetainerModal({
  kind,
  retainer,
  isDm,
  onClose,
  onSave,
}: {
  kind: "individual" | "force";
  retainer: SheetRetainer | null;
  isDm: boolean;
  onClose: () => void;
  onSave: (input: {
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
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clericFightingForce, setClericFightingForce] = useState(
    kind === "force" && Boolean(retainer?.clericFightingForce),
  );
  const modalRef = useRef<HTMLElement>(null);
  const [roster, setRoster] = useState<Array<{ rosterGroupId?: string; soldierType: string; men: string; armor: string; shield: boolean; weaponNames: string[]; missingSerjeants: number }>>(() => {
    if (kind !== "force") return [];
    const existing: FightingForceGroup[] = retainer?.roster?.length
      ? retainer.roster
      : retainer?.role
        ? [{ soldierType: retainer.role, men: Number(retainer.men || 0) }]
        : [{ soldierType: "", men: 0 }];
    return existing.map((entry) => ({
      rosterGroupId: entry.rosterGroupId,
      soldierType: entry.soldierType,
      men: entry.men ? String(entry.men) : "",
      armor: entry.armor || "None",
      shield: Boolean(entry.shield),
      weaponNames: entry.weapons?.map((weapon) => weapon.name) || entry.weaponNames || [],
      missingSerjeants: Number(entry.missingSerjeants || 0),
    }));
  });
  const forceWageBreakdowns = kind === "force"
    ? roster.map((entry) => soldierWageBreakdown(entry.soldierType, entry.men))
    : [];
  const standardAutomaticMonthlyUpkeep = forceWageBreakdowns.reduce(
    (total, breakdown) => total + (breakdown?.monthlyTotal || 0),
    0,
  );
  const automaticMonthlyUpkeep = clericFightingForce ? 0 : standardAutomaticMonthlyUpkeep;
  const forceStrength = roster.reduce((total, entry) => total + Number(entry.men || 0), 0);
  const hasManualWageTypes = kind === "force" && roster.some(
    (entry) => entry.soldierType && entry.men && !soldierWageBreakdown(entry.soldierType, entry.men),
  );

  useEffect(() => {
    modalRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      if (kind === "force") {
        if (clericFightingForce && forceStrength > 200) {
          throw new Error("A cleric fighting force cannot exceed 200 soldiers.");
        }
        for (const entry of roster) {
          const gearError = forceEditorGearValidation(
            entry.soldierType,
            entry.armor,
            entry.shield,
            entry.weaponNames,
          );
          if (gearError) {
            throw new Error(`${entry.soldierType || "Soldier group"}: ${gearError}`);
          }
        }
      }

      await onSave({
        type: kind,
        name: String(form.get("name") || "").trim(),
        role: kind === "individual" ? String(form.get("role") || "").trim() : "",
        level: kind === "individual" && form.get("level") ? Number(form.get("level")) : "",
        amount: kind === "force"
          ? clericFightingForce
            ? 0
            : automaticMonthlyUpkeep + Number(form.get("manualForceUpkeep") || 0)
          : Number(form.get("amount") || 0),
        costCoin: kind === "force" ? "gp" : String(form.get("costCoin") || "gp") as CoinType,
        wageFrequency: kind === "force" ? "monthly" : String(form.get("wageFrequency") || "monthly") as "weekly" | "monthly" | "annually",
        hiringDate: kind === "force" ? String(form.get("hiringDate") || "") : undefined,
        men: kind === "force"
          ? roster.reduce((total, entry) => total + Number(entry.men || 0), 0)
          : "",
        clericFightingForce: kind === "force" ? clericFightingForce : undefined,
        roster: kind === "force"
          ? mergeIdenticalForceGroups(
              roster.map((entry) => ({
                rosterGroupId: entry.rosterGroupId || crypto.randomUUID(),
                soldierType: entry.soldierType.trim(),
                men: Number(entry.men || 0),
                armor: entry.armor,
                shield: entry.shield,
                armorClass: forceArmorClass(entry.armor, entry.shield),
                weapons: entry.weaponNames.map((name) =>
                  FORCE_WEAPON_OPTIONS.find((weapon) => weapon.name === name) || {
                    name,
                    damageSmallMedium: "",
                    damageLarge: "",
                  }
                ),
                weaponNames: entry.weaponNames,
                missingSerjeants: entry.missingSerjeants,
              })),
            )
          : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this record.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop retainer-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={modalRef} tabIndex={-1} className="modal retainer-modal ornamental-card" role="dialog" aria-modal="true" aria-labelledby="retainer-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close retainer-modal-close" type="button" onClick={onClose} aria-label="Close"><X size={22} /></button>
        <div className="retainer-modal-scroll">
        <p className="eyebrow">{kind === "individual" ? "Named Personnel" : "Military Unit"}</p>
        <h2 id="retainer-modal-title">
          {retainer ? "Edit" : "Add"} {kind === "individual" ? "Individual Retainer" : "Fighting Force"}
        </h2>
        <p className="modal-intro">
          {kind === "individual"
            ? "Record the retainer’s identity, occupation, optional level, and continuing cost."
            : "Build a complete roster, set its hiring date, and choose monthly or annual upkeep."}
        </p>
        <form onSubmit={submit}>
          <label>
            {kind === "individual" ? "Name" : "Force name"}
            <input name="name" defaultValue={retainer?.name || ""} required maxLength={120} />
          </label>
          {kind === "force" && isDm && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={clericFightingForce}
                onChange={(event) => setClericFightingForce(event.target.checked)}
              />
              <span>
                <strong>Cleric fighting force</strong>
                <small>No upkeep for soldiers or serjeants; maximum 200 soldiers. Salaried individual officers remain separate retainers.</small>
              </span>
            </label>
          )}
          {kind === "force" && !isDm && clericFightingForce && (
            <p className="force-roster-total"><strong>Cleric fighting force</strong> · soldier and serjeant upkeep waived · 200-soldier maximum</p>
          )}
          {kind === "individual" && <label>
            Occupation
            <input
              name="role"
              defaultValue={retainer?.role || ""}
              placeholder="Scout, blacksmith, man-at-arms…"
              required
              maxLength={120}
            />
          </label>}
          {kind === "individual" ? (
            <label>
              Level <small>Optional</small>
              <input name="level" type="number" min="1" step="1" defaultValue={retainer?.level || ""} inputMode="numeric" />
            </label>
          ) : (
            <fieldset className="force-roster-editor">
              <legend>Soldier roster</legend>
              {roster.map((entry, index) => (
                <div className="force-roster-row" key={index}>
                  <div className="force-roster-basics">
                  <label>
                    Soldier type
                    <select
                      value={entry.soldierType}
                      onChange={(event) => {
                        const soldierType = event.target.value;
                        const rules = recruitEquipmentRules(soldierType);
                        const armorOptions = forceEditorArmorOptions(soldierType);
                        const allowedWeapons = new Set(forceEditorWeaponNames(soldierType));
                        setRoster((items) => items.map((item, itemIndex) => {
                          if (itemIndex !== index) return item;
                          const armor = armorOptions.some((option) => option.name === item.armor)
                            ? item.armor
                            : (armorOptions[0]?.name || "None");
                          return {
                            ...item,
                            soldierType,
                            armor,
                            shield: rules.shieldAllowed ? item.shield : false,
                            weaponNames: item.weaponNames.filter((name) => allowedWeapons.has(name)).slice(0, 3),
                          };
                        }));
                      }}
                      required
                    >
                      <option value="" disabled>Select soldier type</option>
                      {entry.soldierType && !RECRUITMENT_SOLDIER_TYPES.some((option) => option.value === entry.soldierType) && (
                        <option value={entry.soldierType}>{entry.soldierType} (existing type)</option>
                      )}
                      {RECRUITMENT_SOLDIER_TYPES.map((option) => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Number
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={entry.men}
                      onChange={(event) => setRoster((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, men: event.target.value } : item))}
                      required
                    />
                  </label>
                  <button
                    className="force-roster-remove"
                    type="button"
                    aria-label={`Remove soldier type ${index + 1}`}
                    disabled={roster.length === 1}
                    onClick={() => setRoster((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 size={18} />
                  </button>
                  </div>
                  <div className="force-loadout-editor" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                    {forceWageBreakdowns[index] && (
                      <p className="force-wage-breakdown">
                        <strong>{forceWageBreakdowns[index]!.monthlyTotal.toLocaleString()} gp/month</strong>
                        <span>
                          {forceWageBreakdowns[index]!.ordinary} soldiers at {forceWageBreakdowns[index]!.baseWage} gp +{" "}
                          {forceWageBreakdowns[index]!.serjeants} serjeant{forceWageBreakdowns[index]!.serjeants === 1 ? "" : "s"} at{" "}
                          {forceWageBreakdowns[index]!.baseWage * 10} gp
                        </span>
                      </p>
                    )}

                    <h4 style={{ margin: "2px 0 0" }}>Equipment</h4>

                    <div className="recruitment-equipment-list" style={{ maxHeight: "none", overflow: "visible" }}>
                      <label>
                        <span>
                          <strong>Armor</strong>
                          <small>Allowed for {entry.soldierType || "this troop type"}</small>
                        </span>
                        <select
                          value={entry.armor}
                          onChange={(event) =>
                            setRoster((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, armor: event.target.value } : item
                              )
                            )
                          }
                        >
                          {forceEditorArmorOptions(entry.soldierType).map((option) => (
                            <option value={option.name} key={option.name}>
                              {option.name} · AC {option.ac}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>
                          <strong>Weapons</strong>
                          <small>
                            {recruitEquipmentRules(entry.soldierType).requiredMissileWeapons
                              ? "Required weapon + melee weapon · maximum 3"
                              : recruitEquipmentRules(entry.soldierType).requireMelee
                                ? "At least 1 melee weapon · maximum 3"
                                : "Maximum 3 weapons"}
                          </small>
                        </span>
                        <select
                          value=""
                          disabled={entry.weaponNames.length >= 3}
                          onChange={(event) => {
                            const weaponName = event.target.value;
                            if (!weaponName) return;
                            setRoster((items) =>
                              items.map((item, itemIndex) => {
                                if (itemIndex !== index) return item;
                                if (item.weaponNames.includes(weaponName) || item.weaponNames.length >= 3) return item;
                                return { ...item, weaponNames: [...item.weaponNames, weaponName] };
                              })
                            );
                          }}
                        >
                          <option value="">
                            {entry.weaponNames.length >= 3 ? "Three-weapon limit reached" : "Add weapon…"}
                          </option>
                          {forceEditorWeaponOptions(entry.soldierType)
                            .filter((weapon) => !entry.weaponNames.includes(weapon.name))
                            .map((weapon) => (
                              <option value={weapon.name} key={weapon.name}>
                                {weapon.name}
                              </option>
                            ))}
                        </select>
                      </label>

                      {entry.weaponNames.map((weaponName) => {
                        const weapon = forceEditorWeaponOptions(entry.soldierType).find(
                          (item) => item.name === weaponName
                        );
                        return (
                          <div
                            key={weaponName}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) auto",
                              alignItems: "center",
                              gap: 10,
                              padding: "9px 11px",
                              borderBottom: "1px solid var(--line-soft)",
                            }}
                          >
                            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                              <strong>{weaponName}</strong>
                              {weapon && (weapon.damageSmallMedium || weapon.damageLarge) && (
                                <small style={{ color: "var(--muted)" }}>
                                  {weapon.damageSmallMedium} vs S/M · {weapon.damageLarge} vs L
                                </small>
                              )}
                            </span>
                            <button
                              className="secondary-action"
                              type="button"
                              onClick={() =>
                                setRoster((items) =>
                                  items.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          weaponNames: item.weaponNames.filter((name) => name !== weaponName),
                                        }
                                      : item
                                  )
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}

                      {recruitEquipmentRules(entry.soldierType).shieldAllowed && (
                        <label>
                          <span>
                            <strong>Shield</strong>
                            <small>Optional</small>
                          </span>
                          <select
                            value={entry.shield ? "shield" : ""}
                            onChange={(event) =>
                              setRoster((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, shield: event.target.value === "shield" }
                                    : item
                                )
                              )
                            }
                          >
                            <option value="">No shield</option>
                            <option value="shield">Shield</option>
                          </select>
                        </label>
                      )}
                    </div>

                    <div className="equipment-total">
                      <span>Armor Class</span>
                      <strong>AC {forceArmorClass(entry.armor, entry.shield)}</strong>
                    </div>
                  </div>
                </div>
              ))}
              <button
                className="secondary-action force-roster-add"
                type="button"
                onClick={() => setRoster((items) => [...items, { soldierType: "", men: "", armor: "None", shield: false, weaponNames: [], missingSerjeants: 0 }])}
              >
                <Plus size={17} /> Add Soldier Type
              </button>
              <p className="force-roster-total">
                Total strength: <strong>{forceStrength.toLocaleString()} men</strong>
                {clericFightingForce && <small> · maximum 200</small>}
              </p>
              <p className="force-roster-total">
                {clericFightingForce
                  ? <><strong>No soldier or serjeant upkeep</strong></>
                  : <>Automatic monthly upkeep: <strong>{automaticMonthlyUpkeep.toLocaleString()} gp</strong></>}
              </p>
            </fieldset>
          )}
          {kind === "force" && !clericFightingForce && hasManualWageTypes ? <label>
            Additional monthly upkeep for leader or existing custom types
            <input
              name="manualForceUpkeep"
              type="number"
              min="0"
              step="1"
              defaultValue={Math.max(0, Number(retainer?.wageGp || 0) - automaticMonthlyUpkeep)}
              inputMode="numeric"
            />
            <small>Standard soldier wages and serjeants are calculated automatically above.</small>
          </label> : kind === "force" ? null : <div className="retainer-cost-fields">
            <label>
              Recurring cost
              <input name="amount" type="number" min="0" step="1" defaultValue={retainer?.wageGp ?? ""} required inputMode="numeric" />
            </label>
            <label>
              Coin
              <select name="costCoin" defaultValue={retainer?.costCoin || "gp"}>
                <option value="pp">pp</option>
                <option value="gp">gp</option>
                <option value="sp">sp</option>
                <option value="cp">cp</option>
              </select>
            </label>
          </div>}
          {kind === "force" && (
            <label>
              Date hired
              <input
                name="hiringDate"
                type="date"
                defaultValue={String(retainer?.hiringDate || retainer?.createdAt || new Date().toISOString()).slice(0, 10)}
                required
              />
            </label>
          )}
          {kind !== "force" && <label>
            Cost frequency
            <select name="wageFrequency" defaultValue={retainer?.wageFrequency || "monthly"}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="annually">Annual</option>
            </select>
          </label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="retainer-modal-actions">
            <button className="secondary-action" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-action" type="submit" disabled={saving}>
              {saving ? "Saving…" : retainer ? "Save Changes" : kind === "individual" ? "Add Retainer" : "Add Fighting Force"}
            </button>
          </div>
        </form>
        </div>
      </section>
    </div>
  );
}

function PlayerManagementView({
  players,
  characters,
  webhookConfigured,
  onRefresh,
  onChangeAccess,
  onSaveWebhook,
  onSaveThread,
}: {
  players: SheetPlayer[];
  characters: SheetCharacter[];
  webhookConfigured: boolean;
  onRefresh: () => Promise<void>;
  onChangeAccess: (
    playerId: string,
    enabled: boolean,
  ) => Promise<void>;
  onSaveWebhook: (playerId: string, webhookUrl: string) => Promise<void>;
  onSaveThread: (characterId: string, threadId: string) => Promise<void>;
}) {
  const managedAccounts = [...players].sort((left, right) => {
    if (left.role !== right.role) return left.role === "dm" ? -1 : 1;
    return (left.displayName || left.playerId).localeCompare(right.displayName || right.playerId);
  });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [savingThreadId, setSavingThreadId] = useState("");
  const [discordMessage, setDiscordMessage] = useState("");
  const [discordError, setDiscordError] = useState("");
  const [refreshingPlayers, setRefreshingPlayers] = useState(false);
  const [refreshPlayersMessage, setRefreshPlayersMessage] = useState("");
  const [refreshPlayersError, setRefreshPlayersError] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const selectedAccount = managedAccounts.find((player) => player.playerId === selectedAccountId);
  const selectedAccountCharacters = selectedAccount
    ? characters.filter((character) => character.playerId === selectedAccount.playerId)
    : [];

  useEffect(() => {
    if (!selectedAccountId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedAccountId("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedAccountId]);

  return (
    <section className="management-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">Dungeon Master only</p>
          <h1>Player Management</h1>
          <p>Manage the DM and player accounts, their feature access, and character-specific Discord destinations.</p>
        </div>
        <button
          className="secondary-action"
          type="button"
          disabled={refreshingPlayers}
          onClick={() => {
            setRefreshingPlayers(true);
            setRefreshPlayersMessage("");
            setRefreshPlayersError("");
            void onRefresh()
              .then(() => setRefreshPlayersMessage("Players and characters refreshed."))
              .catch((error) =>
                setRefreshPlayersError(
                  error instanceof Error ? error.message : "Could not refresh players.",
                ),
              )
              .finally(() => setRefreshingPlayers(false));
          }}
        >
          {refreshingPlayers ? "Refreshing…" : "Refresh Players"}
        </button>
      </div>
      {refreshPlayersMessage && <p className="form-success" role="status">{refreshPlayersMessage}</p>}
      {refreshPlayersError && <p className="form-error" role="alert">{refreshPlayersError}</p>}

      <div className="ornamental-card player-management-card">
        <div className="management-table-heading" aria-hidden="true">
          <span>Account</span>
          <span>Default tabs</span>
          <span>Territory access</span>
          <span>Characters</span>
        </div>
        {managedAccounts.length ? (
          managedAccounts.map((player) => (
            <div className={`player-access-row${player.role === "dm" ? " dm-account-row" : ""}`} key={player.playerId}>
              <div>
                <strong>{player.displayName || "Unnamed player"}</strong>
                <small>{player.role === "dm" ? "Dungeon Master" : player.playerId}</small>
              </div>
              <span className="default-access">
                {player.role === "dm" ? "All tabs · DM controls" : "Wallet · Journal · Hirelings"}
              </span>
              {player.role === "dm" ? (
                <span className="dm-full-access">Full access</span>
              ) : (
                <label className="access-toggle">
                  <input
                    type="checkbox"
                    checked={player.territoriesEnabled}
                    onChange={(event) =>
                      void onChangeAccess(
                        player.playerId,
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <span>{player.territoriesEnabled ? "Enabled" : "Hidden"}</span>
                </label>
              )}
              <button
                className="character-management-button"
                type="button"
                onClick={() => {
                  setDiscordMessage("");
                  setDiscordError("");
                  setSelectedAccountId(player.playerId);
                }}
                aria-label={`Manage characters for ${player.displayName || "this account"}`}
              >
                <UsersRound size={17} aria-hidden="true" />
                <span>{characters.filter((character) => character.playerId === player.playerId).length}</span>
                <small>Manage</small>
              </button>
            </div>
          ))
        ) : (
          <p className="empty-management">No player accounts have been created yet.</p>
        )}
      </div>

      {selectedAccount && (
        <div className="modal-backdrop account-characters-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedAccountId("");
        }}>
          <section className="modal ornamental-card account-characters-modal" role="dialog" aria-modal="true" aria-labelledby="account-characters-title">
            <button className="modal-close" type="button" onClick={() => setSelectedAccountId("")} aria-label="Close character management"><X /></button>
            <p className="eyebrow">Discord journal delivery</p>
            <h2 id="account-characters-title">{selectedAccount.displayName || "Unnamed player"}</h2>
            <p className="account-characters-summary">
              {selectedAccount.role === "dm" ? "Dungeon Master characters" : "Player characters"} · Set the parent-channel webhook, then assign each character's thread ID.
            </p>
            <div className="discord-thread-list">
                <form className="discord-webhook-form" onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const webhookUrl = String(new FormData(form).get("webhookUrl") || "").trim();
                  setSavingWebhook(true);
                  setDiscordError("");
                  setDiscordMessage("");
                  try {
                    await onSaveWebhook(selectedAccount.playerId, webhookUrl);
                    form.reset();
                    setDiscordMessage(`Webhook saved for ${selectedAccount.displayName || "this account"}.`);
                  } catch (caught) {
                    setDiscordError(caught instanceof Error ? caught.message : "Could not save the webhook.");
                  } finally {
                    setSavingWebhook(false);
                  }
                }}>
                  <label>
                    Parent channel webhook URL
                    <input name="webhookUrl" type="url" placeholder={selectedAccount.discordWebhookConfigured ? "Webhook configured — paste a new URL to replace it" : "https://discord.com/api/webhooks/…"} required autoComplete="off" />
                  </label>
                  <button className="primary-action" disabled={savingWebhook}>{savingWebhook ? "Saving…" : selectedAccount.discordWebhookConfigured ? "Replace Webhook" : "Save Webhook"}</button>
                </form>
                {selectedAccountCharacters.length ? selectedAccountCharacters.map((character) => (
                  <form className="discord-thread-row" key={character.characterId} onSubmit={async (event) => {
              event.preventDefault();
              const threadId = String(new FormData(event.currentTarget).get("threadId") || "").trim();
              setSavingThreadId(character.characterId);
              setDiscordError("");
              setDiscordMessage("");
              try {
                await onSaveThread(character.characterId, threadId);
                setDiscordMessage(`Thread saved for ${character.name}.`);
              } catch (caught) {
                setDiscordError(caught instanceof Error ? caught.message : "Could not save the thread ID.");
              } finally {
                setSavingThreadId("");
              }
                  }}>
                    <label>
                      <strong>{character.name}</strong>
                      <span>Discord thread ID</span>
                      <input name="threadId" defaultValue={character.discordThreadId || ""} placeholder="123456789012345678" inputMode="numeric" pattern="[0-9]{17,20}" required />
                    </label>
                    <button className="secondary-action" disabled={savingThreadId === character.characterId}>{savingThreadId === character.characterId ? "Saving…" : "Save Thread"}</button>
                  </form>
                )) : <p className="discord-no-characters">No characters on this account yet.</p>}
            </div>
            {discordMessage && <p className="form-success">{discordMessage}</p>}
            {discordError && <p className="form-error" role="alert">{discordError}</p>}
          </section>
        </div>
      )}
    </section>
  );
}

function TransactionModal({
  mode,
  characterName,
  onClose,
  onSave,
}: {
  mode: "funds" | "expense";
  characterName: string;
  onClose: () => void;
  onSave: (
    label: string,
    amount: number,
    coin: CoinType,
    kind: "income" | "expense",
    note: string,
    recurrence?: {
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
    },
  ) => void;
}) {
  const [expenseType, setExpenseType] = useState<"one-time" | "recurring">("one-time");
  const config = {
    funds: { title: "Add Funds", label: "Source", placeholder: "Treasure share", kind: "income" as const },
    expense: { title: "Record Expense", label: "Expense", placeholder: "Room and board", kind: "expense" as const },
  }[mode];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get("label") || config.placeholder);
    const amount = Number(data.get("amount"));
    const coin = String(data.get("coin") || "gp") as CoinType;
    const note = String(data.get("note") || "").trim();
    const recurring = mode === "expense" && expenseType === "recurring";
    const frequency = String(data.get("frequency") || "monthly") as
      | "weekly"
      | "monthly"
      | "annually";
    const startDate = String(data.get("startDate") || "");
    if (amount > 0 && (!recurring || startDate)) {
      onSave(
        label,
        amount,
        coin,
        config.kind,
        note,
        recurring ? { frequency, startDate } : undefined,
      );
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal transaction-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}><X /></button>
        <p className="eyebrow">{characterName}</p>
        <h2 id="modal-title">{config.title}</h2>
        <form onSubmit={submit}>
          {mode === "expense" && (
            <label>
              Expense type
              <select
                name="expenseType"
                value={expenseType}
                onChange={(event) =>
                  setExpenseType(event.currentTarget.value as "one-time" | "recurring")
                }
              >
                <option value="one-time">One-time expense</option>
                <option value="recurring">Recurring expense</option>
              </select>
            </label>
          )}
          <label>{config.label}<input name="label" placeholder={config.placeholder} autoFocus required /></label>
          <div className="coin-entry">
            <label>Amount<input name="amount" type="number" min="1" step="1" placeholder="0" required /></label>
            <label>Coin
              <select name="coin" defaultValue="gp">
                <option value="pp">Platinum pieces (pp)</option>
                <option value="gp">Gold pieces (gp)</option>
                <option value="sp">Silver pieces (sp)</option>
                <option value="cp">Copper pieces (cp)</option>
              </select>
            </label>
          </div>
          {mode === "expense" && expenseType === "recurring" && (
            <div className="coin-entry">
              <label>
                Repeats
                <select name="frequency" defaultValue="monthly">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annually">Annually</option>
                </select>
              </label>
              <label>
                First deduction date
                <input
                  name="startDate"
                  type="date"
                  defaultValue={localCalendarDate()}
                  required
                />
              </label>
            </div>
          )}
          <label>
            Note
            <input
              className="transaction-note-input"
              name="note"
              placeholder="add note"
              maxLength={250}
            />
          </label>
          <button className="primary-action" type="submit">Save to Ledger</button>
        </form>
      </section>
    </div>
  );
}

function PurchaseModal({
  balances,
  onClose,
  onPurchase,
}: {
  balances: CoinBalances;
  onClose: () => void;
  onPurchase: (item: EquipmentItem, quantity: number, note: string) => void;
}) {
  const modalRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EquipmentItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const filteredItems = equipmentCatalog.filter((item) =>
    `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const parsedQuantity = quantity === "" ? NaN : Number(quantity);
  const validQuantity = Number.isInteger(parsedQuantity) && parsedQuantity >= 1
    ? parsedQuantity
    : null;
  const total = selected && validQuantity ? selected.amount * validQuantity : 0;
  const purseValue = purseValueInCopper(balances);
  const purchaseValue = selected
    ? total * coinValueInCopper[selected.coin]
    : 0;

  useEffect(() => {
    modalRef.current?.focus({ preventScroll: true });
  }, []);

  function purchase() {
    if (!selected) return;
    if (validQuantity === null) {
      setError("Enter a quantity of at least 1.");
      return;
    }
    if (purseValue < purchaseValue) {
      setError(
        `Insufficient funds. This purchase costs ${total} ${selected.coin}.`,
      );
      return;
    }
    onPurchase(selected, validQuantity, note.trim());
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={modalRef}
        tabIndex={-1}
        className="modal purchase-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}><X /></button>
        <p className="eyebrow">Basic equipment and supplies</p>
        <h2 id="purchase-title">Purchase Equipment</h2>
        <input
          className="equipment-search"
          type="search"
          placeholder="Search equipment"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <p className="encumbrance-note">
          Encumbrance is shown for reference only and is not added to the wallet.
        </p>
        <div className="equipment-list">
          {filteredItems.map((item) => (
            <button
              type="button"
              key={`${item.category}-${item.name}`}
              className={selected === item ? "equipment-row selected" : "equipment-row"}
              onClick={() => {
                setSelected(item);
                setQuantity("1");
                setError("");
              }}
            >
              <span><strong>{item.name}</strong><small>{item.category}</small></span>
              <span className="equipment-price">{item.amount} {item.coin}</span>
              <span className="equipment-encumbrance">
                {item.encumbrance === "—" ? "—" : `${item.encumbrance} enc.`}
              </span>
            </button>
          ))}
          {!filteredItems.length && <p className="empty-ledger">No matching equipment.</p>}
        </div>
        {selected && (
          <div className="purchase-selection">
            <div>
              <strong>{selected.name}</strong>
              <span>{total} {selected.coin} total</span>
            </div>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setError("");
                }}
              />
            </label>
            <label className="purchase-note">
              Note
              <input
                className="transaction-note-input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="add note"
                maxLength={250}
              />
            </label>
            {error && <p className="purchase-error" role="alert">{error}</p>}
            <button className="primary-action" type="button" onClick={purchase}>
              Purchase for {total} {selected.coin}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
