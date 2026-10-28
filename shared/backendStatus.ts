export type BackendStatus = {
  ok: true;
  checkedAt: string;
  schema: {
    ready: boolean;
    missing: string[];
    appliedMigrations: string[] | null;
    pendingMigrations: string[];
  };
  scheduler: {
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastSucceededAt: string | null;
    outcome: "running" | "ok" | "partial" | "failed" | null;
    failureCount: number;
    lastFailureCharacterId: string | null;
    lastFailureCategory: string | null;
  } | null;
  notifications: {
    pending: number;
    failed: number;
    blocked: number;
    oldestPendingAt: string | null;
  } | null;
  storage: { encodedBytes: number; limitBytes: number; files: number } | null;
  activeCharacters: number | null;
};
export function isBackendStatus(input: unknown): input is BackendStatus {
  if (!input || typeof input !== "object") return false;
  const v = input as BackendStatus;
  const count = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const date = (s: unknown) =>
    typeof s === "string" && Number.isFinite(Date.parse(s));
  const nullableDate = (s: unknown) => s === null || date(s);
  const strings = (a: unknown) =>
    Array.isArray(a) && a.every((s) => typeof s === "string");
  const nullableText = (s: unknown) => s === null || typeof s === "string";
  if (
    v.ok !== true ||
    !date(v.checkedAt) ||
    !v.schema ||
    typeof v.schema.ready !== "boolean" ||
    !strings(v.schema.missing) ||
    !strings(v.schema.pendingMigrations) ||
    !(
      v.schema.appliedMigrations === null || strings(v.schema.appliedMigrations)
    )
  )
    return false;
  if (!v.schema.ready)
    return (
      v.scheduler === null &&
      v.notifications === null &&
      v.storage === null &&
      v.activeCharacters === null
    );
  const s = v.scheduler,
    n = v.notifications,
    f = v.storage;
  return (
    !!s &&
    !!n &&
    !!f &&
    count(v.activeCharacters) &&
    nullableDate(s.lastStartedAt) &&
    nullableDate(s.lastFinishedAt) &&
    nullableDate(s.lastSucceededAt) &&
    [null, "running", "ok", "partial", "failed"].includes(s.outcome) &&
    count(s.failureCount) &&
    nullableText(s.lastFailureCharacterId) &&
    nullableText(s.lastFailureCategory) &&
    count(n.pending) &&
    count(n.failed) &&
    count(n.blocked) &&
    nullableDate(n.oldestPendingAt) &&
    count(f.encodedBytes) &&
    count(f.limitBytes) &&
    f.limitBytes > 0 &&
    count(f.files)
  );
}
