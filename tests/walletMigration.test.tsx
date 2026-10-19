import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as api from "../src/google-sheets-api";
import { AppError } from "../src/app/errors";
import { createMockBootstrap } from "../src/app/mockData";
import { appStorage } from "../src/app/storage";
import { useWallet } from "../src/app/useWallet";
import {
  loadLocalWalletState,
  saveLocalWalletState,
  type Transaction,
} from "../src/app/wallet";
import { readWalletTransfer } from "../src/app/walletTransfer";
const data = createMockBootstrap(),
  characterId = data.characters[0].characterId;
const transaction: Transaction = {
  id: -12,
  transactionId: "local-12",
  label: "Savings",
  kind: "income",
  coins: { pp: 0, gp: 12, sp: 0, cp: 0 },
  timestamp: "Oct 15, 2026",
};
const transfer = {
  format: "pcm-wallet",
  version: 1,
  characterId,
  transactions: [transaction],
  recurringExpenses: [],
  balance: { pp: 9999, gp: 9999, sp: 0, cp: 0 },
};
function file(input: unknown): File {
  return { size: 100, text: async () => JSON.stringify(input) } as File;
}
function setup() {
  const selection = { current: characterId },
    generation = { current: 1 };
  const hook = renderHook(() =>
    useWallet(() => ({
      selectedCharacter: data.characters[0],
      selectedCharacterIdRef: selection,
      characterLoadRequestRef: generation,
      setModal: vi.fn(),
      setSection: vi.fn(),
    })),
  );
  hook.result.current.walletLoadedCharacterIdRef.current = characterId;
  return { ...hook, selection, generation };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => appStorage.clear());
