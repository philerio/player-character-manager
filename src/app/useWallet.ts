import { AppError } from "./errors";
import { apiBackend, isDemoMode } from "./runtime";
import { canonicalJSON } from "../../shared/records.mjs";
import { downloadWalletTransfer, readWalletTransfer } from "./walletTransfer";
import { loadLocalWalletState } from "./wallet";
import { validateWalletBackup } from "./validation";
import type { AppModal } from "./core";
import { recurringOccurrenceDate } from "./wallet";

import { useEffect, useRef, useState } from "react";
import {
  backupLocalWallet,
  getSessionToken,
  loadLocalWalletBackup,
  loadWalletData,
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
  mapSheetTransactions,
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
    "backup" | "restore" | "import" | ""
  >("");
  const [walletBackupMessage, setWalletBackupMessage] = useState("");
  const [walletBackupError, setWalletBackupError] = useState("");

  const [walletRecovering, setWalletRecovering] = useState(false);
  const [walletRecoveryError, setWalletRecoveryError] = useState("");
  const [walletRecoveryRetry, setWalletRecoveryRetry] = useState(0);
  const [walletBackupConflict, setWalletBackupConflict] = useState(false);
  const d1Wallet = apiBackend === "d1" && !isDemoMode;
  const operationRef = useRef(false);
  const pendingBackupRef = useRef<{ key: string; mutationId: string } | null>(
    null,
  );
  const liveWalletRef = useRef({ transactions, recurringExpenses });
  liveWalletRef.current = { transactions, recurringExpenses };

  function captureWalletScope() {
    const context = getContext();
    const characterId = context.selectedCharacter?.characterId || "";
    const generation = context.characterLoadRequestRef?.current;
    const session = getSessionToken();
    return {
      characterId,
      current: () =>
        getContext().selectedCharacterIdRef.current === characterId &&
        getContext().characterLoadRequestRef?.current === generation &&
        getSessionToken() === session,
    };
  }

  function replaceWallet(
    characterId: string,
    wallet: Pick<LocalWalletState, "transactions" | "recurringExpenses">,
    backupId = loadLocalWalletState(characterId)?.backupId,
  ) {
    const balance = walletBalanceFromTransactions(wallet.transactions);
    saveLocalWalletState(
      {
        version: 1,
        characterId,
        balance,
        ...wallet,
        backupId,
        savedAt: new Date().toISOString(),
      },
      true,
    );
    walletLoadedCharacterIdRef.current = characterId;
    setTransactions(wallet.transactions);
    setRecurringExpenses(wallet.recurringExpenses);
    setPlatinum(balance.pp);
    setGold(balance.gp);
    setSilver(balance.sp);
    setCopper(balance.cp);
    setWalletRecoveryError("");
    setWalletBackupConflict(false);
  }

  function requireLoadedWallet(characterId: string) {
    if (walletLoadedCharacterIdRef.current !== characterId)
      throw new AppError(
        "rejected",
        "Wait for this character's wallet to finish loading, then try again.",
      );
  }

  function serverBackupId(result: { backupId?: string }) {
    if (!result.backupId || typeof result.backupId !== "string")
      throw new AppError(
        "validation",
        "The campaign did not provide a wallet backup version. Your wallet was kept.",
      );
    return result.backupId;
  }

  useEffect(() => {
    setWalletBackupConflict(false);
    setWalletBackupError("");
    setWalletBackupMessage("");
  }, [selectedCharacterId]);

  useEffect(() => {
    if (!d1Wallet || !selectedCharacterId || !getSessionToken()) return;
    if (walletLoadedCharacterIdRef.current === selectedCharacterId) {
      setWalletRecovering(false);
      setWalletRecoveryError("");
      return;
    }
    if (operationRef.current) return;
    const scope = captureWalletScope();
    if (scope.characterId !== selectedCharacterId || !scope.current()) return;
    let cancelled = false;
    const current = () =>
      !cancelled &&
      scope.current() &&
      walletLoadedCharacterIdRef.current !== scope.characterId &&
      !operationRef.current;
    setWalletRecovering(true);
    setWalletRecoveryError("");
    void (async () => {
      try {
        let wallet: Pick<
            LocalWalletState,
            "transactions" | "recurringExpenses"
          >,
          backupId: string;
        try {
          const result = await loadLocalWalletBackup(scope.characterId);
          backupId = serverBackupId(result);
          validateWalletBackup(
            result.transactions,
            result.recurringExpenses,
            scope.characterId,
          );
          if (result.characterId !== scope.characterId)
            throw new AppError(
              "validation",
              "The saved wallet belongs to a different character.",
            );
          wallet = {
            transactions: result.transactions as unknown as Transaction[],
            recurringExpenses:
              result.recurringExpenses as unknown as SheetRecurringExpense[],
          };
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== "not-found")
            throw error;
          if (!current()) return;
          const result = await loadWalletData(scope.characterId);
          if (result.characterId !== scope.characterId)
            throw new AppError(
              "validation",
              "The campaign wallet belongs to a different character.",
            );
          wallet = {
            transactions: mapSheetTransactions(result.transactions),
            recurringExpenses: result.recurringExpenses,
          };
          validateWalletBackup(
            wallet.transactions,
            wallet.recurringExpenses,
            scope.characterId,
          );
          // If a backup appeared after the 404, the first save will conflict safely.
          backupId = "";
        }
        if (!current()) return;
        replaceWallet(scope.characterId, wallet, backupId);
      } catch (error) {
        if (current())
          setWalletRecoveryError(
            error instanceof Error
              ? error.message
              : "Could not recover this wallet. Retry or import a wallet file.",
          );
      } finally {
        if (!cancelled && scope.current()) setWalletRecovering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCharacterId, walletRecoveryRetry, walletBackupBusy]);

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
    if (d1Wallet) requireLoadedWallet(activeCharacterId);

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
    if (d1Wallet) requireLoadedWallet(characterId);

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
    if (d1Wallet) requireLoadedWallet(activeCharacterId);

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
    const scope = captureWalletScope();
    if (!scope.characterId || operationRef.current) return;
    operationRef.current = true;
    setWalletBackupBusy("backup");
    setWalletBackupMessage("");
    setWalletBackupError("");
    try {
      requireLoadedWallet(scope.characterId);
      let expectedBackupId = loadLocalWalletState(scope.characterId)?.backupId;
      if (
        d1Wallet &&
        (expectedBackupId === undefined || walletBackupConflict)
      ) {
        try {
          const campaign = await loadLocalWalletBackup(scope.characterId);
          if (!scope.current()) return;
          expectedBackupId = serverBackupId(campaign);
          const same =
            canonicalJSON({
              transactions: campaign.transactions,
              recurringExpenses: campaign.recurringExpenses,
            }) === canonicalJSON(liveWalletRef.current);
          if (
            !same &&
            !window.confirm(
              `A campaign backup from ${new Date(campaign.backedUpAt).toLocaleString()} already exists (${campaign.transactions.length} transactions). Replace it with this device's wallet? Export both wallets first if you need to combine their entries.`,
            )
          )
            return;
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== "not-found")
            throw error;
          const imported = await loadWalletData(scope.characterId);
          if (!scope.current()) return;
          const hasImportedData =
            imported.transactions.length || imported.recurringExpenses.length;
          const same =
            canonicalJSON({
              transactions: mapSheetTransactions(imported.transactions),
              recurringExpenses: imported.recurringExpenses,
            }) === canonicalJSON(liveWalletRef.current);
          if (
            hasImportedData &&
            !same &&
            !window.confirm(
              "The imported campaign ledger differs from this device's wallet. Save this device's wallet as the campaign backup? Export and compare the ledgers first if you need to combine their entries.",
            )
          )
            return;
          expectedBackupId = "";
        }
        if (!scope.current()) return;
        saveLocalWalletState(
          {
            version: 1,
            characterId: scope.characterId,
            ...liveWalletRef.current,
            balance: walletBalanceFromTransactions(
              liveWalletRef.current.transactions,
            ),
            backupId: expectedBackupId,
            savedAt: new Date().toISOString(),
          },
          true,
        );
        setWalletBackupConflict(false);
      }
      const wallet = liveWalletRef.current;
      validateWalletBackup(
        wallet.transactions,
        wallet.recurringExpenses,
        scope.characterId,
      );
      const key = canonicalJSON({
        session: getSessionToken(),
        characterId: scope.characterId,
        expectedBackupId,
        ...wallet,
      });
      if (pendingBackupRef.current?.key !== key)
        pendingBackupRef.current = { key, mutationId: crypto.randomUUID() };
      const mutationId = pendingBackupRef.current.mutationId;
      const result = await backupLocalWallet({
        characterId: scope.characterId,
        transactions: wallet.transactions as unknown as Array<
          Record<string, unknown>
        >,
        recurringExpenses: wallet.recurringExpenses as unknown as Array<
          Record<string, unknown>
        >,
        clientMutationId: mutationId,
        expectedBackupId,
      });
      if (!scope.current()) return;
      if (d1Wallet) {
        const backupId = serverBackupId(result);
        saveLocalWalletState(
          {
            version: 1,
            characterId: scope.characterId,
            ...liveWalletRef.current,
            balance: walletBalanceFromTransactions(
              liveWalletRef.current.transactions,
            ),
            backupId,
            savedAt: new Date().toISOString(),
          },
          true,
        );
      }
      if (pendingBackupRef.current?.mutationId === mutationId)
        pendingBackupRef.current = null;
      setWalletBackupConflict(result.isLatest === false);
      const when = result.backedUpAt
        ? new Date(result.backedUpAt).toLocaleString()
        : "just now";
      const changed =
        canonicalJSON(liveWalletRef.current) !== canonicalJSON(wallet);
      setWalletBackupMessage(
        result.isLatest === false
          ? "This snapshot was saved, but a newer campaign backup exists."
          : `Ledger backup saved ${when}.${changed ? " Newer edits on this device still need to be backed up." : ""}`,
      );
    } catch (error) {
      if (
        scope.current() &&
        error instanceof AppError &&
        error.code === "conflict"
      )
        setWalletBackupConflict(true);
      if (scope.current())
        setWalletBackupError(
          error instanceof Error
            ? error.message
            : "Could not back up this wallet.",
        );
      throw error;
    } finally {
      operationRef.current = false;
      setWalletBackupBusy("");
    }
  }

  async function restoreCurrentWalletBackup() {
    const scope = captureWalletScope();
    if (!scope.characterId || operationRef.current) return;
    if (
      !window.confirm(
        "Restore this character's wallet backup? This will replace the local ledger and recurring wallet expenses on this device.",
      )
    )
      return;
    const before = JSON.stringify(loadLocalWalletState(scope.characterId));
    const beforeLive = canonicalJSON(liveWalletRef.current);
    operationRef.current = true;
    setWalletBackupBusy("restore");
    setWalletBackupMessage("");
    setWalletBackupError("");
    try {
      const result = await loadLocalWalletBackup(scope.characterId);
      if (!scope.current()) return;
      if (
        JSON.stringify(loadLocalWalletState(scope.characterId)) !== before ||
        canonicalJSON(liveWalletRef.current) !== beforeLive
      )
        throw new AppError(
          "conflict",
          "New wallet edits were made while restoring. They are preserved. Review the ledger and confirm restore again if you still want to replace them.",
        );
      if (result.characterId !== scope.characterId)
        throw new AppError(
          "validation",
          "The backup belongs to a different character. Your current wallet has been kept.",
        );
      validateWalletBackup(
        result.transactions,
        result.recurringExpenses,
        scope.characterId,
      );
      replaceWallet(
        scope.characterId,
        {
          transactions: result.transactions as unknown as Transaction[],
          recurringExpenses:
            result.recurringExpenses as unknown as SheetRecurringExpense[],
        },
        d1Wallet ? serverBackupId(result) : undefined,
      );
      const when = result.backedUpAt
        ? new Date(result.backedUpAt).toLocaleString()
        : "the saved backup";
      setWalletBackupMessage(`Wallet restored from ${when}.`);
    } catch (error) {
      if (scope.current())
        setWalletBackupError(
          error instanceof Error
            ? error.message
            : "Could not restore this wallet backup.",
        );
      throw error;
    } finally {
      operationRef.current = false;
      setWalletBackupBusy("");
    }
  }

  function exportCurrentWallet() {
    const { characterId } = captureWalletScope();
    if (!characterId || operationRef.current) return;
    setWalletBackupMessage("");
    setWalletBackupError("");
    try {
      requireLoadedWallet(characterId);
      downloadWalletTransfer({ characterId, ...liveWalletRef.current });
      setWalletBackupMessage(
        "Wallet file downloaded. Keep it safe; it contains this character's ledger.",
      );
    } catch (error) {
      setWalletBackupError(
        error instanceof Error
          ? error.message
          : "Could not export this wallet.",
      );
    }
  }

  async function importWalletFile(file: File) {
    const scope = captureWalletScope();
    if (!scope.characterId || operationRef.current) return;
    const before = JSON.stringify(loadLocalWalletState(scope.characterId));
    const beforeLive = canonicalJSON(liveWalletRef.current);
    operationRef.current = true;
    setWalletBackupBusy("import");
    setWalletBackupMessage("");
    setWalletBackupError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new AppError(
          "rejected",
          "This wallet file is too large. Export this character's wallet separately and try again.",
        );
      let input: unknown;
      const text = await file.text();
      try {
        input = JSON.parse(text);
      } catch {
        throw new AppError(
          "rejected",
          "This file is not valid JSON. Export a fresh wallet file and try again.",
        );
      }
      if (!scope.current()) return;
      const wallet = readWalletTransfer(input, scope.characterId);
      if (
        !window.confirm(
          "Import this wallet file? This will replace the selected character's local ledger and recurring wallet expenses on this device.",
        )
      )
        return;
      if (!scope.current()) return;
      if (
        JSON.stringify(loadLocalWalletState(scope.characterId)) !== before ||
        canonicalJSON(liveWalletRef.current) !== beforeLive
      )
        throw new AppError(
          "conflict",
          "The wallet changed while reading this file. Your edits are preserved. Review the ledger before importing again.",
        );
      replaceWallet(scope.characterId, wallet);
      setWalletBackupMessage(
        "Wallet file imported on this device. Use Back Up Ledger to save it to the campaign.",
      );
    } catch (error) {
      if (scope.current())
        setWalletBackupError(
          error instanceof Error
            ? error.message
            : "Could not import this wallet file.",
        );
      throw error;
    } finally {
      operationRef.current = false;
      setWalletBackupBusy("");
    }
  }

  async function cancelSchedule(scheduleId: string) {
    if (d1Wallet)
      requireLoadedWallet(getContext().selectedCharacterIdRef.current);
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
    if (d1Wallet)
      requireLoadedWallet(getContext().selectedCharacterIdRef.current);
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
      backupId: loadLocalWalletState(selectedCharacterId)?.backupId,
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
    exportCurrentWallet,
    importWalletFile,
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
    walletRecovering,
    walletRecoveryError,
    walletBackupConflict,
    retryWalletRecovery: () => setWalletRecoveryRetry((value) => value + 1),
    walletBackupBusy,
    setWalletBackupBusy,
    walletBackupMessage,
    setWalletBackupMessage,
    walletBackupError,
    setWalletBackupError,
  };
}
