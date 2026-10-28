import { useEffect, useRef, useState } from "react";
import { loadBackendStatus } from "../google-sheets-api";
import { apiBackend, isDemoMode } from "../app/runtime";
import type { BackendStatus as Status } from "../../shared/backendStatus";

export function BackendStatus() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function refresh() {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const next = await loadBackendStatus();
      if (current === generation.current) setStatus(next);
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : "Could not check backend status.",
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (open) void refresh();
  }, [open]);
  if (apiBackend !== "d1" || isDemoMode) return null;
  const time = (value: string | null) =>
    value ? new Date(value).toLocaleString() : "Not recorded";
  const stale = status?.scheduler?.lastFinishedAt
    ? Date.parse(status.checkedAt) -
        Date.parse(status.scheduler.lastFinishedAt) >
      5 * 60000
    : true;
  return (
    <details
      className="data-diagnostics"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Backend status</summary>
      {open && (
        <div aria-busy={busy}>
          {busy && <p role="status">Checking campaign services…</p>}
          {error && (
            <p role="alert">
              {error}
              {status ? " Showing the previous check below." : ""}
            </p>
          )}
          {!status && !busy && !error && <p>Status has not been checked.</p>}
          {status && (
            <>
              <p>Checked: {time(status.checkedAt)}</p>
              <p>
                <strong>Database:</strong>{" "}
                {status.schema.ready
                  ? "Schema checks passed."
                  : "Update required. Apply pending D1 migrations and check again."}
              </p>
              {!!status.schema.pendingMigrations.length && (
                <p>
                  Pending migrations:{" "}
                  {status.schema.pendingMigrations.join(", ")}
                </p>
              )}
              {!!status.schema.missing.length && (
                <p>Missing schema: {status.schema.missing.join(", ")}</p>
              )}
              {status.schema.appliedMigrations === null && (
                <p>
                  Migration history is unavailable; structural checks are shown.
                </p>
              )}
              {status.scheduler && (
                <>
                  <p>
                    <strong>Scheduled jobs:</strong>{" "}
                    {status.scheduler.outcome === "running"
                      ? status.scheduler.lastStartedAt &&
                        Date.parse(status.checkedAt) -
                          Date.parse(status.scheduler.lastStartedAt) >
                          5 * 60000
                        ? "Last run did not finish. Check the Worker logs."
                        : "Running."
                      : !status.scheduler.lastFinishedAt
                        ? "No completed run recorded."
                        : stale
                          ? "No recent completed run. Check the Cron trigger."
                          : status.scheduler.outcome === "ok"
                            ? "Last run completed."
                            : "Last run needs attention."}
                  </p>
                  <p>
                    Last completed: {time(status.scheduler.lastFinishedAt)}
                    <br />
                    Last successful: {time(status.scheduler.lastSucceededAt)}
                  </p>
                  {!!status.scheduler.failureCount && (
                    <p>
                      Failures in the last run: {status.scheduler.failureCount}.{" "}
                      {status.scheduler.lastFailureCharacterId &&
                        `Character: ${status.scheduler.lastFailureCharacterId}. `}
                      Refresh conflicts retry on the next campaign pass; other
                      failures need a Worker log check.
                    </p>
                  )}
                  {status.activeCharacters !== null && (
                    <p>
                      Jobs check one character per minute. A full pass takes
                      approximately {Math.max(1, status.activeCharacters + 1)}{" "}
                      minutes.
                    </p>
                  )}
                </>
              )}
              {status.notifications && (
                <p>
                  <strong>Discord:</strong> {status.notifications.pending}{" "}
                  queued · {status.notifications.blocked} missing configuration
                  · {status.notifications.failed} failed.{" "}
                  {status.notifications.oldestPendingAt &&
                    `Oldest queued: ${time(status.notifications.oldestPendingAt)}.`}
                </p>
              )}
              {status.storage && (
                <>
                  <p>
                    <strong>Upload storage:</strong>{" "}
                    {(status.storage.encodedBytes / 1048576).toFixed(1)} of{" "}
                    {(status.storage.limitBytes / 1048576).toFixed(0)} MiB used
                    · {status.storage.files} files.
                  </p>
                  <progress
                    aria-label="Upload storage used"
                    value={status.storage.encodedBytes}
                    max={status.storage.limitBytes}
                  />
                  {status.storage.encodedBytes >=
                    status.storage.limitBytes * 0.8 && (
                    <p>
                      Upload storage is nearly full. Replace large maps with
                      smaller images or remove unused portraits.
                    </p>
                  )}
                  <p>
                    This measures encoded file content. Check total database
                    usage and daily quotas in Cloudflare.
                  </p>
                </>
              )}
              <p>
                Full-database backups are created and verified from the
                terminal. This view does not confirm a backup exists.
              </p>
            </>
          )}
          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? "Checking…" : "Refresh backend status"}
          </button>
        </div>
      )}
    </details>
  );
}
