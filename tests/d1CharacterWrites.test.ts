import { afterEach, expect, it, vi } from "vitest";
const input = {
  playerName: "Player",
  name: "Hero",
  className: "Fighter",
  level: 1,
};
const character = {
  characterId: "hero",
  playerId: "player",
  name: "Hero",
  class: "Fighter",
  level: 1,
  version: 1,
};
async function setup() {
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_API_BACKEND", "d1");
  vi.stubEnv("VITE_API_URL", "https://characters.example.test/api");
  vi.resetModules();
  const { appStorage } = await import("../src/app/storage");
  appStorage.setItem("pcm-session-token", "character-session");
  return import("../src/google-sheets-api");
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("preserves character creation request IDs across lost responses and reloads, then clears confirmed requests", async () => {
  let api = await setup();
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("Connection lost"))
    .mockImplementation(async () => Response.json({ ok: true, character }));
  await expect(api.saveSheetCharacter(input)).rejects.toMatchObject({
    code: "uncertain",
  });
  const first = JSON.parse(String(network.mock.calls[0][1]?.body));
  expect(first.clientMutationId).toBeTruthy();
  vi.resetModules();
  api = await import("../src/google-sheets-api");
  await api.saveSheetCharacter(input);
  const retry = JSON.parse(String(network.mock.calls[1][1]?.body));
  expect(retry.clientMutationId).toBe(first.clientMutationId);
  await api.saveSheetCharacter(input);
  const deliberateNew = JSON.parse(String(network.mock.calls[2][1]?.body));
  expect(deliberateNew.clientMutationId).not.toBe(first.clientMutationId);
});
it("sends the edit's version and refuses unversioned D1 edits and deletions", async () => {
  const api = await setup();
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () =>
      Response.json({ ok: true, character: { ...character, version: 2 } }),
    );
  await api.updateSheetCharacter({
    characterId: "hero",
    ...input,
    expectedVersion: 1,
  });
  expect(
    JSON.parse(String(network.mock.calls[0][1]?.body)).expectedVersion,
  ).toBe(1);
  await expect(
    api.updateSheetCharacter({ characterId: "hero", ...input }),
  ).rejects.toThrow("Refresh");
  await expect(api.deleteSheetCharacter("hero")).rejects.toThrow("Refresh");
  expect(network).toHaveBeenCalledTimes(1);
});
