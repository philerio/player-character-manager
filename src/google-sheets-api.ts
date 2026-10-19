import { AppError } from "./app/errors";
import { clearDataIssues, diagnosticsScope } from "./app/dataDiagnostics";
import { normalizeSheetResponse, validateResponse } from "./app/validation";
import { requestCampaign, cancelAllReads } from "./app/transport";
import { apiBackend, apiUrl, isDemoMode } from "./app/runtime";
import { demoRequest, getDemoBootstrap } from "./app/demoApi";
import { appStorage } from "./app/storage";
import { withD1Command } from "./app/d1Commands";
export type SheetCharacter = {
  characterId: string;
  version?: number;
  playerId: string;
  name: string;
  class: string;
  level: number;
  discordThreadId?: string;
  discordConfigured?: boolean;
  portraitFileId?: string;
  portraitUrl?: string;
  portraitFileName?: string;
};

export type SheetPlayer = {
  playerId: string;
  displayName: string;
  email?: string;
  role: "dm" | "player";
  active: boolean;
  territoriesEnabled: boolean;
  retainersEnabled: boolean;
  discordWebhookConfigured?: boolean;
};

export type SheetTransaction = {
  transactionId: string;
  characterId: string;
  timestamp: string;
  type: "income" | "expense";
  label: string;
  pp: number;
  gp: number;
  sp: number;
  cp: number;
  note?: string;
  clientMutationId?: string;
  deleted?: boolean;
};

export type SheetJournalEntry = {
  syncPending?: boolean;
  clientMutationId?: string;
  entryId: string;
  characterId: string;
  title: string;
  category: string;
  notes: string;
  playerId: string;
  createdAt: string;
  updatedAt: string;
};

export type SheetRecurringExpense = {
  scheduleId: string;
  characterId: string;
  label: string;
  pp: number;
  gp: number;
  sp: number;
  cp: number;
  note?: string;
  frequency: "weekly" | "monthly" | "annually";
  startDate: string;
  occurrenceCount: number;
  active: boolean;
  sourceType?: "retainer" | "";
  sourceId?: string;
};

export type SheetRetainer = {
  clientMutationId?: string;
  retainerId: string;
  characterId: string;
  name: string;
  type: "individual" | "force";
  role: string;
  level?: number | "";
  wageGp: number;
  costCoin: "pp" | "gp" | "sp" | "cp";
  wageFrequency: "weekly" | "monthly" | "annually";
  hiringDate?: string;
  men?: number | "";
  roster?: FightingForceGroup[];
  status?: string;
  createdAt: string;
  updatedAt?: string;
  scheduleId?: string;
  clericFightingForce?: boolean;
};

export type FightingForceWeapon = {
  name: string;
  damageSmallMedium: string;
  damageLarge: string;
};

export type FightingForceGroup = {
  rosterGroupId?: string;
  soldierType: string;
  men: number;
  armor?: string;
  shield?: boolean;
  armorClass?: number;
  weapons?: FightingForceWeapon[];
  weaponNames?: string[];
  missingSerjeants?: number;
};

export type SheetTerritory = {
  territoryId: string;
  characterId: string;
  name: string;
  hexNumber?: string;
  mapFileId?: string;
  mapUrl?: string;
  mapFileName?: string;
  poiMapFileId?: string;
  poiMapUrl?: string;
  poiMapFileName?: string;
  workbookFileId?: string;
  workbookFileName?: string;
  scoutingWebhookConfigured?: boolean;
  payChurchTithe?: boolean;
  population?: number;
  assets?: Array<{
    type: string;
    name: string;
    quantity: number;
    notes?: string;
  }>;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
};

export async function updateTerritoryChurchTithe(input: {
  characterId: string;
  territoryId: string;
  payChurchTithe: boolean;
}) {
  return postSheetAction<{ ok: true; territory: SheetTerritory }>(
    "territory.tithe.update",
    input,
  );
}

export type TerritoryRecruitmentOffer = {
  offerId: string;
  territoryId: string;
  characterId: string;
  rollDate: string;
  percentileRoll: number;
  quantityRoll: number;
  soldierType: string;
  quantity: number;
  wageGpPerSoldier?: number;
  status: "available" | "recruited" | "denied" | "reset";
};

export type SheetScoutingMission = {
  missionId: string;
  clientMissionId?: string;
  characterId: string;
  territoryId: string;
  hexNumber: string;
  mapX: number;
  mapY: number;
  allocations: Array<{
    retainerId: string;
    forceName: string;
    rosterGroupId?: string;
    soldierType: string;
    men: number;
    armorClass?: number;
    strandedMen?: number;
  }>;
  men: number;
  status: "active" | "completed" | "failed" | "cancelled";
  startedAt?: string;
  durationDays?: number;
  completesAt?: string;
  completedAt?: string;
  resultsViewedAt?: string;
  dismissedAt?: string;
  encounterRoll?: number;
  encounterOccurred?: boolean;
  reactionDisposition?: "Friendly" | "Neutral" | "Hostile" | "";
  reactionModifier?: number;
  reactionRoll?: number;
  adjustedReactionRoll?: number;
  reactionResult?: string;
  attackerCount?: number;
  attackThac0?: number;
  attackRoll?: number;
  attackNeeded?: number;
  attackHit?: boolean;
  attackTargetArmorClass?: number;
  attackTargetSoldierType?: string;
  scoutMoraleRoll?: number;
  scoutMoraleBonus?: number;
  scoutMoralePassed?: boolean;
  attackerMoraleRoll?: number;
  attackerMoraleBonus?: number;
  attackerMoralePassed?: boolean;
  missionOutcome?: string;
  casualtyRoll?: number;
  scoutsKilled?: number;
  serjeantsChecked?: number;
  serjeantsKilled?: number;
  survivors?: number;
  encounterKnownToPlayer?: boolean;
  encounteredInhabitants?: string;
  populationAdded?: number;
  strandedMen?: number;
  promotionFeeGp?: number;
  promotionPaidAt?: string;
  resolvedAt?: string;
};

