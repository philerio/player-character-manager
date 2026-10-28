import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import App from "../src/App";
import * as api from "../src/google-sheets-api";
import { createMockBootstrap } from "../src/app/mockData";
import { territoryActions } from "../src/app/territoryActions";
import { useAppController } from "../src/app/useAppController";
import { useTerritoryCommands } from "../src/app/useTerritoryCommands";
import { loadTerritoryDraft } from "../src/app/territoryStorage";
import { loadAcceptedTabSyncRevisions } from "../src/app/syncStorage";
import { ResourceFeedback } from "../src/components/DataFeedback";

function campaign() {
  const data = createMockBootstrap();
  const settlement = {
    ...data.territoryHexes[0],
    hexId: "settlement",
    hexNumber: "4.4",
    settlementName: "Test Village",
    hexPopulationValue: 200,
    cerealFields: 1,
    cottonFields: 0,
    pastureFields: 0,
    fieldCapacity: 8,
    isDiscovered: true,
  };
  const plains = {
    ...settlement,
    hexId: "plains",
    hexNumber: "2.0",
    settlementName: "",
    terrain: "Plains",
    hexPopulationValue: 0,
    cerealFields: 0,
    dmRevealed: true,
  };
  data.territoryHexes = [settlement, plains];
  let revision = 0;
  vi.spyOn(api, "loadTerritoryStatus").mockImplementation(async () => ({
    ...structuredClone(data),
    customMissions: data.customMissions || [],
    characterId: data.selectedCharacterId,
  }));
  vi.spyOn(api, "loadSheetData").mockImplementation(async () =>
    structuredClone(data),
  );
  vi.spyOn(api, "loadTabSyncRevisions").mockImplementation(async () => ({
    wallet: 0,
    retainers: 0,
    journal: 0,
    territories: revision,
  }));
  return { data, settlement, plains, advance: () => ++revision };
}
function hook() {
  return renderHook(() => {
    const controller = useAppController();
    return { controller, commands: useTerritoryCommands(controller) };
  });
}
async function ready(result: {
  current: { controller: ReturnType<typeof useAppController> };
}) {
  await waitFor(() =>
    expect(
      !result.current.controller.background.refreshing &&
        Object.values(result.current.controller.background.resources).every(
          (row) => row.status === "ready",
        ),
    ).toBe(true),
  );
}

it("keeps both confirmed development hexes without queuing server results as new local field edits", async () => {
  const remote = campaign();
  const { result } = hook();
  await ready(result);
  const plains = {
    ...remote.plains,
    farmlandStartedAt: "2026-10-19T12:00:00Z",
  };
  const settlement = { ...remote.settlement, cerealFields: 2 };
  remote.data.territoryHexes = [settlement, plains];
  remote.advance();
  act(() => {
    result.current.commands.onFieldAllocationSaved(plains, "campaign");
    result.current.commands.onFieldAllocationSaved(settlement, "campaign");
  });
  const draft = loadTerritoryDraft(remote.data.selectedCharacterId)!;
  expect(draft.operations).toEqual([]);
  expect(
    draft.territoryHexes.find((row) => row.hexId === "plains")
      ?.farmlandStartedAt,
  ).toBe(plains.farmlandStartedAt);
  expect(
    draft.territoryHexes.find((row) => row.hexId === "settlement")
      ?.cerealFields,
  ).toBe(2);
  expect(result.current.controller.territoryDraftDirty).toBe(false);
  await act(() =>
    result.current.commands.onRecruitmentComplete({
      ...remote.data.transactions[0],
      transactionId: "paid-development",
      type: "expense",
      gp: 200,
    }),
  );
  expect(result.current.controller.background.error).toBe("");
  expect(
    loadAcceptedTabSyncRevisions(remote.data.selectedCharacterId).territories,
  ).toBe(1);
  expect(loadTerritoryDraft(remote.data.selectedCharacterId)).toBeNull();
});

