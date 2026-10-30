import { apiBackend, isDemoMode } from "./runtime";
import { retainerDraftHasChanges } from "./retainerStorage";
import { loadJournalDraft } from "./journalStorage";
import { useBackgroundSync } from "./useBackgroundSync";
import { AppError, errorMessage } from "./errors";
import type { AppModal, DataStatus } from "./core";
import { useSession } from "./useSession";
import { useWallet } from "./useWallet";
import { useRetainers } from "./useRetainers";
import { useTerritories } from "./useTerritories";
import { useJournal } from "./useJournal";

import { LockKeyhole } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearSession,
  loadCachedSheetData,
  saveCachedSheetData,
  loadSharedRosterCache,
  saveSharedRosterCache,
  hasSheetsConnection,
  loadLoginOptions,
  loadAccountRoster,
  loadSheetData,
  loadTerritoryStatus,
  loadRetainerData,
  loadJournalData,
  loadTabSyncRevisions,
  markTabAuthoritative,
  type SheetCharacter,
  type SheetBootstrap,
  type SheetSyncTab,
} from "../google-sheets-api";
import { type Section } from "./core";
import {
  loadTerritoryDraft,
  clearTerritoryDraft,
  reconcileLocalScoutingTimersWithAuthoritative,
} from "./territoryStorage";
import { loadRetainerDraft, clearRetainerDraft } from "./retainerStorage";
import { loadLocalWalletState, migrateLegacyWalletToLocal } from "./wallet";
import {
  loadAcceptedTabSyncRevisions,
  saveAcceptedTabSyncRevisions,
} from "./syncStorage";
import { navItems } from "./catalog";

