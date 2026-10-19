import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as api from "../src/google-sheets-api";
import { useJournal } from "../src/app/useJournal";
import { useTerritories } from "../src/app/useTerritories";
import { loadJournalDraft } from "../src/app/journalStorage";
import { loadTerritoryDraft } from "../src/app/territoryStorage";
import { createMockBootstrap } from "../src/app/mockData";
import { requestCampaign } from "../src/app/transport";
import { AppError } from "../src/app/errors";
const fixture = createMockBootstrap(),
  id = fixture.selectedCharacterId;
function journalHook() {
  return renderHook(() =>
    useJournal(() => ({
      cacheBaseRef: { current: fixture },
      selectedCharacter: fixture.characters[0],
      selectedCharacterIdRef: { current: id },
      setModal: vi.fn(),
    })),
  );
}
it("allows a definitively rejected journal create to be corrected and saved without an uncertainty dead end", async () => {
  vi.spyOn(api, "loadJournalData").mockResolvedValue({
    ok: true,
    characterId: id,
    journal: [],
  });
  const create = vi
    .spyOn(api, "saveJournalEntry")
    .mockImplementation(async () => {
      await requestCampaign(
        "https://campaign.example.test/",
        {
          method: "POST",
          body: JSON.stringify({ action: "journal.create", characterId: id }),
        },
        async () =>
          Response.json(
            {
              ok: false,
              code: "invalid_request",
              error: "A required field is empty.",
            },
            { status: 400 },
          ),
      );
      throw new Error("Expected rejection");
    });
  const { result } = journalHook();
  await act(() =>
    result.current.saveCampaignJournalEntry({
      title: "Notes",
      tags: [],
      notes: "",
    }),
  );
  const operationId = loadJournalDraft(id)!.operations[0].id;
  await act(async () => {
    await expect(result.current.syncJournalToCampaign()).rejects.toMatchObject({
      code: "rejected",
    });
  });
  expect(loadJournalDraft(id)?.uncertain).toEqual([]);
  act(() =>
    result.current.setEditingJournalEntry(result.current.journalEntries[0]),
  );
  await act(() =>
    result.current.saveCampaignJournalEntry({
      title: "Notes",
      tags: [],
      notes: "Corrected notes",
    }),
  );
  expect(loadJournalDraft(id)?.operations).toHaveLength(1);
  create.mockImplementation(async (input) => ({
    entryId: "server-entry",
    characterId: id,
    playerId: fixture.currentPlayer.playerId,
    title: input.title,
    category: input.tags.join(", "),
    notes: input.notes,
    clientMutationId: input.clientMutationId,
    createdAt: "2026-10-15T10:00:00Z",
    updatedAt: "2026-10-15T10:00:00Z",
  }));
  await act(() => result.current.syncJournalToCampaign());
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[1][0]).toMatchObject({
    clientMutationId: operationId,
    notes: "Corrected notes",
  });
  expect(loadJournalDraft(id)).toBeNull();
  expect(result.current.journalEntries[0].notes).toBe("Corrected notes");
});
it("still preserves an uncertain journal creation when confirmation really was lost", async () => {
  vi.spyOn(api, "loadJournalData").mockResolvedValue({
    ok: true,
    characterId: id,
    journal: [],
  });
  const create = vi
    .spyOn(api, "saveJournalEntry")
    .mockRejectedValue(new AppError("uncertain", "Confirmation lost"));
  const { result } = journalHook();
  await act(() =>
    result.current.saveCampaignJournalEntry({
      title: "Notes",
      tags: [],
      notes: "Keep these notes",
    }),
  );
  await act(async () => {
    await expect(result.current.syncJournalToCampaign()).rejects.toMatchObject({
      code: "uncertain",
    });
  });
  await act(async () => {
    await expect(result.current.syncJournalToCampaign()).rejects.toMatchObject({
      code: "uncertain",
    });
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(loadJournalDraft(id)?.uncertain).toHaveLength(1);
});
it("keeps the sign-in cooldown message and Retry-After without misclassifying it as session expiry", async () => {
  const send = vi.fn().mockResolvedValue(
    Response.json(
      {
        ok: false,
        code: "rate_limited",
        error:
          "Too many sign-in attempts. Wait 15 minutes before trying again.",
      },
      { status: 429, headers: { "Retry-After": "900" } },
    ),
  );
  await expect(
    requestCampaign(
      "https://campaign.example.test/",
      { method: "POST", body: JSON.stringify({ action: "auth.login" }) },
      send,
    ),
  ).rejects.toMatchObject({
    code: "rate-limit",
    retryAfterSeconds: 900,
    message: expect.stringContaining("Wait 15 minutes"),
  });
  expect(send).toHaveBeenCalledTimes(1);
});
it("shows the backend reference on unexpected service errors without leaking raw database errors", async () => {
  const requestId = "12345678-1234-4321-a123-123456789012";
  const send = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { ok: false, error: "PRIVATE DATABASE DETAILS", requestId },
        { status: 500 },
      ),
    );
  await expect(
    requestCampaign(
      "https://campaign.example.test/",
      { method: "POST", body: JSON.stringify({ action: "journal.create" }) },
      send,
    ),
  ).rejects.toMatchObject({
    requestId,
    message: expect.stringContaining(requestId),
  });
  expect(send).toHaveBeenCalledTimes(1);
});
function territoryHook() {
  return renderHook(() =>
    useTerritories(() => ({
      selectedCharacter: fixture.characters[0],
      selectedCharacterIdRef: { current: id },
      selectedCharacterId: id,
      setRetainers: vi.fn(),
      retainerDraftDirty: false,
      setModal: vi.fn(),
      permissions: fixture.permissions,
      cacheBaseRef: { current: fixture },
    })),
  );
}
it("sends reveal-only requests for older saved unlock drafts without sending stale notes", async () => {
  const { result } = territoryHook();
  const base = fixture.territoryHexes[0],
    fresh = {
      ...base,
      contents: "New server notes",
      mapX: 75,
      mapY: 65,
      dmRevealed: true,
      updatedAt: "2026-10-15T10:00:00Z",
    };
  const write = vi
    .spyOn(api, "upsertTerritoryHex")
    .mockResolvedValue({ ok: true, hex: fresh });
  vi.spyOn(api, "loadTerritoryStatus").mockResolvedValue({
    ...fixture,
    characterId: id,
    territoryHexes: [fresh],
    customMissions: [],
  });
  act(() =>
    result.current.queueTerritoryOperation(
      {
        id: "old-unlock",
        kind: "hex",
        territoryId: base.territoryId,
        localHexId: base.hexId,
        hexNumber: base.hexNumber,
        mapX: 1,
        mapY: 2,
        title: "Stale title",
        contents: "Stale notes",
        dmRevealed: true,
      },
      { territoryHexes: [{ ...base, dmRevealed: true }] },
    ),
  );
  await act(() => result.current.syncTerritoryData());
  expect(write.mock.calls[0][0]).toMatchObject({
    revealOnly: true,
    dmRevealed: true,
    title: undefined,
    contents: undefined,
  });
  expect(result.current.territoryHexes[0]).toMatchObject({
    contents: "New server notes",
    mapX: 75,
    mapY: 65,
  });
  expect(loadTerritoryDraft(id)).toBeNull();
});
it("checkpoints versions across multiple queued edits to the same hex", async () => {
  const { result } = territoryHook();
  const base = {
    ...fixture.territoryHexes[0],
    updatedAt: "2026-10-15T10:00:00.000Z",
  };
  const second = {
    ...base,
    contents: "Second",
    updatedAt: "2026-10-15T10:00:00.002Z",
  };
  const write = vi
    .spyOn(api, "upsertTerritoryHex")
    .mockResolvedValueOnce({
      ok: true,
      hex: {
        ...base,
        contents: "First",
        updatedAt: "2026-10-15T10:00:00.001Z",
      },
    })
    .mockResolvedValueOnce({ ok: true, hex: second });
  vi.spyOn(api, "loadTerritoryStatus").mockResolvedValue({
    ...fixture,
    characterId: id,
    territoryHexes: [second],
    customMissions: [],
  });
  for (const [operationId, contents] of [
    ["first", "First"],
    ["second", "Second"],
  ])
    act(() =>
      result.current.queueTerritoryOperation(
        {
          id: operationId,
          kind: "hex",
          territoryId: base.territoryId,
          localHexId: base.hexId,
          hexNumber: base.hexNumber,
          mapX: base.mapX,
          mapY: base.mapY,
          contents,
          expectedUpdatedAt: base.updatedAt,
        },
        { territoryHexes: [{ ...base, contents }] },
      ),
    );
  await act(() => result.current.syncTerritoryData());
  expect(write.mock.calls.map(([input]) => input.expectedUpdatedAt)).toEqual([
    "2026-10-15T10:00:00.000Z",
    "2026-10-15T10:00:00.001Z",
  ]);
  expect(loadTerritoryDraft(id)).toBeNull();
  expect(result.current.territoryHexes[0].contents).toBe("Second");
});
