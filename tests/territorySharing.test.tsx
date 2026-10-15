import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAppController } from "../src/app/useAppController";
import { useTerritories } from "../src/app/useTerritories";
import * as playerApi from "../src/google-sheets-api";
import { createMockBootstrap } from "../src/app/mockData";
import { requestCampaign } from "../src/app/transport";
import {
  loadTerritoryDraft,
  mergePublishedTerritoryReveals,
  type TerritoryLocalDraft,
} from "../src/app/territoryStorage";
import { appStorage } from "../src/app/storage";
const fixture = createMockBootstrap();
afterEach(() => {
  vi.useRealTimers();
  appStorage.clear();
});
async function ready(result: { current: ReturnType<typeof useAppController> }) {
  await waitFor(
    () =>
      expect(
        !result.current.background.refreshing &&
          Object.values(result.current.background.resources).every(
            (row) => row.status === "ready",
          ),
      ).toBe(true),
    { timeout: 5000 },
  );
}
it("normalizes numeric Sheet hex labels and checkbox text before using a status response", async () => {
  const hex = {
    ...fixture.territoryHexes[0],
    hexNumber: 2,
    dmRevealed: "TRUE",
    isDiscovered: "FALSE",
  };
  const response = await requestCampaign(
    `https://campaign.test/?action=territory-status&characterId=${fixture.selectedCharacterId}`,
    undefined,
    vi.fn().mockResolvedValue(
      Response.json({
        ...fixture,
        characterId: fixture.selectedCharacterId,
        territoryHexes: [hex],
      }),
    ),
  );
  expect((await response.json()).territoryHexes[0]).toMatchObject({
    hexNumber: "2",
    dmRevealed: true,
    isDiscovered: false,
  });
});
it("matches numeric hex acknowledgements to decimal labels without losing coordinate precision", async () => {
  const payload = {
    action: "territory.hex.upsert",
    characterId: fixture.selectedCharacterId,
    territoryId: "demo-territory",
    hexNumber: "2.0",
    mapX: 100 / 3,
    mapY: 50 / 7,
    dmRevealed: true,
  };
  const response = await requestCampaign(
    "https://campaign.test/",
    { method: "POST", body: JSON.stringify(payload) },
    vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        hex: {
          ...fixture.territoryHexes[0],
          hexNumber: 2,
          mapX: 33.33333333333333,
          mapY: 50 / 7,
          dmRevealed: true,
        },
      }),
    ),
  );
  expect((await response.json()).hex.hexNumber).toBe("2");
});
it("merges published reveals without overwriting local fields, operations, or exposing unrevealed imported rows", () => {
  const local = { ...fixture.territoryHexes[0], cerealFields: 12 };
  const draft: TerritoryLocalDraft = {
    characterId: fixture.selectedCharacterId,
    territories: fixture.territories,
    territoryHexes: [local],
    scoutingMissions: [],
    customMissions: [],
    updatedAt: "local-time",
    operations: [
      {
        id: "local-edit",
        kind: "fields",
        territoryId: local.territoryId,
        hexId: local.hexId,
        cerealFields: 12,
        cottonFields: 0,
        pastureFields: 0,
      },
    ],
  };
  const revealed = {
    ...local,
    hexId: "revealed",
    hexNumber: "2.0",
    dmRevealed: true,
  };
  const hidden = {
    ...local,
    hexId: "hidden",
    hexNumber: "3.0",
    dmRevealed: false,
    isDiscovered: false,
  };
  const foreign = {
    ...revealed,
    hexId: "foreign",
    characterId: "other-character",
    hexNumber: "4.0",
  };
  const result = mergePublishedTerritoryReveals(draft, [
    { ...local, cerealFields: 0, dmRevealed: true },
    revealed,
    hidden,
    foreign,
  ]);
  expect(
    result.territoryHexes.find((row) => row.hexId === local.hexId)
      ?.cerealFields,
  ).toBe(12);
  expect(
    result.territoryHexes.find((row) => row.hexId === revealed.hexId)
      ?.dmRevealed,
  ).toBe(true);
  expect(
    result.territoryHexes.some((row) =>
      ["hidden", "foreign"].includes(row.hexId),
    ),
  ).toBe(false);
  expect(result.operations).toEqual(draft.operations);
});
it("keeps a reveal queued when a fresh campaign read loses its flag", async () => {
  const { result } = renderHook(() =>
    useTerritories(() => ({
      selectedCharacter: fixture.characters[0],
      selectedCharacterIdRef: { current: fixture.selectedCharacterId },
      setRetainers: vi.fn(),
      retainerDraftDirty: false,
      setModal: vi.fn(),
      permissions: fixture.permissions,
      selectedCharacterId: fixture.selectedCharacterId,
      cacheBaseRef: { current: fixture },
    })),
  );
  const hex = {
    ...fixture.territoryHexes[0],
    hexId: "local-reveal",
    hexNumber: "2.0",
    dmRevealed: true,
  };
  act(() =>
    result.current.queueTerritoryOperation(
      {
        id: "reveal",
        kind: "hex",
        territoryId: hex.territoryId,
        localHexId: hex.hexId,
        hexNumber: hex.hexNumber,
        mapX: hex.mapX,
        mapY: hex.mapY,
        dmRevealed: true,
      },
      { territoryHexes: [hex] },
    ),
  );
  vi.spyOn(playerApi, "upsertTerritoryHex").mockResolvedValue({
    ok: true,
    hex,
  });
  const read = vi.spyOn(playerApi, "loadTerritoryStatus").mockResolvedValue({
    ...fixture,
    customMissions: fixture.customMissions || [],
    characterId: fixture.selectedCharacterId,
    territoryHexes: [],
  });
  await act(async () => {
    await expect(result.current.syncTerritoryData()).rejects.toThrow(
      "did not confirm",
    );
  });
  expect(read).toHaveBeenCalledWith(fixture.selectedCharacterId, true);
  expect(
    loadTerritoryDraft(fixture.selectedCharacterId)?.operations.map(
      (row) => row.id,
    ),
  ).toEqual(["reveal"]);
  expect(result.current.territoryDraftDirty).toBe(true);
  read.mockResolvedValue({
    ...fixture,
    customMissions: fixture.customMissions || [],
    characterId: fixture.selectedCharacterId,
    territoryHexes: [hex],
  });
  await act(() => result.current.syncTerritoryData());
  expect(loadTerritoryDraft(fixture.selectedCharacterId)).toBeNull();
});
it("publishes a DM demo unlock to the player while preserving separate player drafts", async () => {
  const player = renderHook(() => useAppController());
  await ready(player.result);
  window.history.replaceState({}, "", "/?demo=dm");
  vi.resetModules();
  const { useAppController: useDmController } =
    await import("../src/app/useAppController");
  const { useTerritoryCommands } =
    await import("../src/app/useTerritoryCommands");
  const dmApi = await import("../src/google-sheets-api");
  const dmStorage = await import("../src/app/territoryStorage");
  const dm = renderHook(() => {
    const controller = useDmController();
    return { controller, commands: useTerritoryCommands(controller) };
  });
  await waitFor(() =>
    expect(dm.result.current.controller.currentPlayer?.role).toBe("dm"),
  );
  await waitFor(
    () =>
      expect(
        !dm.result.current.controller.background.refreshing &&
          Object.values(
            dm.result.current.controller.background.resources,
          ).every((row) => row.status === "ready"),
      ).toBe(true),
    { timeout: 5000 },
  );
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const center = player.result.current.territoryHexes[0];
  act(() =>
    player.result.current.queueTerritoryOperation(
      {
        id: "player-fields",
        kind: "fields",
        territoryId: center.territoryId,
        hexId: center.hexId,
        cerealFields: 12,
        cottonFields: 0,
        pastureFields: 0,
      },
      { territoryHexes: [{ ...center, cerealFields: 12 }] },
    ),
  );
  await act(() =>
    dm.result.current.commands.onRevealHex({
      territoryId: "demo-territory",
      hexNumber: "2.0",
      mapX: 100 / 3,
      mapY: 50 / 7,
    }),
  );
  expect(
    dmStorage.loadTerritoryDraft("demo-character")?.operations[0].kind,
  ).toBe("hex");
  expect(loadTerritoryDraft("demo-character")?.operations[0].id).toBe(
    "player-fields",
  );
  expect(
    (await playerApi.loadTerritoryStatus("demo-character")).territoryHexes.some(
      (hex) => hex.hexNumber === "2.0" && hex.dmRevealed,
    ),
  ).toBe(false);
  await act(() => dm.result.current.controller.pushDmTabToSheet("territories"));
  expect(dm.result.current.controller.dmTabPushSuccess).toBe("territories");
  expect((await dmApi.loadTabSyncRevisions("demo-character")).territories).toBe(
    1,
  );
  expect((await playerApi.loadAccountRoster()).currentPlayer.role).toBe(
    "player",
  );
  expect((await dmApi.loadAccountRoster()).currentPlayer.role).toBe("dm");
  await act(() => player.result.current.background.refreshNow());
  expect(
    player.result.current.territoryHexes.some(
      (hex) => hex.hexNumber === "2.0" && hex.dmRevealed,
    ),
  ).toBe(true);
  expect(
    player.result.current.territoryHexes.find(
      (hex) => hex.hexId === center.hexId,
    )?.cerealFields,
  ).toBe(12);
  expect(
    loadTerritoryDraft("demo-character")?.operations.map((row) => row.id),
  ).toEqual(["player-fields"]);
  expect(dmStorage.loadTerritoryDraft("demo-character")).toBeNull();
  expect(player.result.current.currentPlayer?.role).toBe("player");
  // The revision remains unaccepted: local field conflicts still require review.
  expect(
    player.result.current.background.resources.territories.error,
  ).toContain("local edits are preserved");
  vi.useRealTimers();
}, 30_000);

it("accepts unset reveal cells from Apps Script without revealing imported hexes", async () => {
  const hex = {
    ...fixture.territoryHexes[0],
    hexNumber: 2,
    dmRevealed: "",
    isDiscovered: false,
  };
  const response = await requestCampaign(
    `https://campaign.test/?action=territory-status&characterId=${fixture.selectedCharacterId}`,
    undefined,
    vi.fn().mockResolvedValue(
      Response.json({
        ...fixture,
        characterId: fixture.selectedCharacterId,
        territoryHexes: [hex],
      }),
    ),
  );
  expect((await response.json()).territoryHexes[0]).toMatchObject({
    hexNumber: "2",
    dmRevealed: false,
    isDiscovered: false,
  });
});