export function useAppController() {
  const {
    accountPermissions,
    refreshPlayerRoster,
    saveCampaignName,
    changePlayerAccess,
    saveDiscordWebhook,
    saveCharacterDiscordThread,
    createCharacter,
    saveCharacterPortrait,
    removeCharacterPortrait,
    selectCharacter,
    deleteCharacter,
    refreshRoster,
    updateCharacter,
    authenticated,
    setAuthenticated,
    loginOptions,
    setLoginOptions,
    passwordChangeToken,
    setPasswordChangeToken,
    characters,
    setCharacters,
    campaignName,
    setCampaignName,
    discordWebhookConfigured,
    setDiscordWebhookConfigured,
    players,
    setPlayers,
    currentPlayer,
    setCurrentPlayer,
    permissions,
    setPermissions,
    selectedCharacterId,
    setSelectedCharacterId,
    cacheBaseRef,
    selectedCharacterIdRef,
    characterLoadRequestRef,
    profileSyncing,
    setProfileSyncing,
    profileSyncError,
    setProfileSyncError,
    profileLastSyncedAt,
    setProfileLastSyncedAt,
    profileSyncSuccess,
    setProfileSyncSuccess,
    rosterReady,
    setRosterReady,
    rosterRefreshing,
    setRosterRefreshing,
    rosterRefreshError,
    setRosterRefreshError,
    dmTabPushing,
    setDmTabPushing,
    dmTabPushSuccess,
    setDmTabPushSuccess,
    dmTabPushError,
    setDmTabPushError,
  } = useSession(() => ({
    setEditingCampaignName,
    selectedCharacter,
    walletLoadedCharacterIdRef,
    setPlatinum,
    setGold,
    setSilver,
    setCopper,
    setTransactions,
    setJournalEntries,
    setJournalDraftDirty,
    setRecurringExpenses,
    setRetainers,
    setRetainerDraftDirty,
    setTerritories,
    setScoutingMissions,
    setCustomMissions,
    setTerritoryHexes,
    setTerritoryDraftDirty,
    setCharacterMenu,
    setModal,
    setDataStatus,
    setPortraitViewer,
    applySheetData,
  }));
  const {
    applySystemWalletTransactionLocally,
    recordTransaction,
    deleteWalletTransaction,
    recordPurchase,
    exportCurrentWallet,
    importWalletFile,
    backUpCurrentWallet,
    restoreCurrentWalletBackup,
    cancelSchedule,
    updateSchedule,
    platinum,
    setPlatinum,
    gold,
    setGold,
    silver,
    setSilver,
    copper,
    setCopper,
    transactions,
    setTransactions,
    recurringExpenses,
    setRecurringExpenses,
    walletLoadedCharacterIdRef,
    walletRecovering,
    walletRecoveryError,
    walletBackupConflict,
    retryWalletRecovery,
    walletBackupBusy,
    setWalletBackupBusy,
    walletBackupMessage,
    setWalletBackupMessage,
    walletBackupError,
    setWalletBackupError,
  } = useWallet(
    () => ({
      characterLoadRequestRef,
      selectedCharacterIdRef,
      selectedCharacter,
      setModal,
      setSection,
    }),
    selectedCharacterId,
  );
  const {
    persistLocalRetainers,
    saveRetainerRecord,
    removeRetainerRecord,
    syncRetainersToCampaign,
    refreshRetainersFromCampaign: replaceRetainersFromCampaign,
    retainers,
    setRetainers,
    retainerDraftDirty,
    setRetainerDraftDirty,
    retainerProgress,
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
  } = useRetainers(() => ({
    characterLoadRequestRef,
    selectedCharacter,
    setModal,
    setRecurringExpenses,
    selectedCharacterIdRef,
  }));
  const {
    persistLocalTerritoryState,
    queueTerritoryOperation,
    submitExpiredLocalScoutingTimer,
    syncTerritoryData,
    refreshTerritoryDataFromCampaign: replaceTerritoryDataFromCampaign,
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
    territoryProgress,
    territorySyncing,
    setTerritorySyncing,
    territorySyncError,
    setTerritorySyncError,
    territoryLastSyncedAt,
    setTerritoryLastSyncedAt,
    editingTerritory,
    setEditingTerritory,
    scoutingAutoSubmitInFlightRef,
  } = useTerritories(
    () => ({
      characterLoadRequestRef,
      selectedCharacter,
      selectedCharacterIdRef,
      setRetainers,
      retainerDraftDirty,
      setModal,
      permissions,
      selectedCharacterId,
      cacheBaseRef,
    }),
    { authenticated, selectedCharacterId },
  );
  const {
    persistJournalCache,
    saveCampaignJournalEntry,
    removeCampaignJournalEntry,
    journalDraftDirty,
    setJournalDraftDirty,
    journalSyncing,
    journalSyncError,
    journalProgress,
    syncJournalToCampaign,
    journalEntries,
    setJournalEntries,
    editingJournalEntry,
    setEditingJournalEntry,
  } = useJournal(() => ({
    cacheBaseRef,
    selectedCharacter,
    selectedCharacterIdRef,
    setModal,
  }));

  const [section, setSection] = useState<Section>("wallet");
  const [modal, setModal] = useState<AppModal>(null);
  const [characterMenu, setCharacterMenu] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState("");
  const [editingCampaignName, setEditingCampaignName] = useState(false);
  const [portraitViewer, setPortraitViewer] = useState<SheetCharacter | null>(
    null,
  );
  const [dataStatus, setDataStatus] = useState<DataStatus>(
    hasSheetsConnection() ? "loading" : "demo",
  );

  const selectedCharacter: SheetCharacter | undefined =
    characters.find(
      (character) => character.characterId === selectedCharacterId,
    ) || characters[0];

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
      (left.displayName || left.playerId).localeCompare(
        right.displayName || right.playerId,
      ),
    );
    const knownIds = new Set(knownPlayers.map((player) => player.playerId));
    const missingPlayers = characters
      .filter(
        (character, index, items) =>
          !knownIds.has(character.playerId) &&
          items.findIndex((item) => item.playerId === character.playerId) ===
            index,
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

  const applySheetData = useCallback(
    (data: SheetBootstrap, openEmptyCharacterModal = true) => {
      cacheBaseRef.current = data;
      setRosterReady(true);
      setCharacters(data.characters);
      setCampaignName(data.campaignName || "Evermoor Campaign");
      setDiscordWebhookConfigured(Boolean(data.discordWebhookConfigured));
      setPlayers(data.players || []);
      setCurrentPlayer(data.currentPlayer || null);
      setManagedTerritories(data.managedTerritories || []);
      setPermissions(
        data.permissions || {
          isDm: false,
          territories: false,
          retainers: true,
          playerManagement: false,
        },
      );
      if (data.characters.length) {
        selectedCharacterIdRef.current = data.selectedCharacterId;
        setSelectedCharacterId(data.selectedCharacterId);
        const localWallet =
          apiBackend === "d1" && !isDemoMode
            ? loadLocalWalletState(data.selectedCharacterId)
            : migrateLegacyWalletToLocal(
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
        walletLoadedCharacterIdRef.current = localWallet
          ? data.selectedCharacterId
          : "";
        setPlatinum(localWallet?.balance.pp || 0);
        setGold(localWallet?.balance.gp || 0);
        setSilver(localWallet?.balance.sp || 0);
        setCopper(localWallet?.balance.cp || 0);
        setTransactions(localWallet?.transactions || []);
        setJournalEntries(
          loadJournalDraft(data.selectedCharacterId)?.entries ||
            data.journal ||
            [],
        );
        setJournalDraftDirty(
          Boolean(
            loadJournalDraft(data.selectedCharacterId)?.operations.length,
          ),
        );
        setRecurringExpenses(localWallet?.recurringExpenses || []);
        const savedRetainerDraft = loadRetainerDraft(data.selectedCharacterId);
        if (savedRetainerDraft) {
          setRetainers(savedRetainerDraft.retainers);
          setRetainerDraftDirty(true);
        } else {
          setRetainers(data.retainers || []);
          setRetainerDraftDirty(false);
        }
        const savedTerritoryDraft = loadTerritoryDraft(
          data.selectedCharacterId,
        );
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
    },
    [],
  );

  useEffect(() => {
    if (!authenticated) return;

    // Hydrate the saved working copy immediately; background reads preserve it while refreshing.
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
    setRosterReady(Boolean(accountState));
    setCharacters(accountCharacters);
    setPlayers(accountState?.players || []);
    setCurrentPlayer(accountState?.currentPlayer || null);
    setPermissions(accountPermissions(accountState?.currentPlayer || null));
    setSelectedCharacterId(initialCharacterId);
    const initialLocalWallet = initialCharacterId
      ? loadLocalWalletState(initialCharacterId)
      : null;
    walletLoadedCharacterIdRef.current =
      apiBackend === "d1" && !isDemoMode && !initialLocalWallet
        ? ""
        : initialCharacterId;
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
          setRosterReady(true);
          setCurrentPlayer(roster.currentPlayer);
          setPlayers(roster.players || []);
          setCharacters(roster.characters || []);
          setPermissions(accountPermissions(roster.currentPlayer));
          const firstCharacterId = roster.characters?.[0]?.characterId || "";
          selectedCharacterIdRef.current = firstCharacterId;
          setSelectedCharacterId(firstCharacterId);
          const recoveredWallet = firstCharacterId
            ? loadLocalWalletState(firstCharacterId)
            : null;
          walletLoadedCharacterIdRef.current =
            apiBackend === "d1" && !isDemoMode && !recoveredWallet
              ? ""
              : firstCharacterId;
          setPlatinum(recoveredWallet?.balance.pp || 0);
          setGold(recoveredWallet?.balance.gp || 0);
          setSilver(recoveredWallet?.balance.sp || 0);
          setCopper(recoveredWallet?.balance.cp || 0);
          setTransactions(recoveredWallet?.transactions || []);
          setRecurringExpenses(recoveredWallet?.recurringExpenses || []);
          setDataStatus("connected");
        })
        .catch((error) => {
          setRosterRefreshError(errorMessage(error));
          if (String(error).toLowerCase().includes("session")) {
            clearSession();
            setAuthenticated(false);
          }
        });
    }
  }, [authenticated, applySheetData]);

  useEffect(() => {
    if (
      (dataStatus !== "connected" && dataStatus !== "cached") ||
      !cacheBaseRef.current
    )
      return;
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
  }, [
    dataStatus,
    campaignName,
    discordWebhookConfigured,
    players,
    permissions,
    characters,
    selectedCharacterId,
    platinum,
    gold,
    silver,
    copper,
    journalEntries,
    recurringExpenses,
    retainers,
    territories,
    managedTerritories,
    scoutingMissions,
    customMissions,
    territoryHexes,
  ]);

  const [loginOptionsStatus, setLoginOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [loginOptionsError, setLoginOptionsError] = useState("");
  const [loginRetry, setLoginRetry] = useState(0);
  useEffect(() => {
    // Only the legacy Sheets service requires a public player-name lookup.
    if (apiBackend === "d1" || !hasSheetsConnection() || authenticated) return;
    let cancelled = false;
    setLoginOptionsStatus("loading");
    setLoginOptionsError("");
    void loadLoginOptions()
      .then((options) => {
        if (!cancelled) {
          setLoginOptions(options);
          setLoginOptionsStatus("ready");
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setLoginOptionsStatus("error");
          setLoginOptionsError(errorMessage(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, loginRetry]);
  const retryLoginOptions = () => setLoginRetry((value) => value + 1);

  const coinWeight = useMemo(
    () => ((platinum + gold + silver + copper) / 10).toFixed(1),
    [platinum, gold, silver, copper],
  );
  const profileHasUnsyncedChanges =
    retainerDraftDirty || territoryDraftDirty || journalDraftDirty;
  const visibleNavItems = useMemo(() => {
    const items = navItems.filter((item) => {
      if (item.id === "territories") return permissions.territories;
      if (item.id === "retainers") return permissions.retainers;
      return true;
    });
    if (permissions.playerManagement) {
      items.push({
        id: "player-management",
        label: "Player Management",
        icon: LockKeyhole,
      });
    }
    return items;
  }, [permissions]);

  async function pushDmTabToSheet(tab: SheetSyncTab) {
    if (!selectedCharacter || !permissions.isDm || dmTabPushing) return;
    const characterId = selectedCharacter.characterId;

    setDmTabPushing(tab);
    setDmTabPushError("");
    setDmTabPushSuccess("");

    try {
      if (tab === "wallet") {
        throw new Error(
          "Wallet data is local-only and is never sent to the Sheet.",
        );
      } else if (tab === "retainers") {
        await syncRetainersToCampaign(true);
      } else if (tab === "journal") {
        await syncJournalToCampaign();
      } else if (tab === "territories") {
        if (loadTerritoryDraft(characterId)?.operations.length) {
          await syncTerritoryData();
        }
      }

      const newerEdits = () =>
        tab === "retainers"
          ? Boolean(
              loadRetainerDraft(characterId) &&
              retainerDraftHasChanges(loadRetainerDraft(characterId)!),
            )
          : tab === "territories"
            ? Boolean(loadTerritoryDraft(characterId)?.operations.length)
            : tab === "journal"
              ? Boolean(loadJournalDraft(characterId)?.operations.length)
              : false;
      if (newerEdits())
        throw new AppError(
          "conflict",
          "Changes made during the push remain saved locally. Push again after editing is finished to publish them.",
        );
      const pushed = await markTabAuthoritative({ characterId, tab });
      const accepted = loadAcceptedTabSyncRevisions(characterId);
      saveAcceptedTabSyncRevisions(characterId, {
        ...accepted,
        [tab]: pushed.revision,
      });

      if (selectedCharacterIdRef.current !== characterId) return;
      if (newerEdits())
        throw new AppError(
          "conflict",
          "Confirmed changes were published; newer edits remain saved locally for the next push.",
        );
      setDmTabPushSuccess(tab);
      window.setTimeout(() => {
        setDmTabPushSuccess((current) => (current === tab ? "" : current));
      }, 4000);
      setDataStatus("connected");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Could not push ${tab} to the Sheet.`;
      setDmTabPushError(message);
      throw error;
    } finally {
      setDmTabPushing("");
    }
  }

  const background = useBackgroundSync(
    () => ({
      selectedCharacterIdRef,
      characterLoadRequestRef,
      cacheBaseRef,
      selectedCharacter,
      currentPlayer,
      permissions,
      setAuthenticated,
      setCurrentPlayer,
      setPlayers,
      setCharacters,
      setPermissions,
      accountPermissions,
      setJournalEntries,
      setRetainers,
      setTerritories,
      setManagedTerritories,
      setScoutingMissions,
      setCustomMissions,
      setTerritoryHexes,
      syncRetainersToCampaign,
      syncTerritoryData,
      syncJournalToCampaign,
      setRosterReady,
      setRosterRefreshing,
      setRosterRefreshError,
    }),
    {
      characterId: selectedCharacterId,
      authenticated,
      autoSyncAllowed: !permissions.isDm || dmOwnsSelectedCharacter,
      retainerDirty: retainerDraftDirty,
      territoryDirty: territoryDraftDirty,
      journalDirty: journalDraftDirty,
    },
  );
  async function refreshRetainersFromCampaign() {
    const id = selectedCharacterIdRef.current,
      generation = characterLoadRequestRef.current;
    await replaceRetainersFromCampaign();
    if (
      selectedCharacterIdRef.current === id &&
      characterLoadRequestRef.current === generation &&
      !loadRetainerDraft(id)
    )
      background.confirmResource("retainers");
  }
  async function refreshTerritoryDataFromCampaign() {
    const id = selectedCharacterIdRef.current,
      generation = characterLoadRequestRef.current;
    await replaceTerritoryDataFromCampaign();
    if (
      selectedCharacterIdRef.current === id &&
      characterLoadRequestRef.current === generation &&
      !loadTerritoryDraft(id)?.operations.length
    )
      background.confirmResource("territories");
  }
  async function syncWholeProfile() {
    setProfileSyncing(true);
    setProfileSyncError("");
    setProfileSyncSuccess(false);
    try {
      await background.refreshNow();
    } finally {
      setProfileSyncing(false);
    }
  }

  return {
    background,
    retainerProgress,
    territoryProgress,
    journalProgress,
    journalSyncing,
    journalSyncError,
    journalDraftDirty,
    rosterReady,
    loginOptionsStatus,
    loginOptionsError,
    retryLoginOptions,
    authenticated,
    passwordChangeToken,
    setCurrentPlayer,
    currentPlayer,
    setPlayers,
    players,
    setCharacters,
    characters,
    selectedCharacterIdRef,
    setSelectedCharacterId,
    setPasswordChangeToken,
    setAuthenticated,
    loginOptions,
    setPermissions,
    accountPermissions,
    visibleNavItems,
    section,
    setSection,
    permissions,
    editingCampaignName,
    campaignName,
    saveCampaignName,
    setEditingCampaignName,
    selectedCharacter,
    setPortraitViewer,
    characterMenu,
    setCharacterMenu,
    setModal,
    profileHasUnsyncedChanges,
    profileSyncing,
    dmOwnsSelectedCharacter,
    profileSyncError,
    profileSyncSuccess,
    syncWholeProfile,
    characterPlayers,
    expandedPlayerId,
    setExpandedPlayerId,
    selectedCharacterId,
    selectCharacter,
    rosterRefreshing,
    rosterRefreshError,
    refreshRoster,
    dataStatus,
    platinum,
    gold,
    silver,
    copper,
    coinWeight,
    transactions,
    walletReady: Boolean(
      selectedCharacterId &&
      walletLoadedCharacterIdRef.current === selectedCharacterId,
    ),
    walletRecovering,
    walletRecoveryError,
    walletBackupConflict,
    retryWalletRecovery,
    walletBackupBusy,
    walletBackupMessage,
    walletBackupError,
    exportCurrentWallet,
    importWalletFile,
    backUpCurrentWallet,
    restoreCurrentWalletBackup,
    territories,
    retainers,
    scoutingMissions,
    customMissions,
    territoryHexes,
    interfaceIsDm,
    territoryDraftDirty,
    territorySyncing,
    territorySyncError,
    territoryLastSyncedAt,
    refreshTerritoryDataFromCampaign,
    dmTabPushing,
    dmTabPushSuccess,
    pushDmTabToSheet,
    applySystemWalletTransactionLocally,
    setRecurringExpenses,
    retainerDraftDirty,
    setRetainers,
    setRetainerDraftDirty,
    setTerritories,
    queueTerritoryOperation,
    persistLocalTerritoryState,
    setEditingTerritory,
    setScoutingMissions,
    setTerritoryHexes,
    journalEntries,
    setEditingJournalEntry,
    setEditingRetainer,
    setRetainerKind,
    removeRetainerRecord,
    retainerSyncing,
    retainerSyncError,
    retainerLastSyncedAt,
    refreshRetainersFromCampaign,
    discordWebhookConfigured,
    refreshPlayerRoster,
    changePlayerAccess,
    saveDiscordWebhook,
    saveCharacterDiscordThread,
    modal,
    createCharacter,
    updateCharacter,
    saveCharacterPortrait,
    removeCharacterPortrait,
    deleteCharacter,
    deleteWalletTransaction,
    recurringExpenses,
    cancelSchedule,
    updateSchedule,
    recordPurchase,
    editingJournalEntry,
    saveCampaignJournalEntry,
    removeCampaignJournalEntry,
    retainerKind,
    editingRetainer,
    saveRetainerRecord,
    editingTerritory,
    saveTerritoryRecord,
    deleteTerritoryRecord,
    recordTransaction,
    portraitViewer,
  };
}
