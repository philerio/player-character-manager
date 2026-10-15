export type ErrorCode =
  | "offline"
  | "timeout"
  | "session"
  | "permission"
  | "conflict"
  | "validation"
  | "storage"
  | "cancelled"
  | "uncertain"
  | "server";
export type DataIssue = {
  path: string;
  expected: string;
  received: string;
  collection?: string;
  recordId?: string;
  recordIndex?: number;
};
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable = false,
    public dataIssue?: DataIssue,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function errorMessage(
  error: unknown,
  fallback = "The operation failed.",
) {
  return error instanceof Error ? error.message : fallback;
}
export function serverError(message: string): AppError {
  if (/session|sign.?in|unauth|expired/i.test(message))
    return new AppError(
      "session",
      "Your session expired. Sign in again. Pending changes remain on this device.",
    );
  if (
    /permission|forbidden|not allowed|only the dm|access denied|inactive|disabled account/i.test(
      message,
    )
  )
    return new AppError(
      "permission",
      "This account does not have permission for that action. Your local changes have not been discarded.",
    );
  if (/conflict|changed in the campaign|revision/i.test(message))
    return new AppError(
      "conflict",
      "Campaign data changed on another device. Your edits are preserved. Review the campaign copy before replacing them.",
    );
  return new AppError(
    "server",
    message || "The campaign could not complete the request.",
  );
}
export type SyncProgress = { completed: number; total: number; label: string };

export function definitelyNotApplied(error: unknown) {
  return (
    error instanceof AppError &&
    ["offline", "session", "permission"].includes(error.code)
  );
}
