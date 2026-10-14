import { afterEach, expect, it, vi } from "vitest";
import { createMockBootstrap } from "../src/app/mockData";

afterEach(() => vi.unstubAllEnvs());
it("uses the existing transport and unprefixed session storage in live mode", async () => {
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_APPS_SCRIPT_URL", "https://live.example.invalid/sheets");
  vi.resetModules();
  window.localStorage.setItem("pcm-session-token", "live-session");
  window.localStorage.setItem(
    "pcm-demo:player:pcm-session-token",
    "demo-token",
  );
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json(createMockBootstrap()));
  const api = await import("../src/google-sheets-api");
  expect(api.getSessionToken()).toBe("live-session");
  await api.loadSheetData("demo-character");
  const url = new URL(String(network.mock.calls[0][0]));
  expect(url.origin).toBe("https://live.example.invalid");
  expect(url.searchParams.get("sessionToken")).toBe("live-session");
  expect(url.searchParams.get("characterId")).toBe("demo-character");
  api.clearSession();
  expect(window.localStorage.getItem("pcm-session-token")).toBeNull();
  expect(window.localStorage.getItem("pcm-demo:player:pcm-session-token")).toBe(
    "demo-token",
  );
});
