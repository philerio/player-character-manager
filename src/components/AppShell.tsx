import { DataDiagnostics } from "./DataDiagnostics";
import {
  ResourceFeedback,
  CharacterLoadingIndicator,
  WorkflowStatus,
  StorageFeedback,
  ActionFailureFeedback,
} from "./DataFeedback";
import { useAccountCommands } from "../app/useAccountCommands";
import { territoryActions } from "../app/territoryActions";
import { useTerritoryCommands } from "../app/useTerritoryCommands";
import { demoRole, isDemoMode } from "../app/runtime";
import { resetDemo } from "../app/storage";

import {
  ChevronDown,
  Menu,
  Pencil,
  Plus,
  Shield,
  Sword,
  UserRound,
} from "lucide-react";

import { hasSheetsConnection } from "../google-sheets-api";

import {
  PortraitViewer,
  LoginScreen,
  FirstPasswordScreen,
  EditCharacterModal,
  DeleteCharacterModal,
} from "./AccountViews";
import {
  CharacterModal,
  WalletView,
  RecurringExpensesModal,
  FullLedgerModal,
  TransactionModal,
  PurchaseModal,
} from "./WalletViews";
import { TerritoriesView, TerritoryModal } from "./TerritoryViews";
import {
  JournalView,
  JournalEntryModal,
  RetainersView,
  RetainerModal,
  PlayerManagementView,
} from "./CampaignViews";

import type { useAppController } from "../app/useAppController";

