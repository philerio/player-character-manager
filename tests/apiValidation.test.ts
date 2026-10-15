import { afterEach, expect, it, vi } from "vitest";
import { createMockBootstrap } from "../src/app/mockData";
import { validateResponse } from "../src/app/validation";
import { requestCampaign } from "../src/app/transport";
import { demoRequest, getDemoBootstrap } from "../src/app/demoApi";
import { appStorage } from "../src/app/storage";
const data = createMockBootstrap();
const characterId = data.selectedCharacterId;
const request = (
  action: string,
  payload: Record<string, unknown>,
  result: unknown,
) =>
  requestCampaign(
    "https://campaign.example.test/",
    {
      method: "POST",
      body: JSON.stringify({ action, characterId, ...payload }),
    },
    vi.fn().mockResolvedValue(Response.json(result)),
  );
afterEach(() => {
  appStorage.clear();
  vi.unstubAllEnvs();
});

it.each([
  "auth.login",
  "auth.password.change",
  "auth.register",
  "auth.recovery.question",
  "character.create",
  "character.update",
  "character.delete",
  "transaction.create",
  "transaction.delete",
  "recurring.create",
  "recurring.update",
  "recurring.cancel",
  "retainer.create",
  "retainer.update",
  "retainer.delete",
  "journal.create",
  "journal.update",
  "journal.delete",
  "territory.delete",
  "wallet.backup.load",
  "wallet.backup.save",
  "tab.push",
  "campaign.update",
  "discord.webhook.update",
  "journal.discord.send",
])("rejects an incomplete successful %s response", (action) => {
  expect(() => validateResponse(action, { ok: true }, characterId)).toThrow();
});

