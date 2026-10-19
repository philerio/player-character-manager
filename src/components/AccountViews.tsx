import { LockKeyhole, Trash2, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { type SheetCharacter, type LoginOption } from "../google-sheets-api";
import { CHARACTER_CLASSES, canonicalCharacterClass } from "../app/core";

export function PortraitViewer({
  character,
  onClose,
}: {
  character: SheetCharacter;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="portrait-viewer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="portrait-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`${character.name} portrait`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="portrait-viewer-close" type="button" aria-label="Close portrait" onClick={onClose}>
          <X />
        </button>
        <img src={character.portraitUrl} alt={`${character.name} portrait, full size`} />
      </section>
    </div>
  );
}

export function LoginScreen({
  optionsStatus = "ready",
  optionsError = "",
  onRetryOptions,
  players,
  onLogin,
  onRegister,
  onLoadRecoveryQuestion,
  onResetPassword,
}: {
  optionsStatus?: "idle" | "loading" | "ready" | "error";
  optionsError?: string;
  onRetryOptions?: () => void;
  players: LoginOption[];
  onLogin: (input: { playerId: string; email: string; password: string }) => Promise<void>;
  onRegister: (input: { displayName: string; email: string; setupPassword: string }) => Promise<void>;
  onLoadRecoveryQuestion: (input: { playerId: string; email: string }) => Promise<{ recoveryQuestion: string }>;
  onResetPassword: (input: {
    playerId: string;
    email: string;
    recoveryAnswer: string;
    newPassword: string;
  }) => Promise<void>;
}) {
  const [registering, setRegistering] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryQuestion, setRecoveryQuestion] = useState("");
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (playerId && !players.some(player => player.playerId === playerId)) setPlayerId(""); }, [players, playerId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!registering && (optionsStatus !== "ready" || !players.some(player => player.playerId === playerId))) { setError("Load player names and choose a player before continuing."); return; }
    setError("");
    setBusy(true);
    try {
      if (registering) {
        await onRegister({ displayName, email, setupPassword: password });
      } else if (recovering && !recoveryQuestion) {
        const result = await onLoadRecoveryQuestion({ playerId, email });
        setRecoveryQuestion(result.recoveryQuestion);
      } else if (recovering) {
        if (password.length < 10) throw new Error("Use a password of at least 10 characters.");
        if (password !== confirmation) throw new Error("The passwords do not match.");
        await onResetPassword({
          playerId,
          email,
          recoveryAnswer,
          newPassword: password,
        });
        setRecovering(false);
        setRecoveryQuestion("");
        setRecoveryAnswer("");
        setConfirmation("");
        setPassword("");
        setError("Password reset. You can now sign in.");
      } else {
        await onLogin({ playerId, email, password });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="seal auth-seal">
          <img
            src="/player-character-manager-icon-192.png"
            alt=""
            className="seal-icon"
          />
        </div>
        <p className="eyebrow">Player Character Manager</p>
        <h1>{registering ? "Set up your account" : recovering ? "Reset your password" : "Sign in"}</h1>
        {registering ? (
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
        ) : (
          <label>
            Display name
            <select disabled={optionsStatus !== "ready" || busy || !players.length} value={playerId} onChange={(event) => setPlayerId(event.target.value)} required>
              <option value="">{optionsStatus === "loading" || optionsStatus === "idle" ? "Loading player names…" : optionsStatus === "error" ? "Player names unavailable" : !players.length ? "No players registered" : "Select your name"}</option>
              {players.map((player) => (
                <option value={player.playerId} key={player.playerId}>{player.displayName}</option>
              ))}
            </select>
          </label>
        )}
        {!registering && optionsStatus === "error" && <div role="alert"><p>{optionsError}</p><button type="button" onClick={onRetryOptions}>Retry loading names</button></div>}
        {!registering && optionsStatus === "loading" && <progress aria-label="Loading player names" />}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {recovering && recoveryQuestion && (
          <label>
            {recoveryQuestion}
            <input value={recoveryAnswer} onChange={(event) => setRecoveryAnswer(event.target.value)} autoComplete="off" required />
          </label>
        )}
        {(!recovering || recoveryQuestion) && (
          <label>
            {registering ? "Shared setup password" : recovering ? "New password" : "Password"}
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={recovering ? "new-password" : "current-password"} required />
          </label>
        )}
        {recovering && recoveryQuestion && (
          <label>
            Confirm new password
            <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy || (!registering && (optionsStatus !== "ready" || !players.some(player => player.playerId === playerId)))}>
          {busy
            ? "Please wait…"
            : registering
              ? "Create account"
              : recovering && !recoveryQuestion
                ? "Continue"
                : recovering
                  ? "Reset password"
                  : "Sign in"}
        </button>
        {!registering && !recovering && (
          <button
            className="auth-switch-button"
            type="button"
            onClick={() => {
              setRecovering(true);
              setError("");
              setPassword("");
            }}
          >
            Forgot password?
          </button>
        )}
        <button
          className="auth-switch-button"
          type="button"
          onClick={() => {
            if (recovering) {
              setRecovering(false);
              setRecoveryQuestion("");
              setRecoveryAnswer("");
              setConfirmation("");
            } else {
              setRegistering((current) => !current);
            }
            setError("");
            setPassword("");
          }}
        >
          {recovering
            ? "Back to sign in"
            : registering
              ? "Already have an account? Sign in"
              : "First time here? Set up your account"}
        </button>
      </form>
    </main>
  );
}

export function FirstPasswordScreen({
  onSave,
}: {
  onSave: (input: {
    newPassword: string;
    recoveryQuestion: string;
    recoveryAnswer: string;
  }) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryQuestion, setRecoveryQuestion] = useState("");
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirmation) return setError("The passwords do not match.");
    if (recoveryQuestion.trim().length < 5) return setError("Enter a recovery question.");
    if (recoveryAnswer.trim().length < 2) return setError("Enter an answer to your recovery question.");
    setBusy(true);
    setError("");
    try {
      await onSave({
        newPassword: password,
        recoveryQuestion: recoveryQuestion.trim(),
        recoveryAnswer,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="seal auth-seal"><LockKeyhole size={28} /></div>
        <p className="eyebrow">First sign-in</p>
        <h1>Create your password</h1>
        <p>Your temporary password worked. Replace it before continuing.</p>
        <label>
          New password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          Confirm new password
          <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          Password recovery question
          <input value={recoveryQuestion} onChange={(event) => setRecoveryQuestion(event.target.value)} placeholder="e.g. What was your first character's name?" required />
        </label>
        <label>
          Recovery answer
          <input value={recoveryAnswer} onChange={(event) => setRecoveryAnswer(event.target.value)} autoComplete="off" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </main>
  );
}

export function EditCharacterModal({
  character,
  onClose,
  onSave,
  onDelete,
  onPortraitUpload,
  onPortraitDelete,
}: {
  character: SheetCharacter;
  onClose: () => void;
  onSave: (input: { characterId?: string; expectedVersion?: number; name: string; className: string; level: number }) => Promise<void>;
  onDelete: () => void;
  onPortraitUpload: (file: File) => Promise<void>;
  onPortraitDelete: () => Promise<void>;
}) {
  const initialCharacter = useRef(character).current;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadingPortrait, setUploadingPortrait] = useState(false);
  const [deletingPortrait, setDeletingPortrait] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await onSave({
        characterId: initialCharacter.characterId,
        expectedVersion: initialCharacter.version,
        name: String(data.get("name") || "").trim(),
        className: String(data.get("className") || "").trim(),
        level: Math.max(1, Number(data.get("level")) || 1),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the character.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal character-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-character-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          <X />
        </button>
        <p className="eyebrow">Character details</p>
        <h2 id="edit-character-title">Edit Character</h2>
        <form onSubmit={submit}>
          <div className="portrait-editor">
            <div className={character.portraitUrl ? "portrait-preview has-image" : "portrait-preview"}>
              {character.portraitUrl
                ? <img src={character.portraitUrl} alt={`${character.name} portrait`} />
                : <UserRound size={34} />}
            </div>
            <div className="portrait-editor-actions">
              <label className="portrait-upload-button">
                {uploadingPortrait ? "Uploading…" : character.portraitUrl ? "Replace portrait" : "Upload portrait"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploadingPortrait}
                  onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    setUploadingPortrait(true);
                    setError("");
                    try {
                      await onPortraitUpload(file);
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Could not upload the portrait.");
                    } finally {
                      setUploadingPortrait(false);
                      event.currentTarget.value = "";
                    }
                  }}
                />
              </label>
              {character.portraitUrl && (
                <button
                  className="portrait-delete-button"
                  type="button"
                  disabled={uploadingPortrait || deletingPortrait}
                  onClick={async () => {
                    if (!window.confirm("Delete this character portrait? The sword marker will be restored.")) return;
                    setDeletingPortrait(true);
                    setError("");
                    try {
                      await onPortraitDelete();
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Could not delete the portrait.");
                    } finally {
                      setDeletingPortrait(false);
                    }
                  }}
                >
                  <Trash2 size={16} />
                  {deletingPortrait ? "Deleting…" : "Delete portrait"}
                </button>
              )}
            </div>
            <small>PNG, JPG, WebP, or GIF · maximum 5 MB</small>
          </div>
          <label>
            Character name
            <input name="name" defaultValue={initialCharacter.name} autoFocus required maxLength={120} />
          </label>
          <div className="character-fields">
            <label>
              Class
              <select name="className" defaultValue={canonicalCharacterClass(initialCharacter.class)} required>
                {CHARACTER_CLASSES.map((className) => <option value={className} key={className}>{className}</option>)}
              </select>
            </label>
            <label>
              Level
              <input name="level" type="number" min="1" max="99" defaultValue={initialCharacter.level} required />
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="edit-character-actions">
            <button className="primary-action" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              className="edit-delete-button"
              type="button"
              aria-label={`Delete ${character.name}`}
              title={`Delete ${character.name}`}
              onClick={onDelete}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function DeleteCharacterModal({
  character,
  onClose,
  onDelete,
}: {
  character: SheetCharacter;
  onClose: () => void;
  onDelete: (input?: {characterId: string; expectedVersion?: number}) => Promise<void>;
}) {
  const initialCharacter = useRef(character).current;
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const matches = confirmation.trim() === initialCharacter.name;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete({characterId: initialCharacter.characterId, expectedVersion: initialCharacter.version});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the character.");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal delete-character-modal ornamental-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-character-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          <X />
        </button>
        <p className="eyebrow">Permanent deletion</p>
        <h2 id="delete-character-title">Delete {initialCharacter.name}?</h2>
        <p className="modal-intro">
          This permanently removes the character and all of their wallet transactions,
          territories, retainers, and journal entries.
        </p>
        <form onSubmit={submit}>
          <label>
            Type <strong>{initialCharacter.name}</strong> to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoFocus
              autoComplete="off"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="delete-actions">
            <button type="button" className="secondary-action" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="danger-action" disabled={!matches || deleting}>
              <Trash2 size={17} />
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
