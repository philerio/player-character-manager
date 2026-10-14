import { useAppController } from "../src/app/useAppController";
import { useTerritoryCommands } from "../src/app/useTerritoryCommands";
import { loadTerritoryDraft } from "../src/app/territoryStorage";
import { useState } from "react";
import {
  act,
  renderHook,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TapRevealTerritoryMap } from "../src/components/TerritoryViews";
import { createMockBootstrap } from "../src/app/mockData";
import type { SheetTerritoryHex } from "../src/google-sheets-api";

function renderMap({
  isDm = true,
  singleMap = false,
  failure = false,
  pushingToSheet = false,
} = {}) {
  const data = createMockBootstrap(isDm ? "dm" : "player");
  const onRevealHex = vi.fn(
    async (input: {
      territoryId: string;
      hexNumber: string;
      mapX: number;
      mapY: number;
    }) => {
      if (failure) throw new Error("Could not save unlock.");
    },
  );
  const onStartScouting = vi.fn(async () => {});
  function MapHarness() {
    const [hexes, setHexes] = useState(data.territoryHexes);
    return (
      <TapRevealTerritoryMap
        startUnlocking={isDm}
        pushingToSheet={pushingToSheet}
        territory={{
          ...data.territories[0],
          poiMapUrl: singleMap ? undefined : data.territories[0].poiMapUrl,
        }}
        territoryHexes={hexes}
        fightingForces={data.retainers}
        missions={[]}
        customMissions={[]}
        isDm={isDm}
        onRevealHex={async (input) => {
          await onRevealHex(input);
          const hex: SheetTerritoryHex = {
            ...input,
            hexId: `test-${input.hexNumber}`,
            characterId: "demo-character",
            createdAt: "2026-10-01",
            isDiscovered: true,
            dmRevealed: true,
          };
          setHexes((current) => [...current, hex]);
        }}
        onStartScouting={onStartScouting}
        onViewResults={vi.fn()}
        onClose={vi.fn()}
      />
    );
  }
  const view = render(<MapHarness />);
  for (const img of view.container.querySelectorAll<HTMLImageElement>(
    ".tap-reveal-base-map, .tap-reveal-dimension-probe",
  )) {
    Object.defineProperties(img, {
      naturalWidth: { value: 1000 },
      naturalHeight: { value: 1000 },
    });
    fireEvent.load(img);
  }
  return { ...view, onRevealHex, onStartScouting };
}

