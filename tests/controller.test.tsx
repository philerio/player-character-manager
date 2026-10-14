import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAppController } from "../src/app/useAppController";
import { loadRetainerDraft } from "../src/app/retainerStorage";
import { loadTerritoryDraft } from "../src/app/territoryStorage";
import { loadLocalWalletState } from "../src/app/wallet";

describe("local-first character data", () => {
  it("boots from fixtures and switches characters without network requests", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network request"));
    const { result } = renderHook(() => useAppController());
    await waitFor(() =>
      expect(result.current.selectedCharacterId).toBe("demo-character"),
    );
    expect(result.current.gold).toBe(462);
    expect(result.current.retainers).toHaveLength(2);
    await act(() => result.current.selectCharacter("demo-character-2"));
    expect(result.current.selectedCharacter?.name).toBe("Elara Reed");
    expect(result.current.transactions).toHaveLength(0);
    expect(result.current.retainers).toHaveLength(0);
    expect(result.current.gold).toBe(0);
    expect(network).not.toHaveBeenCalled();
  });

  it("preserves wallets and unsynced drafts independently across switches and reopening", async () => {
    const { result, unmount } = renderHook(() => useAppController());
    await waitFor(() =>
      expect(result.current.selectedCharacterId).toBe("demo-character"),
    );
    await act(() =>
      result.current.recordTransaction("Treasure", 10, "gp", "income", ""),
    );
    await act(() =>
      result.current.saveRetainerRecord({
        type: "individual",
        name: "Demo guide",
        role: "Guide",
        amount: 2,
        costCoin: "gp",
        wageFrequency: "monthly",
      }),
    );
    act(() =>
      result.current.queueTerritoryOperation(
        {
          id: "test-tithe",
          kind: "tithe",
          territoryId: "demo-territory",
          payChurchTithe: false,
        },
        {
          territories: result.current.territories.map((t) => ({
            ...t,
            payChurchTithe: false,
          })),
        },
      ),
    );
    expect(loadRetainerDraft("demo-character")?.retainers).toHaveLength(3);
    expect(loadTerritoryDraft("demo-character")?.operations).toHaveLength(1);
    await act(() => result.current.selectCharacter("demo-character-2"));
    await act(() =>
      result.current.recordTransaction("Offering", 7, "sp", "income", ""),
    );
    await act(() => result.current.selectCharacter("demo-character"));
    expect(result.current.gold).toBe(472);
    expect(result.current.retainers).toHaveLength(3);
    expect(result.current.retainerDraftDirty).toBe(true);
    expect(result.current.territoryDraftDirty).toBe(true);
    expect(result.current.territories[0].payChurchTithe).toBe(false);
    expect(loadLocalWalletState("demo-character-2")?.balance.sp).toBe(7);
    unmount();
    const reopened = renderHook(() => useAppController());
    await waitFor(() =>
      expect(reopened.result.current.selectedCharacterId).toBe(
        "demo-character",
      ),
    );
    expect(reopened.result.current.gold).toBe(472);
    expect(reopened.result.current.retainerDraftDirty).toBe(true);
    expect(reopened.result.current.territoryDraftDirty).toBe(true);
  });

  it("syncs retainer drafts through the fake service without contacting Sheets", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network request"));
    const { result } = renderHook(() => useAppController());
    await waitFor(() =>
      expect(result.current.selectedCharacterId).toBe("demo-character"),
    );
    await act(() =>
      result.current.saveRetainerRecord({
        type: "individual",
        name: "Demo guide",
        role: "Guide",
        amount: 2,
        costCoin: "gp",
        wageFrequency: "monthly",
      }),
    );
    await act(() => result.current.syncWholeProfile());
    expect(result.current.profileSyncError).toBe("");
    expect(result.current.retainerDraftDirty).toBe(false);
    expect(
      result.current.retainers.find((r) => r.name === "Demo guide")?.retainerId,
    ).toMatch(/^demo-/);
    expect(loadRetainerDraft("demo-character")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
});

it("posts due recurring charges once and keeps the ledger stable after reopening", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  try {
    const { result, unmount } = renderHook(() => useAppController());
    await waitFor(() => expect(result.current.gold).toBe(424));
    expect(
      result.current.transactions.filter(
        (t) => t.transactionId === "local-recurring:demo-schedule:2",
      ),
    ).toHaveLength(1);
    unmount();
    const reopened = renderHook(() => useAppController());
    await waitFor(() => expect(reopened.result.current.gold).toBe(424));
    expect(
      reopened.result.current.transactions.filter(
        (t) => t.transactionId === "local-recurring:demo-schedule:2",
      ),
    ).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
