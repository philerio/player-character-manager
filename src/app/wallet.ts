import { appStorage } from "./storage";

import {
  getSessionToken,
  type SheetTransaction,
  type SheetRecurringExpense,
} from "../google-sheets-api";

import {
  CoinBalances,
  coinValueInCopper,
  CoinType,
  hashId,
  formatLedgerDate,
} from "./core";

export function purseValueInCopper(balances: CoinBalances) {
  return (Object.keys(coinValueInCopper) as CoinType[]).reduce(
    (total, coin) => total + balances[coin] * coinValueInCopper[coin],
    0,
  );
}

export function deductCostPreservingCoins(
  currentBalances: CoinBalances,
  costInCopper: number,
): CoinBalances | null {
  const cost = Math.max(0, Math.floor(costInCopper));
  if (purseValueInCopper(currentBalances) < cost) return null;

  const nextBalances = { ...currentBalances };
  let remainingCost = cost;
  const coinsLowToHigh: CoinType[] = ["cp", "sp", "gp", "pp"];

  for (let index = 0; index < coinsLowToHigh.length; index += 1) {
    const coin = coinsLowToHigh[index];
    const coinValue = coinValueInCopper[coin];
    const coinsToSpend = Math.min(
      nextBalances[coin],
      Math.floor(remainingCost / coinValue),
    );

    nextBalances[coin] -= coinsToSpend;
    remainingCost -= coinsToSpend * coinValue;

    if (remainingCost === 0) return nextBalances;

    if (
      index < coinsLowToHigh.length - 1 &&
      remainingCost < coinValueInCopper[coinsLowToHigh[index + 1]]
    ) {
      continue;
    }
  }

  const coinToBreak = coinsLowToHigh.find(
    (coin) => nextBalances[coin] > 0 && coinValueInCopper[coin] > remainingCost,
  );
  if (!coinToBreak) return null;

  nextBalances[coinToBreak] -= 1;
  let change = coinValueInCopper[coinToBreak] - remainingCost;

  (["gp", "sp", "cp"] as CoinType[]).forEach((coin) => {
    if (coinValueInCopper[coin] >= coinValueInCopper[coinToBreak]) return;
    const changeCoins = Math.floor(change / coinValueInCopper[coin]);
    nextBalances[coin] += changeCoins;
    change %= coinValueInCopper[coin];
  });

  return nextBalances;
}

export type EquipmentItem = {
  name: string;
  category: string;
  amount: number;
  coin: CoinType;
  encumbrance: string;
};

export type Transaction = {
  id: number;
  label: string;
  coins: CoinBalances;
  kind: "income" | "expense";
  note?: string;
  timestamp: string;
  source?: "pending" | "sheet" | "local";
  transactionId?: string;
  clientId?: string;
};

type PendingWalletMutation = {
  clientId: string;
  characterId: string;
  label: string;
  kind: "income" | "expense";
  pp: number;
  gp: number;
  sp: number;
  cp: number;
  note?: string;
  preserveSigns?: boolean;
  createdAt: string;
};

const PENDING_WALLET_MUTATIONS_STORAGE_PREFIX = "pcm-pending-wallet:v1:";

function pendingWalletMutationsStorageKey() {
  return `${PENDING_WALLET_MUTATIONS_STORAGE_PREFIX}${getSessionToken() || "guest"}`;
}

function loadPendingWalletMutations() {
  try {
    const raw = appStorage.getItem(pendingWalletMutationsStorageKey());
    if (!raw) return [] as PendingWalletMutation[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingWalletMutation[]) : [];
  } catch {
    return [] as PendingWalletMutation[];
  }
}

function savePendingWalletMutations(items: PendingWalletMutation[]) {
  try {
    appStorage.setItem(
      pendingWalletMutationsStorageKey(),
      JSON.stringify(items),
    );
  } catch {
    // A full or unavailable cache must never prevent the live app from working.
  }
}

function signedCoinsForPendingWalletMutation(
  mutation: PendingWalletMutation,
): CoinBalances {
  if (mutation.preserveSigns) {
    return {
      pp: Number(mutation.pp) || 0,
      gp: Number(mutation.gp) || 0,
      sp: Number(mutation.sp) || 0,
      cp: Number(mutation.cp) || 0,
    };
  }
  const multiplier = mutation.kind === "income" ? 1 : -1;
  return {
    pp: (Number(mutation.pp) || 0) * multiplier,
    gp: (Number(mutation.gp) || 0) * multiplier,
    sp: (Number(mutation.sp) || 0) * multiplier,
    cp: (Number(mutation.cp) || 0) * multiplier,
  };
}

