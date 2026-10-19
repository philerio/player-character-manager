import {
  diagnosticsScope,
  reportDataIssue,
  resolveDataIssues,
} from "./dataDiagnostics";
import { AppError, serverError } from "./errors";
import { normalizeSheetResponse, validateResponse } from "./validation";
const reads = new Map<
  string,
  {
    promise: Promise<Response>;
    controller: AbortController;
    characterId: string;
  }
>();
export function cancelCharacterReads(characterId: string) {
  for (const request of reads.values())
    if (request.characterId === characterId) request.controller.abort();
}
export function cancelAllReads() {
  for (const request of reads.values()) request.controller.abort();
}

/** Reads retry once and deduplicate; writes never automatically repeat at the transport layer. */
export function requestCampaign(
  url: string,
  options: RequestInit | undefined,
  send: (url: string, options?: RequestInit) => Promise<Response>,
) {
  const parsed = new URL(url);
  const write = (options?.method || "GET").toUpperCase() !== "GET";
  const body =
    write && typeof options?.body === "string" ? JSON.parse(options.body) : {};
  const action = write
    ? String(body.action || "")
    : parsed.searchParams.get("action") || "bootstrap";
  const characterId = String(
    body.characterId || parsed.searchParams.get("characterId") || "",
  );
  const scope = diagnosticsScope(
    String(body.sessionToken || parsed.searchParams.get("sessionToken") || ""),
  );
  const keyUrl = new URL(url);
  keyUrl.searchParams.delete("_");
  const key = keyUrl.toString();
  if (!write && reads.get(key)?.controller.signal.aborted) reads.delete(key);
  if (!write && reads.has(key))
    return reads.get(key)!.promise.then((response) => response.clone());
  const controller = new AbortController();
  const execute = async () => {
    for (let attempt = 0; ; attempt++) {
      let timedOut = false;
      const attemptController = new AbortController();
      const cancel = () => attemptController.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      if (controller.signal.aborted) cancel();
      const timer = setTimeout(() => {
        timedOut = true;
        attemptController.abort();
      }, 20_000);
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine)
          throw new AppError(
            "offline",
            "You are offline. Local edits are kept until the connection returns.",
            true,
          );
        const response = await send(url, {
          ...options,
          signal: attemptController.signal,
        });
        if (!response.ok) {
          const failure = await response
            .clone()
            .json()
            .catch(() => null);
          const message =
            typeof failure?.error === "string" ? failure.error : "";
          const rawId =
            failure?.requestId || response.headers.get("X-Request-ID");
          const requestId =
            typeof rawId === "string" && /^[a-f0-9-]{36}$/i.test(rawId)
              ? rawId
              : undefined;
          let error: AppError;
          if (response.status === 401) error = serverError("session expired");
          else if (response.status === 403)
            error = serverError("permission denied");
          else if (response.status === 404)
            error = new AppError(
              "not-found",
              message || "The requested campaign data was not found.",
            );
          else if (response.status === 409) error = serverError("conflict");
          else if ([400, 405, 413, 422].includes(response.status))
            error = new AppError(
              "rejected",
              message ||
                "The campaign rejected this request. Check the entered values and try again.",
            );
          else if (response.status === 429) {
            error = new AppError(
              "rate-limit",
              message || "Too many requests. Wait before trying again.",
            );
            const retryAfter = response.headers.get("Retry-After");
            if (retryAfter) {
              const seconds = /^\d+$/.test(retryAfter)
                ? Number(retryAfter)
                : Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000);
              if (Number.isFinite(seconds))
                error.retryAfterSeconds = Math.max(0, seconds);
            }
          } else if (response.status === 503)
            error = new AppError(
              "server",
              message ||
                "The campaign service is temporarily unavailable. Your working copy was kept.",
              !write,
            );
          else if (response.status === 501)
            error = new AppError(
              "unsupported",
              message ||
                "This operation is not available on the selected campaign service yet.",
            );
          else
            error = new AppError(
              "server",
              `The campaign service returned an error (${response.status}). Your working copy has been kept.${requestId ? ` Reference: ${requestId}.` : ""}`,
              !write && response.status >= 500,
            );
          error.requestId = requestId;
          throw error;
        }
        let data: any;
        try {
          data = await response.clone().json();
        } catch {
          throw new AppError(
            "validation",
            "The campaign returned an unreadable response. Your working copy has been kept.",
            false,
            {
              path: "response",
              expected: "a JSON response",
              received: "unreadable response",
            },
          );
        }
        const normalized = normalizeSheetResponse(data);
        validateResponse(action, data, characterId || undefined, body);
        if (!data.ok)
          throw serverError(
            String(
              data.error || "The campaign could not complete the request.",
            ),
          );
        if (controller.signal.aborted)
          throw new AppError("cancelled", "This request was superseded.");
        resolveDataIssues(scope, action, characterId);
        if (normalized) {
          const headers = new Headers(response.headers);
          headers.delete("Content-Length");
          headers.delete("Content-Encoding");
          headers.set("Content-Type", "application/json");
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }
        return response;
      } catch (reason) {
        const error =
          reason instanceof AppError
            ? reason
            : controller.signal.aborted
              ? new AppError("cancelled", "This request was superseded.")
              : write && action !== "wallet.backup.load"
                ? new AppError(
                    "uncertain",
                    "The campaign may have received this change, but confirmation was lost. Your draft is kept. Check the campaign copy before retrying to avoid duplicates.",
                  )
                : timedOut
                  ? new AppError(
                      "timeout",
                      "The campaign took too long to respond. Your saved data is still available.",
                      true,
                    )
                  : new AppError(
                      "offline",
                      "Could not reach the campaign. Showing the saved working copy; retry when connected.",
                      true,
                    );
        if (
          !controller.signal.aborted &&
          error.code === "validation" &&
          error.dataIssue
        )
          reportDataIssue(scope, action, characterId, error.dataIssue);
        if (
          write ||
          attempt >= 1 ||
          !error.retryable ||
          controller.signal.aborted ||
          (typeof navigator !== "undefined" && !navigator.onLine)
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", cancel);
      }
    }
  };
  const promise = execute().finally(() => {
    if (reads.get(key)?.controller === controller) reads.delete(key);
  });
  if (!write) reads.set(key, { promise, controller, characterId });
  return promise.then((response) => response.clone());
}