export type SheetCustomMission = {
  missionId: string;
  characterId: string;
  territoryId: string;
  objective: string;
  missionLocation: string;
  startDate: string;
  durationDays: number;
  completesAt?: string;
  allocations: Array<{
    retainerId: string;
    forceName: string;
    soldierType: string;
    men: number;
  }>;
  men: number;
  officerRetainerId?: string;
  officerName?: string;
  officerRole?: string;
  additionalNotes?: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  discordSentAt?: string;
};

export type SheetTerritoryHex = {
  hexId: string;
  characterId: string;
  territoryId: string;
  hexNumber: string;
  mapX: number;
  mapY: number;
  title?: string;
  contents?: string;
  terrain?: string;
  inhabitants?: string;
  dungeon?: string;
  settlement?: string;
  settlementName?: string;
  details?: string;
  potentialHostileEncounterPopulation?: number;
  reaction?: "Friendly" | "Neutral" | "Hostile" | "";
  hexPopulationValue?: number;
  cerealFields?: number;
  cottonFields?: number;
  pastureFields?: number;
  fieldsInitializedAt?: string;
  fieldCapacity?: number;
  fieldExpansionStartedAt?: string;
  fieldExpansionCompletesAt?: string;
  fieldExpansionCompletedAt?: string;
  farmlandSettlementHexId?: string;
  farmlandStartedAt?: string;
  farmlandCompletesAt?: string;
  farmlandCompletedAt?: string;
  lastPopulationUpdateMonth?: string;
  dmOnlyInformation?: string;
  createdAt: string;
  updatedAt?: string;
  isDiscovered?: boolean;
  dmRevealed?: boolean;
};

export type SheetWalletData = {
  ok: boolean;
  error?: string;
  characterId: string;
  balance: { pp: number; gp: number; sp: number; cp: number };
  transactions: SheetTransaction[];
  recurringExpenses: SheetRecurringExpense[];
};

export type SheetTerritoryStatus = {
  ok: boolean;
  error?: string;
  characterId: string;
  retainers: SheetRetainer[];
  territories: SheetTerritory[];
  scoutingMissions: SheetScoutingMission[];
  customMissions: SheetCustomMission[];
  territoryHexes: SheetTerritoryHex[];
};

export type SheetSyncTab = "wallet" | "journal" | "retainers" | "territories";

export type SheetTabSyncRevisions = {
  wallet: number;
  journal: number;
  retainers: number;
  territories: number;
};

export type SheetBootstrap = {
  loadedTabs?: SheetSyncTab[];
  ok: boolean;
  error?: string;
  campaignName: string;
  coinWeightPerPound: number;
  discordWebhookConfigured: boolean;
  currentPlayer: SheetPlayer;
  players: SheetPlayer[];
  permissions: {
    isDm: boolean;
    territories: boolean;
    retainers: boolean;
    playerManagement: boolean;
  };
  customMissions?: SheetCustomMission[];
  characters: SheetCharacter[];
  selectedCharacterId: string;
  balance: { pp: number; gp: number; sp: number; cp: number };
  transactions: SheetTransaction[];
  territories: SheetTerritory[];
  managedTerritories?: SheetTerritory[];
  retainers: SheetRetainer[];
  scoutingMissions: SheetScoutingMission[];
  territoryHexes: SheetTerritoryHex[];
  journal: SheetJournalEntry[];
  recurringExpenses: SheetRecurringExpense[];
};

export type LoginOption = { playerId: string; displayName: string };
export type LoginResult = {
  ok: true;
  mustChangePassword: boolean;
  passwordChangeToken?: string;
  sessionToken?: string;
  currentPlayer?: SheetPlayer;
  players?: SheetPlayer[];
  characters?: SheetCharacter[];
};

export type RegistrationResult = {
  ok: true;
  mustChangePassword: true;
  passwordChangeToken: string;
};

const SCRIPT_URL = isDemoMode ? "https://demo.invalid/sheets" : apiUrl;
function requestSheet(url: string, options?: RequestInit) {
  if (
    apiBackend === "d1" &&
    !isDemoMode &&
    options?.method === "POST" &&
    typeof options.body === "string"
  ) {
    const action = JSON.parse(options.body).action || "";
    if (
      !action.startsWith("auth.") &&
      ![
        "character.create",
        "character.update",
        "character.delete",
        "journal.create",
        "journal.update",
        "journal.delete",
        "wallet.backup.save",
        "wallet.backup.load",
        "territory.hex.upsert",
        "tab.push",
      ].includes(action)
    )
      return withD1Command(options, (next) =>
        requestCampaign(url, next, fetch),
      );
  }
  return requestCampaign(url, options, isDemoMode ? demoRequest : fetch);
}
const ACCESS_KEY =
  apiBackend === "sheets"
    ? import.meta.env.VITE_PCM_ACCESS_KEY?.trim() || ""
    : "";