function mapPendingWalletMutation(
  mutation: PendingWalletMutation,
): Transaction {
  return {
    id: hashId(mutation.clientId),
    label: mutation.label,
    coins: signedCoinsForPendingWalletMutation(mutation),
    kind: mutation.kind,
    note: mutation.note?.trim() || undefined,
    timestamp: formatLedgerDate(mutation.createdAt),
    source: "pending",
    clientId: mutation.clientId,
  };
}

function applyPendingWalletMutationsToWallet(
  balance: { pp: number; gp: number; sp: number; cp: number },
  sheetTransactions: SheetTransaction[],
  pendingMutations: PendingWalletMutation[],
) {
  const adjustedBalance = {
    pp: Number(balance.pp) || 0,
    gp: Number(balance.gp) || 0,
    sp: Number(balance.sp) || 0,
    cp: Number(balance.cp) || 0,
  };

  pendingMutations.forEach((mutation) => {
    const signed = signedCoinsForPendingWalletMutation(mutation);
    adjustedBalance.pp += signed.pp;
    adjustedBalance.gp += signed.gp;
    adjustedBalance.sp += signed.sp;
    adjustedBalance.cp += signed.cp;
  });

  const pendingTransactions = [...pendingMutations]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .map(mapPendingWalletMutation);

  return {
    balance: adjustedBalance,
    transactions: [
      ...pendingTransactions,
      ...mapSheetTransactions(sheetTransactions),
    ],
  };
}

function mapSheetTransactions(
  sheetTransactions: SheetTransaction[],
): Transaction[] {
  return sheetTransactions.map((transaction) => {
    return {
      id: hashId(transaction.transactionId),
      label: transaction.label,
      coins: {
        pp: Number(transaction.pp) || 0,
        gp: Number(transaction.gp) || 0,
        sp: Number(transaction.sp) || 0,
        cp: Number(transaction.cp) || 0,
      },
      kind: transaction.type,
      note: transaction.note?.trim() || undefined,
      timestamp: formatLedgerDate(transaction.timestamp),
      source: "sheet",
      transactionId: transaction.transactionId,
    };
  });
}

export type LocalWalletState = {
  version: 1;
  characterId: string;
  balance: CoinBalances;
  transactions: Transaction[];
  recurringExpenses: SheetRecurringExpense[];
  savedAt: string;
};

export function walletBalanceFromTransactions(
  transactions: Transaction[],
): CoinBalances {
  return transactions.reduce(
    (total, transaction) => {
      total.pp += Number(transaction.coins?.pp) || 0;
      total.gp += Number(transaction.coins?.gp) || 0;
      total.sp += Number(transaction.coins?.sp) || 0;
      total.cp += Number(transaction.coins?.cp) || 0;
      return total;
    },
    { pp: 0, gp: 0, sp: 0, cp: 0 } as CoinBalances,
  );
}

const LOCAL_WALLET_STORAGE_PREFIX = "pcm-local-wallet:v1:";

function localWalletStorageKey(characterId: string) {
  return `${LOCAL_WALLET_STORAGE_PREFIX}${characterId}`;
}

