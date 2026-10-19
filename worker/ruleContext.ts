import { ApiError } from "./errors";
export type Row = Record<string, any>;
export type RuleContext = {
  sheets: Record<string, Row[]>;
  player: Row;
  timeZone: string;
  notifications: Array<{
    key: string;
    characterId: string;
    event: string;
    data: Row;
  }>;
  webhook: string;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const columns: Record<string, string[]> = {
  "Recurring Expenses":
    "scheduleId characterId label pp gp sp cp note frequency startDate occurrenceCount active createdAt createdBy sourceType sourceId delinquentSince".split(
      " ",
    ),
};
/** In-memory storage adapter for the synchronous, existing campaign calculations. */
export function createRuleContext(context: RuleContext) {
  const rows = (sheet: string) => (context.sheets[sheet] ||= []);
  const rowsAsObjects_ = (sheet: string): Row[] => clone(rows(sheet));
  const updateObjectById_ = (
    sheet: string,
    field: string,
    id: string,
    patch: Row,
  ) => {
    const row = rows(sheet).find((row) => String(row[field]) === String(id));
    if (!row) throw new ApiError(404, "The campaign record no longer exists.");
    Object.assign(row, clone(patch));
  };
  const requireDm_ = (player: Row) => {
    if (player.role !== "dm")
      throw new ApiError(403, "Only the DM can perform this action.");
  };
  const requireCharacterAccess_ = (player: Row, id: string) => {
    const row = rows("Characters").find(
      (r) => r.characterId === id && r.active !== false,
    );
    if (!row || (player.role !== "dm" && row.playerId !== player.playerId))
      throw new ApiError(403, "Access denied.");
    return clone(row);
  };
  const requireTerritoryAccess_ = (player: Row, id: string) => {
    const character = requireCharacterAccess_(player, id);
    if (player.role !== "dm" && !player.territoriesEnabled)
      throw new ApiError(403, "Territories are disabled for this account.");
    return character;
  };
  const formatDate = (date: Date, timeZone: string, pattern: string) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    );
    if (pattern === "M") return String(Number(parts.month));
    if (pattern === "yyyy-MM") return `${parts.year}-${parts.month}`;
    if (pattern === "yyyy-MM-dd")
      return `${parts.year}-${parts.month}-${parts.day}`;
    throw new Error("Unsupported campaign calendar format.");
  };
  const getSheet_ = (sheet: string) => {
    const headers = [
      ...new Set([
        ...(columns[sheet] || []),
        ...rows(sheet).flatMap(Object.keys),
      ]),
    ];
    const values = () => [
      headers,
      ...rows(sheet).map((row) => headers.map((key) => row[key] ?? "")),
    ];
    const range = (row: number, col: number, height = 1, width = 1) => ({
      getValues: () =>
        values()
          .slice(row - 1, row - 1 + height)
          .map((cells) => cells.slice(col - 1, col - 1 + width)),
      setValue: (value: unknown) => {
        if (row < 2 || !headers[col - 1] || !rows(sheet)[row - 2])
          throw new Error("Invalid rule storage update.");
        rows(sheet)[row - 2][headers[col - 1]] = clone(value);
      },
    });
    return {
      getLastRow: () => rows(sheet).length + 1,
      getLastColumn: () => headers.length,
      getRange: range,
      getDataRange: () => ({ getValues: values }),
    };
  };
  const calendarMidnight = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new ApiError(400, "Choose a valid calendar date.");
    const midnight = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    if (new Date(midnight).toISOString().slice(0, 10) !== value)
      throw new ApiError(400, "Choose a valid calendar date.");
    let instant = midnight;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: context.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(instant))
          .map((p) => [p.type, p.value]),
      );
      const wall = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      instant += midnight - wall;
    }
    return new Date(instant);
  };
  const enqueue = (event: string, mission: Row) => {
    context.notifications.push({
      key: `${event}:${mission.missionId}`,
      characterId: mission.characterId,
      event,
      data: clone(mission),
    });
  };
  return {
    rowsAsObjects_,
    getSheet_,
    updateObjectById_,
    requireCharacterAccess_,
    requireTerritoryAccess_,
    requireDm_,
    requireRetainerAccess_: requireCharacterAccess_,
    filterByCharacter_: (sheet: string, id: string) =>
      rowsAsObjects_(sheet).filter((row) => row.characterId === id),
    appendObject_: (sheet: string, row: Row) => rows(sheet).push(clone(row)),
    deleteRowsByValue_: (sheet: string, field: string, id: string) => {
      context.sheets[sheet] = rows(sheet).filter(
        (row) => String(row[field]) !== String(id),
      );
    },
    withLock_: <T>(fn: () => T) => fn(),
    getDiscordWebhookForPlayer_: () => context.webhook,
    sendScoutingMissionDiscord_: (_territory: Row, mission: Row) =>
      enqueue("scouting", mission),
    sendCustomMissionDiscord_: (mission: Row) => enqueue("custom", mission),
    // These schedules and personnel costs are managed on the device. Never
    // charge an imported, potentially stale campaign ledger in a background job.
    processRecurringExpensesUnlocked_: () => {},
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate,
      calendarMidnight,
    },
    Session: { getScriptTimeZone: () => context.timeZone },
  };
}
