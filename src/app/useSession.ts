import { loadJournalDraft } from "./journalStorage";
import type { AppModal, DataStatus } from "./core";

import { useRef, useState } from "react";
import {
  deleteSheetCharacter,
  loadCachedSheetData,
  saveCachedSheetData,
  loadSharedRosterCache,
  saveSharedRosterCache,
  getSessionToken,
  hasSheetsConnection,
  loadAccountRoster,
  loadPlayerRoster,
  loadSheetData,
  saveSheetCharacter,
  uploadCharacterPortrait,
  deleteCharacterPortrait,
  updateSheetCharacter,
  updateCampaignName,
  updatePlayerAccess,
  updateDiscordWebhook,
  updateCharacterDiscordThread,
  type SheetCharacter,
  type SheetBootstrap,
  type SheetPlayer,
  type SheetJournalEntry,
  type SheetRecurringExpense,
  type SheetRetainer,
  type SheetTerritory,
  type SheetScoutingMission,
  type SheetCustomMission,
  type SheetTerritoryHex,
  type LoginOption,
  type SheetSyncTab,
} from "../google-sheets-api";
import { fileToDataUrl } from "./workbook";
import { loadTerritoryDraft } from "./territoryStorage";
import { loadRetainerDraft } from "./retainerStorage";
import {
  type Transaction,
  type LocalWalletState,
  loadLocalWalletState,
  saveLocalWalletState,
  deleteLocalWalletState,
} from "./wallet";

import type { Dispatch, SetStateAction, RefObject } from "react";

type SessionContext = {
  setEditingCampaignName: Dispatch<SetStateAction<boolean>>;
  selectedCharacter: SheetCharacter | undefined;
  walletLoadedCharacterIdRef: RefObject<string>;
  setPlatinum: Dispatch<SetStateAction<number>>;
  setGold: Dispatch<SetStateAction<number>>;
  setSilver: Dispatch<SetStateAction<number>>;
  setCopper: Dispatch<SetStateAction<number>>;
  setTransactions: Dispatch<SetStateAction<Transaction[]>>;
  setJournalDraftDirty: Dispatch<SetStateAction<boolean>>;
  setJournalEntries: Dispatch<SetStateAction<SheetJournalEntry[]>>;
  setRecurringExpenses: Dispatch<SetStateAction<SheetRecurringExpense[]>>;
  setRetainers: Dispatch<SetStateAction<SheetRetainer[]>>;
  setRetainerDraftDirty: Dispatch<SetStateAction<boolean>>;
  setTerritories: Dispatch<SetStateAction<SheetTerritory[]>>;
  setScoutingMissions: Dispatch<SetStateAction<SheetScoutingMission[]>>;
  setCustomMissions: Dispatch<SetStateAction<SheetCustomMission[]>>;
  setTerritoryHexes: Dispatch<SetStateAction<SheetTerritoryHex[]>>;
  setTerritoryDraftDirty: Dispatch<SetStateAction<boolean>>;
  setCharacterMenu: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<AppModal>>;
  setDataStatus: Dispatch<SetStateAction<DataStatus>>;
  setPortraitViewer: Dispatch<SetStateAction<SheetCharacter | null>>;
  applySheetData: (
    data: SheetBootstrap,
    openEmptyCharacterModal?: boolean,
  ) => void;
};

