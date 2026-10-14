import { CircleDollarSign, Coins, Plus, ReceiptText, ScrollText, ShoppingCart, Trash2, X, Upload } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { type SheetPlayer, type SheetRecurringExpense, type SheetRetainer } from "../google-sheets-api";
import { type CoinType, type CoinBalances, coinValueInCopper, CHARACTER_CLASSES, formatCalendarDate } from "../app/core";
import { localCalendarDate } from "../app/workbook";
import { purseValueInCopper, type EquipmentItem, type Transaction, transactionCoinText } from "../app/wallet";
import { equipmentCatalog } from "../app/catalog";

export function CharacterModal({
  canClose,
  isDm,
  players,
  currentPlayer,
  onClose,
  onSave,
}: {
  canClose: boolean;
  isDm: boolean;
  players: SheetPlayer[];
  currentPlayer: SheetPlayer | null;
  onClose: () => void;
  onSave: (input: {
    playerName: string;
    targetPlayerId?: string;
    name: string;
    className: string;
    level: number;
  }) => Promise<void>;
}) {
  const [ownerId, setOwnerId] = useState(currentPlayer?.playerId || players.find(player => player.active)?.playerId || "");
  useEffect(() => { if (ownerId && !players.some(player => player.playerId === ownerId && player.active)) setOwnerId(""); }, [players, ownerId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const targetPlayerId = String(data.get("targetPlayerId") || "").trim();
      const selectedOwner = players.find((player) => player.playerId === targetPlayerId);
      if (isDm && (!selectedOwner || !selectedOwner.active)) throw new Error("This player is no longer available. Choose a player from the current roster.");
      await onSave({
        playerName: isDm
          ? selectedOwner?.displayName || currentPlayer?.displayName || ""
          : String(data.get("playerName") || "").trim(),
        targetPlayerId: isDm ? targetPlayerId || currentPlayer?.playerId : undefined,
        name: String(data.get("name") || "").trim(),
        className: String(data.get("className") || "").trim(),
        level: Math.max(1, Number(data.get("level")) || 1),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the character.");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={canClose ? onClose : undefined}
    >
      <section
        className="modal character-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {canClose && (
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        )}
        <p className="eyebrow">Character creator · Step 1</p>
        <h2 id="character-modal-title">Create a Character</h2>
        <p className="modal-intro">
          Add the character’s basic identity now. Ability scores, race, alignment,
          and the full AD&amp;D creation sequence will follow in later steps.
        </p>
        <form onSubmit={submit}>
          {isDm ? (
            <label>
              Player
              <select
                name="targetPlayerId"
                value={ownerId}
                onChange={event => setOwnerId(event.target.value)}
                autoFocus
                required
              >
                <option value="" disabled>Select a player</option>
                {players.map((player) => (
                  <option disabled={!player.active} value={player.playerId} key={player.playerId}>
                    {player.displayName || player.playerId}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Player name
              <input
                name="playerName"
                defaultValue={currentPlayer?.displayName || ""}
                placeholder="Your name"
                autoFocus
                required
                maxLength={120}
              />
            </label>
          )}
          <label>
            Character name
            <input name="name" placeholder="Character name" required maxLength={120} />
          </label>
          <div className="character-fields">
            <label>
              Class
              <select name="className" defaultValue="" required>
                <option value="" disabled>Select a class</option>
                {CHARACTER_CLASSES.map((className) => <option value={className} key={className}>{className}</option>)}
              </select>
            </label>
            <label>
              Starting level
              <input name="level" type="number" min="1" max="99" defaultValue="1" required />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create Character"}
          </button>
        </form>
      </section>
    </div>
  );
}

export function WalletView({
  platinum,
  gold,
  silver,
  copper,
  coinWeight,
  transactions,
  onAction,
  onSeeFullLedger,
  onManageRecurringExpenses,
  backupEnabled,
  backupBusy,
  backupMessage,
  backupError,
  onBackup,
  onRestore,
}: {
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  coinWeight: string;
  transactions: Transaction[];
  onAction: (action: "funds" | "expense" | "purchase") => void;
  onSeeFullLedger: () => void;
  onManageRecurringExpenses: () => void;
  backupEnabled: boolean;
  backupBusy: "backup" | "restore" | "";
  backupMessage: string;
  backupError: string;
  onBackup: () => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  const formatCoinAmount = (amount: number) => amount.toLocaleString();
  const coinAmountClass = (amount: number) => {
    const digits = Math.abs(Math.trunc(amount)).toString().length;
    if (digits >= 8) return "coin-amount coin-amount-xlong";
    if (digits >= 5) return "coin-amount coin-amount-long";
    return "coin-amount";
  };

  return (
    <>
      <section className="wallet-hero ornamental-card">
        <div className="watermark-coins">
          <Coins size={146} strokeWidth={0.7} />
        </div>
        <div className="balance-column">
          <p className="eyebrow">Character purse</p>
          <div className="coin-balances" aria-label="Current balance">
            <div className="coin-balance platinum">
              <span className="coin coin-platinum">pp</span>
              <strong className={coinAmountClass(platinum)}>{formatCoinAmount(platinum)}</strong>
              <span className="coin-type">pp</span>
            </div>
            <div className="coin-balance gold">
              <span className="coin coin-gold">gp</span>
              <strong className={coinAmountClass(gold)}>{formatCoinAmount(gold)}</strong>
              <span className="coin-type">gp</span>
            </div>
            <div className="coin-balance">
              <span className="coin coin-silver">sp</span>
              <strong className={coinAmountClass(silver)}>{formatCoinAmount(silver)}</strong>
              <span className="coin-type">sp</span>
            </div>
            <div className="coin-balance">
              <span className="coin coin-copper">cp</span>
              <strong className={coinAmountClass(copper)}>{formatCoinAmount(copper)}</strong>
              <span className="coin-type">cp</span>
            </div>
          </div>
          <div className="coin-weight">
            <ShoppingCart size={22} />
            <span>Coin weight</span>
            <span className="dot-leader" />
            <strong>{coinWeight} lb</strong>
          </div>
        </div>

        <div className="wallet-actions">
          <button className="primary-action" onClick={() => onAction("funds")}>
            <Plus size={21} /> Add Funds
          </button>
          <button onClick={() => onAction("expense")}>
            <ReceiptText size={20} /> Record Expense
          </button>
          <button onClick={() => onAction("purchase")}>
            <ShoppingCart size={20} /> Purchase
          </button>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="ornamental-card ledger-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Last activity</p>
              <h2>Recent Ledger</h2>
            </div>
            <div className="ledger-heading-actions">
              <button
                className="manage-recurring-button"
                onClick={onManageRecurringExpenses}
              >
                <ReceiptText size={15} />
                <span>Manage Recurring Expenses</span>
              </button>
              <button
                className="manage-recurring-button"
                disabled={!backupEnabled || Boolean(backupBusy)}
                onClick={() => void onBackup().catch((error) =>
                  window.alert(error instanceof Error ? error.message : "Could not back up the ledger.")
                )}
                title="Save this local ledger to the workbook as a backup"
              >
                <Upload size={15} />
                <span>{backupBusy === "backup" ? "Backing up…" : "Back Up Ledger"}</span>
              </button>
              <button
                className="manage-recurring-button"
                disabled={!backupEnabled || Boolean(backupBusy)}
                onClick={() => void onRestore().catch((error) =>
                  window.alert(error instanceof Error ? error.message : "Could not restore the ledger backup.")
                )}
                title="Replace this device's local ledger with the saved workbook backup"
              >
                <ScrollText size={15} />
                <span>{backupBusy === "restore" ? "Restoring…" : "Restore Backup"}</span>
              </button>
              <ScrollText size={24} />
            </div>
          </div>
          {backupError && <p className="form-error">{backupError}</p>}
          {backupMessage && <p className="sync-success">{backupMessage}</p>}
          <div className="transaction-list">
            {transactions.slice(0, 4).map((item) => (
              <div className="transaction" key={item.id}>
                <span className={`transaction-icon ${item.kind}`}>
                  {item.kind === "income" ? <CircleDollarSign /> : <ReceiptText />}
                </span>
                <span className="transaction-name">
                  <strong>{item.label}</strong>
                  <small className="transaction-date">{item.timestamp}</small>
                  {item.note && <small className="transaction-note">{item.note}</small>}
                </span>
                <strong className={item.kind}>
                  {transactionCoinText(item)}
                </strong>
              </div>
            ))}
            {!transactions.length && (
              <p className="empty-ledger">No transactions have been recorded.</p>
            )}
          </div>
          <button className="full-ledger-button" onClick={onSeeFullLedger}>
            <ScrollText size={18} />
            See full ledger
          </button>
        </section>

      </div>
    </>
  );
}

export function RecurringExpensesModal({
  schedules,
  retainers,
  onCancel,
  onUpdate,
  onEditLinkedRetainer,
  onClose,
}: {
  schedules: SheetRecurringExpense[];
  retainers: SheetRetainer[];
  onCancel: (scheduleId: string) => Promise<void>;
  onUpdate: (
    scheduleId: string,
    input: {
      label: string;
      amount: number;
      coin: CoinType;
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
      note: string;
    },
  ) => Promise<void>;
  onEditLinkedRetainer: (retainer: SheetRetainer) => void;
  onClose: () => void;
}) {
  const [cancellingId, setCancellingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [editError, setEditError] = useState("");
  const frequencyLabel = {
    weekly: "Weekly",
    monthly: "Monthly",
    annually: "Annually",
  };
  const amountLabel = (schedule: SheetRecurringExpense) => {
    const amounts = (["pp", "gp", "sp", "cp"] as CoinType[])
      .filter((coin) => Number(schedule[coin]) > 0)
      .map((coin) => `${Number(schedule[coin]).toLocaleString()} ${coin}`);
    return amounts.join(", ");
  };

  async function cancel(scheduleId: string) {
    setCancellingId(scheduleId);
    try {
      await onCancel(scheduleId);
    } finally {
      setCancellingId("");
    }
  }

  function editableCoin(schedule: SheetRecurringExpense): CoinType {
    return (["pp", "gp", "sp", "cp"] as CoinType[]).find(
      (coin) => Number(schedule[coin]) > 0,
    ) || "gp";
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, scheduleId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    if (!(amount > 0)) return;
    setSavingId(scheduleId);
    setEditError("");
    try {
      await onUpdate(scheduleId, {
        label: String(data.get("label") || "").trim(),
        amount,
        coin: String(data.get("coin") || "gp") as CoinType,
        frequency: String(data.get("frequency") || "monthly") as
          | "weekly"
          | "monthly"
          | "annually",
        startDate: String(data.get("startDate") || ""),
        note: String(data.get("note") || "").trim(),
      });
      setEditingId("");
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update the expense.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal recurring-expenses-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-expenses-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X />
        </button>
        <p className="eyebrow">Character wallet</p>
        <h2 id="recurring-expenses-title">Manage Recurring Expenses</h2>
        <div className="recurring-expense-list">
          {schedules.map((schedule) => (
            <div className="recurring-expense-row" key={schedule.scheduleId}>
              <div className="recurring-expense-summary">
                <strong>{schedule.label}</strong>
                <small>
                  {amountLabel(schedule)} · {frequencyLabel[schedule.frequency]} · starts{" "}
                  {formatCalendarDate(schedule.startDate)}
                </small>
                {schedule.note && <small>{schedule.note}</small>}
              </div>
              <div className="recurring-expense-actions">
                <button
                  className="edit-recurring-button"
                  disabled={cancellingId === schedule.scheduleId}
                  onClick={() => {
                    setEditError("");
                    const linkedRetainer = schedule.sourceType === "retainer"
                      ? retainers.find((retainer) => retainer.retainerId === schedule.sourceId)
                      : undefined;
                    if (linkedRetainer) {
                      onEditLinkedRetainer(linkedRetainer);
                    } else {
                      setEditingId(schedule.scheduleId);
                    }
                  }}
                >
                  Edit
                </button>
                {schedule.sourceType !== "retainer" && (
                  <button
                    className="cancel-recurring-button"
                    disabled={cancellingId === schedule.scheduleId}
                    onClick={() => void cancel(schedule.scheduleId)}
                  >
                    {cancellingId === schedule.scheduleId ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </div>
              {editingId === schedule.scheduleId && (
                <form
                  className="recurring-expense-edit-form"
                  onSubmit={(event) => void saveEdit(event, schedule.scheduleId)}
                >
                  <label>
                    Expense
                    <input name="label" defaultValue={schedule.label} required autoFocus />
                  </label>
                  <div className="coin-entry">
                    <label>
                      Amount
                      <input
                        name="amount"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={schedule[editableCoin(schedule)]}
                        required
                      />
                    </label>
                    <label>
                      Coin
                      <select name="coin" defaultValue={editableCoin(schedule)}>
                        <option value="pp">Platinum pieces (pp)</option>
                        <option value="gp">Gold pieces (gp)</option>
                        <option value="sp">Silver pieces (sp)</option>
                        <option value="cp">Copper pieces (cp)</option>
                      </select>
                    </label>
                  </div>
                  <div className="coin-entry">
                    <label>
                      Repeats
                      <select name="frequency" defaultValue={schedule.frequency}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="annually">Annually</option>
                      </select>
                    </label>
                    <label>
                      Schedule date
                      <input
                        name="startDate"
                        type="date"
                        defaultValue={String(schedule.startDate).slice(0, 10)}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Note
                    <input name="note" defaultValue={schedule.note || ""} maxLength={500} />
                  </label>
                  {editError && <p className="form-error">{editError}</p>}
                  <div className="recurring-edit-actions">
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => setEditingId("")}
                    >
                      Back
                    </button>
                    <button
                      className="primary-action"
                      type="submit"
                      disabled={savingId === schedule.scheduleId}
                    >
                      {savingId === schedule.scheduleId ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {!schedules.length && (
            <p className="empty-ledger">No active recurring expenses.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function FullLedgerModal({
  transactions,
  onDelete,
  onClose,
}: {
  transactions: Transaction[];
  onDelete: (transaction: Transaction) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal full-ledger-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="full-ledger-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close full ledger" onClick={onClose}>
          <X size={20} />
        </button>
        <p className="eyebrow">Transaction history</p>
        <h2 id="full-ledger-title">Full Ledger</h2>
        <p className="modal-intro">
          Review every transaction recorded for this character.
        </p>
        <div className="full-ledger-list">
          {transactions.map((item) => (
            <div className="transaction" key={item.id}>
              <span className={`transaction-icon ${item.kind}`}>
                {item.kind === "income" ? <CircleDollarSign /> : <ReceiptText />}
              </span>
              <span className="transaction-name">
                <strong>{item.label}</strong>
                <small className="transaction-date">{item.timestamp}</small>
                {item.note && <small className="transaction-note">{item.note}</small>}
              </span>
              <span
                className="ledger-amount-actions"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.45rem",
                  marginLeft: "auto",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <strong className={item.kind}>
                  {transactionCoinText(item)}
                </strong>
                <button
                  type="button"
                  className="edit-delete-button"
                  style={{ margin: 0, flex: "0 0 auto" }}
                  aria-label={`Delete ${item.label}`}
                  title="Delete transaction"
                  onClick={() => {
                    if (window.confirm(`Delete "${item.label}"?`)) {
                      void onDelete(item);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          ))}
          {!transactions.length && (
            <p className="empty-ledger">No transactions have been recorded.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function TransactionModal({
  mode,
  characterName,
  onClose,
  onSave,
}: {
  mode: "funds" | "expense";
  characterName: string;
  onClose: () => void;
  onSave: (
    label: string,
    amount: number,
    coin: CoinType,
    kind: "income" | "expense",
    note: string,
    recurrence?: {
      frequency: "weekly" | "monthly" | "annually";
      startDate: string;
    },
  ) => void;
}) {
  const [expenseType, setExpenseType] = useState<"one-time" | "recurring">("one-time");
  const config = {
    funds: { title: "Add Funds", label: "Source", placeholder: "Treasure share", kind: "income" as const },
    expense: { title: "Record Expense", label: "Expense", placeholder: "Room and board", kind: "expense" as const },
  }[mode];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get("label") || config.placeholder);
    const amount = Number(data.get("amount"));
    const coin = String(data.get("coin") || "gp") as CoinType;
    const note = String(data.get("note") || "").trim();
    const recurring = mode === "expense" && expenseType === "recurring";
    const frequency = String(data.get("frequency") || "monthly") as
      | "weekly"
      | "monthly"
      | "annually";
    const startDate = String(data.get("startDate") || "");
    if (amount > 0 && (!recurring || startDate)) {
      onSave(
        label,
        amount,
        coin,
        config.kind,
        note,
        recurring ? { frequency, startDate } : undefined,
      );
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal transaction-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}><X /></button>
        <p className="eyebrow">{characterName}</p>
        <h2 id="modal-title">{config.title}</h2>
        <form onSubmit={submit}>
          {mode === "expense" && (
            <label>
              Expense type
              <select
                name="expenseType"
                value={expenseType}
                onChange={(event) =>
                  setExpenseType(event.currentTarget.value as "one-time" | "recurring")
                }
              >
                <option value="one-time">One-time expense</option>
                <option value="recurring">Recurring expense</option>
              </select>
            </label>
          )}
          <label>{config.label}<input name="label" placeholder={config.placeholder} autoFocus required /></label>
          <div className="coin-entry">
            <label>Amount<input name="amount" type="number" min="1" step="1" placeholder="0" required /></label>
            <label>Coin
              <select name="coin" defaultValue="gp">
                <option value="pp">Platinum pieces (pp)</option>
                <option value="gp">Gold pieces (gp)</option>
                <option value="sp">Silver pieces (sp)</option>
                <option value="cp">Copper pieces (cp)</option>
              </select>
            </label>
          </div>
          {mode === "expense" && expenseType === "recurring" && (
            <div className="coin-entry">
              <label>
                Repeats
                <select name="frequency" defaultValue="monthly">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annually">Annually</option>
                </select>
              </label>
              <label>
                First deduction date
                <input
                  name="startDate"
                  type="date"
                  defaultValue={localCalendarDate()}
                  required
                />
              </label>
            </div>
          )}
          <label>
            Note
            <input
              className="transaction-note-input"
              name="note"
              placeholder="add note"
              maxLength={250}
            />
          </label>
          <button className="primary-action" type="submit">Save to Ledger</button>
        </form>
      </section>
    </div>
  );
}

export function PurchaseModal({
  balances,
  onClose,
  onPurchase,
}: {
  balances: CoinBalances;
  onClose: () => void;
  onPurchase: (item: EquipmentItem, quantity: number, note: string) => void;
}) {
  const modalRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EquipmentItem | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const filteredItems = equipmentCatalog.filter((item) =>
    `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  const parsedQuantity = quantity === "" ? NaN : Number(quantity);
  const validQuantity = Number.isInteger(parsedQuantity) && parsedQuantity >= 1
    ? parsedQuantity
    : null;
  const total = selected && validQuantity ? selected.amount * validQuantity : 0;
  const purseValue = purseValueInCopper(balances);
  const purchaseValue = selected
    ? total * coinValueInCopper[selected.coin]
    : 0;

  useEffect(() => {
    modalRef.current?.focus({ preventScroll: true });
  }, []);

  function purchase() {
    if (!selected) return;
    if (validQuantity === null) {
      setError("Enter a quantity of at least 1.");
      return;
    }
    if (purseValue < purchaseValue) {
      setError(
        `Insufficient funds. This purchase costs ${total} ${selected.coin}.`,
      );
      return;
    }
    onPurchase(selected, validQuantity, note.trim());
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={modalRef}
        tabIndex={-1}
        className="modal purchase-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}><X /></button>
        <p className="eyebrow">Basic equipment and supplies</p>
        <h2 id="purchase-title">Purchase Equipment</h2>
        <input
          className="equipment-search"
          type="search"
          placeholder="Search equipment"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <p className="encumbrance-note">
          Encumbrance is shown for reference only and is not added to the wallet.
        </p>
        <div className="equipment-list">
          {filteredItems.map((item) => (
            <button
              type="button"
              key={`${item.category}-${item.name}`}
              className={selected === item ? "equipment-row selected" : "equipment-row"}
              onClick={() => {
                setSelected(item);
                setQuantity("1");
                setError("");
              }}
            >
              <span><strong>{item.name}</strong><small>{item.category}</small></span>
              <span className="equipment-price">{item.amount} {item.coin}</span>
              <span className="equipment-encumbrance">
                {item.encumbrance === "—" ? "—" : `${item.encumbrance} enc.`}
              </span>
            </button>
          ))}
          {!filteredItems.length && <p className="empty-ledger">No matching equipment.</p>}
        </div>
        {selected && (
          <div className="purchase-selection">
            <div>
              <strong>{selected.name}</strong>
              <span>{total} {selected.coin} total</span>
            </div>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setError("");
                }}
              />
            </label>
            <label className="purchase-note">
              Note
              <input
                className="transaction-note-input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="add note"
                maxLength={250}
              />
            </label>
            {error && <p className="purchase-error" role="alert">{error}</p>}
            <button className="primary-action" type="button" onClick={purchase}>
              Purchase for {total} {selected.coin}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
