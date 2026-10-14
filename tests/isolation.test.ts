import { beforeEach, describe, expect, it, vi } from "vitest";
import { appStorage } from "../src/app/storage";
import { createMockBootstrap } from "../src/app/mockData";
import { demoRequest, getDemoBootstrap } from "../src/app/demoApi";
import {
  clearSession,
  getSessionToken,
  loadSheetData,
  saveSheetCharacter,
  saveJournalEntry,
  backupLocalWallet,
  loadLocalWalletBackup,
  markTabAuthoritative,
  loadTabSyncRevisions,
} from "../src/google-sheets-api";

beforeEach(() => vi.resetModules());

const liveKey = "pcm-session-token";
describe("demo fixtures and isolation", () => {
  it("creates fresh linked synthetic data for both roles", () => {
    const first = createMockBootstrap();
    first.characters[0].name = "Changed";
    const second = createMockBootstrap("dm");
    expect(second.characters[0].name).toBe("Rowan Ashford");
    expect(second.permissions.isDm).toBe(true);
    expect(second.currentPlayer.role).toBe("dm");
    const ids = new Set(second.characters.map((c) => c.characterId));
    expect(second.transactions.every((t) => ids.has(t.characterId))).toBe(true);
    expect(second.recurringExpenses[0].sourceId).toBe(
      second.retainers[0].retainerId,
    );
    expect(JSON.stringify(second)).not.toMatch(
      /discord\.com\/api\/webhooks|passwordHash|sessionTokenHash|recoveryAnswer/,
    );
  });

  it("keeps live sessions and caches untouched during demo writes and cleanup", () => {
    window.localStorage.setItem(liveKey, "live-token");
    window.localStorage.setItem(
      "pcm-bootstrap-cache:v1:live:character",
      "live-cache",
    );
    appStorage.setItem(liveKey, "demo-token");
    expect(appStorage.getItem(liveKey)).toBe("demo-token");
    expect(getSessionToken()).toBe("demo-session");
    clearSession();
    appStorage.clear();
    expect(window.localStorage.getItem(liveKey)).toBe("live-token");
    expect(
      window.localStorage.getItem("pcm-bootstrap-cache:v1:live:character"),
    ).toBe("live-cache");
  });

  it("routes CRUD, backups and revisions locally with a configured live URL", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network request"));
    const created = await saveSheetCharacter({
      playerName: "Demo",
      name: "New Hero",
      className: "Fighter",
      level: 1,
    });
    expect(
      (await loadSheetData(created.characterId)).transactions,
    ).toHaveLength(0);
    const entry = await saveJournalEntry({
      characterId: created.characterId,
      title: "A new start",
      tags: ["Adventure"],
      notes: "Hello",
    });
    expect(getDemoBootstrap(created.characterId).journal[0].entryId).toBe(
      entry.entryId,
    );
    await backupLocalWallet({
      characterId: created.characterId,
      transactions: [],
      recurringExpenses: [],
    });
    expect(
      (await loadLocalWalletBackup(created.characterId)).transactions,
    ).toEqual([]);
    await markTabAuthoritative({
      characterId: created.characterId,
      tab: "journal",
    });
    expect((await loadTabSyncRevisions(created.characterId)).journal).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });

  it("reports unsupported demo actions instead of pretending they succeeded", async () => {
    const response = await demoRequest("https://demo.invalid/sheets", {
      method: "POST",
      body: JSON.stringify({
        action: "character.portrait.upload",
        characterId: "demo-character",
      }),
    });
    expect((await response.json()).ok).toBe(false);
  });

  it("isolates player and DM demo storage and honors permissions", async () => {
    appStorage.setItem("role-check", "player-only");
    window.history.replaceState({}, "", "/?demo=dm");
    vi.resetModules();
    const { appStorage: dmStorage } = await import("../src/app/storage");
    const { getDemoBootstrap: dmBootstrap } =
      await import("../src/app/demoApi");
    expect(dmStorage.getItem("role-check")).toBeNull();
    expect(dmBootstrap().permissions.playerManagement).toBe(true);
    expect(dmBootstrap().currentPlayer.role).toBe("dm");
  });
});

it("can recreate a character after deleting the entire demo roster", async () => {
  const { deleteSheetCharacter } = await import("../src/google-sheets-api");
  const snapshot = getDemoBootstrap();
  for (const character of snapshot.characters)
    await deleteSheetCharacter(character.characterId);
  expect(getDemoBootstrap().characters).toEqual([]);
  const character = await saveSheetCharacter({
    playerName: "Demo",
    name: "Fresh Hero",
    className: "Fighter",
    level: 1,
  });
  expect(getDemoBootstrap().characters[0].characterId).toBe(
    character.characterId,
  );
});

it("deduplicates scouting submissions using the client mission ID", async () => {
  const { startScoutingMission } = await import("../src/google-sheets-api");
  const input = {
    characterId: "demo-character",
    territoryId: "demo-territory",
    hexNumber: "2",
    mapX: 1,
    mapY: 1,
    allocations: [
      { retainerId: "demo-force", soldierType: "footman, light", men: 5 },
    ],
    clientMissionId: "demo-idempotent",
    startedAt: "2026-01-01T00:00:00.000Z",
    durationDays: 2,
  };
  const first = await startScoutingMission(input);
  const second = await startScoutingMission(input);
  expect(second.mission.missionId).toBe(first.mission.missionId);
  expect(first.mission.status).toBe("completed");
  expect(
    getDemoBootstrap().scoutingMissions.filter(
      (m) => m.clientMissionId === input.clientMissionId,
    ),
  ).toHaveLength(1);
});
