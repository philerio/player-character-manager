import { BookOpen, Crown, Pencil, Plus, Shield, Send, Trash2, UsersRound, X, Upload } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { type SheetCharacter, type SheetPlayer, type SheetJournalEntry, type SheetRetainer, type FightingForceGroup } from "../google-sheets-api";
import { type CoinType, formatCalendarDate } from "../app/core";
import { FORCE_WEAPON_OPTIONS, forceArmorClass, mergeIdenticalForceGroups } from "../app/forces";
import { RECRUITMENT_SOLDIER_TYPES, soldierWageBreakdown, recruitEquipmentRules, forceEditorArmorOptions, forceEditorWeaponNames, forceEditorWeaponOptions, forceEditorGearValidation } from "../app/catalog";

export function JournalView({
  characterName,
  discordEnabled,
  entries,
  onAdd,
  onEdit,
  onSend,
  isDm,
  pushingToSheet,
  pushToSheetSuccess,
  onPushToSheet,
}: {
  characterName: string;
  discordEnabled: boolean;
  entries: SheetJournalEntry[];
  onAdd: () => void;
  onEdit: (entry: SheetJournalEntry) => void;
  onSend: (entry: SheetJournalEntry) => Promise<void>;
  isDm: boolean;
  pushingToSheet: boolean;
  pushToSheetSuccess: boolean;
  onPushToSheet: () => Promise<void>;
}) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [sendingEntryId, setSendingEntryId] = useState("");
  const [sentEntryId, setSentEntryId] = useState("");
  const [sendError, setSendError] = useState("");
  const [confirmEntry, setConfirmEntry] = useState<SheetJournalEntry | null>(null);

  useEffect(() => {
    setExpandedEntries(new Set());
  }, [characterName]);

  useEffect(() => {
    if (!confirmEntry) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sendingEntryId) setConfirmEntry(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmEntry, sendingEntryId]);

  return (
    <section>
      <div className="page-title">
        <div><p className="eyebrow">Player notes</p><h1>Campaign Journal</h1><p>Notes recorded for {characterName || "this character"}.</p></div>
        <div className="page-title-actions">
          {isDm && (
            <button className="secondary-action" disabled={pushingToSheet} onClick={() => void onPushToSheet().catch((error) => window.alert(error instanceof Error ? error.message : "Could not push Journal to the Sheet."))}>
              <Upload size={17} /> {pushingToSheet ? "Pushing…" : pushToSheetSuccess ? "Pushed" : "Push to Sheet"}
            </button>
          )}
          <button className="primary-action" onClick={onAdd}><Plus size={19} /> Add Entry</button>
        </div>
      </div>
      {entries.length ? (
        <div className="journal-grid">
          {entries.map((entry) => {
            const tags = entry.category.split(",").map((tag) => tag.trim()).filter(Boolean);
            const isLong = entry.notes.length > 240;
            const expanded = expandedEntries.has(entry.entryId);
            return (
              <article className="ornamental-card journal-entry" key={entry.entryId}>
                <div className="journal-entry-heading">
                  <div className="entry-tags">
                    {tags.map((tag) => <span className="entry-tag" key={tag}>{tag}</span>)}
                  </div>
                  <button className="journal-edit-button" aria-label={`Edit ${entry.title}`} onClick={() => onEdit(entry)}>
                    <Pencil size={16} />
                  </button>
                </div>
                <h2>{entry.title}</h2>
                <p className={expanded ? "journal-note expanded" : "journal-note"}>
                  {expanded || !isLong ? entry.notes : `${entry.notes.slice(0, 240).trimEnd()}…`}
                </p>
                {isLong && (
                  <button
                    className="text-button"
                    onClick={() => setExpandedEntries((current) => {
                      const next = new Set(current);
                      if (next.has(entry.entryId)) next.delete(entry.entryId);
                      else next.add(entry.entryId);
                      return next;
                    })}
                  >
                    {expanded ? "Show less ↑" : "Read note →"}
                  </button>
                )}
                {discordEnabled && (
                  <button
                    className="journal-discord-button"
                    aria-label={`Send ${entry.title} to Discord character thread`}
                    title="Send to Discord"
                    disabled={Boolean(sendingEntryId)}
                    onClick={() => setConfirmEntry(entry)}
                  >
                    <Send size={16} />
                    <span className="sr-only">{sentEntryId === entry.entryId ? "Sent" : "Send to Discord"}</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ornamental-card empty-journal">
          <BookOpen size={34} />
          <h2>No journal entries yet</h2>
          <p>Add the first note for {characterName || "this character"}.</p>
        </div>
      )}
      {sendError && <p className="form-error journal-send-error" role="alert">{sendError}</p>}
      {confirmEntry && (
        <div className="modal-backdrop discord-confirm-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget && !sendingEntryId) setConfirmEntry(null);
        }}>
          <section className="modal-card discord-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="discord-confirm-title">
            <button
              className="discord-confirm-close"
              type="button"
              aria-label="Close send confirmation"
              disabled={Boolean(sendingEntryId)}
              onClick={() => setConfirmEntry(null)}
            >
              <X size={20} />
            </button>
            <h2 id="discord-confirm-title">Send to Discord character thread?</h2>
            <div className="discord-confirm-actions">
              <button className="secondary-action" type="button" disabled={Boolean(sendingEntryId)} onClick={() => setConfirmEntry(null)}>Cancel</button>
              <button className="primary-action" type="button" disabled={Boolean(sendingEntryId)} onClick={async () => {
                const entry = confirmEntry;
                setSendingEntryId(entry.entryId);
                setSentEntryId("");
                setSendError("");
                try {
                  await onSend(entry);
                  setSentEntryId(entry.entryId);
                  setConfirmEntry(null);
                } catch (caught) {
                  setSendError(caught instanceof Error ? caught.message : "Could not send the note to Discord.");
                } finally {
                  setSendingEntryId("");
                }
              }}>{sendingEntryId ? "Sending…" : "Send"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export function JournalEntryModal({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: SheetJournalEntry | null;
  onClose: () => void;
  onSave: (input: { title: string; tags: string[]; notes: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const tags = String(data.get("tags") || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: String(data.get("title") || "").trim(),
        tags,
        notes: String(data.get("notes") || "").trim(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the journal entry.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete || !window.confirm(`Delete “${entry?.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the journal entry.");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal journal-modal ornamental-card" role="dialog" aria-modal="true" aria-labelledby="journal-entry-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}><X /></button>
        <p className="eyebrow">Campaign journal</p>
        <h2 id="journal-entry-title">{entry ? "Edit Note" : "Add Note"}</h2>
        <form onSubmit={submit}>
          <label>
            Title
            <input name="title" defaultValue={entry?.title || ""} autoFocus required maxLength={160} />
          </label>
          <label>
            Tags
            <input name="tags" defaultValue={entry?.category || ""} placeholder="NPC, Location, Quest" maxLength={240} />
            <small>Separate multiple tags with commas.</small>
          </label>
          <label>
            Note
            <textarea name="notes" defaultValue={entry?.notes || ""} required maxLength={12000} rows={9} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="journal-modal-actions">
            <button className="primary-action" type="submit" disabled={saving || deleting}>
              {saving ? "Saving…" : entry ? "Save Changes" : "Add Note"}
            </button>
            {onDelete && (
              <button className="edit-delete-button" type="button" aria-label="Delete note" title="Delete note" onClick={() => void remove()} disabled={saving || deleting}>
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

export function RetainersView({
  retainers,
  onAdd,
  onEdit,
  onDelete,
  isDm,
  hasUnsyncedChanges,
  syncing,
  syncError,
  lastSyncedAt,
  onRefresh,
  pushingToSheet,
  pushToSheetSuccess,
  onPushToSheet,
}: {
  retainers: SheetRetainer[];
  onAdd: (kind: "individual" | "force") => void;
  onEdit: (retainer: SheetRetainer) => void;
  onDelete: (retainer: SheetRetainer) => Promise<void>;
  isDm: boolean;
  hasUnsyncedChanges: boolean;
  syncing: boolean;
  syncError: string;
  lastSyncedAt: string;
  onRefresh: () => Promise<void>;
  pushingToSheet: boolean;
  pushToSheetSuccess: boolean;
  onPushToSheet: () => Promise<void>;
}) {
  const individuals = retainers.filter((retainer) => retainer.type !== "force");
  const forces = retainers.filter((retainer) => retainer.type === "force");
  const frequencyLabel = (frequency: SheetRetainer["wageFrequency"]) =>
    frequency === "annually" ? "year" : frequency.replace("ly", "");

  const section = (
    kind: "individual" | "force",
    title: string,
    description: string,
    records: SheetRetainer[],
  ) => (
    <section className="retainer-category">
      <div className="retainer-category-heading">
        <div>
          <p className="eyebrow">{kind === "individual" ? "Named Personnel" : "Military Units"}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button className="primary-action retainer-add-button" onClick={() => onAdd(kind)}>
          <Plus size={18} /> {kind === "individual" ? "Add Retainer" : "Add Fighting Force"}
        </button>
      </div>
      {records.length ? (
        <div className="retainer-list">
          {records.map((retainer) => (
            <article className="ornamental-card retainer-record" key={retainer.retainerId}>
              <div className="retainer-record-icon">
                {kind === "individual" ? <Crown size={24} /> : <Shield size={24} />}
              </div>
              <div className="retainer-record-name">
                <h3>
                  {retainer.name}
                </h3>
                {kind === "force" ? (
                  <>
                  {retainer.clericFightingForce && (
                    <small className="force-loadout-summary"><strong>Cleric fighting force</strong> · troop upkeep waived · 200-soldier maximum</small>
                  )}
                  <ul className="force-roster-summary">
                    {(retainer.roster?.length
                      ? retainer.roster
                      : [{ soldierType: retainer.role, men: Number(retainer.men || 0) }]
                    ).map((entry, index) => (
                      <li key={entry.rosterGroupId || `${entry.soldierType}-${index}`}>
                        <span>{Number(entry.men).toLocaleString()} {entry.soldierType}</span>
                        {(entry.armor || entry.shield || entry.weapons?.length || entry.weaponNames?.length) && (
                          <small className="force-loadout-summary">
                            AC {entry.armorClass ?? forceArmorClass(entry.armor || "None", Boolean(entry.shield))}
                            {` · ${entry.armor || "No armor"}${entry.shield ? " + shield" : ""}`}
                            {entry.weapons?.length
                              ? ` · ${entry.weapons.map((weapon) => `${weapon.name} ${weapon.damageSmallMedium}/${weapon.damageLarge}`).join(", ")}`
                              : entry.weaponNames?.length
                                ? ` · ${entry.weaponNames.join(", ")}`
                                : ""}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                  </>
                ) : (
                  <p>{retainer.role}{retainer.level ? ` · Level ${retainer.level}` : ""}</p>
                )}
              </div>
              {kind === "force" && (
                <div className="retainer-record-stat">
                  <span>Strength</span>
                  <strong>{Number(retainer.men || 0).toLocaleString()} men</strong>
                </div>
              )}
              <div className="retainer-record-stat">
                <span>{kind === "force" ? "Upkeep" : "Recurring cost"}</span>
                <strong>
                  {kind === "force" && retainer.clericFightingForce
                    ? "No troop upkeep"
                    : <>
                        {Number(retainer.wageGp || 0).toLocaleString()} {retainer.costCoin || "gp"}
                        {` / ${frequencyLabel(retainer.wageFrequency || "monthly")}`}
                      </>}
                </strong>
                {kind === "force" && retainer.hiringDate && (
                  <small>Hired {formatCalendarDate(retainer.hiringDate)}</small>
                )}
              </div>
              <div className="retainer-record-actions">
                <button className="secondary-action" onClick={() => onEdit(retainer)}>
                  <Pencil size={16} /> Edit
                </button>
                <button
                  className="cancel-recurring-button retainer-end-button"
                  onClick={() => {
                    const action = kind === "force" ? "Disband" : "Fire";
                    if (window.confirm(`${action} ${retainer.name}? This will stop future recurring costs.`)) {
                      void onDelete(retainer);
                    }
                  }}
                >
                  {kind === "force" ? "Disband" : "Fire"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="ornamental-card retainer-empty">
          {kind === "individual" ? <Crown size={28} /> : <Shield size={28} />}
          <div>
            <h3>No {title.toLowerCase()} added</h3>
            <p>{kind === "individual" ? "Add a henchman, hireling, specialist, or other named retainer." : "Add an army, levy, militia, guard force, or mercenary company."}</p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <section className="retainers-view">
      <div className="page-title">
        <div>
          <p className="eyebrow">Household & Command</p>
          <h1>Hirelings</h1>
          <p>Manage named retainers and fighting forces.</p>
        </div>
      </div>
      <div className="retainer-sync-bar" aria-live="polite">
        <div className="retainer-sync-status">
          <strong>{hasUnsyncedChanges ? "Unsynced changes" : "Retainers synced"}</strong>
          <small>
            {hasUnsyncedChanges
              ? isDm ? "Local changes have not been sent." : "Changes are stored on this device until you press Sync with Sheet."
              : lastSyncedAt
                ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Working copy matches the campaign data."}
          </small>
        </div>
        <div className="retainer-sync-actions">
          {isDm && (
            <>
              <button
                className="secondary-action"
                disabled={syncing || pushingToSheet}
                onClick={() => void onRefresh().catch((error) => window.alert(error instanceof Error ? error.message : "Could not refresh player data."))}
              >
                Refresh Player Data
              </button>
              <button
                className="secondary-action"
                disabled={syncing || pushingToSheet}
                onClick={() => void onPushToSheet().catch((error) => window.alert(error instanceof Error ? error.message : "Could not push Hirelings to the Sheet."))}
              >
                <Upload size={16} /> {pushingToSheet ? "Pushing…" : pushToSheetSuccess ? "Pushed" : "Push to Sheet"}
              </button>
            </>
          )}
        </div>
        {syncError && <p className="form-error retainer-sync-error">{syncError}</p>}
      </div>
      {section("individual", "Individual Retainers", "Henchmen, hirelings, specialists, officials, and other named followers.", individuals)}
      {section("force", "Fighting Forces", "Armies, levies, militia, guards, and other organized bodies of soldiers.", forces)}
    </section>
  );
}

export function RetainerModal({
  kind,
  retainer,
  isDm,
  onClose,
  onSave,
}: {
  kind: "individual" | "force";
  retainer: SheetRetainer | null;
  isDm: boolean;
  onClose: () => void;
  onSave: (input: {
    type: "individual" | "force";
    name: string;
    role: string;
    level?: number | "";
    amount: number;
    costCoin: CoinType;
    wageFrequency: "weekly" | "monthly" | "annually";
    hiringDate?: string;
    men?: number | "";
    roster?: FightingForceGroup[];
    clericFightingForce?: boolean;
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clericFightingForce, setClericFightingForce] = useState(
    kind === "force" && Boolean(retainer?.clericFightingForce),
  );
  const modalRef = useRef<HTMLElement>(null);
  const [roster, setRoster] = useState<Array<{ rosterGroupId?: string; soldierType: string; men: string; armor: string; shield: boolean; weaponNames: string[]; missingSerjeants: number }>>(() => {
    if (kind !== "force") return [];
    const existing: FightingForceGroup[] = retainer?.roster?.length
      ? retainer.roster
      : retainer?.role
        ? [{ soldierType: retainer.role, men: Number(retainer.men || 0) }]
        : [{ soldierType: "", men: 0 }];
    return existing.map((entry) => ({
      rosterGroupId: entry.rosterGroupId,
      soldierType: entry.soldierType,
      men: entry.men ? String(entry.men) : "",
      armor: entry.armor || "None",
      shield: Boolean(entry.shield),
      weaponNames: entry.weapons?.map((weapon) => weapon.name) || entry.weaponNames || [],
      missingSerjeants: Number(entry.missingSerjeants || 0),
    }));
  });
  const forceWageBreakdowns = kind === "force"
    ? roster.map((entry) => soldierWageBreakdown(entry.soldierType, entry.men))
    : [];
  const standardAutomaticMonthlyUpkeep = forceWageBreakdowns.reduce(
    (total, breakdown) => total + (breakdown?.monthlyTotal || 0),
    0,
  );
  const automaticMonthlyUpkeep = clericFightingForce ? 0 : standardAutomaticMonthlyUpkeep;
  const forceStrength = roster.reduce((total, entry) => total + Number(entry.men || 0), 0);
  const hasManualWageTypes = kind === "force" && roster.some(
    (entry) => entry.soldierType && entry.men && !soldierWageBreakdown(entry.soldierType, entry.men),
  );

  useEffect(() => {
    modalRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      if (kind === "force") {
        if (clericFightingForce && forceStrength > 200) {
          throw new Error("A cleric fighting force cannot exceed 200 soldiers.");
        }
        for (const entry of roster) {
          const gearError = forceEditorGearValidation(
            entry.soldierType,
            entry.armor,
            entry.shield,
            entry.weaponNames,
          );
          if (gearError) {
            throw new Error(`${entry.soldierType || "Soldier group"}: ${gearError}`);
          }
        }
      }

      await onSave({
        type: kind,
        name: String(form.get("name") || "").trim(),
        role: kind === "individual" ? String(form.get("role") || "").trim() : "",
        level: kind === "individual" && form.get("level") ? Number(form.get("level")) : "",
        amount: kind === "force"
          ? clericFightingForce
            ? 0
            : automaticMonthlyUpkeep + Number(form.get("manualForceUpkeep") || 0)
          : Number(form.get("amount") || 0),
        costCoin: kind === "force" ? "gp" : String(form.get("costCoin") || "gp") as CoinType,
        wageFrequency: kind === "force" ? "monthly" : String(form.get("wageFrequency") || "monthly") as "weekly" | "monthly" | "annually",
        hiringDate: kind === "force" ? String(form.get("hiringDate") || "") : undefined,
        men: kind === "force"
          ? roster.reduce((total, entry) => total + Number(entry.men || 0), 0)
          : "",
        clericFightingForce: kind === "force" ? clericFightingForce : undefined,
        roster: kind === "force"
          ? mergeIdenticalForceGroups(
              roster.map((entry) => ({
                rosterGroupId: entry.rosterGroupId || crypto.randomUUID(),
                soldierType: entry.soldierType.trim(),
                men: Number(entry.men || 0),
                armor: entry.armor,
                shield: entry.shield,
                armorClass: forceArmorClass(entry.armor, entry.shield),
                weapons: entry.weaponNames.map((name) =>
                  FORCE_WEAPON_OPTIONS.find((weapon) => weapon.name === name) || {
                    name,
                    damageSmallMedium: "",
                    damageLarge: "",
                  }
                ),
                weaponNames: entry.weaponNames,
                missingSerjeants: entry.missingSerjeants,
              })),
            )
          : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this record.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop retainer-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={modalRef} tabIndex={-1} className="modal retainer-modal ornamental-card" role="dialog" aria-modal="true" aria-labelledby="retainer-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close retainer-modal-close" type="button" onClick={onClose} aria-label="Close"><X size={22} /></button>
        <div className="retainer-modal-scroll">
        <p className="eyebrow">{kind === "individual" ? "Named Personnel" : "Military Unit"}</p>
        <h2 id="retainer-modal-title">
          {retainer ? "Edit" : "Add"} {kind === "individual" ? "Individual Retainer" : "Fighting Force"}
        </h2>
        <p className="modal-intro">
          {kind === "individual"
            ? "Record the retainer’s identity, occupation, optional level, and continuing cost."
            : "Build a complete roster, set its hiring date, and choose monthly or annual upkeep."}
        </p>
        <form onSubmit={submit}>
          <label>
            {kind === "individual" ? "Name" : "Force name"}
            <input name="name" defaultValue={retainer?.name || ""} required maxLength={120} />
          </label>
          {kind === "force" && isDm && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={clericFightingForce}
                onChange={(event) => setClericFightingForce(event.target.checked)}
              />
              <span>
                <strong>Cleric fighting force</strong>
                <small>No upkeep for soldiers or serjeants; maximum 200 soldiers. Salaried individual officers remain separate retainers.</small>
              </span>
            </label>
          )}
          {kind === "force" && !isDm && clericFightingForce && (
            <p className="force-roster-total"><strong>Cleric fighting force</strong> · soldier and serjeant upkeep waived · 200-soldier maximum</p>
          )}
          {kind === "individual" && <label>
            Occupation
            <input
              name="role"
              defaultValue={retainer?.role || ""}
              placeholder="Scout, blacksmith, man-at-arms…"
              required
              maxLength={120}
            />
          </label>}
          {kind === "individual" ? (
            <label>
              Level <small>Optional</small>
              <input name="level" type="number" min="1" step="1" defaultValue={retainer?.level || ""} inputMode="numeric" />
            </label>
          ) : (
            <fieldset className="force-roster-editor">
              <legend>Soldier roster</legend>
              {roster.map((entry, index) => (
                <div className="force-roster-row" key={index}>
                  <div className="force-roster-basics">
                  <label>
                    Soldier type
                    <select
                      value={entry.soldierType}
                      onChange={(event) => {
                        const soldierType = event.target.value;
                        const rules = recruitEquipmentRules(soldierType);
                        const armorOptions = forceEditorArmorOptions(soldierType);
                        const allowedWeapons = new Set(forceEditorWeaponNames(soldierType));
                        setRoster((items) => items.map((item, itemIndex) => {
                          if (itemIndex !== index) return item;
                          const armor = armorOptions.some((option) => option.name === item.armor)
                            ? item.armor
                            : (armorOptions[0]?.name || "None");
                          return {
                            ...item,
                            soldierType,
                            armor,
                            shield: rules.shieldAllowed ? item.shield : false,
                            weaponNames: item.weaponNames.filter((name) => allowedWeapons.has(name)).slice(0, 3),
                          };
                        }));
                      }}
                      required
                    >
                      <option value="" disabled>Select soldier type</option>
                      {entry.soldierType && !RECRUITMENT_SOLDIER_TYPES.some((option) => option.value === entry.soldierType) && (
                        <option value={entry.soldierType}>{entry.soldierType} (existing type)</option>
                      )}
                      {RECRUITMENT_SOLDIER_TYPES.map((option) => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Number
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={entry.men}
                      onChange={(event) => setRoster((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, men: event.target.value } : item))}
                      required
                    />
                  </label>
                  <button
                    className="force-roster-remove"
                    type="button"
                    aria-label={`Remove soldier type ${index + 1}`}
                    disabled={roster.length === 1}
                    onClick={() => setRoster((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 size={18} />
                  </button>
                  </div>
                  <div className="force-loadout-editor" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                    {forceWageBreakdowns[index] && (
                      <p className="force-wage-breakdown">
                        <strong>{forceWageBreakdowns[index]!.monthlyTotal.toLocaleString()} gp/month</strong>
                        <span>
                          {forceWageBreakdowns[index]!.ordinary} soldiers at {forceWageBreakdowns[index]!.baseWage} gp +{" "}
                          {forceWageBreakdowns[index]!.serjeants} serjeant{forceWageBreakdowns[index]!.serjeants === 1 ? "" : "s"} at{" "}
                          {forceWageBreakdowns[index]!.baseWage * 10} gp
                        </span>
                      </p>
                    )}

                    <h4 style={{ margin: "2px 0 0" }}>Equipment</h4>

                    <div className="recruitment-equipment-list" style={{ maxHeight: "none", overflow: "visible" }}>
                      <label>
                        <span>
                          <strong>Armor</strong>
                          <small>Allowed for {entry.soldierType || "this troop type"}</small>
                        </span>
                        <select
                          value={entry.armor}
                          onChange={(event) =>
                            setRoster((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, armor: event.target.value } : item
                              )
                            )
                          }
                        >
                          {forceEditorArmorOptions(entry.soldierType).map((option) => (
                            <option value={option.name} key={option.name}>
                              {option.name} · AC {option.ac}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>
                          <strong>Weapons</strong>
                          <small>
                            {recruitEquipmentRules(entry.soldierType).requiredMissileWeapons
                              ? "Required weapon + melee weapon · maximum 3"
                              : recruitEquipmentRules(entry.soldierType).requireMelee
                                ? "At least 1 melee weapon · maximum 3"
                                : "Maximum 3 weapons"}
                          </small>
                        </span>
                        <select
                          value=""
                          disabled={entry.weaponNames.length >= 3}
                          onChange={(event) => {
                            const weaponName = event.target.value;
                            if (!weaponName) return;
                            setRoster((items) =>
                              items.map((item, itemIndex) => {
                                if (itemIndex !== index) return item;
                                if (item.weaponNames.includes(weaponName) || item.weaponNames.length >= 3) return item;
                                return { ...item, weaponNames: [...item.weaponNames, weaponName] };
                              })
                            );
                          }}
                        >
                          <option value="">
                            {entry.weaponNames.length >= 3 ? "Three-weapon limit reached" : "Add weapon…"}
                          </option>
                          {forceEditorWeaponOptions(entry.soldierType)
                            .filter((weapon) => !entry.weaponNames.includes(weapon.name))
                            .map((weapon) => (
                              <option value={weapon.name} key={weapon.name}>
                                {weapon.name}
                              </option>
                            ))}
                        </select>
                      </label>

                      {entry.weaponNames.map((weaponName) => {
                        const weapon = forceEditorWeaponOptions(entry.soldierType).find(
                          (item) => item.name === weaponName
                        );
                        return (
                          <div
                            key={weaponName}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) auto",
                              alignItems: "center",
                              gap: 10,
                              padding: "9px 11px",
                              borderBottom: "1px solid var(--line-soft)",
                            }}
                          >
                            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                              <strong>{weaponName}</strong>
                              {weapon && (weapon.damageSmallMedium || weapon.damageLarge) && (
                                <small style={{ color: "var(--muted)" }}>
                                  {weapon.damageSmallMedium} vs S/M · {weapon.damageLarge} vs L
                                </small>
                              )}
                            </span>
                            <button
                              className="secondary-action"
                              type="button"
                              onClick={() =>
                                setRoster((items) =>
                                  items.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          weaponNames: item.weaponNames.filter((name) => name !== weaponName),
                                        }
                                      : item
                                  )
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}

                      {recruitEquipmentRules(entry.soldierType).shieldAllowed && (
                        <label>
                          <span>
                            <strong>Shield</strong>
                            <small>Optional</small>
                          </span>
                          <select
                            value={entry.shield ? "shield" : ""}
                            onChange={(event) =>
                              setRoster((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, shield: event.target.value === "shield" }
                                    : item
                                )
                              )
                            }
                          >
                            <option value="">No shield</option>
                            <option value="shield">Shield</option>
                          </select>
                        </label>
                      )}
                    </div>

                    <div className="equipment-total">
                      <span>Armor Class</span>
                      <strong>AC {forceArmorClass(entry.armor, entry.shield)}</strong>
                    </div>
                  </div>
                </div>
              ))}
              <button
                className="secondary-action force-roster-add"
                type="button"
                onClick={() => setRoster((items) => [...items, { soldierType: "", men: "", armor: "None", shield: false, weaponNames: [], missingSerjeants: 0 }])}
              >
                <Plus size={17} /> Add Soldier Type
              </button>
              <p className="force-roster-total">
                Total strength: <strong>{forceStrength.toLocaleString()} men</strong>
                {clericFightingForce && <small> · maximum 200</small>}
              </p>
              <p className="force-roster-total">
                {clericFightingForce
                  ? <><strong>No soldier or serjeant upkeep</strong></>
                  : <>Automatic monthly upkeep: <strong>{automaticMonthlyUpkeep.toLocaleString()} gp</strong></>}
              </p>
            </fieldset>
          )}
          {kind === "force" && !clericFightingForce && hasManualWageTypes ? <label>
            Additional monthly upkeep for leader or existing custom types
            <input
              name="manualForceUpkeep"
              type="number"
              min="0"
              step="1"
              defaultValue={Math.max(0, Number(retainer?.wageGp || 0) - automaticMonthlyUpkeep)}
              inputMode="numeric"
            />
            <small>Standard soldier wages and serjeants are calculated automatically above.</small>
          </label> : kind === "force" ? null : <div className="retainer-cost-fields">
            <label>
              Recurring cost
              <input name="amount" type="number" min="0" step="1" defaultValue={retainer?.wageGp ?? ""} required inputMode="numeric" />
            </label>
            <label>
              Coin
              <select name="costCoin" defaultValue={retainer?.costCoin || "gp"}>
                <option value="pp">pp</option>
                <option value="gp">gp</option>
                <option value="sp">sp</option>
                <option value="cp">cp</option>
              </select>
            </label>
          </div>}
          {kind === "force" && (
            <label>
              Date hired
              <input
                name="hiringDate"
                type="date"
                defaultValue={String(retainer?.hiringDate || retainer?.createdAt || new Date().toISOString()).slice(0, 10)}
                required
              />
            </label>
          )}
          {kind !== "force" && <label>
            Cost frequency
            <select name="wageFrequency" defaultValue={retainer?.wageFrequency || "monthly"}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="annually">Annual</option>
            </select>
          </label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="retainer-modal-actions">
            <button className="secondary-action" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-action" type="submit" disabled={saving}>
              {saving ? "Saving…" : retainer ? "Save Changes" : kind === "individual" ? "Add Retainer" : "Add Fighting Force"}
            </button>
          </div>
        </form>
        </div>
      </section>
    </div>
  );
}

export function PlayerManagementView({
  players,
  characters,
  webhookConfigured,
  onRefresh,
  onChangeAccess,
  onSaveWebhook,
  onSaveThread,
}: {
  players: SheetPlayer[];
  characters: SheetCharacter[];
  webhookConfigured: boolean;
  onRefresh: () => Promise<void>;
  onChangeAccess: (
    playerId: string,
    enabled: boolean,
  ) => Promise<void>;
  onSaveWebhook: (playerId: string, webhookUrl: string) => Promise<void>;
  onSaveThread: (characterId: string, threadId: string) => Promise<void>;
}) {
  const managedAccounts = [...players].sort((left, right) => {
    if (left.role !== right.role) return left.role === "dm" ? -1 : 1;
    return (left.displayName || left.playerId).localeCompare(right.displayName || right.playerId);
  });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [savingThreadId, setSavingThreadId] = useState("");
  const [discordMessage, setDiscordMessage] = useState("");
  const [discordError, setDiscordError] = useState("");
  const [refreshingPlayers, setRefreshingPlayers] = useState(false);
  const [refreshPlayersMessage, setRefreshPlayersMessage] = useState("");
  const [refreshPlayersError, setRefreshPlayersError] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const selectedAccount = managedAccounts.find((player) => player.playerId === selectedAccountId);
  const selectedAccountCharacters = selectedAccount
    ? characters.filter((character) => character.playerId === selectedAccount.playerId)
    : [];

  useEffect(() => {
    if (!selectedAccountId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedAccountId("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedAccountId]);

  return (
    <section className="management-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">Dungeon Master only</p>
          <h1>Player Management</h1>
          <p>Manage the DM and player accounts, their feature access, and character-specific Discord destinations.</p>
        </div>
        <button
          className="secondary-action"
          type="button"
          disabled={refreshingPlayers}
          onClick={() => {
            setRefreshingPlayers(true);
            setRefreshPlayersMessage("");
            setRefreshPlayersError("");
            void onRefresh()
              .then(() => setRefreshPlayersMessage("Players and characters refreshed."))
              .catch((error) =>
                setRefreshPlayersError(
                  error instanceof Error ? error.message : "Could not refresh players.",
                ),
              )
              .finally(() => setRefreshingPlayers(false));
          }}
        >
          {refreshingPlayers ? "Refreshing…" : "Refresh Players"}
        </button>
      </div>
      {refreshPlayersMessage && <p className="form-success" role="status">{refreshPlayersMessage}</p>}
      {refreshPlayersError && <p className="form-error" role="alert">{refreshPlayersError}</p>}

      <div className="ornamental-card player-management-card">
        <div className="management-table-heading" aria-hidden="true">
          <span>Account</span>
          <span>Default tabs</span>
          <span>Territory access</span>
          <span>Characters</span>
        </div>
        {managedAccounts.length ? (
          managedAccounts.map((player) => (
            <div className={`player-access-row${player.role === "dm" ? " dm-account-row" : ""}`} key={player.playerId}>
              <div>
                <strong>{player.displayName || "Unnamed player"}</strong>
                <small>{player.role === "dm" ? "Dungeon Master" : player.playerId}</small>
              </div>
              <span className="default-access">
                {player.role === "dm" ? "All tabs · DM controls" : "Wallet · Journal · Hirelings"}
              </span>
              {player.role === "dm" ? (
                <span className="dm-full-access">Full access</span>
              ) : (
                <label className="access-toggle">
                  <input
                    type="checkbox"
                    checked={player.territoriesEnabled}
                    onChange={(event) =>
                      void onChangeAccess(
                        player.playerId,
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <span>{player.territoriesEnabled ? "Enabled" : "Hidden"}</span>
                </label>
              )}
              <button
                className="character-management-button"
                type="button"
                onClick={() => {
                  setDiscordMessage("");
                  setDiscordError("");
                  setSelectedAccountId(player.playerId);
                }}
                aria-label={`Manage characters for ${player.displayName || "this account"}`}
              >
                <UsersRound size={17} aria-hidden="true" />
                <span>{characters.filter((character) => character.playerId === player.playerId).length}</span>
                <small>Manage</small>
              </button>
            </div>
          ))
        ) : (
          <p className="empty-management">No player accounts have been created yet.</p>
        )}
      </div>

      {selectedAccount && (
        <div className="modal-backdrop account-characters-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedAccountId("");
        }}>
          <section className="modal ornamental-card account-characters-modal" role="dialog" aria-modal="true" aria-labelledby="account-characters-title">
            <button className="modal-close" type="button" onClick={() => setSelectedAccountId("")} aria-label="Close character management"><X /></button>
            <p className="eyebrow">Discord journal delivery</p>
            <h2 id="account-characters-title">{selectedAccount.displayName || "Unnamed player"}</h2>
            <p className="account-characters-summary">
              {selectedAccount.role === "dm" ? "Dungeon Master characters" : "Player characters"} · Set the parent-channel webhook, then assign each character's thread ID.
            </p>
            <div className="discord-thread-list">
                <form className="discord-webhook-form" onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const webhookUrl = String(new FormData(form).get("webhookUrl") || "").trim();
                  setSavingWebhook(true);
                  setDiscordError("");
                  setDiscordMessage("");
                  try {
                    await onSaveWebhook(selectedAccount.playerId, webhookUrl);
                    form.reset();
                    setDiscordMessage(`Webhook saved for ${selectedAccount.displayName || "this account"}.`);
                  } catch (caught) {
                    setDiscordError(caught instanceof Error ? caught.message : "Could not save the webhook.");
                  } finally {
                    setSavingWebhook(false);
                  }
                }}>
                  <label>
                    Parent channel webhook URL
                    <input name="webhookUrl" type="url" placeholder={selectedAccount.discordWebhookConfigured ? "Webhook configured — paste a new URL to replace it" : "https://discord.com/api/webhooks/…"} required autoComplete="off" />
                  </label>
                  <button className="primary-action" disabled={savingWebhook}>{savingWebhook ? "Saving…" : selectedAccount.discordWebhookConfigured ? "Replace Webhook" : "Save Webhook"}</button>
                </form>
                {selectedAccountCharacters.length ? selectedAccountCharacters.map((character) => (
                  <form className="discord-thread-row" key={character.characterId} onSubmit={async (event) => {
              event.preventDefault();
              const threadId = String(new FormData(event.currentTarget).get("threadId") || "").trim();
              setSavingThreadId(character.characterId);
              setDiscordError("");
              setDiscordMessage("");
              try {
                await onSaveThread(character.characterId, threadId);
                setDiscordMessage(`Thread saved for ${character.name}.`);
              } catch (caught) {
                setDiscordError(caught instanceof Error ? caught.message : "Could not save the thread ID.");
              } finally {
                setSavingThreadId("");
              }
                  }}>
                    <label>
                      <strong>{character.name}</strong>
                      <span>Discord thread ID</span>
                      <input name="threadId" defaultValue={character.discordThreadId || ""} placeholder="123456789012345678" inputMode="numeric" pattern="[0-9]{17,20}" required />
                    </label>
                    <button className="secondary-action" disabled={savingThreadId === character.characterId}>{savingThreadId === character.characterId ? "Saving…" : "Save Thread"}</button>
                  </form>
                )) : <p className="discord-no-characters">No characters on this account yet.</p>}
            </div>
            {discordMessage && <p className="form-success">{discordMessage}</p>}
            {discordError && <p className="form-error" role="alert">{discordError}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
