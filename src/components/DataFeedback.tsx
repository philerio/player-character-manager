import { useEffect, useState } from "react";
import {
  downloadWorkingCopy,
  hasStorageFailure,
  retryStorage,
} from "../app/storage";
import { errorMessage, type SyncProgress } from "../app/errors";
import type { ResourceState } from "../app/useBackgroundSync";

export function ResourceFeedback({
  name,
  state,
  retry,
  children,
}: {
  name: string;
  state: ResourceState;
  retry: () => Promise<void>;
  children: React.ReactNode;
}) {
  if (!state.hasData)
    return (
      <section
        className="data-placeholder"
        aria-busy={state.status === "loading"}
      >
        <h2>
          {state.status === "error"
            ? `Could not load ${name}`
            : `Loading ${name}…`}
        </h2>
        {state.status !== "error" && (
          <progress aria-label={`Loading ${name}`} />
        )}
        <p>
          {state.error ||
            "Options and actions will be available when the campaign data is ready."}
        </p>
        {state.status === "error" && (
          <button
            className="secondary-action"
            onClick={() => void retry().catch(() => {})}
          >
            Retry loading {name}
          </button>
        )}
      </section>
    );
  return (
    <>
      {state.status === "cached" && (
        <p className="data-refresh-note">
          Showing {name} saved on this device.
        </p>
      )}
      {state.status === "error" && (
        <div className="data-error-note" role="alert">
          <span>{state.error} Your working copy is still available.</span>
          <button
            className="secondary-action"
            onClick={() => void retry().catch(() => {})}
          >
            Retry {name}
          </button>
        </div>
      )}
      {children}
    </>
  );
}
export function CharacterLoadingIndicator({
  name,
  progress,
}: {
  name: string;
  progress: SyncProgress | null;
}) {
  return (
    <span className="character-loading-indicator" role="status">
      <span>Updating…</span>
      <progress
        aria-label={`Loading data for ${name}`}
        {...(progress && progress.total > 0
          ? { value: progress.completed, max: progress.total }
          : {})}
      />
    </span>
  );
}
export function WorkflowStatus({
  compact = false,
  confirmed,
  online,
  busy,
  phase,
  error,
  pending,
  dm,
  progress,
  refresh,
}: {
  compact?: boolean;
  confirmed: boolean;
  online: boolean;
  busy: boolean;
  phase: string;
  error: string;
  pending: boolean;
  dm: boolean;
  progress: SyncProgress | null;
  refresh: () => Promise<void>;
}) {
  const [storageFailed, setStorageFailed] = useState(hasStorageFailure);
  useEffect(() => {
    const update = () => setStorageFailed(hasStorageFailure());
    window.addEventListener("pcm-storage-status", update);
    return () => window.removeEventListener("pcm-storage-status", update);
  }, []);
  return (
    <aside
      className={`workflow-status ${compact ? "is-compact" : ""} ${error ? "has-error" : ""}`}
      aria-label="Data and save status"
      aria-busy={busy}
    >
      <div role={error ? "alert" : "status"} aria-live="polite">
        <strong>
          {storageFailed
            ? "Not safely saved on this device"
            : !online
              ? "Offline · Showing saved data"
              : error
                ? "Action needed"
                : busy
                  ? phase || "Synchronizing…"
                  : pending
                    ? dm
                      ? "Saved locally · DM changes await Push to Sheet"
                      : "Saved locally · Waiting to sync"
                    : confirmed
                      ? "Campaign changes confirmed"
                      : "Showing saved working copy"}
        </strong>
        {busy && (
          <progress
            aria-label={progress?.label || phase || "Refreshing campaign data"}
            {...(progress && progress.total > 0
              ? { value: progress.completed, max: progress.total }
              : {})}
          />
        )}
        {progress && busy && <span>{progress.label}</span>}
        {error && <p>{error}</p>}
        {!online && (
          <p>
            Keep editing available data. Pending changes will be checked when
            the connection returns.
          </p>
        )}
        <small>
          The wallet ledger stays on this device; campaign backup and restore
          remain explicit.
        </small>
      </div>
      {(pending || error) && (
        <button className="secondary-action" onClick={downloadWorkingCopy}>
          Download working copy
        </button>
      )}
      <button
        className="secondary-action"
        disabled={busy || !online}
        onClick={() => void refresh().catch(() => {})}
      >
        {error ? "Retry pending changes" : "Refresh now"}
      </button>
    </aside>
  );
}
export function StorageFeedback() {
  const [failed, setFailed] = useState(hasStorageFailure);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const update = () => setFailed(hasStorageFailure());
    update();
    window.addEventListener("pcm-storage-status", update);
    return () => window.removeEventListener("pcm-storage-status", update);
  }, []);
  if (!failed) return null;
  return (
    <aside className="data-error-note storage-error" role="alert">
      <div>
        <strong>Changes are not safely saved on this device.</strong>
        <p>
          Keep this tab open. Download a working-copy backup before leaving.{" "}
          {message}
        </p>
      </div>
      <button className="secondary-action" onClick={downloadWorkingCopy}>
        Download working copy
      </button>
      <button
        className="secondary-action"
        onClick={() => {
          try {
            retryStorage();
          } catch (reason) {
            setMessage(errorMessage(reason, "Storage is still unavailable."));
          }
        }}
      >
        Retry saving locally
      </button>
    </aside>
  );
}

/** Last-resort feedback for event handlers; ordinary request errors stay with their forms. */
export function ActionFailureFeedback() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const report = (event: PromiseRejectionEvent) => {
      setMessage(
        errorMessage(
          event.reason,
          "The action could not complete. Retry after checking the working copy.",
        ),
      );
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", report);
    return () => window.removeEventListener("unhandledrejection", report);
  }, []);
  if (!message) return null;
  return (
    <aside className="data-error-note" role="alert">
      <p>{message}</p>
      <button className="secondary-action" onClick={downloadWorkingCopy}>
        Download working copy
      </button>
      <button className="secondary-action" onClick={() => setMessage("")}>
        Dismiss
      </button>
    </aside>
  );
}
