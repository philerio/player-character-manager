import { canonicalJSON } from "../../shared/records.mjs";
import { AppError } from "./errors";
import { appStorage } from "./storage";
/** Keep retry IDs across a lost response or page reload without storing request data. */
export async function withD1Command(
  options: RequestInit,
  send: (options: RequestInit) => Promise<Response>,
) {
  const body = JSON.parse(String(options.body));
  const { sessionToken, accessKey, ...payload } = body;
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          canonicalJSON({
            account: appStorage.getItem("pcm-draft-account") || sessionToken,
            payload,
          }),
        ),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const key = "pcm-pending-command:" + digest;
  const commandId =
    body.commandId ||
    (body.clientMutationId
      ? body.action + ":" + body.clientMutationId
      : undefined) ||
    (body.clientMissionId
      ? body.action + ":" + body.clientMissionId
      : undefined) ||
    appStorage.getItem(key) ||
    crypto.randomUUID();
  appStorage.setItemDurably(key, commandId);
  try {
    const response = await send({
      ...options,
      body: JSON.stringify({ ...body, commandId }),
    });
    appStorage.removeItem(key);
    return response;
  } catch (error) {
    if (
      error instanceof AppError &&
      [
        "rejected",
        "permission",
        "conflict",
        "unsupported",
        "not-found",
      ].includes(error.code)
    )
      appStorage.removeItem(key);
    throw error;
  }
}