it("rejects another character's backup even when its schedules are empty", async () => {
  await expect(
    request(
      "wallet.backup.load",
      {},
      {
        ok: true,
        characterId: "other-character",
        backedUpAt: "2026-10-14",
        transactions: [
          {
            id: 1,
            kind: "income",
            label: "Savings",
            coins: { pp: 0, gp: 999, sp: 0, cp: 0 },
          },
        ],
        recurringExpenses: [],
      },
    ),
  ).rejects.toMatchObject({ code: "validation" });
});
it("accepts a valid backup with legacy transactions lacking characterId", async () => {
  expect(
    (
      await request(
        "wallet.backup.load",
        {},
        {
          ok: true,
          characterId,
          backedUpAt: "2026-10-14",
          transactions: [
            {
              id: 1,
              kind: "income",
              label: "Savings",
              coins: { pp: 0, gp: 10, sp: 0, cp: 0 },
            },
          ],
          recurringExpenses: [],
        },
      )
    ).ok,
  ).toBe(true);
});
it.each([
  ["journal.update", { entryId: "expected-entry" }, { entry: data.journal[0] }],
  [
    "retainer.update",
    { retainerId: "expected-retainer" },
    { retainer: data.retainers[0], schedule: null },
  ],
  [
    "territory.fields.update",
    { hexId: "expected-hex" },
    { hex: data.territoryHexes[0] },
  ],
  [
    "character.update",
    { characterId: "expected-character" },
    { character: data.characters[0] },
  ],
])(
  "rejects a wrong-record %s acknowledgement",
  async (action, payload, records) => {
    await expect(
      request(action, payload, { ok: true, ...records }),
    ).rejects.toMatchObject({ code: "validation" });
  },
);
it.each([
  ["journal.delete", { entryId: "expected" }, { deletedEntryId: "other" }],
  ["retainer.delete", { retainerId: "expected" }, { retainerId: "other" }],
  [
    "character.delete",
    { characterId: "expected" },
    { deletedCharacterId: "other" },
  ],
])(
  "rejects a wrong-record %s deletion acknowledgement",
  async (action, payload, fields) => {
    await expect(
      request(action, payload, { ok: true, ...fields }),
    ).rejects.toMatchObject({ code: "validation" });
  },
);
it("accepts correctly matched updates and deletions", async () => {
  const entry = data.journal[0];
  expect(
    (
      await request(
        "journal.update",
        { entryId: entry.entryId },
        { ok: true, entry },
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await request(
        "journal.delete",
        { entryId: entry.entryId },
        { ok: true, deletedEntryId: entry.entryId },
      )
    ).ok,
  ).toBe(true);
});
it("rejects partial journal records even with matching IDs", async () => {
  await expect(
    request(
      "journal.update",
      { entryId: "entry" },
      { ok: true, entry: { entryId: "entry", characterId } },
    ),
  ).rejects.toMatchObject({ code: "validation" });
});
it("validates both login branches and the signed-in player", async () => {
  expect(
    (
      await request(
        "auth.login",
        { playerId: data.currentPlayer.playerId },
        {
          ok: true,
          mustChangePassword: false,
          sessionToken: "token",
          currentPlayer: data.currentPlayer,
          players: data.players,
          characters: data.characters,
        },
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await request(
        "auth.login",
        {},
        {
          ok: true,
          mustChangePassword: true,
          passwordChangeToken: "change-token",
        },
      )
    ).ok,
  ).toBe(true);
  // Login may omit roster lists; the normal account refresh loads them later.
  expect(
    (
      await request(
        "auth.login",
        { playerId: data.currentPlayer.playerId },
        {
          ok: true,
          mustChangePassword: false,
          sessionToken: "token",
          currentPlayer: data.currentPlayer,
        },
      )
    ).ok,
  ).toBe(true);
  await expect(
    request(
      "auth.login",
      { playerId: "someone-else" },
      {
        ok: true,
        mustChangePassword: false,
        sessionToken: "token",
        currentPlayer: data.currentPlayer,
        players: data.players,
        characters: data.characters,
      },
    ),
  ).rejects.toMatchObject({ code: "validation" });
});
it("does not save a session from an incomplete password-change response", async () => {
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_APPS_SCRIPT_URL", "https://campaign.example.test/");
  vi.resetModules();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
  const api = await import("../src/google-sheets-api");
  await expect(
    api.changeInitialPassword({
      passwordChangeToken: "change-token",
      newPassword: "new",
      recoveryQuestion: "Question",
      recoveryAnswer: "Answer",
    }),
  ).rejects.toMatchObject({ code: "validation" });
  expect(api.getSessionToken()).toBe("");
});
it.each(["journal", "retainer"])(
  "demo rejects a stale %s update and delete without changing the record",
  async (kind) => {
    const before = getDemoBootstrap();
    const record = kind === "journal" ? before.journal[0] : before.retainers[0];
    const payload =
      kind === "journal"
        ? {
            entryId: before.journal[0].entryId,
            title: "Overwrite",
            category: "",
            notes: "Overwrite",
          }
        : { retainerId: before.retainers[0].retainerId, name: "Overwrite" };
    for (const verb of ["update", "delete"]) {
      const result = await demoRequest("https://demo.invalid/sheets", {
        method: "POST",
        body: JSON.stringify({
          action: `${kind}.${verb}`,
          characterId: before.selectedCharacterId,
          expectedUpdatedAt: "stale-version",
          ...payload,
        }),
      });
      expect(await result.json()).toMatchObject({
        ok: false,
        error: expect.stringContaining("Conflict"),
      });
    }
    const after = getDemoBootstrap();
    expect(kind === "journal" ? after.journal[0] : after.retainers[0]).toEqual(
      record,
    );
  },
);
it("demo accepts a matching version then rejects a second edit using the previous version", async () => {
  const before = getDemoBootstrap();
  const entry = before.journal[0];
  const payload = {
    action: "journal.update",
    characterId: before.selectedCharacterId,
    entryId: entry.entryId,
    expectedUpdatedAt: entry.updatedAt,
    title: "Updated",
    category: entry.category,
    notes: entry.notes,
  };
  const send = () =>
    demoRequest("https://demo.invalid/sheets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  expect(await (await send()).json()).toMatchObject({
    ok: true,
    entry: { title: "Updated" },
  });
  expect(await (await send()).json()).toMatchObject({
    ok: false,
    error: expect.stringContaining("Conflict"),
  });
});
