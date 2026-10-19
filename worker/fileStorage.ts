import { ApiError } from "./errors";

// Small bound values fit D1's row limit. Even a 5 MiB upload needs only 14
// content INSERTs, leaving room under the Free plan's per-invocation query cap.
export const FILE_PART_SIZE = 512 * 1024;
export const FILE_STORAGE_BUDGET = 128 * 1024 * 1024;
export function decodeFile(value: string): Uint8Array {
  const native = Uint8Array as typeof Uint8Array & {
    fromBase64?: (value: string) => Uint8Array;
  };
  if (native.fromBase64) return native.fromBase64(value);
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export async function contentHash(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function fileStorageUsed(db: D1Database) {
  return (await db
    .prepare(
      "SELECT COALESCE(sum(encoded_length),0) AS used FROM media_files WHERE storage='d1'",
    )
    .first<{ used: number }>())!.used;
}
export async function assertFileCapacity(
  db: D1Database,
  encodedLength: number,
  replacedId: string,
  char: string,
) {
  const replaced = await db
    .prepare(
      "SELECT encoded_length FROM media_files WHERE id=? AND character_id=? AND storage='d1'",
    )
    .bind(replacedId, char)
    .first<{ encoded_length: number }>();
  if (
    (await fileStorageUsed(db)) -
      (replaced?.encoded_length || 0) +
      encodedLength >
    FILE_STORAGE_BUDGET
  )
    throw new ApiError(
      413,
      "Campaign upload storage is full. Remove unused portraits or replace large maps with smaller images, then retry.",
    );
}