it("does not acknowledge a revision published after the replacement snapshot was read", async () => {
  const remote = campaign();
  const { result } = hook();
  await ready(result);
  remote.advance();
  vi.mocked(api.loadTerritoryStatus).mockImplementationOnce(async () => {
    const snapshot = {
      ...structuredClone(remote.data),
      customMissions: remote.data.customMissions || [],
      characterId: remote.data.selectedCharacterId,
    };
    remote.advance();
    return snapshot;
  });
  await act(() => result.current.controller.refreshTerritoryDataFromCampaign());
  expect(
    loadAcceptedTabSyncRevisions(remote.data.selectedCharacterId).territories,
  ).toBe(1);
});

it("keeps the draft and its accepted revision when loading the campaign copy fails", async () => {
  const remote = campaign();
  const { result } = hook();
  await ready(result);
  act(() =>
    result.current.commands.onFieldAllocationSaved({
      ...remote.settlement,
      cerealFields: 3,
    }),
  );
  const before = loadTerritoryDraft(remote.data.selectedCharacterId);
  remote.advance();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.mocked(api.loadTerritoryStatus).mockRejectedValueOnce(
    new Error("Connection lost"),
  );
  await act(async () => {
    await expect(
      result.current.controller.refreshTerritoryDataFromCampaign(),
    ).rejects.toThrow("Connection lost");
  });
  expect(loadTerritoryDraft(remote.data.selectedCharacterId)).toEqual(before);
  expect(
    loadAcceptedTabSyncRevisions(remote.data.selectedCharacterId).territories,
  ).toBe(0);
});

it("preserves edits made during a paid request without adding a duplicate operation", async () => {
  const remote = campaign();
  const { result } = hook();
  await ready(result);
  act(() =>
    result.current.commands.onFieldAllocationSaved({
      ...remote.settlement,
      cerealFields: 3,
    }),
  );
  const before = loadTerritoryDraft(
    remote.data.selectedCharacterId,
  )!.operations;
  act(() =>
    result.current.commands.onFieldAllocationSaved(
      {
        ...remote.settlement,
        cerealFields: 2,
        fieldExpansionStartedAt: "2026-10-19T12:00:00Z",
      },
      "campaign",
    ),
  );
  const draft = loadTerritoryDraft(remote.data.selectedCharacterId)!;
  expect(draft.operations).toEqual(before);
  expect(
    draft.territoryHexes.find((row) => row.hexId === "settlement"),
  ).toMatchObject({
    cerealFields: 3,
    fieldExpansionStartedAt: "2026-10-19T12:00:00Z",
  });
});

it("does not mistake a previous successful field save for an external update on the next edit", async () => {
  const remote = campaign();
  const save = vi
    .spyOn(api, "saveTerritoryFieldAllocation")
    .mockImplementation(async (input) => {
      const hex = { ...remote.settlement, cerealFields: input.cerealFields };
      remote.data.territoryHexes = [hex, remote.plains];
      remote.advance();
      return { ok: true, hex };
    });
  const { result } = hook();
  await ready(result);
  for (const cerealFields of [2, 3]) {
    act(() =>
      result.current.commands.onFieldAllocationSaved({
        ...remote.settlement,
        cerealFields,
      }),
    );
    await act(() => result.current.controller.background.refreshNow());
    expect(result.current.controller.background.error).toBe("");
    expect(loadTerritoryDraft(remote.data.selectedCharacterId)).toBeNull();
    expect(
      loadAcceptedTabSyncRevisions(remote.data.selectedCharacterId).territories,
    ).toBe(cerealFields - 1);
  }
  expect(save).toHaveBeenCalledTimes(2);
});

