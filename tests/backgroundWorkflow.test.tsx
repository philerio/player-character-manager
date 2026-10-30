import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAppController } from "../src/app/useAppController";
import { createMockBootstrap } from "../src/app/mockData";
import { loadJournalDraft } from "../src/app/journalStorage";
import { getDemoBootstrap } from "../src/app/demoApi";
import * as api from "../src/google-sheets-api";
const fixture = createMockBootstrap();
afterEach(() => vi.useRealTimers());
async function ready(result: { current: ReturnType<typeof useAppController> }) {
  await waitFor(
    () =>
      expect(
        Object.values(result.current.background.resources).every(
          (resource) => resource.status === "ready",
        ) && !result.current.background.refreshing,
      ).toBe(true),
    { timeout: 5000 },
  );
}
it("sends ordinary journal edits after a debounce without clicking Sync", async () => {
  const { result } = renderHook(() => useAppController());
  await ready(result);
  const create = vi.spyOn(api, "saveJournalEntry");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await act(() =>
    result.current.saveCampaignJournalEntry({
      title: "Automatic notes",
      tags: [],
      notes: "No Sync click needed",
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2499);
  });
  expect(create).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  vi.useRealTimers();
  await waitFor(() => expect(loadJournalDraft("demo-character")).toBeNull(), {
    timeout: 5000,
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(
    getDemoBootstrap("demo-character").journal.some(
      (entry) => entry.title === "Automatic notes",
    ),
  ).toBe(true);
}, 30_000);
it("keeps notes queued offline and resumes safely after reconnecting", async () => {
  const { result } = renderHook(() => useAppController());
  await ready(result);
  const connection = vi
    .spyOn(navigator, "onLine", "get")
    .mockReturnValue(false);
  act(() => window.dispatchEvent(new Event("offline")));
  await act(() =>
    result.current.saveCampaignJournalEntry({
      title: "Offline notes",
      tags: [],
      notes: "Preserve me",
    }),
  );
  expect(loadJournalDraft("demo-character")?.operations).toHaveLength(1);
  expect(result.current.background.online).toBe(false);
  expect(
    getDemoBootstrap("demo-character").journal.some(
      (entry) => entry.title === "Offline notes",
    ),
  ).toBe(false);
  connection.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(loadJournalDraft("demo-character")).toBeNull(), {
    timeout: 5000,
  });
  expect(
    getDemoBootstrap("demo-character").journal.filter(
      (entry) => entry.title === "Offline notes",
    ),
  ).toHaveLength(1);
}, 30_000);
it("ignores a late read even after switching A to B and back to A", async () => {
  let resolve!: (
    value: Awaited<ReturnType<typeof api.loadJournalData>>,
  ) => void;
  let aCalls = 0;
  vi.spyOn(api, "loadJournalData").mockImplementation(async (id) => {
    if (id === "demo-character" && ++aCalls === 1)
      return new Promise((done) => {
        resolve = done;
      });
    return {
      ok: true,
      characterId: id,
      journal:
        id === "demo-character"
          ? [{ ...fixture.journal[0], title: "Newest notes" }]
          : [],
    };
  });
  const { result } = renderHook(() => useAppController());
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  await act(() => result.current.selectCharacter("demo-character-2"));
  await ready(result);
  await act(() => result.current.selectCharacter("demo-character"));
  await ready(result);
  await act(async () => {
    resolve({
      ok: true,
      characterId: "demo-character",
      journal: [{ ...fixture.journal[0], title: "Obsolete notes" }],
    });
    await Promise.resolve();
  });
  expect(result.current.journalEntries[0].title).toBe("Newest notes");
  expect(api.loadCachedSheetData("demo-character")?.journal[0].title).toBe(
    "Newest notes",
  );
}, 30_000);

async function dmController() {
  window.history.replaceState({}, "", "/?demo=dm");
  vi.resetModules();
  const { useAppController: useDmController } =
    await import("../src/app/useAppController");
  const dmApi = await import("../src/google-sheets-api");
  const storage = await import("../src/app/journalStorage");
  const { result } = renderHook(() => useDmController());
  await ready(result);
  expect(result.current.currentPlayer?.role).toBe("dm");
  return { result, dmApi, storage };
}
it("does not poll every debounce period for DM drafts on another player's character, but keeps reads and explicit pushes working", async () => {
  const { result, dmApi, storage } = await dmController();
  expect(result.current.dmOwnsSelectedCharacter).toBe(false);
  const read = vi.spyOn(dmApi, "loadTabSyncRevisions");
  const create = vi.spyOn(dmApi, "saveJournalEntry");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await act(() =>
    result.current.saveCampaignJournalEntry({
      title: "DM working note",
      tags: [],
      notes: "Publish explicitly",
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(read).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(storage.loadJournalDraft("demo-character")?.operations).toHaveLength(
    1,
  );
  expect(result.current.background.refreshing).toBe(false);
  vi.useRealTimers();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(read).toHaveBeenCalled());
  await waitFor(() => expect(result.current.background.refreshing).toBe(false));
  expect(create).not.toHaveBeenCalled();
  expect(storage.loadJournalDraft("demo-character")?.operations).toHaveLength(
    1,
  );
  await act(() => result.current.pushDmTabToSheet("journal"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(storage.loadJournalDraft("demo-character")).toBeNull();
  expect(result.current.dmTabPushSuccess).toBe("journal");
}, 30_000);
it("continues automatically saving journal changes for a DM-owned character", async () => {
  const { result, dmApi, storage } = await dmController();
  await act(() =>
    result.current.createCharacter({
      playerName: "Demo DM",
      targetPlayerId: "demo-dm",
      name: "DM adventurer",
      className: "Fighter",
      level: 1,
    }),
  );
  await ready(result);
  expect(result.current.dmOwnsSelectedCharacter).toBe(true);
  const id = result.current.selectedCharacterId;
  const create = vi.spyOn(dmApi, "saveJournalEntry");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await act(() =>
    result.current.saveCampaignJournalEntry({
      title: "My character note",
      tags: [],
      notes: "Automatic save",
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500);
  });
  vi.useRealTimers();
  await waitFor(() => expect(storage.loadJournalDraft(id)).toBeNull());
  expect(create).toHaveBeenCalledTimes(1);
}, 30_000);
