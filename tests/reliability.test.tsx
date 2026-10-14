import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../src/google-sheets-api";
import { createMockBootstrap } from "../src/app/mockData";
import { useRetainers } from "../src/app/useRetainers";
import { useTerritories } from "../src/app/useTerritories";
import { useJournal } from "../src/app/useJournal";
import { useWallet } from "../src/app/useWallet";
import { loadRetainerDraft } from "../src/app/retainerStorage";
import { loadTerritoryDraft } from "../src/app/territoryStorage";
import { loadJournalDraft } from "../src/app/journalStorage";
import { AppError } from "../src/app/errors";
import { appStorage, hasStorageFailure } from "../src/app/storage";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.restoreAllMocks();
  appStorage.clear();
});
const data = createMockBootstrap();
const ref = () => ({ current: data.selectedCharacterId });
const input = (name: string) => ({
  type: "individual" as const,
  name,
  role: "Guide",
  amount: 2,
  costCoin: "gp" as const,
  wageFrequency: "monthly" as const,
});
function retainerHook() {
  const selection = ref();
  const hook = renderHook(() =>
    useRetainers(() => ({
      selectedCharacter: data.characters[0],
      selectedCharacterIdRef: selection,
      setModal: vi.fn(),
      setRecurringExpenses: vi.fn(),
    })),
  );
  act(() => hook.result.current.setRetainers(data.retainers));
  return hook;
}
describe("durable synchronization", () => {
  it("preserves a newer retainer edit while its initial creation is awaiting confirmation", async () => {
    const { result } = retainerHook();
    await act(() => result.current.saveRetainerRecord(input("First name")));
    const local = result.current.retainers[0];
    const confirmed = {
      ...local,
      retainerId: "server-guide",
      clientMutationId: `retainer:${local.retainerId}`,
    };
    const request = deferred<Awaited<ReturnType<typeof api.saveRetainer>>>();
    const create = vi
      .spyOn(api, "saveRetainer")
      .mockReturnValue(request.promise);
    vi.spyOn(api, "loadRetainerData").mockResolvedValue({
      ok: true,
      characterId: data.selectedCharacterId,
      retainers: data.retainers,
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.syncRetainersToCampaign();
    });
    // Let the remote read resolve and the creation start before making another edit.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.setEditingRetainer(local));
    await act(() => result.current.saveRetainerRecord(input("Newer name")));
    await act(async () => {
      request.resolve({ ok: true, retainer: confirmed, schedule: null });
      await pending;
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      loadRetainerDraft(data.selectedCharacterId)?.retainers[0],
    ).toMatchObject({ name: "Newer name", retainerId: "server-guide" });
    expect(result.current.retainerDraftDirty).toBe(true);
    vi.mocked(api.loadRetainerData).mockResolvedValue({
      ok: true,
      characterId: data.selectedCharacterId,
      retainers: [...data.retainers, confirmed],
    });
    const update = vi.spyOn(api, "updateRetainer").mockResolvedValue({
      ok: true,
      retainer: { ...confirmed, name: "Newer name" },
      schedule: null,
    });
    await act(() => result.current.syncRetainersToCampaign());
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(loadRetainerDraft(data.selectedCharacterId)).toBeNull();
  });

  it("checkpoints partial success and never blindly repeats an unconfirmed creation", async () => {
    const { result } = retainerHook();
    await act(() => result.current.saveRetainerRecord(input("First guide")));
    await act(() => result.current.saveRetainerRecord(input("Second guide")));
    const created = {
      ...result.current.retainers[0],
      retainerId: "server-first",
    };
    const remote = [...data.retainers, created];
    vi.spyOn(api, "loadRetainerData")
      .mockResolvedValueOnce({
        ok: true,
        characterId: data.selectedCharacterId,
        retainers: data.retainers,
      })
      .mockResolvedValue({
        ok: true,
        characterId: data.selectedCharacterId,
        retainers: remote,
      });
    const create = vi
      .spyOn(api, "saveRetainer")
      .mockResolvedValueOnce({ ok: true, retainer: created, schedule: null })
      .mockRejectedValueOnce(new AppError("uncertain", "Confirmation lost"));
    await act(async () => {
      await expect(result.current.syncRetainersToCampaign()).rejects.toThrow(
        "Confirmation lost",
      );
    });
    expect(
      loadRetainerDraft(data.selectedCharacterId)?.baseRetainers.some(
        (row) => row.retainerId === "server-first",
      ),
    ).toBe(true);
    await act(async () => {
      await expect(result.current.syncRetainersToCampaign()).rejects.toThrow(
        "unconfirmed",
      );
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(loadRetainerDraft(data.selectedCharacterId)?.creating).toBeTruthy();
  });

  it("does not discard drafts after a failed authoritative refresh", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = retainerHook();
    await act(() => result.current.saveRetainerRecord(input("Offline guide")));
    const before = loadRetainerDraft(data.selectedCharacterId);
    vi.spyOn(api, "loadRetainerData").mockRejectedValue(
      new AppError("offline", "Connection unavailable"),
    );
    await act(async () => {
      await expect(
        result.current.refreshRetainersFromCampaign(),
      ).rejects.toThrow("Connection unavailable");
    });
    expect(loadRetainerDraft(data.selectedCharacterId)).toEqual(before);
  });

  it("acknowledges only the territory operation sent before a newer edit", async () => {
    const selection = ref();
    const { result } = renderHook(() =>
      useTerritories(() => ({
        selectedCharacter: data.characters[0],
        selectedCharacterIdRef: selection,
        setRetainers: vi.fn(),
        retainerDraftDirty: false,
        setModal: vi.fn(),
        permissions: data.permissions,
        selectedCharacterId: selection.current,
        cacheBaseRef: { current: data },
      })),
    );
    act(() => result.current.setTerritories(data.territories));
    act(() =>
      result.current.queueTerritoryOperation(
        {
          id: "first",
          kind: "tithe",
          territoryId: "demo-territory",
          payChurchTithe: false,
        },
        {
          territories: data.territories.map((row) => ({
            ...row,
            payChurchTithe: false,
          })),
        },
      ),
    );
    const request =
      deferred<Awaited<ReturnType<typeof api.updateTerritoryChurchTithe>>>();
    vi.spyOn(api, "updateTerritoryChurchTithe").mockReturnValue(
      request.promise,
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.syncTerritoryData();
    });
    act(() =>
      result.current.queueTerritoryOperation(
        {
          id: "second",
          kind: "tithe",
          territoryId: "demo-territory",
          payChurchTithe: true,
        },
        {
          territories: data.territories.map((row) => ({
            ...row,
            payChurchTithe: true,
          })),
        },
      ),
    );
    await act(async () => {
      request.resolve({
        ok: true,
        territory: { ...data.territories[0], payChurchTithe: false },
      });
      await pending;
    });
    const remaining = loadTerritoryDraft(data.selectedCharacterId);
    expect(remaining?.operations.map((row) => row.id)).toEqual(["second"]);
    expect(remaining?.territories[0].payChurchTithe).toBe(true);
    expect(result.current.territoryDraftDirty).toBe(true);
  });

  it("stores journal edits before attempting to contact the campaign", async () => {
    const selectedCharacterIdRef = ref();
    const create = vi.spyOn(api, "saveJournalEntry");
    const { result } = renderHook(() =>
      useJournal(() => ({
        selectedCharacter: data.characters[0],
        selectedCharacterIdRef,
        setModal: vi.fn(),
        cacheBaseRef: { current: data },
      })),
    );
    await act(() =>
      result.current.saveCampaignJournalEntry({
        title: "Offline notes",
        tags: ["Adventure"],
        notes: "Keep these notes",
      }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(loadJournalDraft(data.selectedCharacterId)?.entries[0].notes).toBe(
      "Keep these notes",
    );
    expect(result.current.journalDraftDirty).toBe(true);
    await act(() => result.current.syncJournalToCampaign());
    expect(create).toHaveBeenCalledTimes(1);
    expect(loadJournalDraft(data.selectedCharacterId)).toBeNull();
  });

  it("rejects malformed wallet backups without replacing the existing ledger", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(api, "loadLocalWalletBackup").mockResolvedValue({
      ok: true,
      characterId: data.selectedCharacterId,
      backedUpAt: "2026-10-01",
      transactions: [
        {
          id: 1,
          transactionId: "bad",
          label: "Bad coins",
          kind: "income",
          coins: { pp: 0, gp: "not a number", sp: 0, cp: 0 },
        },
      ],
      recurringExpenses: [],
    });
    const selectedCharacterIdRef = ref();
    const { result } = renderHook(() =>
      useWallet(() => ({
        selectedCharacter: data.characters[0],
        selectedCharacterIdRef,
        setModal: vi.fn(),
        setSection: vi.fn(),
      })),
    );
    await act(async () => {
      await expect(result.current.restoreCurrentWalletBackup()).rejects.toThrow(
        "invalid data",
      );
    });
    expect(result.current.transactions).toEqual([]);
    expect(result.current.walletBackupMessage).toBe("");
  });

  it("does not report a successful restore if the device cannot durably save it", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(api, "loadLocalWalletBackup").mockResolvedValue({
      ok: true,
      characterId: data.selectedCharacterId,
      backedUpAt: "2026-10-01",
      transactions: [
        {
          id: 1,
          transactionId: "restored",
          label: "Savings",
          kind: "income",
          coins: { pp: 0, gp: 10, sp: 0, cp: 0 },
        },
      ],
      recurringExpenses: [],
    });
    const selectedCharacterIdRef = ref();
    const { result } = renderHook(() =>
      useWallet(() => ({
        selectedCharacter: data.characters[0],
        selectedCharacterIdRef,
        setModal: vi.fn(),
        setSection: vi.fn(),
      })),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await act(async () => {
      await expect(result.current.restoreCurrentWalletBackup()).rejects.toThrow(
        "Could not save",
      );
    });
    expect(result.current.gold).toBe(0);
    expect(result.current.walletBackupMessage).toBe("");
    expect(hasStorageFailure()).toBe(true);
  });
});
