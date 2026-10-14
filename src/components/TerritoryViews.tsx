import { type TapRevealPoint, TAP_REVEAL_HEXES, TAP_REVEAL_HEX_WIDTH, TAP_REVEAL_HEX_HEIGHT, TAP_REVEAL_CENTER_HEX, tapRevealHexPolygon, nearestTapRevealHex } from "../app/territoryMapGrid";
import { territoryHexKey } from "../app/territoryRules";
export { territoryHexKey } from "../app/territoryRules";
import type { TerritoryActions } from "../app/territoryActions";
import { CalendarClock, Castle, Coins, Landmark, Leaf, LockKeyhole, Pencil, Pickaxe, Plus, ScrollText, Shield, Sprout, Sword, Timer, Trash2, UsersRound, X, Upload } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { rollTerritoryRecruitment, completeTerritoryRecruitment, denyTerritoryRecruitment, resetTerritoryRecruitment, startSettlementFieldExpansion, startFarmlandDevelopment, type SheetCharacter, type SheetTransaction, type SheetRecurringExpense, type SheetRetainer, type SheetTerritory, type SheetScoutingMission, type SheetCustomMission, type SheetTerritoryHex, type TerritoryWorkbookRow, type TerritoryRecruitmentOffer } from "../google-sheets-api";
import { HEX_I2_CARDS, type HexCardDetails } from "../hex-i2-data";
import { type CoinBalances, coinValueInCopper, domainTaxRateSp, formatCalendarDate } from "../app/core";
import { readTerritoryWorkbook } from "../app/workbook";
import { purseValueInCopper } from "../app/wallet";
import { SOLDIER_MONTHLY_WAGES_GP, equipmentCatalog, RECRUIT_ARMOR_AC, RECRUIT_SHIELDS, recruitEquipmentRules, recruitWeaponOptions, recruitGearValidation } from "../app/catalog";