describe("territory map controls", () => {
  it("lets the DM unlock a hex with one click without starting scouting", async () => {
    const { onRevealHex, onStartScouting } = renderMap();
    fireEvent.click(
      screen.getByRole("button", {
        hidden: true,
        name: "Unlock hex 2.0 (locked)",
      }),
    );
    await screen.findByRole("button", {
      hidden: true,
      name: "Open hex 2.0 (unlocked)",
    });
    expect(onRevealHex).toHaveBeenCalledTimes(1);
    expect(onRevealHex.mock.calls[0][0]).toMatchObject({
      territoryId: "demo-territory",
      hexNumber: "2.0",
    });
    expect(onStartScouting).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", {
        hidden: true,
        name: "Begin scouting mission",
      }),
    ).toBeNull();
    expect(screen.getByText(/Hex 2.0 unlocked/)).toBeTruthy();
    const button = screen.getByRole<HTMLButtonElement>("button", {
      hidden: true,
      name: "Unlock selected hex",
    });
    expect(button.disabled).toBe(true);
  });

  it("supports selection by hex number and keyboard map controls", async () => {
    const { onRevealHex } = renderMap();
    fireEvent.change(
      screen.getByRole("combobox", {
        hidden: true,
        name: "Hex number to unlock",
      }),
      { target: { value: "0-1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { hidden: true, name: "Unlock selected hex" }),
    );
    await screen.findByRole("button", {
      hidden: true,
      name: "Open hex 3.0 (unlocked)",
    });
    fireEvent.keyDown(
      screen.getByRole("button", {
        hidden: true,
        name: "Unlock hex 4.0 (locked)",
      }),
      { key: "Enter" },
    );
    await screen.findByRole("button", {
      hidden: true,
      name: "Open hex 4.0 (unlocked)",
    });
    expect(onRevealHex).toHaveBeenCalledTimes(2);
  });

  it("keeps map controls working with a single map image", async () => {
    const { onRevealHex } = renderMap({ singleMap: true });
    fireEvent.click(
      screen.getByRole("button", {
        hidden: true,
        name: "Unlock hex 2.0 (locked)",
      }),
    );
    await screen.findByRole("button", {
      hidden: true,
      name: "Open hex 2.0 (unlocked)",
    });
    expect(onRevealHex).toHaveBeenCalledTimes(1);
  });

  it("preserves player scouting and hides DM unlock controls", () => {
    const { onRevealHex } = renderMap({ isDm: false });
    expect(
      screen.queryByRole("button", { hidden: true, name: "Unlock mode" }),
    ).toBeNull();
    expect(
      screen.queryByRole("combobox", {
        hidden: true,
        name: "Hex number to unlock",
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        hidden: true,
        name: "Open hex 2.0 (locked)",
      }),
    );
    expect(
      screen.getByRole("dialog", {
        hidden: true,
        name: "Begin scouting mission",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { hidden: true, name: "Reveal Hex" }),
    ).toBeNull();
    expect(onRevealHex).not.toHaveBeenCalled();
  });

  it("shows failed unlocks and leaves the hex locked", async () => {
    const { onRevealHex } = renderMap({ failure: true });
    fireEvent.click(
      screen.getByRole("button", {
        hidden: true,
        name: "Unlock hex 2.0 (locked)",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(
        "Could not save unlock.",
      ),
    );
    expect(
      screen.getByRole("button", {
        hidden: true,
        name: "Unlock hex 2.0 (locked)",
      }),
    ).toBeTruthy();
    expect(onRevealHex).toHaveBeenCalledTimes(1);
  });
});

it("persists DM unlocks in the territory draft and restores them after reopening", async () => {
  function useMapController() {
    const controller = useAppController();
    return { controller, commands: useTerritoryCommands(controller) };
  }
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected network request"));
  const { result, unmount } = renderHook(useMapController);
  await waitFor(() =>
    expect(result.current.controller.selectedCharacterId).toBe(
      "demo-character",
    ),
  );
  await expect(
    result.current.commands.onRevealHex({
      territoryId: "demo-territory",
      hexNumber: "2.0",
      mapX: 100 / 3,
      mapY: 50 / 7,
    }),
  ).rejects.toThrow("Only the DM");
  act(() =>
    result.current.controller.setPermissions({
      isDm: true,
      territories: true,
      retainers: true,
      playerManagement: true,
    }),
  );
  await act(() =>
    result.current.commands.onRevealHex({
      territoryId: "demo-territory",
      hexNumber: "2.0",
      mapX: 100 / 3,
      mapY: 50 / 7,
    }),
  );
  expect(loadTerritoryDraft("demo-character")?.operations).toContainEqual(
    expect.objectContaining({
      kind: "hex",
      hexNumber: "2.0",
      dmRevealed: true,
    }),
  );
  unmount();
  const reopened = renderHook(useMapController);
  await waitFor(() =>
    expect(
      reopened.result.current.controller.territoryHexes.some(
        (hex) => hex.hexNumber === "2.0" && hex.dmRevealed,
      ),
    ).toBe(true),
  );
  expect(reopened.result.current.controller.territoryDraftDirty).toBe(true);
  expect(network).not.toHaveBeenCalled();
}, 30_000);

it("lets the DM preview the full map without unlocking player hexes", () => {
  const { container, onRevealHex } = renderMap();
  fireEvent.click(
    screen.getByRole("button", { hidden: true, name: "Preview full DM map" }),
  );
  expect(container.querySelector(".territory-full-map-preview")).toBeTruthy();
  expect(container.querySelector(".tap-reveal-fog")).toBeNull();
  expect(
    screen.getByRole("button", {
      hidden: true,
      name: "Unlock hex 2.0 (locked)",
    }),
  ).toBeTruthy();
  expect(onRevealHex).not.toHaveBeenCalled();
});

it("blocks new unlocks while Territories are being pushed", () => {
  const { onRevealHex } = renderMap({ pushingToSheet: true });
  fireEvent.click(
    screen.getByRole("button", {
      hidden: true,
      name: "Unlock hex 2.0 (locked)",
    }),
  );
  expect(onRevealHex).not.toHaveBeenCalled();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      hidden: true,
      name: "Unlock selected hex",
    }).disabled,
  ).toBe(true);
});
