import { territoryHexKey } from "./territoryRules";

import {
  loadSheetData,
  notifyScoutingMissionStarted,
  completeScoutingMissionForTesting,
  promoteScoutingSerjeants,
  type SheetScoutingMission,
  type SheetCustomMission,
  type SheetTerritoryHex,
} from "../google-sheets-api";
import {
  localMissionStamp,
  loadTerritoryDraft,
  upsertLocalScoutingTimer,
} from "./territoryStorage";
import { loadRetainerDraft } from "./retainerStorage";

import { TerritoriesView } from "../components/TerritoryViews";

import type { useAppController } from "./useAppController";
import type { ComponentProps } from "react";
type TerritoryProps = ComponentProps<typeof TerritoriesView>;
type CommandContext = Pick<
  ReturnType<typeof useAppController>,
  | "permissions"
  | "selectedCharacter"
  | "applySystemWalletTransactionLocally"
  | "setRecurringExpenses"
  | "retainerDraftDirty"
  | "selectedCharacterIdRef"
  | "setRetainers"
  | "retainers"
  | "setRetainerDraftDirty"
  | "territoryDraftDirty"
  | "setTerritories"
  | "territories"
  | "territoryHexes"
  | "queueTerritoryOperation"
  | "persistLocalTerritoryState"
  | "setEditingTerritory"
  | "setModal"
  | "scoutingMissions"
  | "customMissions"
  | "setScoutingMissions"
  | "setTerritoryHexes"
  | "platinum"
  | "gold"
  | "silver"
  | "copper"
>;