const SESSION_KEY = "pcm-session-token";
const BOOTSTRAP_CACHE_PREFIX = "pcm-bootstrap-cache:v1:";
const BOOTSTRAP_CACHE_LATEST_PREFIX = "pcm-bootstrap-cache-latest:v1:";
const SHARED_ROSTER_CACHE_PREFIX = "pcm-shared-roster:v2:";
const BOOTSTRAP_CACHE_VERSION = 1;

type BootstrapCacheEnvelope = {
  version: number;
  sessionFingerprint: string;
  playerId: string;
  characterId: string;
  savedAt: string;
  data: SheetBootstrap;
};

function sessionFingerprint(token = getSessionToken()) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function bootstrapCacheKey(
  characterId: string,
  fingerprint = sessionFingerprint(),
) {
  return `${BOOTSTRAP_CACHE_PREFIX}${fingerprint}:${characterId || "none"}`;
}

function latestBootstrapCacheKey(fingerprint = sessionFingerprint()) {
  return `${BOOTSTRAP_CACHE_LATEST_PREFIX}${fingerprint}`;
}

type SharedRosterCache = {
  version: 2;
  sessionFingerprint: string;
  playerId: string;
  savedAt: string;
  currentPlayer: SheetPlayer;
  players: SheetPlayer[];
  characters: SheetCharacter[];
};

export function getDraftScope() {
  return (
    appStorage.getItem("pcm-draft-account") ||
    loadSharedRosterCache()?.currentPlayer.playerId ||
    getSessionToken() ||
    "anonymous"
  );
}

function sharedRosterCacheKey(fingerprint = sessionFingerprint()) {
  return `${SHARED_ROSTER_CACHE_PREFIX}${fingerprint}`;
}

export function loadSharedRosterCache(): {
  currentPlayer: SheetPlayer;
  players: SheetPlayer[];
  characters: SheetCharacter[];
} | null {
  const token = getSessionToken();
  if (!token) return null;
  const fingerprint = sessionFingerprint(token);
  try {
    const raw = appStorage.getItem(sharedRosterCacheKey(fingerprint));
    if (!raw && isDemoMode) {
      const { currentPlayer, players, characters } = getDemoBootstrap();
      return { currentPlayer, players, characters };
    }
    if (!raw) return null;
    const cached = JSON.parse(raw) as SharedRosterCache;
    if (
      cached.version !== 2 ||
      cached.sessionFingerprint !== fingerprint ||
      !cached.currentPlayer?.playerId ||
      cached.playerId !== cached.currentPlayer.playerId ||
      !Array.isArray(cached.players) ||
      !Array.isArray(cached.characters)
    )
      return null;
    return {
      currentPlayer: cached.currentPlayer,
      players: cached.players,
      characters: cached.characters,
    };
  } catch {
    return null;
  }
}

export function saveSharedRosterCache(input: {
  currentPlayer: SheetPlayer;
  players: SheetPlayer[];
  characters: SheetCharacter[];
}) {
  const token = getSessionToken();
  if (!token || !input.currentPlayer?.playerId) return;
  const fingerprint = sessionFingerprint(token);
  const cached: SharedRosterCache = {
    version: 2,
    sessionFingerprint: fingerprint,
    playerId: input.currentPlayer.playerId,
    savedAt: new Date().toISOString(),
    currentPlayer: input.currentPlayer,
    players: input.players || [],
    characters: input.characters || [],
  };
  try {
    appStorage.setItem("pcm-draft-account", input.currentPlayer.playerId);
    appStorage.setItem(
      sharedRosterCacheKey(fingerprint),
      JSON.stringify(cached),
    );
  } catch {
    // Account-roster caching must never prevent the app from working.
  }
}

export function loadCachedSheetData(
  characterId?: string,
): SheetBootstrap | null {
  const token = getSessionToken();
  if (!token) return null;
  const fingerprint = sessionFingerprint(token);
  const resolvedCharacterId =
    characterId ||
    appStorage.getItem(latestBootstrapCacheKey(fingerprint)) ||
    "";
  if (!resolvedCharacterId)
    return isDemoMode ? getDemoBootstrap(characterId) : null;
  try {
    const raw = appStorage.getItem(
      bootstrapCacheKey(resolvedCharacterId, fingerprint),
    );
    if (!raw) return isDemoMode ? getDemoBootstrap(resolvedCharacterId) : null;
    const cached = JSON.parse(raw) as BootstrapCacheEnvelope;
    if (
      cached.version !== BOOTSTRAP_CACHE_VERSION ||
      cached.sessionFingerprint !== fingerprint ||
      cached.characterId !== resolvedCharacterId ||
      !cached.data?.ok ||
      !cached.data.currentPlayer?.playerId ||
      cached.playerId !== cached.data.currentPlayer.playerId
    )
      return null;
    normalizeSheetResponse(cached.data);
    validateResponse(
      "bootstrap",
      cached.data,
      resolvedCharacterId === "none" ? undefined : resolvedCharacterId,
    );
    const sharedRoster = loadSharedRosterCache();
    return sharedRoster
      ? {
          ...cached.data,
          currentPlayer: sharedRoster.currentPlayer,
          players: sharedRoster.players,
          characters: sharedRoster.characters,
        }
      : cached.data;
  } catch {
    return null;
  }
}

