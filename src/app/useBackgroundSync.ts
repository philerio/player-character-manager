import { loadJournalDraft } from "./journalStorage";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  clearSession,
  loadCachedSheetData,
  loadSharedRosterCache,
  saveCachedSheetData,
  loadAccountRoster,
  loadJournalData,
  loadRetainerData,
  loadTerritoryStatus,
  loadTabSyncRevisions,
  type SheetBootstrap,
  type SheetCharacter,
  type SheetPlayer,
  type SheetRetainer,
  type SheetTerritory,
  type SheetTerritoryHex,
  type SheetScoutingMission,
  type SheetCustomMission,
  type SheetJournalEntry,
} from "../google-sheets-api";
import { loadRetainerDraft } from "./retainerStorage";
import {
  loadTerritoryDraft,
  clearTerritoryDraft,
  saveTerritoryDraft,
  mergePublishedTerritoryReveals,
} from "./territoryStorage";
import {
  loadAcceptedTabSyncRevisions,
  saveAcceptedTabSyncRevisions,
} from "./syncStorage";
import { hasStorageFailure } from "./storage";
import { cancelCharacterReads } from "./transport";
import { AppError, errorMessage, type SyncProgress } from "./errors";

export type ResourceName = "journal" | "retainers" | "territories";
export type ResourceState = {
  status: "idle" | "loading" | "cached" | "ready" | "error";
  hasData: boolean;
  error: string;
  updatedAt: string;
  conflict?: boolean;
};
export type Resources = Record<ResourceName, ResourceState>;
const blank = (): ResourceState => ({
  status: "idle",
  hasData: false,
  error: "",
  updatedAt: "",
});
const names: ResourceName[] = ["journal", "retainers", "territories"];
type Context = {
  selectedCharacterIdRef: RefObject<string>;
  characterLoadRequestRef: RefObject<number>;
  cacheBaseRef: RefObject<SheetBootstrap | null>;
  selectedCharacter: SheetCharacter | undefined;
  currentPlayer: SheetPlayer | null;
  permissions: SheetBootstrap["permissions"];
  setRosterReady: Dispatch<SetStateAction<boolean>>;
  setRosterRefreshing: Dispatch<SetStateAction<boolean>>;
  setRosterRefreshError: Dispatch<SetStateAction<string>>;
  setAuthenticated: Dispatch<SetStateAction<boolean>>;
  setCurrentPlayer: Dispatch<SetStateAction<SheetPlayer | null>>;
  setPlayers: Dispatch<SetStateAction<SheetPlayer[]>>;
  setCharacters: Dispatch<SetStateAction<SheetCharacter[]>>;
  setPermissions: Dispatch<SetStateAction<SheetBootstrap["permissions"]>>;
  accountPermissions: (
    player: SheetPlayer | null | undefined,
  ) => SheetBootstrap["permissions"];
  setJournalEntries: Dispatch<SetStateAction<SheetJournalEntry[]>>;
  setRetainers: Dispatch<SetStateAction<SheetRetainer[]>>;
  setTerritories: Dispatch<SetStateAction<SheetTerritory[]>>;
  setManagedTerritories: Dispatch<SetStateAction<SheetTerritory[]>>;
  setScoutingMissions: Dispatch<SetStateAction<SheetScoutingMission[]>>;
  setCustomMissions: Dispatch<SetStateAction<SheetCustomMission[]>>;
  setTerritoryHexes: Dispatch<SetStateAction<SheetTerritoryHex[]>>;
  syncJournalToCampaign: () => Promise<void>;
  syncRetainersToCampaign: (force?: boolean) => Promise<void>;
  syncTerritoryData: () => Promise<void>;
};
export function useBackgroundSync(
  getContext: () => Context,
  {
    characterId,
    authenticated,
    autoSyncAllowed,
    retainerDirty,
    territoryDirty,
    journalDirty,
  }: {
    characterId: string;
    authenticated: boolean;
    autoSyncAllowed: boolean;
    retainerDirty: boolean;
    territoryDirty: boolean;
    journalDirty: boolean;
  },
) {
  const contextRef = useRef(getContext);
  contextRef.current = getContext;
  const [states, setStates] = useState<Record<string, Resources>>({});
  const stateRef = useRef(states);
  stateRef.current = states;
  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [foregroundRefreshing, setForegroundRefreshing] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState("");
  const lock = useRef<Promise<void> | null>(null);
  const generation = useRef(0);
  const lastCheck = useRef(0);
  const lastRosterCheck = useRef(Date.now());
  const ready = useRef(false);
  const update = (
    id: string,
    name: ResourceName,
    patch: Partial<ResourceState>,
  ) =>
    setStates((previous) => {
      const current = previous[id] || {
        journal: blank(),
        retainers: blank(),
        territories: blank(),
      };
      const next = {
        ...previous,
        [id]: {
          ...current,
          [name]: { ...current[name], conflict: false, ...patch },
        },
      };
      stateRef.current = next;
      return next;
    });
  const run = useCallback(
    async ({
      force = false,
      flush = true,
      only,
    }: {
      force?: boolean;
      flush?: boolean;
      only?: ResourceName;
    } = {}): Promise<void> => {
      const ctx = contextRef.current();
      const id = ctx.selectedCharacterIdRef.current;
      if (!authenticated || !id) return;
      if (lock.current) {
        await lock.current;
        if (ctx.selectedCharacterIdRef.current !== id) return;
        return run({ force, flush, only });
      }
      const requestGeneration = generation.current,
        selection = ctx.characterLoadRequestRef.current;
      const current = () =>
        generation.current === requestGeneration &&
        ctx.selectedCharacterIdRef.current === id &&
        ctx.characterLoadRequestRef.current === selection;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setOnline(false);
        setError(
          "Offline. Showing saved data; pending changes will sync when connected.",
        );
        for (const name of names)
          if (!stateRef.current[id]?.[name]?.hasData)
            update(id, name, {
              status: "error",
              error:
                "This data is not available on this device yet. Reconnect to load it.",
            });
        return;
      }
      const work = async () => {
        if (current()) {
          setRefreshing(true);
          setForegroundRefreshing(
            force ||
              names.some((name) => !stateRef.current[id]?.[name]?.hasData),
          );
          setError("");
          setPhase("Checking campaign updates…");
        }
        try {
          const cachedAccount = loadSharedRosterCache();
          const fetchRoster =
            (force && !only) ||
            (!only && Date.now() - lastRosterCheck.current > 120_000) ||
            (!ctx.currentPlayer && !cachedAccount);
          const targets = only ? [only] : names;
          let completed = 0;
          const total = targets.length + 1 + (fetchRoster ? 1 : 0);
          const advance = (steps = 1) => {
            completed += steps;
            if (current())
              setProgress({
                completed,
                total,
                label: `${completed} of ${total} data checks complete`,
              });
          };
          if (current())
            setProgress({
              completed: 0,
              total,
              label: "Checking campaign data",
            });
          if (fetchRoster) ctx.setRosterRefreshing(true);
          // Independent metadata reads share one round trip instead of blocking each other.
          const [accountResult, revisionResult] = await Promise.allSettled([
            fetchRoster ? loadAccountRoster() : Promise.resolve(cachedAccount),
            loadTabSyncRevisions(id),
          ]);
          if (!current()) return;
          if (fetchRoster) ctx.setRosterRefreshing(false);
          if (accountResult.status === "rejected") {
            ctx.setRosterRefreshError(errorMessage(accountResult.reason));
            throw accountResult.reason;
          }
          if (revisionResult.status === "rejected") throw revisionResult.reason;
          const account = accountResult.value;
          let player = ctx.currentPlayer;
          if (account) {
            if (!account.characters.some((row) => row.characterId === id))
              throw new AppError(
                "conflict",
                "This character is no longer in the campaign roster. The local working copy is kept; choose another character or contact the DM.",
              );
            if (!ctx.cacheBaseRef.current) {
              const base: SheetBootstrap = {
                ok: true,
                loadedTabs: [],
                campaignName: "Campaign",
                coinWeightPerPound: 10,
                discordWebhookConfigured: false,
                currentPlayer: account.currentPlayer,
                players: account.players,
                permissions: ctx.accountPermissions(account.currentPlayer),
                characters: account.characters,
                selectedCharacterId: id,
                balance: { pp: 0, gp: 0, sp: 0, cp: 0 },
                transactions: [],
                recurringExpenses: [],
                retainers: [],
                territories: [],
                territoryHexes: [],
                scoutingMissions: [],
                customMissions: [],
                journal: [],
              };
              ctx.cacheBaseRef.current = base;
              saveCachedSheetData(base);
            }
            player = account.currentPlayer;
            if (fetchRoster) {
              ctx.setCurrentPlayer(player);
              ctx.setPlayers(account.players);
              ctx.setCharacters(account.characters);
              ctx.setPermissions(ctx.accountPermissions(player));
              ctx.setRosterReady(true);
              ctx.setRosterRefreshError("");
              lastRosterCheck.current = Date.now();
            }
          }
          const revisions = revisionResult.value;
          advance(fetchRoster ? 2 : 1);
          const accepted = loadAcceptedTabSyncRevisions(id);
          const mayWrite =
            player?.role !== "dm" ||
            ctx.selectedCharacter?.playerId === player?.playerId;
          const failures: string[] = [];
          const syncResource = async (name: ResourceName) => {
            try {
              if (!current()) return;
              const draft =
                name === "retainers"
                  ? loadRetainerDraft(id)
                  : name === "territories"
                    ? loadTerritoryDraft(id)
                    : loadJournalDraft(id);
              const dirty =
                name === "retainers"
                  ? Boolean(draft)
                  : name === "territories"
                    ? Boolean(loadTerritoryDraft(id)?.operations.length)
                    : Boolean(loadJournalDraft(id)?.operations.length);
              if (dirty && revisions[name] > accepted[name]) {
                // Visibility can advance without discarding pending orders or field edits.
                if (name === "territories") {
                  try {
                    const remote = await loadTerritoryStatus(id, true);
                    if (!current()) return;
                    const latest = loadTerritoryDraft(id);
                    if (latest?.operations.length) {
                      const merged = mergePublishedTerritoryReveals(
                        latest,
                        remote.territoryHexes,
                        remote.territories,
                      );
                      if (JSON.stringify(merged) !== JSON.stringify(latest))
                        saveTerritoryDraft(merged);
                      contextRef
                        .current()
                        .setTerritoryHexes(merged.territoryHexes);
                      contextRef.current().setTerritories(merged.territories);
                    }
                  } catch (reason) {
                    if (reason instanceof AppError && reason.code === "session")
                      throw reason;
                    if (!current()) return;
                    const message = errorMessage(reason);
                    update(id, name, { status: "error", error: message });
                    failures.push(message);
                    return;
                  }
                }
                const message =
                  "Campaign data changed while this device had pending edits. Your local edits are preserved. Download your working copy before loading the campaign copy, which replaces those pending edits.";
                update(id, name, {
                  status: "error",
                  error: message,
                  conflict: true,
                });
                failures.push(message);
                return;
              }
              if (
                dirty &&
                flush &&
                mayWrite &&
                !hasStorageFailure() &&
                (force || !stateRef.current[id]?.[name]?.error)
              ) {
                setPhase(`Sending pending ${name} changes…`);
                try {
                  await (name === "retainers"
                    ? ctx.syncRetainersToCampaign()
                    : name === "territories"
                      ? ctx.syncTerritoryData()
                      : ctx.syncJournalToCampaign());
                } catch (reason) {
                  if (reason instanceof AppError && reason.code === "session")
                    throw reason;
                  const message = errorMessage(reason);
                  update(id, name, { status: "error", error: message });
                  failures.push(message);
                  return;
                }
                if (!current()) return;
              }
              const pending =
                name === "retainers"
                  ? Boolean(loadRetainerDraft(id))
                  : name === "territories"
                    ? Boolean(loadTerritoryDraft(id)?.operations.length)
                    : Boolean(loadJournalDraft(id)?.operations.length);
              // Never refresh over a working draft, including edits made while a write was in flight.
              if (pending) return;
              const state = stateRef.current[id]?.[name];
              const stale =
                !state?.updatedAt ||
                Date.now() - new Date(state.updatedAt).getTime() > 120_000;
              if (
                !force &&
                !stale &&
                state?.hasData &&
                revisions[name] <= accepted[name]
              )
                return;
              const draftBefore = JSON.stringify(
                name === "retainers"
                  ? loadRetainerDraft(id)
                  : name === "territories"
                    ? loadTerritoryDraft(id)
                    : loadJournalDraft(id),
              );
              update(id, name, { status: "loading", error: "" });
              setPhase("Refreshing campaign data…");
              try {
                const result =
                  name === "journal"
                    ? await loadJournalData(id)
                    : name === "retainers"
                      ? await loadRetainerData(id)
                      : await loadTerritoryStatus(id, force);
                if (!current()) return;
                const draftAfter = JSON.stringify(
                  name === "retainers"
                    ? loadRetainerDraft(id)
                    : name === "territories"
                      ? loadTerritoryDraft(id)
                      : loadJournalDraft(id),
                );
                if (draftBefore !== draftAfter) {
                  update(id, name, { status: "cached", hasData: true });
                  return;
                }
                const live = contextRef.current();
                let patch: Partial<SheetBootstrap>;
                if (name === "journal") {
                  const journal = (
                    result as Awaited<ReturnType<typeof loadJournalData>>
                  ).journal;
                  live.setJournalEntries(journal);
                  patch = { journal };
                } else if (name === "retainers") {
                  const retainers = (
                    result as Awaited<ReturnType<typeof loadRetainerData>>
                  ).retainers;
                  live.setRetainers(retainers);
                  patch = { retainers };
                } else {
                  const territory = result as Awaited<
                    ReturnType<typeof loadTerritoryStatus>
                  >;
                  // The unchanged draft has no pending operations. Its old
                  // snapshot must not shadow the newly loaded campaign data.
                  clearTerritoryDraft(id);
                  live.setTerritories(territory.territories);
                  live.setScoutingMissions(territory.scoutingMissions);
                  live.setCustomMissions(territory.customMissions || []);
                  live.setTerritoryHexes(territory.territoryHexes);
                  patch = {
                    territories: territory.territories,
                    scoutingMissions: territory.scoutingMissions,
                    customMissions: territory.customMissions || [],
                    territoryHexes: territory.territoryHexes,
                  };
                }
                const base =
                  live.cacheBaseRef.current || loadCachedSheetData(id);
                if (base?.selectedCharacterId === id) {
                  const next = {
                    ...base,
                    ...patch,
                    loadedTabs: [
                      ...new Set([
                        ...(base.loadedTabs ??
                          ([
                            "wallet",
                            "journal",
                            "retainers",
                            "territories",
                          ] as const)),
                        name,
                      ]),
                    ],
                  };
                  live.cacheBaseRef.current = next;
                  saveCachedSheetData(next);
                }
                const latestAccepted = loadAcceptedTabSyncRevisions(id);
                saveAcceptedTabSyncRevisions(id, {
                  ...latestAccepted,
                  [name]: Math.max(latestAccepted[name], revisions[name]),
                });
                update(id, name, {
                  status: "ready",
                  hasData: true,
                  updatedAt: new Date().toISOString(),
                  error: "",
                });
              } catch (reason) {
                if (!current()) return;
                if (reason instanceof AppError && reason.code === "session")
                  throw reason;
                const message = errorMessage(reason);
                update(id, name, { status: "error", error: message });
                failures.push(message);
              }
            } finally {
              advance();
            }
          };
          const hasPending = targets.some((name) =>
            name === "retainers"
              ? Boolean(loadRetainerDraft(id))
              : name === "territories"
                ? Boolean(loadTerritoryDraft(id)?.operations.length)
                : Boolean(loadJournalDraft(id)?.operations.length),
          );
          if (flush && hasPending) {
            // Related writes retain their ordering; only independent reads run together.
            for (const name of targets) await syncResource(name);
          } else {
            const results = await Promise.allSettled(targets.map(syncResource));
            const rejected = results.filter(
              (result): result is PromiseRejectedResult =>
                result.status === "rejected",
            );
            if (rejected.length)
              throw (
                rejected.find(
                  (result) =>
                    result.reason instanceof AppError &&
                    result.reason.code === "session",
                )?.reason || rejected[0].reason
              );
          }
          if (current()) {
            ready.current = true;
            lastCheck.current = Date.now();
            if (failures.length) setError(failures[0]);
          }
        } catch (reason) {
          if (!current()) return;
          if (reason instanceof AppError && reason.code === "cancelled") return;
          const message = errorMessage(reason);
          setError(message);
          if (reason instanceof AppError && reason.code === "session") {
            clearSession();
            ctx.setAuthenticated(false);
          }
          for (const name of names)
            if (!stateRef.current[id]?.[name]?.hasData)
              update(id, name, { status: "error", error: message });
        } finally {
          if (current()) {
            setRefreshing(false);
            setForegroundRefreshing(false);
            setPhase("");
            setProgress(null);
            ctx.setRosterRefreshing(false);
          }
        }
      };
      const promise = work();
      lock.current = promise;
      try {
        await promise;
      } finally {
        if (lock.current === promise) lock.current = null;
      }
    },
    [authenticated],
  );

  useEffect(() => {
    generation.current++;
    ready.current = false;
    lock.current = null;
    setRefreshing(false);
    setForegroundRefreshing(false);
    setProgress(null);
    setError("");
    if (!characterId || !authenticated) return;
    const cache = loadCachedSheetData(characterId);
    const cached = (name: ResourceName) =>
      Boolean(
        cache &&
        (cache.loadedTabs === undefined || cache.loadedTabs.includes(name)),
      );
    const resources: Resources = {
      journal: blank(),
      retainers: blank(),
      territories: blank(),
    };
    for (const name of names) {
      const hasData =
        cached(name) ||
        (name === "retainers" && Boolean(loadRetainerDraft(characterId))) ||
        (name === "territories" && Boolean(loadTerritoryDraft(characterId))) ||
        (name === "journal" && Boolean(loadJournalDraft(characterId)));
      resources[name] = {
        ...blank(),
        hasData,
        status: hasData
          ? stateRef.current[characterId]?.[name]?.status === "ready"
            ? "ready"
            : "cached"
          : "loading",
        updatedAt: cached(name)
          ? stateRef.current[characterId]?.[name]?.updatedAt || ""
          : "",
      };
    }
    setStates((previous) => {
      const next = { ...previous, [characterId]: resources };
      stateRef.current = next;
      return next;
    });
    void run({ flush: false });
    return () => {
      generation.current++;
      cancelCharacterReads(characterId);
    };
  }, [characterId, authenticated, run]);
  useEffect(() => {
    if (
      !characterId ||
      !authenticated ||
      !autoSyncAllowed ||
      refreshing ||
      error ||
      (!retainerDirty && !territoryDirty && !journalDirty)
    )
      return;
    const timer = setTimeout(() => {
      if (ready.current) void run({ flush: true });
    }, 2500);
    return () => clearTimeout(timer);
  }, [
    characterId,
    authenticated,
    autoSyncAllowed,
    retainerDirty,
    territoryDirty,
    journalDirty,
    states,
    refreshing,
    error,
    run,
  ]);
  useEffect(() => {
    const onlineNow = () => {
      setOnline(true);
      void run({ force: true });
    };
    const offlineNow = () => {
      setOnline(false);
    };
    const focus = () => {
      if (
        document.visibilityState !== "hidden" &&
        Date.now() - lastCheck.current > 10_000
      )
        void run();
    };
    window.addEventListener("online", onlineNow);
    window.addEventListener("offline", offlineNow);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = setInterval(focus, 30_000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onlineNow);
      window.removeEventListener("offline", offlineNow);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [run]);
  const confirmResource = (name: ResourceName) => {
    if (!characterId) return;
    update(characterId, name, {
      status: "ready",
      hasData: true,
      error: "",
      updatedAt: new Date().toISOString(),
    });
    setError("");
  };
  const resources = states[characterId] || {
    journal: blank(),
    retainers: blank(),
    territories: blank(),
  };
  return {
    confirmResource,
    resources,
    online,
    refreshing,
    foregroundRefreshing,
    phase,
    progress,
    error:
      error || names.map((name) => resources[name].error).find(Boolean) || "",
    refreshNow: () => run({ force: true }),
    retryResource: (only: ResourceName) => run({ force: true, only }),
  };
}
