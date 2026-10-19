import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TerritoriesView } from "../src/components/TerritoryViews";
import { territoryActions } from "../src/app/territoryActions";
// @ts-expect-error Synthetic workbook fixture shared with the D1 seed.
import { fixtureSheets } from "../scripts/d1-fixture.mjs";
function renderTerritory(withMap = true, storedMap = false) {
  const fixture = fixtureSheets();
  const territory = { ...fixture.Territories[0], assets: [] };
  if (storedMap) {
    territory.mapFileId = "d1:synthetic-file";
    territory.mapUrl = "https://campaign.example/files/synthetic-file";
  }
  if (!withMap) {
    delete territory.mapUrl;
    delete territory.mapFileId;
  }
  return render(
    <TerritoriesView
      actions={territoryActions}
      territories={[territory]}
      fightingForces={[]}
      officerRetainers={[]}
      scoutingMissions={[]}
      customMissions={[]}
      territoryHexes={[]}
      characterName="Test player"
      character={fixture.Characters[0]}
      characterId="player-character"
      balances={{ pp: 0, gp: 0, sp: 0, cp: 0 }}
      isDm={false}
      hasUnsyncedChanges={false}
      syncing={false}
      syncError=""
      lastSyncedAt=""
      pushingToSheet={false}
      pushToSheetSuccess={false}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onRevealHex={vi.fn()}
      onStartScouting={vi.fn()}
      onCreateCustomMission={vi.fn()}
      onCompleteScoutingForTesting={vi.fn()}
      onPromoteScoutingSerjeants={vi.fn()}
      onViewScoutingResults={vi.fn()}
      onDismissScoutingResult={vi.fn()}
      onSaveHex={vi.fn()}
      onRecruitmentComplete={vi.fn()}
      onFieldAllocationSaved={vi.fn()}
      onTitheChanged={vi.fn()}
      onRefresh={vi.fn()}
      onPushToSheet={vi.fn()}
    />,
  );
}
it("opens the seeded Test Territory map for Test player from the card and View Map button", () => {
  const { container } = renderTerritory();
  fireEvent.click(
    screen.getByRole("button", { name: "Open map for Test Territory" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Map of Test Territory" }),
  ).toBeTruthy();
  expect(
    container.querySelector(".tap-reveal-base-map")?.getAttribute("src"),
  ).toBe("/demo-territory-player.svg");
  expect(screen.queryByRole("button", { name: "Unlock mode" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close map" }));
  fireEvent.click(
    screen.getByRole("button", { name: "View map of Test Territory" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Map of Test Territory" }),
  ).toBeTruthy();
});
it("explains why a territory without an assigned map cannot be opened", () => {
  renderTerritory(false);
  expect(
    screen.getByText("No map has been assigned to this territory."),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Open map for Test Territory" }),
  ).toBeNull();
});
it("opens a D1 map directly without first requesting a Google Drive thumbnail", () => {
  const { container } = renderTerritory(true, true);
  fireEvent.click(
    screen.getByRole("button", { name: "Open map for Test Territory" }),
  );
  expect(
    container.querySelector(".tap-reveal-base-map")?.getAttribute("src"),
  ).toBe("https://campaign.example/files/synthetic-file");
});