export function AppShell({
  controller,
}: {
  controller: ReturnType<typeof useAppController>;
}) {
  const {
    onSaveFirstPassword,
    onLogin,
    onRegister,
    onResetPassword,
    onSignOut,
    onSendJournal,
    onLoadRecoveryQuestion,
  } = useAccountCommands(controller);
  const {
    onRecruitmentComplete,
    onFieldAllocationSaved,
    onTitheChanged,
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
  } = useTerritoryCommands(controller);
  const {
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
  } = controller;
  const characterBusy =
    background.refreshing ||
    rosterRefreshing ||
    retainerSyncing ||
    territorySyncing ||
    journalSyncing ||
    profileSyncing;
  const characterError =
    background.error ||
    retainerSyncError ||
    territorySyncError ||
    journalSyncError ||
    profileSyncError;
  const characterProgress = retainerSyncing
    ? retainerProgress
    : territorySyncing
      ? territoryProgress
      : journalSyncing
        ? journalProgress
        : background.progress;
  const characterStatus = selectedCharacterId ? (
    <WorkflowStatus
      compact
      confirmed={Object.values(background.resources).every(
        (state) => state.status === "ready",
      )}
      online={background.online}
      busy={characterBusy}
      phase={background.phase}
      error={characterError}
      pending={retainerDraftDirty || territoryDraftDirty || journalDraftDirty}
      dm={permissions.isDm && !dmOwnsSelectedCharacter}
      progress={characterProgress}
      refresh={syncWholeProfile}
    />
  ) : null;
  if (hasSheetsConnection() && !authenticated) {
    return passwordChangeToken ? (
      <FirstPasswordScreen onSave={onSaveFirstPassword} />
    ) : (
      <LoginScreen
        players={loginOptions}
        optionsStatus={loginOptionsStatus}
        optionsError={loginOptionsError}
        onRetryOptions={retryLoginOptions}
        onLogin={onLogin}
        onRegister={onRegister}
        onLoadRecoveryQuestion={onLoadRecoveryQuestion}
        onResetPassword={onResetPassword}
      />
    );
  }

  return (
    <main className="app-shell">
      {isDemoMode && (
        <aside className="demo-banner" aria-label="Demo mode">
          <span>
            Demo: {demoRole === "dm" ? "Dungeon Master" : "Player"}. Changes
            stay in this browser.
          </span>
          <a href="?demo=player">Player demo</a>
          <a href="?demo=dm">DM demo</a>
          <button type="button" onClick={resetDemo}>
            Reset demo
          </button>
        </aside>
      )}
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
              onBlur={(event) =>
                void saveCampaignName(event.currentTarget.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setEditingCampaignName(false);
              }}
            />
          ) : (
            <button
              className={
                permissions.isDm ? "campaign-name editable" : "campaign-name"
              }
              disabled={!permissions.isDm}
              title={
                permissions.isDm ? "Click to edit campaign name" : undefined
              }
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
                <img
                  src={selectedCharacter.portraitUrl}
                  alt={`${selectedCharacter.name} portrait`}
                />
              </button>
            ) : (
              <div className="character-crest" aria-hidden="true">
                <Sword size={22} />
              </div>
            )}
            <div className="character-heading">
              <button
                className="character-button"
                aria-label={selectedCharacter?.name || "Choose character"}
                aria-expanded={characterMenu}
                onClick={() => setCharacterMenu((open) => !open)}
              >
                <span className="character-selector-label">
                  <span>{selectedCharacter?.name || "Choose character"}</span>
                  {characterBusy && (
                    <CharacterLoadingIndicator
                      name={selectedCharacter?.name || "selected character"}
                      progress={characterProgress}
                    />
                  )}
                  {!characterBusy && characterError && (
                    <span className="character-status-hint">Action needed</span>
                  )}
                </span>
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
            {characterMenu &&
              (permissions.isDm ? (
                <div className="character-menu dm-character-menu">
                  {characterStatus}
                  <DataDiagnostics characterId={selectedCharacterId} />
                  {selectedCharacter && hasSheetsConnection() && (
                    <div className="character-menu-sync-header">
                      <div className="character-menu-sync-name">
                        <strong>{selectedCharacter.name}</strong>
                        <span>
                          {selectedCharacter.class} · Level{" "}
                          {selectedCharacter.level}
                        </span>
                      </div>
                      <button
                        className={`character-sync-button ${profileHasUnsyncedChanges ? "has-changes" : ""}`}
                        type="button"
                        disabled={
                          profileSyncing ||
                          (permissions.isDm && !dmOwnsSelectedCharacter)
                        }
                        title={
                          permissions.isDm && !dmOwnsSelectedCharacter
                            ? "Campaign data refreshes in the background. Use Refresh Player Data to explicitly replace a local DM working copy."
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
                        {profileSyncing ? "Refreshing…" : "Refresh now"}
                      </button>
                    </div>
                  )}
                  {characterPlayers.map((player) => {
                    const playerCharacters = characters.filter(
                      (character) => character.playerId === player.playerId,
                    );
                    const expanded = expandedPlayerId === player.playerId;
                    return (
                      <div
                        className="dm-player-character-group"
                        key={player.playerId}
                      >
                        <button
                          className="dm-player-button"
                          type="button"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedPlayerId(expanded ? "" : player.playerId)
                          }
                        >
                          <span>
                            <strong>
                              {player.displayName || "Unnamed player"}
                            </strong>
                            <small>
                              {playerCharacters.length} character
                              {playerCharacters.length === 1 ? "" : "s"}
                            </small>
                          </span>
                          <ChevronDown size={17} />
                        </button>
                        {expanded && (
                          <div className="dm-player-characters">
                            {playerCharacters.length ? (
                              playerCharacters.map((character) => {
                                const selected =
                                  character.characterId === selectedCharacterId;
                                return (
                                  <div
                                    className={
                                      selected
                                        ? "character-menu-row selected"
                                        : "character-menu-row"
                                    }
                                    key={character.characterId}
                                  >
                                    <button
                                      className="character-menu-select"
                                      type="button"
                                      onClick={() =>
                                        void selectCharacter(
                                          character.characterId,
                                        )
                                      }
                                    >
                                      <strong>{character.name}</strong>
                                      <span>
                                        {character.class} · Level{" "}
                                        {character.level}
                                      </span>
                                    </button>
                                  </div>
                                );
                              })
                            ) : (
                              <p>No characters</p>
                            )}
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
                  {characterStatus}
                  {selectedCharacter && hasSheetsConnection() && (
                    <div className="character-menu-sync-header">
                      <div className="character-menu-sync-name">
                        <strong>{selectedCharacter.name}</strong>
                        <span>
                          {selectedCharacter.class} · Level{" "}
                          {selectedCharacter.level}
                        </span>
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
                        {profileSyncing ? "Refreshing…" : "Refresh now"}
                      </button>
                    </div>
                  )}
                  {characters.map((character) => {
                    const selected =
                      character.characterId === selectedCharacterId;
                    return (
                      <div
                        className={
                          selected
                            ? "character-menu-row selected"
                            : "character-menu-row"
                        }
                        key={character.characterId}
                      >
                        <button
                          className="character-menu-select"
                          type="button"
                          onClick={() =>
                            void selectCharacter(character.characterId)
                          }
                        >
                          <strong>{character.name}</strong>
                          <span>
                            {character.class} · Level {character.level}
                          </span>
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
                        title={
                          rosterRefreshError ||
                          "Reload your character roster from the campaign Sheet"
                        }
                        onClick={() =>
                          void refreshRoster().catch(() => undefined)
                        }
                      >
                        {rosterRefreshing ? "Refreshing…" : "Refresh Roster"}
                      </button>
                      {rosterRefreshError && (
                        <p className="form-error" role="alert">
                          {rosterRefreshError}
                        </p>
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
              ))}
          </div>

          <div className="topbar-actions">
            <div className="player-chip">
              <UserRound size={21} />
              <span>
                {isDemoMode
                  ? "Demo data"
                  : !background.online
                    ? "Offline · Local copy"
                    : background.refreshing
                      ? "Refreshing campaign…"
                      : background.error
                        ? "Campaign unavailable"
                        : "Saved working copy"}
              </span>
            </div>
            {hasSheetsConnection() && !isDemoMode && (
              <button className="sign-out-button" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </div>
        </header>

        <div className="page-content">
          <StorageFeedback />
          <ActionFailureFeedback />
          {characterError && !characterMenu && (
            <div className="data-error-note" role="alert">
              <span>{characterError}</span>
              <button
                className="secondary-action"
                onClick={() => setCharacterMenu(true)}
              >
                Open character status
              </button>
            </div>
          )}
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
              backupEnabled={Boolean(
                selectedCharacter && hasSheetsConnection(),
              )}
              backupBusy={walletBackupBusy}
              backupMessage={walletBackupMessage}
              backupError={walletBackupError}
              onBackup={backUpCurrentWallet}
              onRestore={restoreCurrentWalletBackup}
            />
          )}
          {section === "territories" && (
            <ResourceFeedback
              name="territories"
              state={background.resources.territories}
              retry={() => background.retryResource("territories")}
            >
              <TerritoriesView
                actions={territoryActions}
                retainersReady={background.resources.retainers.hasData}
                dataFresh={background.resources.territories.status === "ready"}
                territories={territories}
                fightingForces={retainers.filter(
                  (item) => item.type === "force",
                )}
                officerRetainers={retainers.filter(
                  (item) => item.type === "individual",
                )}
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
                onRecruitmentComplete={onRecruitmentComplete}
                onFieldAllocationSaved={onFieldAllocationSaved}
                onTitheChanged={onTitheChanged}
                onAdd={onAdd}
                onEdit={onEdit}
                onRevealHex={onRevealHex}
                onStartScouting={onStartScouting}
                onCreateCustomMission={onCreateCustomMission}
                onCompleteScoutingForTesting={onCompleteScoutingForTesting}
                onPromoteScoutingSerjeants={onPromoteScoutingSerjeants}
                onViewScoutingResults={onViewScoutingResults}
                onDismissScoutingResult={onDismissScoutingResult}
                onSaveHex={onSaveHex}
              />
            </ResourceFeedback>
          )}
          {section === "journal" && (
            <ResourceFeedback
              name="journal"
              state={background.resources.journal}
              retry={() => background.retryResource("journal")}
            >
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
                onSend={onSendJournal}
                isDm={permissions.isDm}
                pushingToSheet={dmTabPushing === "journal"}
                pushToSheetSuccess={dmTabPushSuccess === "journal"}
                onPushToSheet={() => pushDmTabToSheet("journal")}
              />
            </ResourceFeedback>
          )}
          {section === "retainers" && (
            <ResourceFeedback
              name="retainers"
              state={background.resources.retainers}
              retry={() => background.retryResource("retainers")}
            >
              <RetainersView
                dataFresh={background.resources.retainers.status === "ready"}
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
            </ResourceFeedback>
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
              <span>
                {item.id === "player-management" ? "Players" : item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {modal &&
        (["retainer", "recurring-expenses"].includes(modal) &&
        !background.resources.retainers.hasData ? (
          <div className="modal-backdrop">
            <div className="modal">
              <ResourceFeedback
                name="retainers"
                state={background.resources.retainers}
                retry={() => background.retryResource("retainers")}
              >
                {null}
              </ResourceFeedback>
              <button onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        ) : modal === "character" && !rosterReady ? (
          <div className="modal-backdrop">
            <div className="modal">
              <h2>
                {rosterRefreshing
                  ? "Loading players…"
                  : "Player roster unavailable"}
              </h2>
              <p>
                {rosterRefreshError ||
                  "Load the campaign roster before choosing a player."}
              </p>
              <button onClick={() => void refreshRoster().catch(() => {})}>
                Retry loading players
              </button>
              <button onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        ) : modal === "character" ? (
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
              setRetainerKind(
                retainer.type === "force" ? "force" : "individual",
              );
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
            onDelete={
              editingJournalEntry ? removeCampaignJournalEntry : undefined
            }
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
        ))}
      {profileSyncSuccess && (!permissions.isDm || dmOwnsSelectedCharacter) && (
        <div
          className="profile-sync-success-toast"
          role="status"
          aria-live="polite"
        >
          <strong>Character synced successfully</strong>
          <span>
            Your latest character data has been synchronized with the campaign
            Sheet.
          </span>
        </div>
      )}
      {dmTabPushSuccess && permissions.isDm && (
        <div
          className="profile-sync-success-toast"
          role="status"
          aria-live="polite"
        >
          <strong>
            {dmTabPushSuccess.charAt(0).toUpperCase() +
              dmTabPushSuccess.slice(1)}{" "}
            pushed to Sheet
          </strong>
          <span>
            The player will receive this tab as authoritative data on their next
            Sync with Sheet.
          </span>
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