it("acknowledges a campaign replacement so subsequent edits can sync, while a cancelled replacement keeps the draft", async () => {
  const remote = campaign();
  const { result } = hook();
  await ready(result);
  act(() =>
    result.current.commands.onFieldAllocationSaved({
      ...remote.settlement,
      cerealFields: 3,
    }),
  );
  remote.advance();
  await act(() => result.current.controller.background.refreshNow());
  expect(
    result.current.controller.background.resources.territories.conflict,
  ).toBe(true);
  expect(result.current.controller.background.error).not.toContain("DM");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(() => result.current.controller.refreshTerritoryDataFromCampaign());
  expect(
    loadTerritoryDraft(remote.data.selectedCharacterId)?.operations,
  ).toHaveLength(1);
  expect(
    loadAcceptedTabSyncRevisions(remote.data.selectedCharacterId).territories,
  ).toBe(0);
  confirm.mockReturnValue(true);
  await act(() => result.current.controller.refreshTerritoryDataFromCampaign());
  expect(loadTerritoryDraft(remote.data.selectedCharacterId)).toBeNull();
  expect(
    loadAcceptedTabSyncRevisions(remote.data.selectedCharacterId).territories,
  ).toBe(1);
  expect(result.current.controller.background.error).toBe("");
  const save = vi
    .spyOn(api, "saveTerritoryFieldAllocation")
    .mockImplementation(async (input) => ({
      ok: true,
      hex: { ...remote.settlement, cerealFields: input.cerealFields },
    }));
  act(() =>
    result.current.commands.onFieldAllocationSaved({
      ...remote.settlement,
      cerealFields: 2,
    }),
  );
  await act(() => result.current.controller.background.refreshNow());
  expect(save).toHaveBeenCalledOnce();
  expect(result.current.controller.background.error).toBe("");
});

it("offers an explicit campaign replacement beside the conflict notice", () => {
  const load = vi.fn(async () => {});
  render(
    <ResourceFeedback
      name="territories"
      state={{
        status: "error",
        hasData: true,
        error: "Campaign changed",
        conflict: true,
        updatedAt: "",
      }}
      retry={vi.fn()}
      loadCampaignCopy={load}
    >
      <p>Local territory</p>
    </ResourceFeedback>,
  );
  expect(
    screen.getByRole("button", { name: "Download working copy" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load campaign copy" }));
  expect(load).toHaveBeenCalledOnce();
  expect(screen.getByText("Local territory")).toBeTruthy();
});

it("marks Develop Land results as confirmed campaign data in the actual player screen", async () => {
  const remote = campaign();
  const plains = {
    ...remote.plains,
    farmlandStartedAt: "2026-10-19T12:00:00Z",
    farmlandCompletesAt: "2027-06-19T12:00:00Z",
  };
  const settlement = { ...remote.settlement, cerealFields: 2 };
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const save = vi.spyOn(api, "saveTerritoryFieldAllocation");
  vi.spyOn(territoryActions, "startFarmlandDevelopment").mockImplementation(
    async () => {
      remote.data.territoryHexes = [settlement, plains];
      remote.advance();
      return {
        ok: true,
        plainsHex: plains,
        settlementHex: settlement,
        transaction: {
          ...remote.data.transactions[0],
          transactionId: "development-payment",
          type: "expense",
          gp: 500,
        },
      };
    },
  );
  render(<App />);
  fireEvent.click(
    screen.getAllByRole("button", { hidden: true, name: "Territories" })[0],
  );
  await screen.findByText("Territory data confirmed");
  fireEvent.click(screen.getByRole("button", { name: "Manage Territory" }));
  fireEvent.change(screen.getByLabelText("Available plains"), {
    target: { value: "plains" },
  });
  fireEvent.change(screen.getByLabelText("Develop fields for settlement"), {
    target: { value: "settlement" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Develop Land · 500 gp" }),
  );
  await screen.findByText("Sub-hex 2.0 · 50 workers");
  await waitFor(() =>
    expect(
      loadAcceptedTabSyncRevisions(remote.data.selectedCharacterId).territories,
    ).toBe(1),
  );
  expect(loadTerritoryDraft(remote.data.selectedCharacterId)).toBeNull();
  await waitFor(() =>
    expect(
      api
        .loadCachedSheetData(remote.data.selectedCharacterId)!
        .territoryHexes.find((row) => row.hexId === "plains")
        ?.farmlandStartedAt,
    ).toBe(plains.farmlandStartedAt),
  );
  expect(save).not.toHaveBeenCalled();
});
