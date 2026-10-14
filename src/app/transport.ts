import { AppError, serverError } from "./errors";
import { validateResponse } from "./validation";
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
          if (response.status === 401) throw serverError("session expired");
          if (response.status === 403) throw serverError("permission denied");
          throw new AppError(
            "server",
            `The campaign service returned an error (${response.status}). Your working copy has been kept.`,
            !write && response.status >= 500,
          );
        }
        let data: any;
        try {
          data = await response.clone().json();
        } catch {
          throw new AppError(
            "validation",
            "The campaign returned an unreadable response. Your working copy has been kept.",
          );
        }
        validateResponse(action, data, characterId || undefined);
        if (!data.ok)
          throw serverError(
            String(
              data.error || "The campaign could not complete the request.",
            ),
          );
        if (controller.signal.aborted)
          throw new AppError("cancelled", "This request was superseded.");
        return response;
      } catch (reason) {
        const error =
          reason instanceof AppError
            ? reason
            : controller.signal.aborted
              ? new AppError("cancelled", "This request was superseded.")
              : write
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
