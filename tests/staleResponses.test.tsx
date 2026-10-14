import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../src/google-sheets-api";
import { createMockBootstrap } from "../src/app/mockData";
import { useRetainers } from "../src/app/useRetainers";
import { useTerritories } from "../src/app/useTerritories";
import { useWallet } from "../src/app/useWallet";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("responses after character switching", () => {
  it("does not display another character's retainers after a slow refresh", async () => {
    const data = createMockBootstrap();
    const ref = { current: data.selectedCharacterId };
    const request =
      deferred<Awaited<ReturnType<typeof api.loadRetainerData>>>();
    vi.spyOn(api, "loadRetainerData").mockReturnValue(request.promise);
    const { result } = renderHook(() =>
      useRetainers(() => ({
        selectedCharacter: data.characters[0],
        selectedCharacterIdRef: ref,
        setModal: vi.fn(),
        setRecurringExpenses: vi.fn(),
      })),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshRetainersFromCampaign();
    });
    ref.current = "demo-character-2";
    await act(async () => {
      request.resolve({
        ok: true,
        characterId: data.selectedCharacterId,
        retainers: data.retainers,
      });
      await pending;
    });
    expect(result.current.retainers).toEqual([]);
    expect(result.current.retainerLastSyncedAt).toBe("");
  });

  it("does not display another character's territory data after a slow refresh", async () => {
    const data = createMockBootstrap();
    const ref = { current: data.selectedCharacterId };
    const request =
      deferred<Awaited<ReturnType<typeof api.loadTerritoryStatus>>>();
    vi.spyOn(api, "loadTerritoryStatus").mockReturnValue(request.promise);
    const setRetainers = vi.fn();
    const { result } = renderHook(() =>
      useTerritories(() => ({
        selectedCharacter: data.characters[0],
        selectedCharacterIdRef: ref,
        setRetainers,
        retainerDraftDirty: false,
        setModal: vi.fn(),
        permissions: data.permissions,
        selectedCharacterId: ref.current,
        cacheBaseRef: { current: data },
      })),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refreshTerritoryDataFromCampaign();
    });
    ref.current = "demo-character-2";
    await act(async () => {
      request.resolve({
        ok: true,
        characterId: data.selectedCharacterId,
        retainers: data.retainers,
        territories: data.territories,
        scoutingMissions: data.scoutingMissions,
        customMissions: [],
        territoryHexes: data.territoryHexes,
      });
      await pending;
    });
    expect(result.current.territories).toEqual([]);
    expect(setRetainers).not.toHaveBeenCalled();
  });

  it("does not restore a wallet into a newly selected character", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const data = createMockBootstrap();
    const ref = { current: data.selectedCharacterId };
    const request =
      deferred<Awaited<ReturnType<typeof api.loadLocalWalletBackup>>>();
    vi.spyOn(api, "loadLocalWalletBackup").mockReturnValue(request.promise);
    const { result } = renderHook(() =>
      useWallet(() => ({
        selectedCharacter: data.characters[0],
        selectedCharacterIdRef: ref,
        setModal: vi.fn(),
        setSection: vi.fn(),
      })),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.restoreCurrentWalletBackup();
    });
    ref.current = "demo-character-2";
    await act(async () => {
      request.resolve({
        ok: true,
        characterId: data.selectedCharacterId,
        backedUpAt: "2026-10-01T12:00:00Z",
        transactions: [{ id: 1, coins: { pp: 0, gp: 100, sp: 0, cp: 0 } }],
        recurringExpenses: [],
      });
      await pending;
    });
    expect(result.current.gold).toBe(0);
    expect(result.current.transactions).toEqual([]);
  });
});