export function useSession(getContext: () => SessionContext) {
  const [authenticated, setAuthenticated] = useState(() =>
    Boolean(getSessionToken()),
  );
  const [loginOptions, setLoginOptions] = useState<LoginOption[]>([]);
  const [passwordChangeToken, setPasswordChangeToken] = useState("");
  const [characters, setCharacters] = useState<SheetCharacter[]>(
    () => loadSharedRosterCache()?.characters || [],
  );
  const [campaignName, setCampaignName] = useState("Evermoor Campaign");
  const [discordWebhookConfigured, setDiscordWebhookConfigured] =
    useState(false);
  const [players, setPlayers] = useState<SheetPlayer[]>(
    () => loadSharedRosterCache()?.players || [],
  );
  const [currentPlayer, setCurrentPlayer] = useState<SheetPlayer | null>(
    () => loadSharedRosterCache()?.currentPlayer || null,
  );
  const [permissions, setPermissions] = useState({
    isDm: false,
    territories: false,
    retainers: true,
    playerManagement: false,
  });
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const cacheBaseRef = useRef<SheetBootstrap | null>(null);
  const selectedCharacterIdRef = useRef("");
  const characterLoadRequestRef = useRef(0);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState("");
  const [profileLastSyncedAt, setProfileLastSyncedAt] = useState("");
  const [profileSyncSuccess, setProfileSyncSuccess] = useState(false);
  const [rosterReady, setRosterReady] = useState(() =>
    Boolean(loadSharedRosterCache()),
  );
  const [rosterRefreshing, setRosterRefreshing] = useState(false);
  const [rosterRefreshError, setRosterRefreshError] = useState("");
  const [dmTabPushing, setDmTabPushing] = useState<SheetSyncTab | "">("");
  const [dmTabPushSuccess, setDmTabPushSuccess] = useState<SheetSyncTab | "">(
    "",
  );
  const [dmTabPushError, setDmTabPushError] = useState("");

  function accountPermissions(player: SheetPlayer | null | undefined) {
    const isDm = String(player?.role || "").toLowerCase() === "dm";
    return {
      isDm,
      territories: isDm || Boolean(player?.territoriesEnabled),
      retainers: true,
      playerManagement: isDm,
    };
  }

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
    const { setEditingCampaignName } = getContext();

    const trimmedName = nextName.trim();
    setEditingCampaignName(false);
    if (!trimmedName || trimmedName === campaignName) return;
    const result = await updateCampaignName(trimmedName);
    setCampaignName(result.campaignName);
  }

  async function changePlayerAccess(targetPlayerId: string, enabled: boolean) {
    const current = players.find(
      (player) => player.playerId === targetPlayerId,
    );
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

  async function saveDiscordWebhook(
    targetPlayerId: string,
    webhookUrl: string,
  ) {
    const { selectedCharacter } = getContext();

    const result = await updateDiscordWebhook(targetPlayerId, webhookUrl);
    setPlayers((items) =>
      items.map((player) =>
        player.playerId === targetPlayerId
          ? { ...player, discordWebhookConfigured: result.configured }
          : player,
      ),
    );
    setCharacters((items) =>
      items.map((character) =>
        character.playerId === targetPlayerId
          ? {
              ...character,
              discordConfigured: Boolean(
                result.configured && character.discordThreadId,
              ),
            }
          : character,
      ),
    );
    if (selectedCharacter?.playerId === targetPlayerId) {
      setDiscordWebhookConfigured(result.configured);
    }
  }

  async function saveCharacterDiscordThread(
    characterId: string,
    threadId: string,
  ) {
    const result = await updateCharacterDiscordThread({
      characterId,
      threadId,
    });
    setCharacters((items) =>
      items.map((character) =>
        character.characterId === result.character.characterId
          ? result.character
          : character,
      ),
    );
  }

  async function createCharacter(input: {
    playerName: string;
    targetPlayerId?: string;
    name: string;
    className: string;
    level: number;
  }) {
    const {
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
    } = getContext();

    const character = await saveSheetCharacter(input);

    // Character creation is itself the explicit Sheet write. Do NOT follow it
    // with a full bootstrap request: that second request is expensive and can
    // time out even though the character row was created successfully.
    const nextCharacters = [
      ...characters.filter(
        (item) => item.characterId !== character.characterId,
      ),
      character,
    ];

    characterLoadRequestRef.current += 1;
    selectedCharacterIdRef.current = character.characterId;
    setCharacters(nextCharacters);
    setSelectedCharacterId(character.characterId);
    const accountPlayer =
      currentPlayer || loadSharedRosterCache()?.currentPlayer || null;
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
    setJournalDraftDirty(false);
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
    const { selectedCharacter } = getContext();

    if (!selectedCharacter) throw new Error("Select a character first.");
    if (!file.type.startsWith("image/"))
      throw new Error("Choose an image file.");
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Portraits must be 5 MB or smaller.");
    const result = await uploadCharacterPortrait({
      characterId: selectedCharacter.characterId,
      fileName: file.name,
      mimeType: file.type,
      base64: await fileToDataUrl(file),
    });
    setCharacters((items) =>
      items.map((character) =>
        character.characterId === result.character.characterId
          ? result.character
          : character,
      ),
    );
  }

  async function removeCharacterPortrait() {
    const { selectedCharacter, setPortraitViewer } = getContext();

    if (!selectedCharacter?.portraitUrl) return;
    const result = await deleteCharacterPortrait(selectedCharacter.characterId);
    setPortraitViewer(null);
    setCharacters((items) =>
      items.map((character) =>
        character.characterId === result.character.characterId
          ? result.character
          : character,
      ),
    );
  }

  async function selectCharacter(characterId: string) {
    const {
      setCharacterMenu,
      applySheetData,
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
      setDataStatus,
    } = getContext();

    if (characterId === selectedCharacterIdRef.current) {
      setCharacterMenu(false);
      return;
    }

    // Show the saved working copy immediately; the coordinator refreshes this selection in the background.
    characterLoadRequestRef.current += 1;
    selectedCharacterIdRef.current = characterId;
    setSelectedCharacterId(characterId);
    setCharacterMenu(false);
    getContext().setModal(null);
    setProfileSyncError("");
    setProfileSyncSuccess(false);

    const cached = loadCachedSheetData(characterId);
    cacheBaseRef.current = cached;

    if (cached) {
      // Remember the selection immediately even when fresh data needs no network refresh.
      saveCachedSheetData(cached);
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
      setJournalEntries(loadJournalDraft(characterId)?.entries || []);
      setJournalDraftDirty(
        Boolean(loadJournalDraft(characterId)?.operations.length),
      );
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
    setDataStatus(hasSheetsConnection() ? "cached" : "demo");
  }

  async function deleteCharacter() {
    const {
      selectedCharacter,
      setCharacterMenu,
      setModal,
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
      setTerritories,
      setScoutingMissions,
      setCustomMissions,
      setTerritoryHexes,
      setRetainerDraftDirty,
      setTerritoryDraftDirty,
    } = getContext();

    if (!selectedCharacter) return;
    const deletedCharacterId = selectedCharacter.characterId;
    await deleteSheetCharacter(deletedCharacterId);
    deleteLocalWalletState(deletedCharacterId);

    const remainingCharacters = characters.filter(
      (character) => character.characterId !== deletedCharacterId,
    );
    setCharacters(remainingCharacters);
    const accountPlayer =
      currentPlayer || loadSharedRosterCache()?.currentPlayer || null;
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
      setJournalDraftDirty(false);
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
    )
      return;
    cacheBaseRef.current = data;
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
    setRetainers(
      savedRetainerDraft ? savedRetainerDraft.retainers : data.retainers || [],
    );
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

  async function refreshRoster() {
    const { setCharacterMenu, setDataStatus } = getContext();

    if (rosterRefreshing || !hasSheetsConnection()) return;

    setRosterRefreshing(true);
    setRosterRefreshError("");
    try {
      const accountState = await loadAccountRoster();

      setRosterReady(true);
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
        error instanceof Error
          ? error.message
          : "Could not refresh the character roster.",
      );
      throw error;
    } finally {
      setRosterRefreshing(false);
    }
  }

  async function updateCharacter(input: {
    name: string;
    className: string;
    level: number;
  }) {
    const { selectedCharacter, setModal } = getContext();

    if (!selectedCharacter) return;
    const character = await updateSheetCharacter({
      characterId: selectedCharacter.characterId,
      ...input,
    });
    setCharacters((current) => {
      const nextCharacters = current.map((item) =>
        item.characterId === character.characterId
          ? { ...item, ...character }
          : item,
      );
      const accountPlayer =
        currentPlayer || loadSharedRosterCache()?.currentPlayer || null;
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
  return {
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
  };
}
