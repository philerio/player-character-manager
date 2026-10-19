import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMockBootstrap } from "../src/app/mockData";
const fixture = createMockBootstrap();
const characterId = fixture.selectedCharacterId;
const transaction = {
  id: 1,
  transactionId: "saved",
  label: "Savings",
  kind: "income",
  coins: { pp: 0, gp: 42, sp: 0, cp: 0 },
  timestamp: "Oct 15, 2026",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup() {
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_API_BACKEND", "d1");
  vi.stubEnv("VITE_API_URL", "https://recovery.example.test/api");
  vi.resetModules();
  const api = await import("../src/google-sheets-api"),
    storage = await import("../src/app/storage"),
    wallet = await import("../src/app/wallet");
  storage.appStorage.setItem("pcm-session-token", "recovery-session");
  api.saveSharedRosterCache(fixture);
  const calls: Array<{ action: string; body: any }> = [];
  let backup: () => Promise<Response> = async () =>
    Response.json(
      { ok: false, error: "No wallet backup exists." },
      { status: 404 },
    );
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options) => {
      const body =
        options?.method === "POST"
          ? JSON.parse(String(options.body))
          : Object.fromEntries(new URL(String(url)).searchParams);
      const action = body.action;
      calls.push({ action, body });
      if (action === "wallet.backup.load") return backup();
      if (action === "wallet")
        return Response.json({
          ok: true,
          characterId,
          balance: { pp: 0, gp: 42, sp: 0, cp: 0 },
          transactions: [
            {
              transactionId: "imported",
              characterId,
              label: "Imported",
              type: "income",
              timestamp: "2026-10-15T00:00:00Z",
              pp: 0,
              gp: 42,
              sp: 0,
              cp: 0,
            },
          ],
          recurringExpenses: [],
        });
      if (action === "wallet.backup.save")
        return Response.json({
          ok: true,
          characterId,
          backupId: "new-backup",
          isLatest: true,
          backedUpAt: "2026-10-15T00:00:00Z",
          transactionCount: body.transactions.length,
          recurringExpenseCount: 0,
        });
      if (action === "sync-revisions")
        return Response.json({
          ok: true,
          characterId,
          revisions: { wallet: 0, journal: 0, retainers: 0, territories: 0 },
        });
      return Response.json({ ...fixture, characterId });
    });
  return {
    api,
    ...storage,
    ...wallet,
    calls,
    network,
    setBackup: (handler: typeof backup) => {
      backup = handler;
    },
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("keeps a cold wallet uninitialized until its imported ledger has actually loaded", async () => {
  const env = await setup(),
    loading = deferred<Response>();
  env.setBackup(() => loading.promise);
  const { useAppController } = await import("../src/app/useAppController");
  const { result } = renderHook(() => useAppController());
  await waitFor(() => expect(result.current.walletRecovering).toBe(true));
  expect(result.current.walletReady).toBe(false);
  expect(env.loadLocalWalletState(characterId)).toBeNull();
  await act(async () => {
    await expect(result.current.backUpCurrentWallet()).rejects.toThrow(
      "finish loading",
    );
    await expect(
      result.current.recordTransaction("Early edit", 1, "gp", "income", ""),
    ).rejects.toThrow("finish loading");
  });
  expect(env.calls.some((call) => call.action === "wallet.backup.save")).toBe(
    false,
  );
  await act(async () => {
    loading.resolve(
      Response.json({ ok: false, error: "No backup" }, { status: 404 }),
    );
  });
  await waitFor(() => expect(result.current.walletReady).toBe(true));
  expect(result.current.gold).toBe(42);
  expect(result.current.transactions[0].label).toBe("Imported");
  expect(env.loadLocalWalletState(characterId)?.backupId).toBe("");
  await act(() => result.current.backUpCurrentWallet());
  expect(
    env.calls.find((call) => call.action === "wallet.backup.save")?.body
      .expectedBackupId,
  ).toBe("");
  expect(env.loadLocalWalletState(characterId)?.backupId).toBe("new-backup");
});
it("recovers the latest snapshot before falling back to imported transactions", async () => {
  const env = await setup();
  env.setBackup(async () =>
    Response.json({
      ok: true,
      characterId,
      backupId: "snapshot",
      backedUpAt: "2026-10-15",
      transactions: [transaction],
      recurringExpenses: [],
    }),
  );
  const { useAppController } = await import("../src/app/useAppController");
  const { result } = renderHook(() => useAppController());
  await waitFor(() => expect(result.current.walletReady).toBe(true));
  expect(result.current.gold).toBe(42);
  expect(result.current.transactions[0].label).toBe("Savings");
  expect(env.loadLocalWalletState(characterId)?.backupId).toBe("snapshot");
  expect(env.calls.some((call) => call.action === "wallet")).toBe(false);
});
it("keeps failures uninitialized and supports retrying without saving a blank ledger", async () => {
  const env = await setup();
  env.setBackup(async () => {
    throw new TypeError("Offline");
  });
  const { useAppController } = await import("../src/app/useAppController");
  const { result } = renderHook(() => useAppController());
  await waitFor(() => expect(result.current.walletRecoveryError).toBeTruthy());
  expect(result.current.walletReady).toBe(false);
  expect(env.loadLocalWalletState(characterId)).toBeNull();
  env.setBackup(async () =>
    Response.json({ ok: false, error: "No backup" }, { status: 404 }),
  );
  act(() => result.current.retryWalletRecovery());
  await waitFor(() => expect(result.current.walletReady).toBe(true));
  expect(result.current.gold).toBe(42);
});
it("does not overwrite a file imported while automatic recovery was in flight", async () => {
  const env = await setup(),
    loading = deferred<Response>();
  env.setBackup(() => loading.promise);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { useAppController } = await import("../src/app/useAppController");
  const { result } = renderHook(() => useAppController());
  await waitFor(() => expect(result.current.walletRecovering).toBe(true));
  await act(() =>
    result.current.importWalletFile({
      size: 100,
      text: async () =>
        JSON.stringify({
          version: 1,
          characterId,
          transactions: [transaction],
          recurringExpenses: [],
        }),
    } as File),
  );
  await act(async () =>
    loading.resolve(
      Response.json({
        ok: true,
        characterId,
        backupId: "old-snapshot",
        backedUpAt: "2026-10-15",
        transactions: [],
        recurringExpenses: [],
      }),
    ),
  );
  expect(result.current.walletReady).toBe(true);
  expect(result.current.gold).toBe(42);
  expect(env.loadLocalWalletState(characterId)?.backupId).toBeUndefined();
});
it("requires explicit confirmation before rebasing a wallet after a campaign backup conflict", async () => {
  const env = await setup();
  const { useWallet } = await import("../src/app/useWallet"),
    { AppError } = await import("../src/app/errors");
  env.saveLocalWalletState({
    version: 1,
    characterId,
    balance: transaction.coins,
    transactions: [transaction as any],
    recurringExpenses: [],
    backupId: "old-version",
    savedAt: "before",
  });
  const backup = vi
    .spyOn(env.api, "backupLocalWallet")
    .mockRejectedValueOnce(new AppError("conflict", "A newer backup exists"))
    .mockResolvedValue({
      ok: true,
      characterId,
      backupId: "confirmed",
      isLatest: true,
      backedUpAt: "2026-10-15",
      transactionCount: 1,
      recurringExpenseCount: 0,
    });
  vi.spyOn(env.api, "loadLocalWalletBackup").mockResolvedValue({
    ok: true,
    characterId,
    backupId: "other-device",
    backedUpAt: "2026-10-15",
    transactions: [],
    recurringExpenses: [],
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { result } = renderHook(() =>
    useWallet(() => ({
      selectedCharacter: fixture.characters[0],
      selectedCharacterIdRef: { current: characterId },
      setModal: vi.fn(),
      setSection: vi.fn(),
    })),
  );
  result.current.walletLoadedCharacterIdRef.current = characterId;
  act(() => result.current.setTransactions([transaction as any]));
  await act(async () => {
    await expect(result.current.backUpCurrentWallet()).rejects.toMatchObject({
      code: "conflict",
    });
  });
  expect(result.current.walletBackupConflict).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  await act(() => result.current.backUpCurrentWallet());
  expect(backup).toHaveBeenCalledTimes(1);
  expect(env.loadLocalWalletState(characterId)?.backupId).toBe("old-version");
  confirm.mockReturnValue(true);
  await act(() => result.current.backUpCurrentWallet());
  expect(backup.mock.calls[1][0].expectedBackupId).toBe("other-device");
  expect(env.loadLocalWalletState(characterId)?.backupId).toBe("confirmed");
  expect(result.current.walletBackupConflict).toBe(false);
});
it("keeps the resolved backup version and retry ID after confirmation is lost", async () => {
  const env = await setup();
  const { useWallet } = await import("../src/app/useWallet"),
    { AppError } = await import("../src/app/errors");
  env.saveLocalWalletState({
    version: 1,
    characterId,
    balance: transaction.coins,
    transactions: [transaction as any],
    recurringExpenses: [],
    backupId: "old",
    savedAt: "before",
  });
  const backup = vi
    .spyOn(env.api, "backupLocalWallet")
    .mockRejectedValueOnce(new AppError("conflict", "Newer backup"))
    .mockRejectedValueOnce(new AppError("uncertain", "Confirmation lost"))
    .mockResolvedValue({
      ok: true,
      characterId,
      backupId: "confirmed",
      isLatest: true,
      backedUpAt: "2026-10-15",
      transactionCount: 1,
      recurringExpenseCount: 0,
    });
  const load = vi.spyOn(env.api, "loadLocalWalletBackup").mockResolvedValue({
    ok: true,
    characterId,
    backupId: "reviewed",
    backedUpAt: "2026-10-15",
    transactions: [],
    recurringExpenses: [],
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { result } = renderHook(() =>
    useWallet(() => ({
      selectedCharacter: fixture.characters[0],
      selectedCharacterIdRef: { current: characterId },
      setModal: vi.fn(),
      setSection: vi.fn(),
    })),
  );
  result.current.walletLoadedCharacterIdRef.current = characterId;
  act(() => result.current.setTransactions([transaction as any]));
  await act(async () => {
    await expect(result.current.backUpCurrentWallet()).rejects.toMatchObject({
      code: "conflict",
    });
  });
  await act(async () => {
    await expect(result.current.backUpCurrentWallet()).rejects.toMatchObject({
      code: "uncertain",
    });
  });
  expect(result.current.walletBackupConflict).toBe(false);
  await act(() => result.current.backUpCurrentWallet());
  expect(load).toHaveBeenCalledTimes(1);
  expect(backup.mock.calls[1][0].expectedBackupId).toBe("reviewed");
  expect(backup.mock.calls[2][0].expectedBackupId).toBe("reviewed");
  expect(backup.mock.calls[1][0].clientMutationId).toBe(
    backup.mock.calls[2][0].clientMutationId,
  );
});
