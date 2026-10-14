import { AppError } from "./errors";
import { loadLocalWalletState } from "./wallet";
import { validateWalletBackup } from "./validation";
import type { AppModal } from "./core";
import { recurringOccurrenceDate } from "./wallet";

import { useEffect, useRef, useState } from "react";
import {
  backupLocalWallet,
  loadLocalWalletBackup,
  type SheetCharacter,
  type SheetTransaction,
  type SheetRecurringExpense,
} from "../google-sheets-api";
import {
  type Section,
  type CoinType,
  type CoinBalances,
  coinValueInCopper,
  hashId,
  formatLedgerDate,
} from "./core";
import {
  deductCostPreservingCoins,
  type EquipmentItem,
  type Transaction,
  type LocalWalletState,
  walletBalanceFromTransactions,
  saveLocalWalletState,
} from "./wallet";

import type { Dispatch, SetStateAction, RefObject } from "react";

type WalletContext = {
  characterLoadRequestRef?: RefObject<number>;
  selectedCharacterIdRef: RefObject<string>;
  selectedCharacter: SheetCharacter | undefined;
  setModal: Dispatch<SetStateAction<AppModal>>;
  setSection: Dispatch<SetStateAction<Section>>;
};

export function useWallet(
  getContext: () => WalletContext,
  selectedCharacterId = "",
) {
  const [platinum, setPlatinum] = useState(0);
  const [gold, setGold] = useState(0);
  const [silver, setSilver] = useState(0);
  const [copper, setCopper] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<
    SheetRecurringExpense[]
  >([]);
  const walletLoadedCharacterIdRef = useRef("");
  const [walletBackupBusy, setWalletBackupBusy] = useState<
    "backup" | "restore" | ""
  >("");
  const [walletBackupMessage, setWalletBackupMessage] = useState("");
  const [walletBackupError, setWalletBackupError] = useState("");

  function applySystemWalletTransactionLocally(
    transaction: SheetTransaction | null | undefined,
  ) {
    if (!transaction) return;
    const externalId = String(transaction.transactionId || "");
    if (
      externalId &&
      transactions.some((item) => item.transactionId === externalId)
    )
      return;

    const localTransaction: Transaction = {
      id: hashId(externalId || `system-${Date.now()}-${Math.random()}`),
      label: transaction.label,
      coins: {
        pp: Number(transaction.pp) || 0,
        gp: Number(transaction.gp) || 0,
        sp: Number(transaction.sp) || 0,
        cp: Number(transaction.cp) || 0,
      },
      kind: transaction.type,
      note: transaction.note?.trim() || undefined,
      timestamp: formatLedgerDate(
        transaction.timestamp || new Date().toISOString(),
      ),
      source: "local",
      transactionId:
        externalId ||
        `local-system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    setPlatinum((current) => Math.max(0, current + localTransaction.coins.pp));
    setGold((current) => Math.max(0, current + localTransaction.coins.gp));
    setSilver((current) => Math.max(0, current + localTransaction.coins.sp));
    setCopper((current) => Math.max(0, current + localTransaction.coins.cp));
    setTransactions((current) => [localTransaction, ...current]);
  }

  async function recordTransaction(
    label: string,
    amount: number,
    coin: CoinType,
    kind: "income" | "expense",
    note: string,
    recurrence?: {
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
    },
  ) {
    const { selectedCharacterIdRef, selectedCharacter, setModal, setSection } =
      getContext();

    const activeCharacterId =
      selectedCharacterIdRef.current || selectedCharacter?.characterId || "";
    if (!activeCharacterId) return;

    if (recurrence) {
      const schedule: SheetRecurringExpense = {
        scheduleId: `local-recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        characterId: activeCharacterId,
        label,
        pp: coin === "pp" ? amount : 0,
        gp: coin === "gp" ? amount : 0,
        sp: coin === "sp" ? amount : 0,
        cp: coin === "cp" ? amount : 0,
        note,
        frequency: recurrence.frequency,
        startDate: recurrence.startDate,
        occurrenceCount: 0,
        active: true,
      };
      setRecurringExpenses((current) => [schedule, ...current]);
      setModal(null);
      setSection("wallet");
      return;
    }

    const signedAmount = kind === "income" ? amount : -amount;
    const setters = {
      pp: setPlatinum,
      gp: setGold,
      sp: setSilver,
      cp: setCopper,
    };
    setters[coin]((current) => Math.max(0, current + signedAmount));

    const visibleTransaction: Transaction = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      label,
      coins: {
        pp: coin === "pp" ? signedAmount : 0,
        gp: coin === "gp" ? signedAmount : 0,
        sp: coin === "sp" ? signedAmount : 0,
        cp: coin === "cp" ? signedAmount : 0,
      },
      kind,
      note,
      timestamp: formatLedgerDate(new Date().toISOString()),
      source: "local",
      transactionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    setTransactions((current) => [visibleTransaction, ...current]);
    setModal(null);
    setSection("wallet");
  }

  async function deleteWalletTransaction(transaction: Transaction) {
    const { selectedCharacterIdRef, selectedCharacter } = getContext();

    const characterId =
      selectedCharacterIdRef.current || selectedCharacter?.characterId || "";
    if (!characterId) return;

    setPlatinum((current) =>
      Math.max(0, current - (Number(transaction.coins.pp) || 0)),
    );
    setGold((current) =>
      Math.max(0, current - (Number(transaction.coins.gp) || 0)),
    );
    setSilver((current) =>
      Math.max(0, current - (Number(transaction.coins.sp) || 0)),
    );
    setCopper((current) =>
      Math.max(0, current - (Number(transaction.coins.cp) || 0)),
    );
    setTransactions((current) =>
      current.filter((item) => item.id !== transaction.id),
    );
  }

  async function recordPurchase(
    item: EquipmentItem,
    quantity: number,
    note: string,
  ) {
    const { selectedCharacterIdRef, selectedCharacter, setModal, setSection } =
      getContext();

    const activeCharacterId =
      selectedCharacterIdRef.current || selectedCharacter?.characterId || "";
    if (!activeCharacterId) return;

    const currentBalances: CoinBalances = {
      pp: platinum,
      gp: gold,
      sp: silver,
      cp: copper,
    };
    const costInCopper = item.amount * quantity * coinValueInCopper[item.coin];
    const nextBalances = deductCostPreservingCoins(
      currentBalances,
      costInCopper,
    );
    if (!nextBalances) return;
    const deltas: CoinBalances = {
      pp: nextBalances.pp - currentBalances.pp,
      gp: nextBalances.gp - currentBalances.gp,
      sp: nextBalances.sp - currentBalances.sp,
      cp: nextBalances.cp - currentBalances.cp,
    };
    const label = quantity === 1 ? item.name : `${item.name} ×${quantity}`;

    setPlatinum(nextBalances.pp);
    setGold(nextBalances.gp);
    setSilver(nextBalances.sp);
    setCopper(nextBalances.cp);
    setTransactions((current) => [
      {
        id: Date.now(),
        label,
        coins: deltas,
        kind: "expense",
        note,
        timestamp: formatLedgerDate(new Date().toISOString()),
        source: "local",
        transactionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      ...current,
    ]);
    setModal(null);
    setSection("wallet");
  }

  async function backUpCurrentWallet() {
    const { selectedCharacter, selectedCharacterIdRef } = getContext();

    if (!selectedCharacter || walletBackupBusy) return;
    const characterId = selectedCharacter.characterId;

    setWalletBackupBusy("backup");
    setWalletBackupMessage("");
    setWalletBackupError("");
    try {
      const result = await backupLocalWallet({
        characterId,
        transactions: transactions as unknown as Array<Record<string, unknown>>,
        recurringExpenses: recurringExpenses as unknown as Array<
          Record<string, unknown>
        >,
      });
      if (selectedCharacterIdRef.current !== characterId) return;
      const when = result.backedUpAt
        ? new Date(result.backedUpAt).toLocaleString()
        : "just now";
      setWalletBackupMessage(`Ledger backup saved ${when}.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not back up this wallet.";
      if (selectedCharacterIdRef.current === characterId)
        setWalletBackupError(message);
      throw error;
    } finally {
      setWalletBackupBusy("");
    }
  }

  async function restoreCurrentWalletBackup() {
    const { selectedCharacter, selectedCharacterIdRef } = getContext();

    if (!selectedCharacter || walletBackupBusy) return;
    if (
      !window.confirm(
        "Restore this character's wallet backup? This will replace the local ledger and recurring wallet expenses on this device.",
      )
    )
      return;

    const characterId = selectedCharacter.characterId;
    const generation = getContext().characterLoadRequestRef?.current;
    const before = JSON.stringify(loadLocalWalletState(characterId));
    setWalletBackupBusy("restore");
    setWalletBackupMessage("");
    setWalletBackupError("");

    try {
      const result = await loadLocalWalletBackup(characterId);
      if (
        selectedCharacterIdRef.current !== characterId ||
        getContext().characterLoadRequestRef?.current !== generation
      )
        return;
      if (JSON.stringify(loadLocalWalletState(characterId)) !== before)
        throw new AppError(
          "conflict",
          "New wallet edits were made while restoring. They are preserved. Review the ledger and confirm restore again if you still want to replace them.",
        );
      validateWalletBackup(
        result.transactions,
        result.recurringExpenses,
        characterId,
      );
      const restoredTransactions = Array.isArray(result.transactions)
        ? (result.transactions as unknown as Transaction[])
        : [];
      const restoredRecurring = Array.isArray(result.recurringExpenses)
        ? (result.recurringExpenses as unknown as SheetRecurringExpense[])
        : [];

      const restoredBalance =
        walletBalanceFromTransactions(restoredTransactions);
      const restoredState: LocalWalletState = {
        version: 1,
        characterId,
        balance: restoredBalance,
        transactions: restoredTransactions,
        recurringExpenses: restoredRecurring,
        savedAt: new Date().toISOString(),
      };

      saveLocalWalletState(restoredState, true);
      walletLoadedCharacterIdRef.current = characterId;
      setTransactions(restoredTransactions);
      setRecurringExpenses(restoredRecurring);
      setPlatinum(restoredBalance.pp);
      setGold(restoredBalance.gp);
      setSilver(restoredBalance.sp);
      setCopper(restoredBalance.cp);

      if (
        selectedCharacterIdRef.current !== characterId ||
        getContext().characterLoadRequestRef?.current !== generation
      )
        return;
      const when = result.backedUpAt
        ? new Date(result.backedUpAt).toLocaleString()
        : "the saved backup";
      setWalletBackupMessage(`Wallet restored from ${when}.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not restore this wallet backup.";
      if (selectedCharacterIdRef.current === characterId)
        setWalletBackupError(message);
      throw error;
    } finally {
      setWalletBackupBusy("");
    }
  }

  async function cancelSchedule(scheduleId: string) {
    setRecurringExpenses((items) =>
      items.filter((item) => item.scheduleId !== scheduleId),
    );
  }

  async function updateSchedule(
    scheduleId: string,
    input: {
      label: string;
      amount: number;
      coin: CoinType;
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
      note: string;
    },
  ) {
    const amounts: CoinBalances = { pp: 0, gp: 0, sp: 0, cp: 0 };
    amounts[input.coin] = input.amount;
    setRecurringExpenses((items) =>
      items.map((item) =>
        item.scheduleId === scheduleId
          ? {
              ...item,
              label: input.label,
              ...amounts,
              frequency: input.frequency,
              startDate: input.startDate,
              note: input.note,
              active: true,
            }
          : item,
      ),
    );
  }

  useEffect(() => {
    if (
      !selectedCharacterId ||
      walletLoadedCharacterIdRef.current !== selectedCharacterId
    )
      return;

    const canonicalBalance = walletBalanceFromTransactions(transactions);

    // Keep the visible purse synchronized to the ledger. Reopening the app
    // cannot change the purse unless the ledger itself changed.
    if (platinum !== canonicalBalance.pp) setPlatinum(canonicalBalance.pp);
    if (gold !== canonicalBalance.gp) setGold(canonicalBalance.gp);
    if (silver !== canonicalBalance.sp) setSilver(canonicalBalance.sp);
    if (copper !== canonicalBalance.cp) setCopper(canonicalBalance.cp);

    saveLocalWalletState({
      version: 1,
      characterId: selectedCharacterId,
      balance: canonicalBalance,
      transactions,
      recurringExpenses,
      savedAt: new Date().toISOString(),
    });
  }, [
    selectedCharacterId,
    platinum,
    gold,
    silver,
    copper,
    transactions,
    recurringExpenses,
  ]);

  useEffect(() => {
    if (
      !selectedCharacterId ||
      walletLoadedCharacterIdRef.current !== selectedCharacterId
    )
      return;
    const today = new Date();
    const todayUtc = Date.UTC(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
    );
    const dueTransactions: Transaction[] = [];
    const coinDeltas: CoinBalances = { pp: 0, gp: 0, sp: 0, cp: 0 };
    let changed = false;

    const nextSchedules = recurringExpenses.map((schedule) => {
      if (!schedule.active) return schedule;
      let occurrenceCount = Math.max(0, Number(schedule.occurrenceCount) || 0);
      let safety = 0;
      while (safety < 500) {
        const dueAt = recurringOccurrenceDate(
          schedule.startDate,
          schedule.frequency,
          occurrenceCount,
        );
        if (!dueAt || dueAt.getTime() > todayUtc) break;
        const occurrenceNumber = occurrenceCount + 1;
        const localTransactionId = `local-recurring:${schedule.scheduleId}:${occurrenceNumber}`;
        if (
          !transactions.some(
            (item) => item.transactionId === localTransactionId,
          ) &&
          !dueTransactions.some(
            (item) => item.transactionId === localTransactionId,
          )
        ) {
          const coins: CoinBalances = {
            pp: -Math.abs(Number(schedule.pp) || 0),
            gp: -Math.abs(Number(schedule.gp) || 0),
            sp: -Math.abs(Number(schedule.sp) || 0),
            cp: -Math.abs(Number(schedule.cp) || 0),
          };
          coinDeltas.pp += coins.pp;
          coinDeltas.gp += coins.gp;
          coinDeltas.sp += coins.sp;
          coinDeltas.cp += coins.cp;
          dueTransactions.push({
            id: hashId(localTransactionId),
            label: schedule.label,
            coins,
            kind: "expense",
            note: schedule.note?.trim() || "Recurring expense",
            timestamp: formatLedgerDate(dueAt.toISOString()),
            source: "local",
            transactionId: localTransactionId,
          });
        }
        occurrenceCount += 1;
        safety += 1;
        changed = true;
      }
      return occurrenceCount === Number(schedule.occurrenceCount || 0)
        ? schedule
        : { ...schedule, occurrenceCount };
    });

    if (!changed) return;
    setRecurringExpenses(nextSchedules);
    if (dueTransactions.length) {
      setPlatinum((current) => Math.max(0, current + coinDeltas.pp));
      setGold((current) => Math.max(0, current + coinDeltas.gp));
      setSilver((current) => Math.max(0, current + coinDeltas.sp));
      setCopper((current) => Math.max(0, current + coinDeltas.cp));
      setTransactions((current) => [...dueTransactions.reverse(), ...current]);
    }
  }, [selectedCharacterId, recurringExpenses, transactions]);
  return {
    applySystemWalletTransactionLocally,
    recordTransaction,
    deleteWalletTransaction,
    recordPurchase,
    backUpCurrentWallet,
    restoreCurrentWalletBackup,
    cancelSchedule,
    updateSchedule,
    platinum,
    setPlatinum,
    gold,
    setGold,
    silver,
    setSilver,
    copper,
    setCopper,
    transactions,
    setTransactions,
    recurringExpenses,
    setRecurringExpenses,
    walletLoadedCharacterIdRef,
    walletBackupBusy,
    setWalletBackupBusy,
    walletBackupMessage,
    setWalletBackupMessage,
    walletBackupError,
    setWalletBackupError,
  };
}
