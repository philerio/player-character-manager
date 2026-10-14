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
    walletBackupBusy,
    setWalletBackupBusy,
    walletBackupMessage,
    setWalletBackupMessage,
    walletBackupError,
    setWalletBackupError,
  } = useWallet(
    () => ({ selectedCharacterIdRef, selectedCharacter, setModal, setSection }),
    selectedCharacterId,
  );
  const {
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
  } = useRetainers(() => ({
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
  } = useTerritories(
    () => ({
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
    const initialLocalWallet = initialCharacterId
      ? loadLocalWalletState(initialCharacterId)
      : null;
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
          const recoveredWallet = firstCharacterId
            ? loadLocalWalletState(firstCharacterId)
            : null;
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

  useEffect(() => {
    if (!hasSheetsConnection() || authenticated) return;
    loadLoginOptions()
      .then(setLoginOptions)
      .catch(() => setLoginOptions([]));
  }, [authenticated]);

  const coinWeight = useMemo(
    () => ((platinum + gold + silver + copper) / 10).toFixed(1),
    [platinum, gold, silver, copper],
  );
  const profileHasUnsyncedChanges = retainerDraftDirty || territoryDraftDirty;
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
      } else if (tab === "territories") {
        if (loadTerritoryDraft(characterId)?.operations.length) {
          await syncTerritoryData();
        }
      }

      const pushed = await markTabAuthoritative({ characterId, tab });
      const accepted = loadAcceptedTabSyncRevisions(characterId);
      saveAcceptedTabSyncRevisions(characterId, {
        ...accepted,
        [tab]: pushed.revision,
      });

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

  async function syncWholeProfile() {
    if (!selectedCharacter || profileSyncing) return;

    const characterId = selectedCharacter.characterId;
    const readOnlyDmRefresh = permissions.isDm && !dmOwnsSelectedCharacter;

    if (
      readOnlyDmRefresh &&
      (retainerDraftDirty || territoryDraftDirty) &&
      !window.confirm(
        "Sync Character on another player's character is read-only and will refresh from the workbook. " +
          "Unsynced Retainer/Territory changes on this device will be discarded. Continue?",
      )
    )
      return;

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
        if (selectedCharacterIdRef.current !== characterId) return;
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
      if (selectedCharacterIdRef.current !== characterId) return;
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
      if (
        !cacheBaseRef.current ||
        cacheBaseRef.current.selectedCharacterId !== characterId
      ) {
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
      if (selectedCharacterIdRef.current !== characterId) return;
      const acceptedRevisions = loadAcceptedTabSyncRevisions(characterId);
      const dmOverrides = {
        wallet: false,
        journal: remoteRevisions.journal > acceptedRevisions.journal,
        retainers: remoteRevisions.retainers > acceptedRevisions.retainers,
        territories:
          remoteRevisions.territories > acceptedRevisions.territories,
      };

      let overrideData: SheetBootstrap | null = null;
      if (
        dmOverrides.journal ||
        dmOverrides.retainers ||
        dmOverrides.territories
      ) {
        overrideData = await loadSheetData(characterId);
        if (selectedCharacterIdRef.current !== characterId) return;
      }

      // Journal is Sheet-backed. Refresh it on every explicit Sync Character
      // instead of only when a DM revision changed, otherwise entries created
      // on another device or lost from local cache never return.
      const refreshedJournal =
        dmOverrides.journal && overrideData
          ? { journal: overrideData.journal || [] }
          : await loadJournalData(characterId);
      if (selectedCharacterIdRef.current !== characterId) return;
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
        if (selectedCharacterIdRef.current !== characterId) return;
      }

      if (!dmOverrides.retainers) {
        const refreshedRetainers = await loadRetainerData(characterId);
        if (selectedCharacterIdRef.current !== characterId) return;
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
          if (selectedCharacterIdRef.current !== characterId) return;
        } else {
          // Territory is Sheet-backed. An explicit Sync Character must always
          // refresh it, even when no DM revision changed. This is especially
          // important for DM-owned characters whose local cache may be absent
          // or stale after reopening.
          const refreshedTerritoryData = await loadTerritoryStatus(characterId);
          if (selectedCharacterIdRef.current !== characterId) return;
          clearTerritoryDraft(characterId);
          reconcileLocalScoutingTimersWithAuthoritative(
            characterId,
            refreshedTerritoryData.scoutingMissions || [],
          );
          const refreshedTerritories = refreshedTerritoryData.territories || [];
          const refreshedScouting =
            refreshedTerritoryData.scoutingMissions || [];
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
      const message =
        error instanceof Error ? error.message : "Could not sync this profile.";
      setProfileSyncError(message);
      throw error;
    } finally {
      setProfileSyncing(false);
    }
  }

  return {
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
    walletBackupBusy,
    walletBackupMessage,
    walletBackupError,
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