export function useTerritoryCommands(controller: CommandContext) {
  const onRecruitmentComplete: TerritoryProps["onRecruitmentComplete"] = async (
    walletTransaction,
    recurringSchedule,
  ) => {
    const {
      selectedCharacter,
      applySystemWalletTransactionLocally,
      setRecurringExpenses,
      retainerDraftDirty,
      selectedCharacterIdRef,
      setRetainers,
      retainers,
      setRetainerDraftDirty,
      territoryDraftDirty,
      setTerritories,
      territories,
    } = controller;

    if (!selectedCharacter) return;
    applySystemWalletTransactionLocally(walletTransaction);
    if (recurringSchedule) {
      setRecurringExpenses((items) => [
        recurringSchedule,
        ...items.filter(
          (item) => item.scheduleId !== recurringSchedule.scheduleId,
        ),
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
  };

  const onFieldAllocationSaved: TerritoryProps["onFieldAllocationSaved"] = (
    updatedHex,
  ) => {
    const {
      selectedCharacter,
      territoryHexes,
      queueTerritoryOperation,
      persistLocalTerritoryState,
    } = controller;

    if (!selectedCharacter) return;
    const previous = territoryHexes.find(
      (hex) => hex.hexId === updatedHex.hexId,
    );
    const nextHexes = territoryHexes.map((hex) =>
      hex.hexId === updatedHex.hexId ? updatedHex : hex,
    );
    const fieldsChanged =
      previous &&
      (Number(previous.cerealFields || 0) !==
        Number(updatedHex.cerealFields || 0) ||
        Number(previous.cottonFields || 0) !==
          Number(updatedHex.cottonFields || 0) ||
        Number(previous.pastureFields || 0) !==
          Number(updatedHex.pastureFields || 0));
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
      persistLocalTerritoryState(selectedCharacter.characterId, {
        territoryHexes: nextHexes,
      });
    }
  };

  const onTitheChanged: TerritoryProps["onTitheChanged"] = (
    updatedTerritory,
  ) => {
    const { selectedCharacter, territories, queueTerritoryOperation } =
      controller;

    if (!selectedCharacter) return;
    const nextTerritories = territories.map((item) =>
      item.territoryId === updatedTerritory.territoryId
        ? updatedTerritory
        : item,
    );
    queueTerritoryOperation(
      {
        id: crypto.randomUUID(),
        kind: "tithe",
        territoryId: updatedTerritory.territoryId,
        payChurchTithe: Boolean(updatedTerritory.payChurchTithe),
      },
      { territories: nextTerritories },
    );
  };

  const onAdd: TerritoryProps["onAdd"] = () => {
    const { setEditingTerritory, setModal } = controller;

    setEditingTerritory(null);
    setModal("territory");
  };

  const onEdit: TerritoryProps["onEdit"] = (territory) => {
    const { setEditingTerritory, setModal } = controller;

    setEditingTerritory(territory);
    setModal("territory");
  };

  const onRevealHex: TerritoryProps["onRevealHex"] = async (input) => {
    const {
      permissions,
      selectedCharacter,
      territoryHexes,
      queueTerritoryOperation,
    } = controller;

    if (!permissions.isDm)
      throw new Error("Only the DM can unlock territory hexes.");

    if (!selectedCharacter) return;
    const existing = territoryHexes.find(
      (hex) =>
        hex.territoryId === input.territoryId &&
        territoryHexKey(hex.hexNumber) === territoryHexKey(input.hexNumber),
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
      ...territoryHexes.filter(
        (item) =>
          !(
            item.territoryId === input.territoryId &&
            territoryHexKey(item.hexNumber) === territoryHexKey(input.hexNumber)
          ),
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
        revealOnly: true,
        dmRevealed: true,
      },
      { territoryHexes: nextHexes },
    );
  };

  const onStartScouting: TerritoryProps["onStartScouting"] = async (input) => {
    const {
      selectedCharacter,
      retainers,
      queueTerritoryOperation,
      scoutingMissions,
    } = controller;

    if (!selectedCharacter) return;
    const localMissionId = `local-${crypto.randomUUID()}`;
    const now = localMissionStamp();
    const durationDays = Math.floor(Math.random() * 3) + 1;
    const completesAt = new Date(
      new Date(now).getTime() + durationDays * 86400000,
    ).toISOString();
    const forceNames = new Map(
      retainers
        .filter((item) => item.type === "force")
        .map((item) => [item.retainerId, item.name]),
    );
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
      men: input.allocations.reduce(
        (sum, allocation) => sum + Number(allocation.men || 0),
        0,
      ),
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
  };

  const onCreateCustomMission: TerritoryProps["onCreateCustomMission"] = async (
    input,
  ) => {
    const {
      selectedCharacter,
      retainers,
      queueTerritoryOperation,
      customMissions,
    } = controller;

    if (!selectedCharacter) throw new Error("Select a character first.");
    const localMissionId = `local-${crypto.randomUUID()}`;
    const now = localMissionStamp();
    const forceNames = new Map(
      retainers
        .filter((item) => item.type === "force")
        .map((item) => [item.retainerId, item.name]),
    );
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
      men: input.allocations.reduce(
        (sum, allocation) => sum + Number(allocation.men || 0),
        0,
      ),
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
  };

  const onCompleteScoutingForTesting: TerritoryProps["onCompleteScoutingForTesting"] =
    async (missionId) => {
      const {
        selectedCharacter,
        setScoutingMissions,
        scoutingMissions,
        setTerritories,
        territories,
        setTerritoryHexes,
        territoryHexes,
      } = controller;

      if (!selectedCharacter) return;
      const result = await completeScoutingMissionForTesting({
        characterId: selectedCharacter.characterId,
        missionId,
      });
      // Reveal immediately from the authoritative completion response.
      // The following bootstrap refresh supplies population/hex changes.
      setScoutingMissions((items) =>
        items.map((mission) =>
          mission.missionId === result.mission.missionId
            ? {
                ...mission,
                ...result.mission,
                allocations:
                  result.mission.allocations || mission.allocations || [],
              }
            : mission,
        ),
      );
      const data = await loadSheetData(selectedCharacter.characterId);
      setScoutingMissions(data.scoutingMissions || []);
      setTerritories(data.territories || []);
      setTerritoryHexes(data.territoryHexes || []);
    };

  const onPromoteScoutingSerjeants: TerritoryProps["onPromoteScoutingSerjeants"] =
    async (missionId) => {
      const {
        selectedCharacter,
        platinum,
        gold,
        silver,
        copper,
        applySystemWalletTransactionLocally,
        setScoutingMissions,
        scoutingMissions,
        selectedCharacterIdRef,
        setRetainers,
        retainers,
        setRetainerDraftDirty,
      } = controller;

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
    };

  const onViewScoutingResults: TerritoryProps["onViewScoutingResults"] = async (
    missionId,
  ) => {
    const { selectedCharacter, scoutingMissions, queueTerritoryOperation } =
      controller;

    if (!selectedCharacter) throw new Error("Select a character first.");
    const existingMission = scoutingMissions.find(
      (mission) => mission.missionId === missionId,
    );
    if (!existingMission)
      throw new Error("The scouting mission could not be found.");
    const optimisticMission: SheetScoutingMission = {
      ...existingMission,
      resultsViewedAt:
        existingMission.resultsViewedAt || new Date().toISOString(),
    };
    const nextMissions = scoutingMissions.map((mission) =>
      mission.missionId === missionId ? optimisticMission : mission,
    );
    queueTerritoryOperation(
      { id: crypto.randomUUID(), kind: "scouting-view", missionId },
      { scoutingMissions: nextMissions },
    );
    return optimisticMission;
  };

  const onDismissScoutingResult: TerritoryProps["onDismissScoutingResult"] =
    async (missionId) => {
      const { selectedCharacter, scoutingMissions, queueTerritoryOperation } =
        controller;

      if (!selectedCharacter) return;
      const nextMissions = scoutingMissions.map((mission) =>
        mission.missionId === missionId
          ? { ...mission, dismissedAt: new Date().toISOString() }
          : mission,
      );
      queueTerritoryOperation(
        { id: crypto.randomUUID(), kind: "scouting-dismiss", missionId },
        { scoutingMissions: nextMissions },
      );
    };

  const onSaveHex: TerritoryProps["onSaveHex"] = async (input) => {
    const { selectedCharacter, territoryHexes, queueTerritoryOperation } =
      controller;

    if (!selectedCharacter) return;
    const existing = territoryHexes.find(
      (hex) =>
        hex.territoryId === input.territoryId &&
        territoryHexKey(hex.hexNumber) === territoryHexKey(input.hexNumber),
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
    const nextHexes = [
      updatedHex,
      ...territoryHexes.filter((item) => item.hexId !== localHexId),
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
        title: input.title,
        contents: input.contents,
        expectedUpdatedAt:
          loadTerritoryDraft(selectedCharacter.characterId)
            ?.operations.filter(
              (row): row is Extract<typeof row, { kind: "hex" }> =>
                row.kind === "hex",
            )
            .find(
              (row) =>
                row.territoryId === input.territoryId &&
                territoryHexKey(row.hexNumber) ===
                  territoryHexKey(input.hexNumber) &&
                row.expectedUpdatedAt !== undefined,
            )?.expectedUpdatedAt ??
          (existing && !existing.hexId.startsWith("local-")
            ? existing.updatedAt || existing.createdAt
            : ""),
      },
      { territoryHexes: nextHexes },
    );
  };
  return {
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
  };
}
