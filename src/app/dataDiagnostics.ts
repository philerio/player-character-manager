import type { DataIssue } from "./errors";
import { demoRole, isDemoMode } from "./runtime";
export type DataDiagnostic = DataIssue & {
  action: string;
  characterId?: string;
  detectedAt: string;
};
const reports = new Map<string, DataDiagnostic[]>();
const eventName = "pcm-data-diagnostics";
export function diagnosticsScope(token: string) {
  // Fingerprint the namespace so reports never retain session credentials.
  let hash = 14695981039346656037n;
  for (const character of token)
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(character.charCodeAt(0))) * 1099511628211n,
    );
  return `${isDemoMode ? `demo:${demoRole}` : "live"}:${hash.toString(36)}`;
}
function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName));
}
function safeId(value: string | undefined) {
  return value && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : undefined;
}
export function reportDataIssue(
  scope: string,
  action: string,
  characterId: string,
  issue: DataIssue,
) {
  // No raw response values, request payloads, credentials, emails, or URLs are retained.
  const report: DataDiagnostic = {
    action,
    characterId: safeId(characterId),
    detectedAt: new Date().toISOString(),
    path: issue.path,
    expected: issue.expected,
    received: issue.received,
    collection: issue.collection,
    recordId: safeId(issue.recordId),
    recordIndex: issue.recordIndex,
  };
  const current = reports.get(scope) || [];
  // A newer failed check replaces the previous first failure for that response.
  // Keeping the old field would imply it was still invalid after the DM corrected it.
  reports.set(
    scope,
    [
      report,
      ...current.filter(
        (row) =>
          row.action !== action || row.characterId !== report.characterId,
      ),
    ].slice(0, 25),
  );
  notify();
}
export function resolveDataIssues(
  scope: string,
  action: string,
  characterId: string,
) {
  const current = reports.get(scope) || [];
  const next = current.filter(
    (row) => row.action !== action || row.characterId !== safeId(characterId),
  );
  if (current.length !== next.length) {
    reports.set(scope, next);
    notify();
  }
}
export function clearDataIssues(scope: string) {
  reports.delete(scope);
  notify();
}
export function getDataIssues(
  scope: string,
  characterId: string,
): DataDiagnostic[] {
  return (reports.get(scope) || [])
    .filter((row) => !row.characterId || row.characterId === characterId)
    .map((row) => ({ ...row }));
}
export function subscribeDataIssues(listener: () => void) {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
export function downloadDataIssues(scope: string, characterId: string) {
  const report = {
    exportedAt: new Date().toISOString(),
    issues: getDataIssues(scope, characterId),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "campaign-data-issues.json";
  link.click();
  URL.revokeObjectURL(url);
}
