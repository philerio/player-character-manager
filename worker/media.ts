import { ApiError } from "./errors";
import { commitGame, fromLegacy, loadGameContext } from "./game";
import { runGameRules } from "./gameRules";
import type { Row } from "./ruleContext";
import {
  assertFileCapacity,
  contentHash,
  decodeFile,
  FILE_PART_SIZE,
  FILE_STORAGE_BUDGET,
} from "./fileStorage";
type MediaEnv = { DB: D1Database };
export const mediaActions = new Set([
  "territory.map.upload",
  "territory.poi-map.upload",
  "territory.workbook.import",
  "character.portrait.upload",
  "character.portrait.delete",
  "upload.create",
]);
export async function serveMedia(request: Request, env: MediaEnv, id: string) {
  const file = await env.DB.prepare(
    "SELECT * FROM media_files WHERE id=? AND active=1",
  )
    .bind(id)
    .first<Row>();
  // Images use unguessable share URLs, matching the existing shared-map policy.
  // Workbooks and other private attachments are never served by this image route.
  if (!file || file.storage !== "d1" || !file.mime_type.startsWith("image/"))
    throw new ApiError(404, "Image not found.");
  const parts = await env.DB.prepare(
    "SELECT part,data FROM media_file_parts WHERE file_id=? ORDER BY part",
  )
    .bind(id)
    .all<{ part: number; data: string }>();
  if (
    parts.results.length !== file.part_count ||
    parts.results.some((part, index) => part.part !== index)
  )
    throw new ApiError(
      500,
      "The saved image is incomplete. Reupload the original image.",
    );
  let bytes: Uint8Array;
  try {
    bytes = decodeFile(parts.results.map((part) => part.data).join(""));
  } catch {
    throw new ApiError(
      500,
      "The saved image is damaged. Reupload the original image.",
    );
  }
  if (
    bytes.byteLength !== file.byte_length ||
    (await contentHash(bytes)) !== file.sha256
  )
    throw new ApiError(
      500,
      "The saved image failed its integrity check. Reupload the original image.",
    );
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": file.mime_type,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
function imageSignature(bytes: Uint8Array, mime: string) {
  if (mime === "image/png")
    return (
      bytes[0] === 137 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG"
    );
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/gif")
    return /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0, 6)));
  if (mime === "image/webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}
export async function mediaAction(
  request: Request,
  env: MediaEnv,
  player: Row,
  input: Row,
  action: string,
) {
  const char = String(input.characterId || "");
  if (player.role !== "dm" && action.startsWith("territory."))
    throw new ApiError(403, "Only the DM can upload territory files.");
  const commandId = String(input.commandId || "");
  if (!commandId || commandId.length > 200)
    throw new ApiError(400, "A stable command ID is required.");
  const { sessionToken, accessKey, ...payload } = input;
  const payloadHash = await hashPayload(payload);
  const existing = await env.DB.prepare(
    "SELECT * FROM command_receipts WHERE actor_id=? AND mutation_id=?",
  )
    .bind(player.playerId, commandId)
    .first<Row>();
  if (existing) {
    if (
      existing.action !== action ||
      existing.character_id !== char ||
      existing.payload_hash !== payloadHash
    )
      throw new ApiError(
        409,
        "This command ID was already used for another upload.",
      );
    return JSON.parse(existing.response);
  }
  const { context, clock } = await loadGameContext(env.DB, player, char),
    before: Record<string, Row[]> = JSON.parse(JSON.stringify(context.sheets));
  const character = context.sheets.Characters[0];
  if (action === "character.portrait.delete") {
    const next = {
      ...character,
      portraitFileId: "",
      portraitFileName: "",
      portraitUrl: "",
    };
    const result = { ok: true, character: next };
    await commitGame(
      env.DB,
      context,
      before,
      clock,
      char,
      player,
      { mutation: commandId, action, payloadHash, result },
      [
        env.DB.prepare(
          "UPDATE characters SET data=?,version=version+1 WHERE id=?",
        ).bind(JSON.stringify(next), char),
        env.DB.prepare(
          "DELETE FROM media_files WHERE id=? AND character_id=? AND storage='d1'",
        ).bind(
          String(character.portraitFileId || "").replace(/^(?:d1|r2):/, ""),
          char,
        ),
      ],
    );
    return result;
  }
  const mime = String(input.mimeType || ""),
    name = String(input.fileName || "")
      .trim()
      .slice(0, 200);
  if (
    !name ||
    typeof input.base64 !== "string" ||
    input.base64.length > 8 * 1024 * 1024
  )
    throw new ApiError(400, "Choose a file of 5 MB or smaller.");
  let bytes: Uint8Array;
  try {
    bytes = decodeFile(input.base64.replace(/^data:[^;]+;base64,/, ""));
  } catch {
    throw new ApiError(400, "The uploaded file is unreadable.");
  }
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new ApiError(413, "Files must be 5 MB or smaller.");
  const workbook = action === "territory.workbook.import";
  if (workbook) {
    if (
      mime !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      bytes[0] !== 80 ||
      bytes[1] !== 75
    )
      throw new ApiError(400, "Choose an XLSX workbook.");
  } else if (!imageSignature(bytes, mime))
    throw new ApiError(400, "Choose a valid PNG, JPEG, GIF or WebP image.");
  const id = crypto.randomUUID(),
    fileId = "d1:" + id,
    url = new URL("/files/" + id, request.url).toString();
  let result: Row;
  const territory = context.sheets.Territories.find(
    (r) => r.territoryId === input.territoryId,
  );
  if (action.startsWith("territory.") && !territory)
    throw new ApiError(404, "Territory not found.");
  if (workbook) {
    if (!Array.isArray(input.rows) || input.rows.length !== 61)
      throw new ApiError(
        400,
        "The territory workbook must contain exactly 61 populated hex rows.",
      );
    const seen = new Set<string>(),
      now = new Date().toISOString();
    for (const row of input.rows) {
      if (!row || typeof row !== "object")
        throw new ApiError(400, "Invalid territory workbook row.");
      const number = String(row.hexNumber || "").trim(),
        key = Number.isFinite(Number(number))
          ? String(Number(number))
          : number.toLowerCase();
      if (!/^\d+\.\d+$/.test(number) || seen.has(key))
        throw new ApiError(
          400,
          "The territory workbook contains empty or duplicate hex numbers.",
        );
      seen.add(key);
      const old = context.sheets["Territory Hexes"].find(
        (r) =>
          r.territoryId === territory!.territoryId &&
          (Number.isFinite(Number(r.hexNumber))
            ? String(Number(r.hexNumber))
            : String(r.hexNumber).toLowerCase()) === key,
      );
      const next: Row = {
        ...old,
        hexId: old?.hexId || crypto.randomUUID(),
        characterId: char,
        territoryId: territory!.territoryId,
        hexNumber: number,
        mapX: old?.mapX ?? 0,
        mapY: old?.mapY ?? 0,
        title: old?.title || "Hex " + number,
        contents: String(row.details || ""),
        createdAt: old?.createdAt || now,
        updatedAt: now,
      };
      for (const field of [
        "terrain",
        "inhabitants",
        "dungeon",
        "settlement",
        "settlementName",
        "details",
        "reaction",
        "dmOnlyInformation",
      ]) {
        if (typeof row[field] !== "string" || row[field].length > 12000)
          throw new ApiError(400, `Invalid workbook field: ${field}.`);
        next[field] = row[field];
      }
      for (const field of [
        "hexPopulationValue",
        "potentialHostileEncounterPopulation",
      ]) {
        if (
          typeof row[field] !== "number" ||
          !Number.isSafeInteger(row[field]) ||
          row[field] < 0
        )
          throw new ApiError(400, `Invalid workbook field: ${field}.`);
        next[field] = row[field];
      }
      if (old) Object.assign(old, next);
      else context.sheets["Territory Hexes"].push(next);
    }
    // Preserve existing discoveries and records for hexes omitted by an upload.
    territory!.workbookFileId = fileId;
    territory!.workbookFileName = name;
    runGameRules(context, "initialize-fields", { characterId: char });
    result = {
      ok: true,
      territory: fromLegacy(territory!),
      hexes: context.sheets["Territory Hexes"].filter(
        (r) => r.territoryId === territory!.territoryId,
      ),
    };
  } else if (action === "character.portrait.upload") {
    Object.assign(character, {
      portraitFileId: fileId,
      portraitUrl: url,
      portraitFileName: name,
    });
    result = { ok: true, character };
  } else if (action === "upload.create") {
    result = { ok: true, fileId, url, fileName: name };
  } else {
    const prefix = action === "territory.poi-map.upload" ? "poiMap" : "map";
    Object.assign(territory!, {
      [prefix + "FileId"]: fileId,
      [prefix + "Url"]: url,
      [prefix + "FileName"]: name,
    });
    result = { ok: true, territory: fromLegacy(territory!) };
  }
  const now = new Date().toISOString();
  const previousFileId =
    action === "character.portrait.upload"
      ? before.Characters[0].portraitFileId
      : action === "territory.poi-map.upload"
        ? before.Territories.find((r) => r.territoryId === input.territoryId)
            ?.poiMapFileId
        : action === "territory.map.upload"
          ? before.Territories.find((r) => r.territoryId === input.territoryId)
              ?.mapFileId
          : workbook
            ? before.Territories.find(
                (r) => r.territoryId === input.territoryId,
              )?.workbookFileId
            : "";
  const replacedId = String(previousFileId || "").replace(/^(?:d1|r2):/, "");
  const encoded = input.base64
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s/g, "");
  const parts: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += FILE_PART_SIZE)
    parts.push(encoded.slice(offset, offset + FILE_PART_SIZE));
  const sha256 = await contentHash(bytes);
  await assertFileCapacity(env.DB, encoded.length, replacedId, char);
  const capacityGuard = crypto.randomUUID();
  try {
    // Media metadata and the new campaign reference belong to the same guarded batch.
    await commitGame(
      env.DB,
      context,
      before,
      clock,
      char,
      player,
      { mutation: commandId, action, payloadHash, result },
      [
        env.DB.prepare(
          "INSERT INTO transaction_guards(id,valid) VALUES(?,CASE WHEN (SELECT COALESCE(sum(encoded_length),0) FROM media_files WHERE storage='d1')-COALESCE((SELECT encoded_length FROM media_files WHERE id=? AND character_id=? AND storage='d1'),0)+?<=? THEN 1 ELSE 0 END)",
        ).bind(
          capacityGuard,
          replacedId,
          char,
          encoded.length,
          FILE_STORAGE_BUDGET,
        ),
        env.DB.prepare(
          "DELETE FROM media_files WHERE id=? AND character_id=? AND storage='d1'",
        ).bind(replacedId, char),
        env.DB.prepare(
          "INSERT INTO media_files(id,character_id,category,name,mime_type,created_at,storage,byte_length,encoded_length,part_count,sha256) VALUES(?,?,?,?,?,?,'d1',?,?,?,?)",
        ).bind(
          id,
          char,
          action,
          name,
          mime,
          now,
          bytes.byteLength,
          encoded.length,
          parts.length,
          sha256,
        ),
        ...parts.map((part, index) =>
          env.DB.prepare(
            "INSERT INTO media_file_parts(file_id,part,data) VALUES(?,?,?)",
          ).bind(id, index, part),
        ),
        ...(action === "character.portrait.upload"
          ? [
              env.DB.prepare(
                "UPDATE characters SET data=?,version=version+1 WHERE id=?",
              ).bind(JSON.stringify(character), char),
            ]
          : []),
        env.DB.prepare("DELETE FROM transaction_guards WHERE id=?").bind(
          capacityGuard,
        ),
      ],
    );
  } catch (error) {
    await assertFileCapacity(env.DB, encoded.length, replacedId, char);
    throw error;
  }
  return result;
}
async function hashPayload(value: unknown) {
  const { canonicalJSON } = await import("../shared/records.mjs");
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJSON(value)),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