export function TerritoriesView({
  actions,
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
  actions: TerritoryActions;
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
  const [unlockMapOnOpen, setUnlockMapOnOpen] = useState(false);
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
              {(territory.mapUrl || territory.mapFileId) ? (
                <button
                  className="territory-map-hit-area"
                  onClick={() => { setUnlockMapOnOpen(false); setViewingMap(territory); }}
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
                {(territory.mapUrl || territory.mapFileId) && <>
                  <button className="secondary-action" onClick={() => { setUnlockMapOnOpen(false); setViewingMap(territory); }} aria-label={`View map of ${territory.name}`}><Landmark size={16} /> View Map</button>
                  {isDm && <button className="secondary-action" onClick={() => { setUnlockMapOnOpen(true); setViewingMap(territory); }} aria-label={`Unlock hexes for ${territory.name}`}><LockKeyhole size={16} /> Unlock Hexes</button>}
                </>}
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
      {!isDm && territories.some((territory) => !territory.mapUrl && !territory.mapFileId) && (
        <p className="territory-map-note">Only the Dungeon Master can upload territory maps.</p>
      )}
      {viewingMap && (
        <TapRevealTerritoryMap
          key={viewingMap.territoryId}
          startUnlocking={unlockMapOnOpen}
          onPushToSheet={isDm ? onPushToSheet : undefined}
          pushingToSheet={pushingToSheet}
          hasUnsyncedChanges={hasUnsyncedChanges}
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
          actions={actions}
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
          }}
          onRecruitmentComplete={onRecruitmentComplete}
          hasUnsyncedChanges={hasUnsyncedChanges}
        />
      )}
      {recruitingTerritory && (
        <TerritoryManagementPanel
          actions={actions}
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

function TerritoryManagementPanel({ actions, mode, territory, character, characterId, fightingForces, balances, isDm, territoryHexes, onFieldAllocationSaved, onClose, onSaved, onRecruitmentComplete, hasUnsyncedChanges }: {
  actions: TerritoryActions;
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
      const result = await actions.rollTerritoryRecruitment({ characterId, territoryId: territory.territoryId });
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
      const recruitmentResult = await actions.completeTerritoryRecruitment({
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
      await actions.denyTerritoryRecruitment({ characterId, territoryId: territory.territoryId, offerId: offer.offerId });
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not deny these recruits."); }
    finally { setSaving(false); setDecisionAction(null); }
  }

  async function resetRoll() {
    setSaving(true); setError("");
    try {
      await actions.resetTerritoryRecruitment({ characterId, territoryId: territory.territoryId });
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
      const result = await actions.startSettlementFieldExpansion({
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
      const result = await actions.startFarmlandDevelopment({
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

export function TapRevealTerritoryMap({
  startUnlocking = false,
  onPushToSheet,
  pushingToSheet = false,
  hasUnsyncedChanges = false,
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
  startUnlocking?: boolean;
  onPushToSheet?: () => Promise<void>;
  pushingToSheet?: boolean;
  hasUnsyncedChanges?: boolean;
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
  const [unlockMode, setUnlockMode] = useState(isDm && startUnlocking);
  const [previewFullMap, setPreviewFullMap] = useState(false);
  const [selectedHexId, setSelectedHexId] = useState(TAP_REVEAL_HEXES[0].id);
  const [unlockMessage, setUnlockMessage] = useState("");
  const [missionError, setMissionError] = useState("");
  const selectedMen = Object.values(allocations).reduce((sum, men) => sum + Number(men || 0), 0);
  const [playerMapSize, setPlayerMapSize] = useState<{ width: number; height: number } | null>(null);
  const [secondaryMapSize, setSecondaryMapSize] = useState<{ width: number; height: number } | null>(null);
  // Large Drive thumbnails can fail to decode without firing a useful error on
  // memory-constrained mobile browsers.  The scouting overlay is never wider
  // than the phone viewport there, so request a smaller (but still crisp) copy.
  const requestedMapWidth = typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches
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
  const mapReady = Boolean(playerMapSize && !playerMapFailed);
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
    if (!mapReady || revealingHex) return;
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
    activateHex(hex);
  }

  async function unlockHex(hex: TapRevealPoint) {
    if (!isDm || revealingHex || pushingToSheet || !mapReady || reveals.some(item => item.id === hex.id)) return;
    setRevealingHex(true);
    setMissionError("");
    setUnlockMessage("");
    try {
      const hexNumber = HEX_I2_CARDS[hex.id]?.hex || hex.id;
      await onRevealHex({ territoryId: territory.territoryId, hexNumber, mapX: hex.x, mapY: hex.y });
      setUnlockMessage(`Hex ${hexNumber} unlocked. Push Territories to the Sheet to share it.`);
    } catch (error) {
      setMissionError(error instanceof Error ? error.message : "Could not unlock this hex.");
    } finally {
      setRevealingHex(false);
    }
  }

  function activateHex(hex: TapRevealPoint) {
    if (!mapReady || revealingHex || (isDm && unlockMode && pushingToSheet)) return;
    setSelectedHexId(hex.id);
    const isRevealed = reveals.some((reveal) => reveal.id === hex.id);
    if (isDm && unlockMode && !isRevealed) {
      void unlockHex(hex);
      return;
    }
    if (isRevealed || (isDm && previewFullMap)) {
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
        {isDm && <div className="dm-hex-toolbar">
          <button type="button" className={unlockMode ? "primary-action" : "secondary-action"} aria-pressed={unlockMode} disabled={revealingHex || pushingToSheet} onClick={() => { setUnlockMode(value => !value); setMissionHex(null); }}><LockKeyhole size={16} /> Unlock mode</button>
          <button type="button" className="secondary-action" aria-pressed={previewFullMap} disabled={!dimensionsMatch} onClick={() => setPreviewFullMap(value => !value)}>Preview full DM map</button>
          <label>Hex number<select aria-label="Hex number to unlock" value={selectedHexId} disabled={revealingHex || pushingToSheet} onChange={event => setSelectedHexId(event.target.value)}>{TAP_REVEAL_HEXES.map(hex => <option key={hex.id} value={hex.id}>{HEX_I2_CARDS[hex.id]?.hex || hex.id}{reveals.some(item => item.id === hex.id) ? " — unlocked" : ""}</option>)}</select></label>
          <button type="button" className="secondary-action" disabled={!mapReady || revealingHex || pushingToSheet || reveals.some(hex => hex.id === selectedHexId)} onClick={() => { const hex = TAP_REVEAL_HEXES.find(item => item.id === selectedHexId); if (hex) void unlockHex(hex); }}>{revealingHex ? "Unlocking…" : "Unlock selected hex"}</button>
          {onPushToSheet && <button type="button" className="secondary-action" disabled={revealingHex || pushingToSheet || !hasUnsyncedChanges} onClick={async () => {
            setMissionError("");
            setUnlockMessage("");
            try { await onPushToSheet(); setUnlockMessage("Territories pushed to the Sheet. Players see unlocked hexes on their next sync."); }
            catch (error) { setMissionError(error instanceof Error ? error.message : "Could not push Territories to the Sheet."); }
          }}><Upload size={16} /> {pushingToSheet ? "Pushing…" : "Push Territories to Sheet"}</button>}
          <p>{unlockMode ? "Click a locked hex to unlock it. No scouting mission is needed." : "Open hex details or scouting options by clicking the map."} Unlocks are saved locally until you push Territories to the Sheet.</p>
          <span role="status" aria-live="polite">{unlockMessage}</span>
          {missionError && <p className="form-error" role="alert">{missionError}</p>}
        </div>}
        <div className="territory-map-canvas tap-reveal-map-canvas">
          {!playerMapSize && !playerMapFailed && (
            <div className="territory-map-loading" role="status">Loading territory map…</div>
          )}
          <div
            className={`territory-map-image-wrap tap-reveal-image-wrap ${mapReady ? "is-ready" : ""}`}
            onClick={selectHex}
            role="group"
            aria-label="Territory hex map"
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
            {dimensionsMatch && isDm && previewFullMap && <img className="tap-reveal-secondary-map territory-full-map-preview" src={secondaryMapSource} alt={`Full DM map of ${territory.name}`} draggable={false} />}
            {dimensionsMatch && !(isDm && previewFullMap) && reveals.map((reveal, index) => (
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
            {mapReady && !(isDm && previewFullMap) && (
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
            {mapReady && <svg className="territory-hex-controls" viewBox="0 0 100 100" preserveAspectRatio="none" role="group" aria-label="Territory hexes">{TAP_REVEAL_HEXES.map(hex => {
              const unlocked = reveals.some(item => item.id === hex.id);
              const number = HEX_I2_CARDS[hex.id]?.hex || hex.id;
              return <g key={hex.id}>
                <polygon points={tapRevealHexPolygon(hex)} role="button" tabIndex={0} aria-disabled={revealingHex || pushingToSheet} aria-label={`${isDm && unlockMode && !unlocked ? "Unlock" : "Open"} hex ${number}${unlocked ? " (unlocked)" : " (locked)"}`} className={isDm && unlockMode && !unlocked ? "unlock-target" : ""} onClick={event => { event.stopPropagation(); activateHex(hex); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); activateHex(hex); } }} />
                {isDm && unlockMode && <text x={hex.x} y={hex.y} textAnchor="middle" dominantBaseline="middle">{number}</text>}
              </g>;
            })}</svg>}
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
            <strong>The territory map is available. Add a matching secondary map to display discovered locations.</strong>
          ) : playerMapSize && secondaryMapSize && !dimensionsMatch ? (
            <strong>Map proportions do not match: player map is {playerMapSize.width} × {playerMapSize.height}; secondary map is {secondaryMapSize.width} × {secondaryMapSize.height}.</strong>
          ) : (
            <div>
              <strong>{isDm && unlockMode ? "Click a locked hex to unlock it for the player." : availableMen >= 10 ? "Tap a fog-covered sub-hex to begin a scouting mission." : "At least one available squad of 10 soldiers is required to scout."}</strong>
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
                    disabled={revealingHex || pushingToSheet}
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

export function TerritoryModal({
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