export function loadLocalWalletState(
  characterId: string,
): LocalWalletState | null {
  if (!characterId || typeof window === "undefined") return null;
  try {
    const raw = appStorage.getItem(localWalletStorageKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalWalletState>;
    if (parsed.version !== 1 || parsed.characterId !== characterId) return null;
    const transactions = Array.isArray(parsed.transactions)
      ? (parsed.transactions as Transaction[])
      : [];
    return {
      version: 1,
      characterId,
      // The ledger is the wallet's single source of truth. Never trust a
      // separately persisted balance, because it can drift from the ledger.
      balance: walletBalanceFromTransactions(transactions),
      transactions,
      recurringExpenses: Array.isArray(parsed.recurringExpenses)
        ? (parsed.recurringExpenses as SheetRecurringExpense[])
        : [],
      savedAt: String(parsed.savedAt || ""),
    };
  } catch {
    return null;
  }
}

export function saveLocalWalletState(
  state: LocalWalletState,
  requireDurableSave = false,
) {
  if (!state.characterId || typeof window === "undefined") return;
  try {
    const canonicalState: LocalWalletState = {
      ...state,
      balance: walletBalanceFromTransactions(state.transactions),
    };
    appStorage.setItem(
      localWalletStorageKey(state.characterId),
      JSON.stringify(canonicalState),
    );
  } catch (reason) {
    if (requireDurableSave) throw reason;
    // Local wallet persistence must never crash the UI; the storage-status banner reports the failure.
  }
}

export function deleteLocalWalletState(characterId: string) {
  if (!characterId || typeof window === "undefined") return;
  try {
    appStorage.removeItem(localWalletStorageKey(characterId));
  } catch {
    // Ignore unavailable local storage.
  }
}

export function migrateLegacyWalletToLocal(
  characterId: string,
  balance: CoinBalances,
  sheetTransactions: SheetTransaction[],
  recurringExpenses: SheetRecurringExpense[],
) {
  const existing = loadLocalWalletState(characterId);
  if (existing) return existing;

  // The old character cache already stored the displayed purse total, so do
  // not add pending mutations to the balance again. Pending entries are only
  // used to recover ledger rows that were still waiting in the old outbox.
  const allPending = loadPendingWalletMutations();
  const pendingForCharacter = allPending.filter(
    (item) => item.characterId === characterId,
  );
  const recoveredPending = pendingForCharacter.map((item) => ({
    ...mapPendingWalletMutation(item),
    source: "local" as const,
    clientId: undefined,
  }));
  const recoveredSheet = mapSheetTransactions(sheetTransactions || []).map(
    (item) => ({
      ...item,
      source: "local" as const,
    }),
  );
  const recoveredTransactions = [...recoveredPending, ...recoveredSheet].filter(
    (item, index, items) =>
      items.findIndex((other) => other.id === item.id) === index,
  );

  // Preserve the exact purse total that was visible before this migration,
  // even if the old ledger was incomplete. Any unexplained difference becomes
  // one explicit local carry-forward entry so the new ledger and purse agree.
  const recoveredTotals = recoveredTransactions.reduce(
    (total, item) => {
      total.pp += Number(item.coins.pp) || 0;
      total.gp += Number(item.coins.gp) || 0;
      total.sp += Number(item.coins.sp) || 0;
      total.cp += Number(item.coins.cp) || 0;
      return total;
    },
    { pp: 0, gp: 0, sp: 0, cp: 0 } as CoinBalances,
  );
  const carryForwardCoins: CoinBalances = {
    pp: (Number(balance.pp) || 0) - recoveredTotals.pp,
    gp: (Number(balance.gp) || 0) - recoveredTotals.gp,
    sp: (Number(balance.sp) || 0) - recoveredTotals.sp,
    cp: (Number(balance.cp) || 0) - recoveredTotals.cp,
  };
  const hasCarryForward = Object.values(carryForwardCoins).some(
    (value) => value !== 0,
  );
  const transactions = hasCarryForward
    ? [
        {
          id: hashId(`local-wallet-carry-forward:${characterId}`),
          label: "Local wallet balance carried forward",
          coins: carryForwardCoins,
          kind: "income" as const,
          note: "Created automatically when the wallet was converted to local-only storage.",
          timestamp: formatLedgerDate(new Date().toISOString()),
          source: "local" as const,
          transactionId: `local-wallet-carry-forward:${characterId}`,
        },
        ...recoveredTransactions,
      ]
    : recoveredTransactions;

  const state: LocalWalletState = {
    version: 1,
    characterId,
    balance: walletBalanceFromTransactions(transactions),
    transactions,
    recurringExpenses: recurringExpenses || [],
    savedAt: new Date().toISOString(),
  };
  saveLocalWalletState(state);

  // The wallet no longer has a Sheet outbox. Remove migrated entries so they
  // can never be uploaded by old sync code.
  const remainingPending = allPending.filter(
    (item) => item.characterId !== characterId,
  );
  savePendingWalletMutations(remainingPending);
  return state;
}

export function recurringOccurrenceDate(
  startDate: string,
  frequency: "weekly" | "monthly" | "annually",
  occurrenceIndex: number,
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ""));
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  if (frequency === "weekly")
    date.setUTCDate(date.getUTCDate() + occurrenceIndex * 7);
  if (frequency === "monthly")
    date.setUTCMonth(date.getUTCMonth() + occurrenceIndex);
  if (frequency === "annually")
    date.setUTCFullYear(date.getUTCFullYear() + occurrenceIndex);
  return date;
}

export function transactionCoinText(transaction: Transaction) {
  return (["pp", "gp", "sp", "cp"] as CoinType[])
    .filter((coin) => transaction.coins[coin] !== 0)
    .map((coin) => {
      const amount = transaction.coins[coin];
      return `${amount > 0 ? "+" : "−"}${Math.abs(amount).toLocaleString()} ${coin}`;
    })
    .join(", ");
}
