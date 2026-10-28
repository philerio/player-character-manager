import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BackendStatus } from "../src/components/BackendStatus";
import { loadBackendStatus } from "../src/google-sheets-api";
import { validateResponse } from "../src/app/validation";
import type { BackendStatus as Status } from "../shared/backendStatus";
vi.mock("../src/app/runtime", () => ({ apiBackend: "d1", isDemoMode: false }));
vi.mock("../src/google-sheets-api", () => ({ loadBackendStatus: vi.fn() }));
const now = "2026-10-19T14:00:00.000Z";
const status: Status = {
  ok: true,
  checkedAt: now,
  schema: {
    ready: true,
    missing: [],
    pendingMigrations: [],
    appliedMigrations: null,
  },
  scheduler: {
    lastStartedAt: now,
    lastFinishedAt: now,
    lastSucceededAt: now,
    outcome: "ok",
    failureCount: 0,
    lastFailureCharacterId: null,
    lastFailureCategory: null,
  },
  notifications: { pending: 2, blocked: 1, failed: 0, oldestPendingAt: now },
  storage: { encodedBytes: 16 * 1048576, limitBytes: 128 * 1048576, files: 3 },
  activeCharacters: 2,
};
afterEach(() => vi.resetAllMocks());
function open() {
  const details = screen.getByText("Backend status").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}
it("loads only when opened and shows loading before any results", async () => {
  let resolve!: (s: Status) => void;
  vi.mocked(loadBackendStatus).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<BackendStatus />);
  expect(loadBackendStatus).not.toHaveBeenCalled();
  open();
  expect((await screen.findByRole("status")).textContent).toContain(
    "Checking campaign services",
  );
  expect(screen.queryByText("Schema checks passed.")).toBeNull();
  await act(async () => resolve(status));
  expect(
    await screen.findByText("Schema checks passed.", { exact: false }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Upload storage used" })
      .getAttribute("value"),
  ).toBe(String(16 * 1048576));
});
it("preserves the previous check and displays a refresh error explicitly", async () => {
  vi.mocked(loadBackendStatus)
    .mockResolvedValueOnce(status)
    .mockRejectedValueOnce(new Error("Could not reach the campaign."));
  render(<BackendStatus />);
  open();
  await screen.findByText("Last run completed.", { exact: false });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Refresh backend status",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh backend status" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Showing the previous check below",
  );
  expect(
    screen.getByText("Last run completed.", { exact: false }),
  ).toBeTruthy();
});
it("flags an unfinished old run and rejects malformed status payloads", async () => {
  vi.mocked(loadBackendStatus).mockResolvedValue({
    ...status,
    scheduler: {
      ...status.scheduler!,
      lastStartedAt: "2026-10-19T13:00:00Z",
      outcome: "running",
    },
  });
  render(<BackendStatus />);
  open();
  expect(await screen.findByText(/Last run did not finish/)).toBeTruthy();
  expect(() =>
    validateResponse("backend.status", {
      ...status,
      storage: { ...status.storage, encodedBytes: "not loaded" },
    }),
  ).toThrow();
  expect(() =>
    validateResponse("backend.status", { ...status, scheduler: null }),
  ).toThrow();
});