it("imports only the selected wallet from a working copy and derives balance from its ledger", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { result } = setup();
  await act(() =>
    result.current.importWalletFile(
      file({
        records: [
          {
            kind: "pcm-local-wallet",
            data: { ...transfer, characterId: "another" },
          },
          {
            kind: "pcm-journal-draft",
            data: { characterId, secret: "must not import" },
          },
          { kind: "pcm-local-wallet", data: transfer },
        ],
      }),
    ),
  );
  expect(result.current.gold).toBe(12);
  expect(result.current.platinum).toBe(0);
  expect(loadLocalWalletState(characterId)?.transactions).toEqual([
    transaction,
  ]);
  expect(
    [...Array(appStorage.length)].map((_, i) => appStorage.key(i)),
  ).toEqual([`pcm-local-wallet:v1:${characterId}`]);
  expect(result.current.walletBackupMessage).toContain(
    "imported on this device",
  );
});
it.each([
  { name: "wrong character", input: { ...transfer, characterId: "wrong" } },
  {
    name: "malformed coins",
    input: {
      ...transfer,
      transactions: [
        { ...transaction, coins: { pp: 0, gp: "12", sp: 0, cp: 0 } },
      ],
    },
  },
  {
    name: "duplicate transactions",
    input: { ...transfer, transactions: [transaction, transaction] },
  },
  {
    name: "invalid display field",
    input: {
      ...transfer,
      transactions: [{ ...transaction, note: { private: "invalid" } }],
    },
  },
  { name: "unsupported version", input: { ...transfer, version: 2 } },
  {
    name: "ambiguous working copy",
    input: {
      records: [
        { kind: "pcm-local-wallet", data: transfer },
        { kind: "pcm-local-wallet", data: transfer },
      ],
    },
  },
])(
  "rejects $name without changing the stored or displayed wallet",
  async ({ input }) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = setup();
    await act(async () => {
      await expect(
        result.current.importWalletFile(file(input)),
      ).rejects.toBeInstanceOf(AppError);
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(result.current.transactions).toEqual([]);
    expect(loadLocalWalletState(characterId)).toBeNull();
    expect(result.current.walletBackupMessage).toBe("");
  },
);
it.each(["selection", "account", "edits"])(
  "preserves the wallet after %s changes while a file is being read",
  async (change) => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const session = vi
      .spyOn(api, "getSessionToken")
      .mockReturnValue("initial-account");
    const { result, generation } = setup();
    const reading = deferred<string>();
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.importWalletFile({
        size: 10,
        text: () => reading.promise,
      } as File);
    });
    if (change === "selection") generation.current++;
    if (change === "account") session.mockReturnValue("another-account");
    if (change === "edits")
      act(() =>
        result.current.setTransactions([{ ...transaction, label: "New edit" }]),
      );
    await act(async () => {
      reading.resolve(JSON.stringify(transfer));
      if (change === "edits")
        await expect(operation).rejects.toMatchObject({ code: "conflict" });
      else await operation;
    });
    expect(loadLocalWalletState(characterId)).toBeNull();
    expect(result.current.walletBackupMessage).toBe("");
    if (change === "edits")
      expect(result.current.transactions[0].label).toBe("New edit");
  },
);
it("preserves the previous working copy if an import cannot be durably saved", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { result } = setup();
  const old = {
    ...transaction,
    id: 1,
    transactionId: "old",
    coins: { ...transaction.coins, gp: 5 },
  };
  saveLocalWalletState({
    version: 1,
    characterId,
    transactions: [old],
    recurringExpenses: [],
    balance: old.coins,
    savedAt: "before",
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  await act(async () => {
    await expect(
      result.current.importWalletFile(file(transfer)),
    ).rejects.toMatchObject({ code: "storage" });
  });
  expect(loadLocalWalletState(characterId)?.transactions).toEqual([old]);
  expect(result.current.transactions).toEqual([]);
  expect(result.current.walletBackupMessage).toBe("");
});
it("reuses the backup mutation ID after a lost confirmation and refuses backups before loading", async () => {
  const backup = vi
    .spyOn(api, "backupLocalWallet")
    .mockRejectedValueOnce(new AppError("uncertain", "Confirmation lost"))
    .mockResolvedValue({
      ok: true,
      characterId,
      backedUpAt: "2026-10-15T00:00:00Z",
      transactionCount: 1,
      recurringExpenseCount: 0,
    });
  const { result } = setup();
  result.current.walletLoadedCharacterIdRef.current = "";
  await act(async () => {
    await expect(result.current.backUpCurrentWallet()).rejects.toThrow(
      "finish loading",
    );
  });
  expect(backup).not.toHaveBeenCalled();
  result.current.walletLoadedCharacterIdRef.current = characterId;
  act(() => result.current.setTransactions([transaction]));
  await act(async () => {
    await expect(result.current.backUpCurrentWallet()).rejects.toMatchObject({
      code: "uncertain",
    });
  });
  await act(() => result.current.backUpCurrentWallet());
  expect(backup).toHaveBeenCalledTimes(2);
  expect(backup.mock.calls[0][0].clientMutationId).toBeTruthy();
  expect(backup.mock.calls[0][0].clientMutationId).toBe(
    backup.mock.calls[1][0].clientMutationId,
  );
  expect(result.current.walletBackupMessage).toContain("backup saved");
});
it("preserves edits made during a campaign restore", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const loading =
    deferred<Awaited<ReturnType<typeof api.loadLocalWalletBackup>>>();
  vi.spyOn(api, "loadLocalWalletBackup").mockReturnValue(loading.promise);
  const { result } = setup();
  let operation!: Promise<void>;
  act(() => {
    operation = result.current.restoreCurrentWalletBackup();
  });
  act(() =>
    result.current.setTransactions([{ ...transaction, label: "New edit" }]),
  );
  await act(async () => {
    loading.resolve({
      ok: true,
      characterId,
      backedUpAt: "2026-10-15",
      transactions: [transaction],
      recurringExpenses: [],
    });
    await expect(operation).rejects.toMatchObject({ code: "conflict" });
  });
  expect(result.current.transactions[0].label).toBe("New edit");
  expect(result.current.walletBackupMessage).toBe("");
});
it("rejects invalid recurring dates before they can silently disable a restored schedule", () => {
  expect(() =>
    readWalletTransfer(
      {
        ...transfer,
        recurringExpenses: [
          {
            scheduleId: "bad",
            characterId,
            label: "Monthly",
            pp: 0,
            gp: 1,
            sp: 0,
            cp: 0,
            frequency: "monthly",
            startDate: "2026-02-30",
            occurrenceCount: 0,
            active: true,
          },
        ],
      },
      characterId,
    ),
  ).toThrow("invalid data");
});
