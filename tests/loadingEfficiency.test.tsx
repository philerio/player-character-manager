import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import App from "../src/App";
import { useAppController } from "../src/app/useAppController";
import * as api from "../src/google-sheets-api";
import { createMockBootstrap } from "../src/app/mockData";
const fixture = createMockBootstrap();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
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
it("starts independent reads together and makes each dataset usable before a slow peer finishes", async () => {
  const journal = deferred<Awaited<ReturnType<typeof api.loadJournalData>>>();
  const retainers =
    deferred<Awaited<ReturnType<typeof api.loadRetainerData>>>();
  const territories =
    deferred<Awaited<ReturnType<typeof api.loadTerritoryStatus>>>();
  const roster = vi.spyOn(api, "loadAccountRoster");
  const journalRead = vi
    .spyOn(api, "loadJournalData")
    .mockReturnValue(journal.promise);
  const retainerRead = vi
    .spyOn(api, "loadRetainerData")
    .mockReturnValue(retainers.promise);
  const territoryRead = vi
    .spyOn(api, "loadTerritoryStatus")
    .mockReturnValue(territories.promise);
  const { result } = renderHook(() => useAppController());
  await waitFor(() => {
    expect(journalRead).toHaveBeenCalledOnce();
    expect(retainerRead).toHaveBeenCalledOnce();
    expect(territoryRead).toHaveBeenCalledOnce();
  });
  expect(roster).not.toHaveBeenCalled();
  await act(async () => {
    retainers.resolve({
      ok: true,
      characterId: fixture.selectedCharacterId,
      retainers: fixture.retainers,
    });
    territories.resolve({
      ...fixture,
      customMissions: [],
      characterId: fixture.selectedCharacterId,
    });
  });
  expect(result.current.background.resources.territories.status).toBe("ready");
  expect(result.current.background.resources.retainers.status).toBe("ready");
  expect(result.current.background.resources.journal.status).toBe("loading");
  expect(result.current.background.refreshing).toBe(true);
  await act(async () =>
    journal.resolve({
      ok: true,
      characterId: fixture.selectedCharacterId,
      journal: fixture.journal,
    }),
  );
  await ready(result);
});
it("reuses fresh character data and cached roster, but reloads a dataset when its published revision changes", async () => {
  const roster = vi.spyOn(api, "loadAccountRoster");
  const journal = vi.spyOn(api, "loadJournalData");
  const retainers = vi.spyOn(api, "loadRetainerData");
  const territories = vi.spyOn(api, "loadTerritoryStatus");
  const { result } = renderHook(() => useAppController());
  await ready(result);
  await act(() => result.current.selectCharacter("demo-character-2"));
  await ready(result);
  await act(() => result.current.selectCharacter("demo-character"));
  await ready(result);
  const callsForFirst = (
    spy: typeof journal | typeof retainers | typeof territories,
  ) => spy.mock.calls.filter((call) => call[0] === "demo-character").length;
  expect(callsForFirst(journal)).toBe(1);
  expect(callsForFirst(retainers)).toBe(1);
  expect(callsForFirst(territories)).toBe(1);
  expect(roster).not.toHaveBeenCalled();
  await api.markTabAuthoritative({
    characterId: "demo-character",
    tab: "journal",
  });
  await act(() => result.current.selectCharacter("demo-character-2"));
  await ready(result);
  await act(() => result.current.selectCharacter("demo-character"));
  await ready(result);
  expect(callsForFirst(journal)).toBe(2);
  expect(callsForFirst(retainers)).toBe(1);
  expect(callsForFirst(territories)).toBe(1);
});
it("keeps refresh progress with the character name and inside its dropdown", async () => {
  const journal = deferred<Awaited<ReturnType<typeof api.loadJournalData>>>();
  vi.spyOn(api, "loadJournalData").mockReturnValue(journal.promise);
  const view = render(<App />);
  const selector = await screen.findByRole("button", {
    name: "Rowan Ashford",
    hidden: true,
  });
  expect(
    within(selector).getByRole("progressbar", {
      hidden: true,
      name: "Loading data for Rowan Ashford",
    }),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".page-content > .workflow-status"),
  ).toBeNull();
  expect(
    screen.queryByRole("progressbar", {
      hidden: true,
      name: "Refreshing journal",
    }),
  ).toBeNull();
  fireEvent.click(selector);
  const menu = view.container.querySelector<HTMLElement>(".character-menu")!;
  expect(
    within(menu).getByRole("complementary", {
      hidden: true,
      name: "Data and save status",
    }),
  ).toBeTruthy();
  expect(
    within(menu).getAllByRole("progressbar", { hidden: true }),
  ).toHaveLength(1);
  await act(async () =>
    journal.resolve({
      ok: true,
      characterId: fixture.selectedCharacterId,
      journal: fixture.journal,
    }),
  );
  await waitFor(() =>
    expect(
      within(selector).queryByRole("progressbar", { hidden: true }),
    ).toBeNull(),
  );
});