export function saveCachedSheetData(data: SheetBootstrap, makeLatest = true) {
  const token = getSessionToken();
  const characterId = data.selectedCharacterId || "none";
  if (!token || !data.ok || !data.currentPlayer?.playerId) return;
  const fingerprint = sessionFingerprint(token);
  const envelope: BootstrapCacheEnvelope = {
    version: BOOTSTRAP_CACHE_VERSION,
    sessionFingerprint: fingerprint,
    playerId: data.currentPlayer.playerId,
    characterId,
    savedAt: new Date().toISOString(),
    data,
  };
  try {
    appStorage.setItem(
      bootstrapCacheKey(characterId, fingerprint),
      JSON.stringify(envelope),
    );
    if (makeLatest)
      appStorage.setItem(latestBootstrapCacheKey(fingerprint), characterId);
  } catch {
    // A full or unavailable cache must never prevent the live app from working.
  }
}

export function clearBootstrapCache() {
  for (let index = appStorage.length - 1; index >= 0; index -= 1) {
    const key = appStorage.key(index);
    if (
      key?.startsWith(BOOTSTRAP_CACHE_PREFIX) ||
      key?.startsWith(BOOTSTRAP_CACHE_LATEST_PREFIX) ||
      key?.startsWith(SHARED_ROSTER_CACHE_PREFIX)
    ) {
      appStorage.removeItem(key);
    }
  }
}

export function getSessionToken() {
  return isDemoMode ? "demo-session" : appStorage.getItem(SESSION_KEY) || "";
}

export function clearSession() {
  clearDataIssues(diagnosticsScope(getSessionToken()));
  try {
    appStorage.setItem("pcm-draft-account", getDraftScope());
  } catch {
    /* Storage feedback preserves an in-memory rescue copy. */
  }
  cancelAllReads();
  appStorage.removeItem(SESSION_KEY);
  clearBootstrapCache();
}

function saveSessionToken(token: string) {
  appStorage.setItem(SESSION_KEY, token);
}

export function hasSheetsConnection() {
  return Boolean(SCRIPT_URL);
}

