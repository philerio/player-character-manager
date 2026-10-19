import { afterEach, expect, it, vi } from "vitest";
import { createMockBootstrap } from "../src/app/mockData";
import { requestCampaign } from "../src/app/transport";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("uses the D1 endpoint and isolates sessions, caches and drafts from Sheets and other D1 endpoints", async () => {
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_API_BACKEND", "d1");
  vi.stubEnv("VITE_PCM_ACCESS_KEY", "legacy-key");
  vi.stubEnv("VITE_API_URL", "https://staging.example.test/api");
  vi.stubEnv("VITE_APPS_SCRIPT_URL", "https://legacy.example.test/");
  vi.resetModules();
  window.localStorage.setItem("pcm-session-token", "sheets-session");
  window.localStorage.setItem(
    "pcm-journal-draft:v1:old",
    "pending Sheets draft",
  );
  const runtime = await import("../src/app/runtime");
  const { appStorage } = await import("../src/app/storage");
  expect(runtime.isDemoMode).toBe(false);
  expect(appStorage.getItem("pcm-session-token")).toBeNull();
  appStorage.setItem("pcm-session-token", "d1-session");
  expect(
    [...Array(appStorage.length)].map((_, index) => appStorage.key(index)),
  ).not.toContain("pcm-journal-draft:v1:old");
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json(createMockBootstrap()));
  const api = await import("../src/google-sheets-api");
  await api.loadSheetData("demo-character");
  const url = new URL(String(network.mock.calls[0][0]));
  expect(url.origin).toBe("https://staging.example.test");
  expect(url.searchParams.get("sessionToken")).toBe("d1-session");
  expect(url.searchParams.has("accessKey")).toBe(false);
  api.clearSession();
  expect(window.localStorage.getItem("pcm-session-token")).toBe(
    "sheets-session",
  );
  expect(window.localStorage.getItem("pcm-journal-draft:v1:old")).toBe(
    "pending Sheets draft",
  );
  vi.stubEnv("VITE_API_URL", "https://other.example.test/api");
  vi.resetModules();
  const other = await import("../src/app/storage");
  expect(other.appStorage.getItem("pcm-session-token")).toBeNull();
});
it("preserves actionable D1 conflict and unported operation errors without repeating writes", async () => {
  const send = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { ok: false, error: "Conflict: the journal changed in the campaign." },
        { status: 409 },
      ),
    );
  const options = {
    method: "POST",
    body: JSON.stringify({ action: "journal.update", characterId: "hero" }),
  };
  await expect(
    requestCampaign("https://campaign.example.test/", options, send),
  ).rejects.toMatchObject({ code: "conflict" });
  expect(send).toHaveBeenCalledTimes(1);
  send.mockResolvedValue(
    Response.json(
      { ok: false, error: "The operation has not been migrated to D1." },
      { status: 501 },
    ),
  );
  await expect(
    requestCampaign("https://campaign.example.test/", options, send),
  ).rejects.toThrow("has not been migrated");
  expect(send).toHaveBeenCalledTimes(2);
});
it("reports an absent wallet backup and treats a failed backup read as a read failure", async () => {
  const options = {
    method: "POST",
    body: JSON.stringify({ action: "wallet.backup.load", characterId: "hero" }),
  };
  const send = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { ok: false, error: "No wallet backup exists for this character." },
        { status: 404 },
      ),
    );
  await expect(
    requestCampaign("https://campaign.example.test/", options, send),
  ).rejects.toMatchObject({
    code: "not-found",
    message: "No wallet backup exists for this character.",
  });
  send.mockRejectedValue(new TypeError("Network failed"));
  await expect(
    requestCampaign("https://campaign.example.test/", options, send),
  ).rejects.toMatchObject({ code: "offline" });
  expect(send).toHaveBeenCalledTimes(2);
});
