import { canonicalJSON, validateRecordFields } from "../shared/records.mjs";
import { ApiError } from "./errors";
import { gameActions, runGameRules } from "./gameRules";
import type { Row, RuleContext } from "./ruleContext";

export const gameKinds: Record<string, [string, string, string]> = {
  Retainers: ["retainer", "retainerId", "retainers"],
  "Recurring Expenses": ["recurring", "scheduleId", "recurringExpenses"],
  "Wallet Transactions": ["transaction", "transactionId", "transactions"],
  "Scouting Missions": ["scouting", "missionId", "scoutingMissions"],
  "Custom Missions": ["custom", "missionId", "customMissions"],
  "Territory Hexes": ["hex", "hexId", "territoryHexes"],
  "Territory Recruitment": ["recruitment", "offerId", ""],
};
export const migratedGameActions = new Set([
  ...gameActions,
  "territory.delete",
  "transaction.create",
  "scouting.notify-start",
]);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const key = (value: unknown) => String(value).trim().toLowerCase();
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export function toLegacy(row: Row): Row {
  const result = clone(row);
  for (const name of ["roster", "allocations", "assets"])
    if (Array.isArray(result[name])) {
      result[name + "Json"] = JSON.stringify(result[name]);
      delete result[name];
    }
  return result;
}
export function fromLegacy(row: Row): Row {
  const result = clone(row);
  for (const name of ["roster", "allocations", "assets"])
    if (name + "Json" in result) {
      result[name] = result[name + "Json"]
        ? JSON.parse(result[name + "Json"])
        : [];
      delete result[name + "Json"];
    }
  return result;
}
export async function readClock(db: D1Database, char: string) {
  return (
    (
      await db
        .prepare("SELECT revision FROM campaign_clocks WHERE character_id=?")
        .bind(char)
        .first<{ revision: number }>()
    )?.revision || 0
  );
}
export async function loadGameContext(
  db: D1Database,
  player: Row,
  char: string,
): Promise<{ context: RuleContext; clock: number }> {
  const clock = await readClock(db, char);
  const [character, territories, records, settings, webhook] =
    await Promise.all([
      db
        .prepare("SELECT data FROM characters WHERE id=? AND active=1")
        .bind(char)
        .first<{ data: string }>(),
      db
        .prepare(
          "SELECT data FROM territories WHERE character_id=? AND active=1",
        )
        .bind(char)
        .all<{ data: string }>(),
      db
        .prepare(
          "SELECT kind,data FROM records WHERE character_id=? ORDER BY id",
        )
        .bind(char)
        .all<{ kind: string; data: string }>(),
      db
        .prepare("SELECT value FROM settings WHERE key='campaignTimeZone'")
        .first<{ value: string }>(),
      db
        .prepare(
          "SELECT url FROM discord_webhooks WHERE player_id=(SELECT player_id FROM characters WHERE id=?)",
        )
        .bind(char)
        .first<{ url: string }>(),
    ]);
  if (!character) throw new ApiError(403, "Character is no longer available.");
  const sheets: Record<string, Row[]> = {
    Characters: [JSON.parse(character.data)],
    Territories: territories.results.map((row) =>
      toLegacy(JSON.parse(row.data)),
    ),
  };
  for (const [sheet, [kind]] of Object.entries(gameKinds))
    sheets[sheet] = records.results
      .filter((row) => row.kind === kind)
      .map((row) => toLegacy(JSON.parse(row.data)));
  if ((await readClock(db, char)) !== clock)
    throw new ApiError(
      409,
      "Campaign data changed while loading. Refresh and retry.",
    );
  return {
    clock,
    context: {
      sheets,
      player,
      timeZone: settings?.value || "UTC",
      notifications: [],
      webhook: webhook?.url || "",
    },
  };
}
export function validateGameInput(
  action: string,
  input: Row,
  context: RuleContext,
) {
  for (const field of [
    "name",
    "label",
    "hexNumber",
    "missionId",
    "retainerId",
    "territoryId",
    "objective",
    "missionLocation",
    "startDate",
    "frequency",
  ])
    if (
      input[field] !== undefined &&
      (typeof input[field] !== "string" || input[field].length > 12000)
    )
      throw new ApiError(400, `Invalid ${field}.`);
  for (const field of ["mapX", "mapY"])
    if (
      input[field] !== undefined &&
      (typeof input[field] !== "number" ||
        !Number.isFinite(input[field]) ||
        input[field] < 0 ||
        input[field] > 100)
    )
      throw new ApiError(400, "Map coordinates must be between 0 and 100.");
  if (
    input.territoryId &&
    action !== "territory.create" &&
    !context.sheets.Territories.some((r) => r.territoryId === input.territoryId)
  )
    throw new ApiError(404, "Territory not found.");
  if (
    action === "territory.fields.update" ||
    action === "territory.fields.expand"
  ) {
    const hex = context.sheets["Territory Hexes"].find(
      (r) => r.hexId === input.hexId && r.territoryId === input.territoryId,
    );
    const revealed =
      hex &&
      (key(hex.hexNumber) === "4.4" ||
        hex.dmRevealed ||
        context.sheets["Scouting Missions"].some(
          (m) =>
            m.territoryId === hex.territoryId &&
            Number(m.hexNumber) === Number(hex.hexNumber) &&
            m.status === "completed" &&
            m.resultsViewedAt,
        ));
    if (!revealed)
      throw new ApiError(
        403,
        "Discover this sub-hex before developing its fields.",
      );
  }
  const check = (value: unknown, positive = false) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1e12 ||
      (positive && value < 0)
    )
      throw new ApiError(400, "Enter a valid amount or count.");
  };
  for (const field of [
    "pp",
    "gp",
    "sp",
    "cp",
    "amount",
    "population",
    "cerealFields",
    "cottonFields",
    "pastureFields",
  ])
    if (input[field] !== undefined)
      check(input[field], !["pp", "gp", "sp", "cp"].includes(field));
  if (input.walletBalance)
    for (const coin of ["pp", "gp", "sp", "cp"])
      check(input.walletBalance[coin], true);
  for (const field of ["roster", "allocations", "equipment", "assets"])
    if (input[field] !== undefined) {
      if (
        !Array.isArray(input[field]) ||
        input[field].length > 100 ||
        input[field].some(
          (r: unknown) => !r || typeof r !== "object" || Array.isArray(r),
        )
      )
        throw new ApiError(400, "Invalid campaign allocation list.");
      for (const item of input[field])
        for (const name of [
          "men",
          "missingSerjeants",
          "amount",
          "quantity",
          "quantityPerSoldier",
        ])
          if (item[name] !== undefined) check(item[name], true);
    }
  const current = context.sheets.Retainers.find(
    (r) => r.retainerId === input.retainerId,
  );
  if (action === "retainer.update" || action === "retainer.delete") {
    if (!current || current.active === false)
      throw new ApiError(404, "Retainer not found.");
    if (current.updatedAt && input.expectedUpdatedAt !== current.updatedAt)
      throw new ApiError(
        409,
        "Retainer changed in the campaign. Refresh before editing.",
      );
  }
  if (action === "retainer.update" && current && input.type !== current.type)
    throw new ApiError(
      400,
      "A retainer cannot change between an individual and a fighting force.",
    );
  const missions = [
    ...context.sheets["Scouting Missions"].filter((r) => r.status === "active"),
    ...context.sheets["Custom Missions"].filter((r) =>
      ["active", "scheduled"].includes(r.status),
    ),
  ];
  if (action === "scouting.promote-serjeants") {
    const mission = context.sheets["Scouting Missions"].find(
      (r) => r.missionId === input.missionId,
    );
    for (const allocation of JSON.parse(mission?.allocationsJson || "[]"))
      if (
        allocation.strandedMen > 0 &&
        !context.sheets.Retainers.some(
          (r) => r.retainerId === allocation.retainerId && r.active !== false,
        )
      )
        throw new ApiError(
          409,
          "The fighting force for this promotion is no longer available. No fee was charged.",
        );
  }
  if (
    action === "retainer.delete" &&
    missions.some(
      (m) =>
        JSON.parse(m.allocationsJson || "[]").some(
          (a: Row) => a.retainerId === input.retainerId,
        ) || m.officerRetainerId === input.retainerId,
    )
  )
    throw new ApiError(409, "This retainer is assigned to an active mission.");
  if (action === "retainer.update" && current?.type === "force") {
    const roster = JSON.parse(current.rosterJson || "[]");
    for (const group of input.roster || []) {
      group.rosterGroupId ||=
        roster.find((r: Row) => r.soldierType === group.soldierType)
          ?.rosterGroupId || crypto.randomUUID();
    }
    for (const mission of missions)
      for (const allocation of JSON.parse(mission.allocationsJson || "[]"))
        if (allocation.retainerId === input.retainerId) {
          const group = (input.roster || []).find((g: Row) =>
            allocation.rosterGroupId
              ? g.rosterGroupId === allocation.rosterGroupId
              : g.soldierType === allocation.soldierType,
          );
          const reserved = missions
            .flatMap((m) => JSON.parse(m.allocationsJson || "[]"))
            .filter(
              (a: Row) =>
                a.retainerId === allocation.retainerId &&
                (allocation.rosterGroupId
                  ? a.rosterGroupId === allocation.rosterGroupId
                  : a.soldierType === allocation.soldierType),
            )
            .reduce((sum: number, a: Row) => sum + a.men, 0);
          if (
            !group ||
            group.soldierType !== allocation.soldierType ||
            group.men - (group.missingSerjeants || 0) * 9 < reserved
          )
            throw new ApiError(
              409,
              "The roster change would remove soldiers assigned to active missions.",
            );
        }
  }
  if (action === "scouting.start" || action === "mission.custom.create") {
    if (!Array.isArray(input.allocations) || !input.allocations.length)
      throw new ApiError(400, "Select soldiers for this mission.");
    const seen = new Set<string>();
    for (const a of input.allocations) {
      if (!Number.isInteger(a.men) || a.men < 10 || a.men % 10)
        throw new ApiError(400, "Assign complete groups of 10 soldiers.");
      const force = context.sheets.Retainers.find(
        (r) =>
          r.retainerId === a.retainerId &&
          r.type === "force" &&
          r.active !== false,
      );
      const roster = JSON.parse(force?.rosterJson || "[]");
      const group = roster.find((g: Row) =>
        a.rosterGroupId
          ? g.rosterGroupId === a.rosterGroupId
          : g.soldierType === a.soldierType,
      );
      if (!force || !group || group.soldierType !== a.soldierType)
        throw new ApiError(
          400,
          "Selected soldiers no longer match the fighting force.",
        );
      const groupKey =
        force.retainerId + "::" + (group.rosterGroupId || group.soldierType);
      if (seen.has(groupKey))
        throw new ApiError(400, "A troop group was selected more than once.");
      seen.add(groupKey);
      const reserved = missions
        .flatMap((m) => JSON.parse(m.allocationsJson || "[]"))
        .filter(
          (r: Row) =>
            r.retainerId === force.retainerId &&
            (r.rosterGroupId && group.rosterGroupId
              ? r.rosterGroupId === group.rosterGroupId
              : r.soldierType === group.soldierType),
        )
        .reduce((s: number, r: Row) => s + r.men, 0);
      if (group.men - (group.missingSerjeants || 0) * 9 - reserved < a.men)
        throw new ApiError(
          409,
          "Not enough uncommitted soldiers are available.",
        );
    }
  }
}
function commandPayload(input: Row) {
  const { sessionToken, accessKey, authPlayer, commandId, ...payload } = input;
  return canonicalJSON(payload);
}
export async function gameMutation(
  db: D1Database,
  player: Row,
  input: Row,
  action: string,
) {
  const char = String(input.characterId || "");
  const mutation = String(
    input.commandId || input.clientMutationId || input.clientMissionId || "",
  );
  if (!mutation || mutation.length > 200)
    throw new ApiError(
      400,
      "A stable command ID is required. Refresh the app and retry.",
    );
  const payloadHash = await hash(commandPayload(input));
  const receipt = await db
    .prepare(
      "SELECT * FROM command_receipts WHERE actor_id=? AND mutation_id=?",
    )
    .bind(player.playerId, mutation)
    .first<Row>();
  if (receipt) {
    if (
      receipt.action !== action ||
      receipt.character_id !== char ||
      receipt.payload_hash !== payloadHash
    )
      throw new ApiError(
        409,
        "This command ID was already used for a different change.",
      );
    return JSON.parse(receipt.response);
  }
  const { context, clock } = await loadGameContext(db, player, char);
  const before = clone(context.sheets);
  const request = { ...clone(input), authPlayer: player };
  validateGameInput(action, request, context);
  let result: Row;
  const extra: D1PreparedStatement[] = [];
  try {
    if (action === "territory.delete") {
      if (player.role !== "dm")
        throw new ApiError(403, "Only the DM can delete territories.");
      const territory = context.sheets.Territories.find(
        (r) => r.territoryId === input.territoryId,
      );
      if (!territory) throw new ApiError(404, "Territory not found.");
      territory.active = false;
      const files = [
        territory.mapFileId,
        territory.poiMapFileId,
        territory.workbookFileId,
      ]
        .filter((id) => typeof id === "string" && id.startsWith("d1:"))
        .map((id) => id.slice(3));
      extra.push(
        db
          .prepare(
            "DELETE FROM media_files WHERE character_id=? AND storage='d1' AND id IN (SELECT value FROM json_each(?))",
          )
          .bind(char, JSON.stringify(files)),
      );
      for (const sheet of ["Scouting Missions", "Custom Missions"])
        for (const row of context.sheets[sheet])
          if (row.territoryId === input.territoryId) row.status = "cancelled";
      result = { ok: true, deletedTerritoryId: territory.territoryId };
    } else if (action === "transaction.create") {
      if (
        !["income", "expense"].includes(input.type) ||
        !String(input.label || "").trim()
      )
        throw new ApiError(400, "Enter a transaction label and type.");
      const transaction: Row = {
        transactionId: crypto.randomUUID(),
        characterId: char,
        timestamp: new Date().toISOString(),
        type: input.type,
        label: String(input.label).trim().slice(0, 160),
        note: String(input.note || "").slice(0, 500),
        clientMutationId: input.clientMutationId || mutation,
        createdBy: player.playerId,
        recurring: false,
      };
      for (const coin of ["pp", "gp", "sp", "cp"])
        transaction[coin] = input.preserveSigns
          ? Number(input[coin] || 0)
          : Math.abs(Number(input[coin] || 0)) *
            (input.type === "expense" ? -1 : 1);
      context.sheets["Wallet Transactions"].push(transaction);
      result = { ok: true, transaction };
    } else if (action === "scouting.notify-start") {
      // Notification only: it never creates or completes a campaign mission.
      if (!player.territoriesEnabled && player.role !== "dm")
        throw new ApiError(403, "Territories are disabled for this account.");
      const territory = context.sheets.Territories.find(
        (r) => r.territoryId === input.territoryId,
      );
      if (!territory) throw new ApiError(404, "Territory not found.");
      context.notifications.push({
        key: `scouting-start:${char}:${String(input.clientMissionId)}`,
        characterId: char,
        event: "scouting",
        data: {
          characterId: char,
          territoryId: input.territoryId,
          hexNumber: input.hexNumber,
          men: (input.allocations || []).reduce(
            (sum: number, row: Row) => sum + row.men,
            0,
          ),
          status: "active",
          missionId: input.clientMissionId,
        },
      });
      result = { ok: true, notificationQueued: true };
    } else result = runGameRules(context, action, request);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof ReferenceError || error instanceof TypeError)
      throw error;
    if (error instanceof Error) throw new ApiError(400, error.message);
    throw error;
  }
  result = normalizeResult(result);
  await commitGame(
    db,
    context,
    before,
    clock,
    char,
    player,
    {
      mutation,
      action,
      payloadHash,
      result,
    },
    extra,
  );
  return result;
}
function normalizeResult(result: Row): Row {
  const normalized = clone(result);
  for (const name of [
    "mission",
    "territory",
    "retainer",
    "schedule",
    "hex",
    "plainsHex",
    "settlementHex",
  ])
    if (normalized[name]) normalized[name] = fromLegacy(normalized[name]);
  if (normalized.affectedRetainers)
    normalized.affectedRetainers = normalized.affectedRetainers.map(fromLegacy);
  return normalized;
}
export async function commitGame(
  db: D1Database,
  context: RuleContext,
  before: Record<string, Row[]>,
  clock: number,
  char: string,
  player: Row,
  receipt?: {
    mutation: string;
    action: string;
    payloadHash: string;
    result: Row;
  },
  extra: D1PreparedStatement[] = [],
) {
  const guard = crypto.randomUUID(),
    now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO transaction_guards(id,valid) VALUES(?,CASE WHEN COALESCE((SELECT revision FROM campaign_clocks WHERE character_id=?),0)=? AND EXISTS(SELECT 1 FROM characters c JOIN players p ON p.id=? WHERE c.id=? AND c.active=1 AND p.active=1 AND p.role=? AND COALESCE(json_extract(p.data,'$.territoriesEnabled'),0)=? AND (p.role='dm' OR c.player_id=p.id)) AND (? IS NULL OR EXISTS(SELECT 1 FROM sessions WHERE token_hash=? AND player_id=? AND expires_at>?)) THEN 1 ELSE 0 END)`,
      )
      .bind(
        guard,
        char,
        clock,
        player.playerId,
        char,
        player.role,
        player.territoriesEnabled ? 1 : 0,
        player.sessionHash || null,
        player.sessionHash || null,
        player.playerId,
        now,
      ),
  ];
  const changedTabs = new Set<string>();
  const recordWrites: Row[] = [],
    territoryWrites: Row[] = [],
    recordDeletes: Row[] = [],
    retainerDeletes: string[] = [];
  for (const [sheet, kindInfo] of Object.entries({
    Territories: ["territory", "territoryId", "territories"],
    ...gameKinds,
  })) {
    const [kind, idField, collection] = kindInfo;
    const old = new Map(
      (before[sheet] || []).map((row) => [row[idField], row]),
    );
    const updated = new Map(
      (context.sheets[sheet] || []).map((row) => [row[idField], row]),
    );
    for (const [id, row] of updated) {
      if (canonicalJSON(old.get(id) || null) === canonicalJSON(row)) continue;
      const data = fromLegacy(row);
      if (data.characterId !== char)
        throw new ApiError(400, "Campaign ownership cannot be changed.");
      // Identity and foreign keys are enforced again at the SQL boundary.
      if (collection) validateRecordFields(collection, data);
      data.updatedAt = now;
      for (const value of [
        ...Object.values(receipt?.result || {}),
        ...Object.values(receipt?.result || {}).flatMap((value) =>
          Array.isArray(value) ? value : [],
        ),
      ])
        if (value && typeof value === "object" && value[idField] === id)
          value.updatedAt = now;
      if (kind === "territory")
        territoryWrites.push({
          id,
          active: data.active === false ? 0 : 1,
          data,
        });
      else
        recordWrites.push({
          kind,
          id,
          territory_id: data.territoryId || null,
          hex_key:
            kind === "hex"
              ? Number.isFinite(Number(data.hexNumber))
                ? String(Number(data.hexNumber))
                : key(data.hexNumber)
              : null,
          mutation_id: data.clientMutationId || null,
          data,
        });
      changedTabs.add(
        ["transaction", "recurring"].includes(kind)
          ? "wallet"
          : kind === "retainer"
            ? "retainers"
            : "territories",
      );
    }
    for (const [id, row] of old)
      if (!updated.has(id)) {
        if (kind === "territory")
          throw new Error("Territories must be soft-deleted.");
        // Keep history for personnel; other records are only removed by an explicit domain operation.
        if (kind === "retainer") retainerDeletes.push(id);
        else recordDeletes.push({ kind, id });
        changedTabs.add(kind === "retainer" ? "retainers" : "territories");
      }
  }
  // Bind JSON sets instead of issuing one SQL statement per hex/mission. This
  // keeps large workbook imports and catch-up jobs within D1 query limits.
  if (
    [
      JSON.stringify(recordWrites),
      JSON.stringify(territoryWrites),
      JSON.stringify(receipt?.result || {}),
    ].some((value) => new TextEncoder().encode(value).length > 1500000)
  )
    throw new ApiError(
      413,
      "This campaign update is too large to save in one operation. Reduce long notes or workbook detail fields and retry.",
    );
  if (territoryWrites.length)
    statements.push(
      db
        .prepare(
          "INSERT INTO territories(id,character_id,active,data) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.active'),json_extract(value,'$.data') FROM json_each(?) WHERE 1 ON CONFLICT(id) DO UPDATE SET active=excluded.active,data=excluded.data WHERE territories.character_id=excluded.character_id",
        )
        .bind(char, JSON.stringify(territoryWrites)),
    );
  if (recordWrites.length)
    statements.push(
      db
        .prepare(
          "INSERT INTO records(kind,id,character_id,territory_id,hex_key,mutation_id,updated_at,data) SELECT json_extract(value,'$.kind'),json_extract(value,'$.id'),?,json_extract(value,'$.territory_id'),json_extract(value,'$.hex_key'),json_extract(value,'$.mutation_id'),?,json_extract(value,'$.data') FROM json_each(?) WHERE 1 ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE records.character_id=excluded.character_id",
        )
        .bind(char, now, JSON.stringify(recordWrites)),
    );
  if (retainerDeletes.length)
    statements.push(
      db
        .prepare(
          "UPDATE records SET data=json_set(data,'$.active',json('false'),'$.updatedAt',?),updated_at=? WHERE character_id=? AND kind='retainer' AND id IN(SELECT value FROM json_each(?))",
        )
        .bind(now, now, char, JSON.stringify(retainerDeletes)),
    );
  if (recordDeletes.length)
    statements.push(
      db
        .prepare(
          "DELETE FROM records WHERE character_id=? AND EXISTS(SELECT 1 FROM json_each(?) WHERE json_extract(value,'$.kind')=records.kind AND json_extract(value,'$.id')=records.id)",
        )
        .bind(char, JSON.stringify(recordDeletes)),
    );
  for (const notification of context.notifications)
    statements.push(
      db
        .prepare(
          "INSERT INTO notification_outbox(id,character_id,event,data,next_attempt_at,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          notification.key,
          char,
          notification.event,
          JSON.stringify(notification.data),
          now,
          now,
        ),
    );
  statements.push(...extra);
  for (const tab of changedTabs)
    statements.push(
      db
        .prepare(
          "INSERT INTO revisions(character_id,tab,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(character_id,tab) DO UPDATE SET revision=revision+1,updated_at=excluded.updated_at",
        )
        .bind(char, tab, now),
    );
  if (receipt)
    statements.push(
      db
        .prepare(
          "INSERT INTO command_receipts(actor_id,mutation_id,action,character_id,payload_hash,response,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          player.playerId,
          receipt.mutation,
          receipt.action,
          char,
          receipt.payloadHash,
          JSON.stringify(receipt.result),
          now,
        ),
    );
  statements.push(
    db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
  );
  try {
    await db.batch(statements);
    return true;
  } catch (error) {
    // A competing copy of the same command may have won the transaction.
    if (receipt) {
      const saved = await db
        .prepare(
          "SELECT action,character_id,payload_hash,response FROM command_receipts WHERE actor_id=? AND mutation_id=?",
        )
        .bind(player.playerId, receipt.mutation)
        .first<Row>();
      if (
        saved &&
        saved.action === receipt.action &&
        saved.character_id === char &&
        saved.payload_hash === receipt.payloadHash
      ) {
        Object.assign(receipt.result, JSON.parse(saved.response));
        return false;
      }
    }
    if ((await readClock(db, char)) !== clock)
      throw new ApiError(
        409,
        "Campaign data changed on another device. Refresh and retry; this change was not applied.",
      );
    throw error;
  }
}