export async function loadTerritoryStatus(
  characterId: string,
  fresh = false,
): Promise<SheetTerritoryStatus> {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  if (!characterId) throw new Error("Select a character first.");

  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "territory-status");
  // A read after a mutation must not join an older in-flight status request.
  if (fresh) url.searchParams.set("afterMutation", crypto.randomUUID());
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("sessionToken", getSessionToken());
  url.searchParams.set("characterId", characterId);
  url.searchParams.set("_", String(Date.now()));

  const response = await requestSheet(url.toString(), {
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = (await response.json()) as SheetTerritoryStatus;
  if (!data.ok)
    throw new Error(data.error || "Could not refresh territory status.");
  return data;
}

export async function loadJournalData(characterId: string): Promise<{
  ok: true;
  characterId: string;
  journal: SheetJournalEntry[];
}> {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  if (!characterId) throw new Error("Select a character first.");

  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "journal-status");
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("characterId", characterId);
  url.searchParams.set("sessionToken", getSessionToken());
  url.searchParams.set("_", String(Date.now()));

  const response = await requestSheet(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Campaign API returned ${response.status}.`);
  }
  return data;
}

export async function loadRetainerData(characterId: string): Promise<{
  ok: true;
  characterId: string;
  retainers: SheetRetainer[];
}> {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  if (!characterId) throw new Error("Select a character first.");

  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "retainer-status");
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("characterId", characterId);
  url.searchParams.set("sessionToken", getSessionToken());
  url.searchParams.set("_", String(Date.now()));

  const response = await requestSheet(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "Could not refresh retainers.");
  }
  return data;
}

export async function loadWalletData(
  characterId: string,
): Promise<SheetWalletData> {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  if (!characterId) throw new Error("Select a character first.");

  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "wallet");
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("sessionToken", getSessionToken());
  url.searchParams.set("characterId", characterId);
  url.searchParams.set("_", String(Date.now()));

  const response = await requestSheet(url.toString(), {
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = (await response.json()) as SheetWalletData;
  if (!data.ok) throw new Error(data.error || "Could not load wallet data.");
  return data;
}

export async function loadTabSyncRevisions(
  characterId: string,
): Promise<SheetTabSyncRevisions> {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  if (!characterId) throw new Error("Select a character first.");

  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "sync-revisions");
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("sessionToken", getSessionToken());
  url.searchParams.set("characterId", characterId);
  url.searchParams.set("_", String(Date.now()));

  const response = await requestSheet(url.toString(), {
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = await response.json();
  if (!data.ok)
    throw new Error(data.error || "Could not load tab sync revisions.");
  return data.revisions as SheetTabSyncRevisions;
}

export async function loadSheetData(
  characterId?: string,
): Promise<SheetBootstrap> {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");

  const requestSession = getSessionToken();
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "bootstrap");
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("sessionToken", getSessionToken());
  if (characterId) url.searchParams.set("characterId", characterId);
  // Apps Script GET responses may be cached by the browser or an intermediary.
  // Bootstrap data must always reflect mutations that just completed.
  url.searchParams.set("_", String(Date.now()));

  const response = await requestSheet(url.toString(), {
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = (await response.json()) as SheetBootstrap;
  if (!data.ok)
    throw new Error(data.error || "Could not load Google Sheets data.");
  if (getSessionToken() === requestSession) saveCachedSheetData(data, false);
  return data;
}

async function postSheetAction<T>(
  action: string,
  payload: Record<string, unknown>,
) {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  const response = await requestSheet(SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      ...payload,
      action,
      accessKey: ACCESS_KEY,
      sessionToken: getSessionToken(),
    }),
  });
  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = await response.json();
  if (!data.ok)
    throw new Error(data.error || "Could not update Google Sheets.");
  return data as T;
}

export async function loadAccountRoster() {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  const requestSession = getSessionToken();
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "account-roster");
  url.searchParams.set("sessionToken", getSessionToken());
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  url.searchParams.set("_", String(Date.now()));
  const response = await requestSheet(url.toString(), {
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = await response.json();
  if (!data.ok)
    throw new Error(data.error || "Could not load the account roster.");
  const result = data as {
    ok: true;
    currentPlayer: SheetPlayer;
    players: SheetPlayer[];
    characters: SheetCharacter[];
  };
  if (getSessionToken() === requestSession)
    saveSharedRosterCache({
      currentPlayer: result.currentPlayer,
      players: result.players || [],
      characters: result.characters || [],
    });
  return result;
}

export async function loadPlayerRoster() {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "player-roster");
  url.searchParams.set("sessionToken", getSessionToken());
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  const response = await requestSheet(url.toString(), { redirect: "follow" });
  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Could not refresh players.");
  return data as {
    ok: true;
    currentPlayer: SheetPlayer;
    players: SheetPlayer[];
    characters: SheetCharacter[];
  };
}

export async function loadLoginOptions() {
  if (!SCRIPT_URL) throw new Error("Campaign API URL is not configured.");
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "auth.options");
  if (ACCESS_KEY) url.searchParams.set("accessKey", ACCESS_KEY);
  const response = await requestSheet(url.toString(), { redirect: "follow" });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Could not load players.");
  return data.players as LoginOption[];
}

export async function login(input: {
  playerId: string;
  email: string;
  password: string;
}) {
  const result = await postSheetAction<LoginResult>("auth.login", input);
  if (result.sessionToken) {
    saveSessionToken(result.sessionToken);
    if (result.currentPlayer) {
      saveSharedRosterCache({
        currentPlayer: result.currentPlayer,
        players: result.players || [],
        characters: result.characters || [],
      });
    }
  }
  return result;
}

export async function registerPlayer(input: {
  displayName: string;
  email: string;
  setupPassword: string;
}) {
  return postSheetAction<RegistrationResult>("auth.register", input);
}

export async function changeInitialPassword(input: {
  passwordChangeToken: string;
  newPassword: string;
  recoveryQuestion: string;
  recoveryAnswer: string;
}) {
  const result = await postSheetAction<{
    ok: true;
    sessionToken: string;
    currentPlayer: SheetPlayer;
    players: SheetPlayer[];
    characters: SheetCharacter[];
  }>("auth.password.change", input);
  saveSessionToken(result.sessionToken);
  saveSharedRosterCache({
    currentPlayer: result.currentPlayer,
    players: result.players || [],
    characters: result.characters || [],
  });
  return result;
}

export async function loadRecoveryQuestion(input: {
  playerId: string;
  email: string;
}) {
  return postSheetAction<{ ok: true; recoveryQuestion: string }>(
    "auth.recovery.question",
    input,
  );
}

export async function resetForgottenPassword(input: {
  playerId: string;
  email: string;
  recoveryAnswer: string;
  newPassword: string;
}) {
  return postSheetAction<{ ok: true }>("auth.recovery.reset", input);
}

export async function logout() {
  try {
    await postSheetAction<{ ok: true }>("auth.logout", {});
  } finally {
    clearSession();
  }
}

export async function markTabAuthoritative(input: {
  characterId: string;
  tab: SheetSyncTab;
}) {
  return postSheetAction<{
    ok: true;
    tab: SheetSyncTab;
    revision: number;
    updatedAt: string;
  }>("tab.push", input);
}

export async function updateCampaignName(campaignName: string) {
  return postSheetAction<{ ok: true; campaignName: string }>(
    "campaign.update",
    {
      campaignName,
    },
  );
}

export async function updatePlayerAccess(input: {
  targetPlayerId: string;
  territoriesEnabled: boolean;
}) {
  return postSheetAction<{ ok: true; player: SheetPlayer }>(
    "player.access.update",
    input,
  );
}

export async function updateDiscordWebhook(
  targetPlayerId: string,
  webhookUrl: string,
) {
  return postSheetAction<{ ok: true; configured: boolean }>(
    "discord.webhook.update",
    {
      targetPlayerId,
      webhookUrl,
    },
  );
}

export async function updateCharacterDiscordThread(input: {
  characterId: string;
  threadId: string;
}) {
  return postSheetAction<{ ok: true; character: SheetCharacter }>(
    "discord.thread.update",
    input,
  );
}

export async function sendJournalEntryToDiscord(input: {
  characterId: string;
  entryId: string;
}) {
  return postSheetAction<{ ok: true; messagesSent: number }>(
    "journal.discord.send",
    input,
  );
}

export async function saveSheetTransaction(input: {
  characterId: string;
  label: string;
  type: "income" | "expense";
  pp: number;
  gp: number;
  sp: number;
  cp: number;
  note?: string;
  preserveSigns?: boolean;
  clientMutationId?: string;
}) {
  if (!SCRIPT_URL) return null;

  const response = await requestSheet(SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "transaction.create",
      accessKey: ACCESS_KEY,
      sessionToken: getSessionToken(),
      characterId: input.characterId,
      label: input.label,
      type: input.type,
      pp: input.pp,
      gp: input.gp,
      sp: input.sp,
      cp: input.cp,
      note: input.note || "",
      preserveSigns: Boolean(input.preserveSigns),
      clientMutationId: input.clientMutationId || "",
    }),
  });

  if (!response.ok)
    throw new Error(`Campaign API returned ${response.status}.`);
  const data = await response.json();
  if (!data.ok)
    throw new Error(data.error || "Could not save the transaction.");
  return data.transaction as SheetTransaction;
}

export async function backupLocalWallet(input: {
  characterId: string;
  clientMutationId?: string;
  expectedBackupId?: string;
  transactions: Array<Record<string, unknown>>;
  recurringExpenses: Array<Record<string, unknown>>;
}) {
  return postSheetAction<{
    ok: true;
    characterId: string;
    backedUpAt: string;
    backupId?: string;
    isLatest?: boolean;
    transactionCount: number;
    recurringExpenseCount: number;
  }>("wallet.backup.save", {
    ...input,
    clientMutationId: input.clientMutationId || crypto.randomUUID(),
  });
}

export async function loadLocalWalletBackup(characterId: string) {
  return postSheetAction<{
    ok: true;
    characterId: string;
    backedUpAt: string;
    backupId?: string;
    transactions: Array<Record<string, unknown>>;
    recurringExpenses: Array<Record<string, unknown>>;
  }>("wallet.backup.load", { characterId });
}

export async function deleteSheetTransaction(input: {
  characterId: string;
  transactionId: string;
}) {
  return postSheetAction<{ ok: true; transactionId: string }>(
    "transaction.delete",
    input,
  );
}

export async function saveRecurringExpense(input: {
  characterId: string;
  label: string;
  frequency: "weekly" | "monthly" | "annually";
  startDate: string;
  pp: number;
  gp: number;
  sp: number;
  cp: number;
  note?: string;
}) {
  return postSheetAction<{ ok: true; schedule: SheetRecurringExpense }>(
    "recurring.create",
    input,
  );
}

export async function cancelRecurringExpense(
  characterId: string,
  scheduleId: string,
) {
  return postSheetAction<{
    ok: true;
    scheduleId: string;
    sourceType?: string;
    sourceId?: string;
  }>("recurring.cancel", {
    characterId,
    scheduleId,
  });
}

export async function updateRecurringExpense(input: {
  characterId: string;
  scheduleId: string;
  label: string;
  frequency: "weekly" | "monthly" | "annually";
  startDate: string;
  pp: number;
  gp: number;
  sp: number;
  cp: number;
  note?: string;
}) {
  return postSheetAction<{ ok: true; schedule: SheetRecurringExpense }>(
    "recurring.update",
    input,
  );
}

export async function saveRetainer(input: {
  characterId: string;
  clientMutationId?: string;
  type: "individual" | "force";
  name: string;
  role: string;
  level?: number | "";
  amount: number;
  costCoin: "pp" | "gp" | "sp" | "cp";
  wageFrequency: "weekly" | "monthly" | "annually";
  hiringDate?: string;
  men?: number | "";
  roster?: FightingForceGroup[];
  clericFightingForce?: boolean;
}) {
  return postSheetAction<{
    ok: true;
    retainer: SheetRetainer;
    schedule: SheetRecurringExpense | null;
  }>("retainer.create", input);
}

export async function updateRetainer(input: {
  characterId: string;
  retainerId: string;
  expectedUpdatedAt?: string;
  type: "individual" | "force";
  name: string;
  role: string;
  level?: number | "";
  amount: number;
  costCoin: "pp" | "gp" | "sp" | "cp";
  wageFrequency: "weekly" | "monthly" | "annually";
  hiringDate?: string;
  men?: number | "";
  roster?: FightingForceGroup[];
  clericFightingForce?: boolean;
}) {
  return postSheetAction<{
    ok: true;
    retainer: SheetRetainer;
    schedule: SheetRecurringExpense | null;
  }>("retainer.update", input);
}

export async function deleteRetainer(
  characterId: string,
  retainerId: string,
  expectedUpdatedAt?: string,
) {
  return postSheetAction<{ ok: true; retainerId: string }>("retainer.delete", {
    characterId,
    retainerId,
    expectedUpdatedAt,
  });
}

export async function saveTerritory(input: {
  characterId: string;
  name: string;
  hexNumber?: string;
  scoutingWebhookUrl?: string;
}) {
  return postSheetAction<{ ok: true; territory: SheetTerritory }>(
    "territory.create",
    input,
  );
}

export async function updateTerritory(input: {
  characterId: string;
  territoryId: string;
  name: string;
  hexNumber?: string;
  scoutingWebhookUrl?: string;
}) {
  return postSheetAction<{ ok: true; territory: SheetTerritory }>(
    "territory.update",
    input,
  );
}

export async function deleteTerritory(
  characterId: string,
  territoryId: string,
) {
  return postSheetAction<{ ok: true; deletedTerritoryId: string }>(
    "territory.delete",
    {
      characterId,
      territoryId,
    },
  );
}

export async function uploadTerritoryMap(input: {
  characterId: string;
  territoryId: string;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  return postSheetAction<{ ok: true; territory: SheetTerritory }>(
    "territory.map.upload",
    input,
  );
}

export async function uploadTerritoryPoiMap(input: {
  characterId: string;
  territoryId: string;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  return postSheetAction<{ ok: true; territory: SheetTerritory }>(
    "territory.poi-map.upload",
    input,
  );
}

export type TerritoryWorkbookRow = {
  hexNumber: string;
  terrain: string;
  inhabitants: string;
  dungeon: string;
  settlement: string;
  settlementName: string;
  details: string;
  potentialHostileEncounterPopulation: number;
  reaction: string;
  hexPopulationValue: number;
  dmOnlyInformation: string;
};

export async function importTerritoryWorkbook(input: {
  characterId: string;
  territoryId: string;
  fileName: string;
  mimeType: string;
  base64: string;
  rows: TerritoryWorkbookRow[];
}) {
  return postSheetAction<{
    ok: true;
    territory: SheetTerritory;
    hexes: SheetTerritoryHex[];
  }>("territory.workbook.import", input);
}

export async function uploadCharacterPortrait(input: {
  characterId: string;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  return postSheetAction<{ ok: true; character: SheetCharacter }>(
    "character.portrait.upload",
    input,
  );
}

export async function deleteCharacterPortrait(characterId: string) {
  return postSheetAction<{ ok: true; character: SheetCharacter }>(
    "character.portrait.delete",
    { characterId },
  );
}

export async function notifyScoutingMissionStarted(input: {
  characterId: string;
  territoryId: string;
  clientMissionId: string;
  hexNumber: string;
  mapX: number;
  mapY: number;
  allocations: Array<{
    retainerId: string;
    rosterGroupId?: string;
    soldierType: string;
    men: number;
  }>;
  startedAt: string;
  durationDays: number;
  completesAt: string;
}) {
  return postSheetAction<{ ok: true; duplicatePrevented?: boolean }>(
    "scouting.notify-start",
    input,
  );
}

export async function startScoutingMission(input: {
  characterId: string;
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
  clientMissionId?: string;
  startedAt?: string;
  durationDays?: number;
}) {
  return postSheetAction<{
    ok: true;
    mission: SheetScoutingMission;
    affectedRetainers?: SheetRetainer[];
    territoryPopulation?: { territoryId: string; population: number };
  }>("scouting.start", input);
}

export async function createCustomMission(input: {
  characterId: string;
  clientMutationId?: string;
  territoryId: string;
  objective: string;
  missionLocation: string;
  startDate: string;
  durationDays: number;
  allocations: Array<{ retainerId: string; soldierType: string; men: number }>;
  officerRetainerId?: string;
  additionalNotes?: string;
}) {
  return postSheetAction<{ ok: true; mission: SheetCustomMission }>(
    "mission.custom.create",
    input,
  );
}

export async function completeDueScoutingMission(input: {
  characterId: string;
  missionId: string;
}) {
  return postSheetAction<{
    ok: true;
    mission: SheetScoutingMission;
    affectedRetainers?: SheetRetainer[];
    territoryPopulation?: { territoryId: string; population: number };
  }>("scouting.complete-due", input);
}

export async function completeScoutingMissionForTesting(input: {
  characterId: string;
  missionId: string;
}) {
  return postSheetAction<{ ok: true; mission: SheetScoutingMission }>(
    "scouting.complete-test",
    input,
  );
}

export async function promoteScoutingSerjeants(input: {
  characterId: string;
  missionId: string;
  walletBalance: { pp: number; gp: number; sp: number; cp: number };
}) {
  return postSheetAction<{
    ok: true;
    mission: SheetScoutingMission;
    transaction: SheetTransaction;
  }>("scouting.promote-serjeants", input);
}

export async function viewScoutingMissionResults(input: {
  characterId: string;
  missionId: string;
}) {
  return postSheetAction<{ ok: true; mission: SheetScoutingMission }>(
    "scouting.view-results",
    input,
  );
}

export async function dismissScoutingMission(input: {
  characterId: string;
  missionId: string;
}) {
  return postSheetAction<{ ok: true; mission: SheetScoutingMission }>(
    "scouting.dismiss",
    input,
  );
}

export async function upsertTerritoryHex(input: {
  characterId: string;
  territoryId: string;
  hexNumber: string;
  mapX: number;
  mapY: number;
  title?: string;
  contents?: string;
  dmRevealed?: boolean;
  revealOnly?: boolean;
  expectedUpdatedAt?: string;
}) {
  return postSheetAction<{ ok: true; hex: SheetTerritoryHex }>(
    "territory.hex.upsert",
    input,
  );
}

export async function saveTerritoryManagement(input: {
  characterId: string;
  territoryId: string;
  population: number;
  assets: Array<{
    type: string;
    name: string;
    quantity: number;
    notes?: string;
  }>;
}) {
  return postSheetAction<{ ok: true; territory: SheetTerritory }>(
    "territory.management.update",
    input,
  );
}

export async function saveTerritoryFieldAllocation(input: {
  characterId: string;
  territoryId: string;
  hexId: string;
  cerealFields: number;
  cottonFields: number;
  pastureFields: number;
}) {
  return postSheetAction<{ ok: true; hex: SheetTerritoryHex }>(
    "territory.fields.update",
    input,
  );
}

export async function startSettlementFieldExpansion(input: {
  characterId: string;
  territoryId: string;
  hexId: string;
  walletBalance: { pp: number; gp: number; sp: number; cp: number };
}) {
  return postSheetAction<{
    ok: true;
    hex: SheetTerritoryHex;
    transaction: SheetTransaction;
  }>("territory.fields.expand", input);
}

export async function startFarmlandDevelopment(input: {
  characterId: string;
  territoryId: string;
  plainsHexId: string;
  settlementHexId: string;
  walletBalance: { pp: number; gp: number; sp: number; cp: number };
}) {
  return postSheetAction<{
    ok: true;
    plainsHex: SheetTerritoryHex;
    settlementHex: SheetTerritoryHex;
    transaction: SheetTransaction;
  }>("territory.farmland.start", input);
}

export async function rollTerritoryRecruitment(input: {
  characterId: string;
  territoryId: string;
}) {
  return postSheetAction<{
    ok: true;
    offer: TerritoryRecruitmentOffer;
    consumed?: boolean;
  }>("territory.recruitment.roll", input);
}

export async function completeTerritoryRecruitment(input: {
  characterId: string;
  territoryId: string;
  offerId: string;
  forceId?: string;
  newForceName?: string;
  chosenSoldierType?: string;
  equipment: Array<{
    name: string;
    quantityPerSoldier: number;
    amount: number;
    coin: string;
  }>;
  walletBalance: { pp: number; gp: number; sp: number; cp: number };
}) {
  return postSheetAction<{
    ok: true;
    offer: TerritoryRecruitmentOffer;
    retainer: SheetRetainer;
    schedule: SheetRecurringExpense;
    transaction: SheetTransaction;
  }>("territory.recruitment.complete", input);
}

export async function denyTerritoryRecruitment(input: {
  characterId: string;
  territoryId: string;
  offerId: string;
}) {
  return postSheetAction<{ ok: true; offer: TerritoryRecruitmentOffer }>(
    "territory.recruitment.deny",
    input,
  );
}

export async function resetTerritoryRecruitment(input: {
  characterId: string;
  territoryId: string;
}) {
  return postSheetAction<{ ok: true; resetCount: number }>(
    "territory.recruitment.reset",
    input,
  );
}

export async function saveSheetCharacter(input: {
  playerName: string;
  targetPlayerId?: string;
  name: string;
  className: string;
  level: number;
  clientMutationId?: string;
}) {
  const payload = {
    playerName: input.playerName,
    targetPlayerId: input.targetPlayerId || "",
    name: input.name,
    class: input.className,
    level: input.level,
  };
  const key = `pcm-character-create:v1:${getDraftScope()}`;
  const fingerprint = JSON.stringify(payload);
  let mutationId = input.clientMutationId;
  if (apiBackend === "d1" && !isDemoMode && !mutationId) {
    let pending: { fingerprint: string; mutationId: string } | undefined;
    try {
      pending = JSON.parse(appStorage.getItem(key) || "null");
    } catch {
      /* Replace an unreadable retry record before sending. */
    }
    mutationId =
      pending?.fingerprint === fingerprint &&
      typeof pending.mutationId === "string"
        ? pending.mutationId
        : crypto.randomUUID();
    appStorage.setItem(key, JSON.stringify({ fingerprint, mutationId }));
  }
  const data = await postSheetAction<{ ok: true; character: SheetCharacter }>(
    "character.create",
    { ...payload, clientMutationId: mutationId },
  );
  if (apiBackend === "d1" && !isDemoMode && mutationId) {
    try {
      if (
        JSON.parse(appStorage.getItem(key) || "null")?.mutationId === mutationId
      )
        appStorage.removeItem(key);
    } catch {
      /* A confirmed request remains safe to retry with its original ID. */
    }
  }
  return data.character;
}

export async function updateSheetCharacter(input: {
  characterId: string;
  name: string;
  className: string;
  level: number;
  expectedVersion?: number;
}) {
  if (
    apiBackend === "d1" &&
    !isDemoMode &&
    !Number.isSafeInteger(input.expectedVersion)
  )
    throw new AppError(
      "rejected",
      "Refresh the character roster before saving these changes.",
    );
  const result = await postSheetAction<{ ok: true; character: SheetCharacter }>(
    "character.update",
    {
      characterId: input.characterId,
      name: input.name,
      class: input.className,
      level: input.level,
      expectedVersion: input.expectedVersion,
    },
  );
  return result.character;
}

export async function deleteSheetCharacter(
  characterId: string,
  expectedVersion?: number,
) {
  if (
    apiBackend === "d1" &&
    !isDemoMode &&
    !Number.isSafeInteger(expectedVersion)
  )
    throw new AppError(
      "rejected",
      "Refresh the character roster before deleting this character.",
    );
  return postSheetAction<{ ok: true; deletedCharacterId: string }>(
    "character.delete",
    { characterId, expectedVersion },
  );
}

export async function saveJournalEntry(input: {
  characterId: string;
  clientMutationId?: string;
  title: string;
  tags: string[];
  notes: string;
}) {
  const result = await postSheetAction<{ ok: true; entry: SheetJournalEntry }>(
    "journal.create",
    {
      characterId: input.characterId,
      clientMutationId: input.clientMutationId,
      title: input.title,
      category: input.tags.join(", "),
      notes: input.notes,
    },
  );
  return result.entry;
}

export async function updateJournalEntry(input: {
  expectedUpdatedAt?: string;
  entryId: string;
  characterId: string;
  title: string;
  tags: string[];
  notes: string;
}) {
  const result = await postSheetAction<{ ok: true; entry: SheetJournalEntry }>(
    "journal.update",
    {
      expectedUpdatedAt: input.expectedUpdatedAt,
      entryId: input.entryId,
      characterId: input.characterId,
      title: input.title,
      category: input.tags.join(", "),
      notes: input.notes,
    },
  );
  return result.entry;
}

export async function deleteJournalEntry(input: {
  expectedUpdatedAt?: string;
  entryId: string;
  characterId: string;
}) {
  return postSheetAction<{ ok: true; deletedEntryId: string }>(
    "journal.delete",
    input,
  );
}
