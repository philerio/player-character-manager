import { AppError } from "./errors";
function invalid(): never {
  throw new AppError(
    "validation",
    "The campaign returned incomplete or invalid data. The existing working copy was kept. Retry or contact the DM.",
  );
}
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, any>;
}
function text(value: unknown) {
  if (typeof value !== "string" || !value.trim()) invalid();
}
function number(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid();
}
const identifiers: Record<string, string> = {
  characters: "characterId",
  players: "playerId",
  retainers: "retainerId",
  territories: "territoryId",
  territoryHexes: "hexId",
  scoutingMissions: "missionId",
  customMissions: "missionId",
  journal: "entryId",
  transactions: "transactionId",
  recurringExpenses: "scheduleId",
};
function rows(
  data: Record<string, any>,
  name: string,
  characterId?: string,
  optional = false,
) {
  if (optional && data[name] === undefined) return;
  if (!Array.isArray(data[name])) invalid();
  const ids = new Set<string>();
  for (const value of data[name]) {
    const row = object(value);
    text(row[identifiers[name]]);
    if (ids.has(row[identifiers[name]])) invalid();
    ids.add(row[identifiers[name]]);
    if (characterId && row.characterId !== characterId) invalid();
    if (["characters", "players", "retainers", "territories"].includes(name))
      text(row[name === "players" ? "displayName" : "name"]);
    if (name === "characters") {
      text(row.playerId);
      text(row.class);
      number(row.level);
    }
    if (name === "retainers") {
      if (!["force", "individual"].includes(row.type)) invalid();
      number(row.wageGp);
    }
    if (name === "transactions" || name === "recurringExpenses")
      for (const coin of ["pp", "gp", "sp", "cp"]) number(row[coin]);
    if (name === "journal") {
      text(row.title);
      if (typeof row.notes !== "string") invalid();
    }
  }
}
export function validateResponse(
  action: string,
  input: unknown,
  requestedCharacterId?: string,
): void {
  const data = object(input);
  if (typeof data.ok !== "boolean") invalid();
  if (!data.ok) return;
  if (
    [
      "bootstrap",
      "territory-status",
      "journal-status",
      "retainer-status",
      "wallet",
    ].includes(action)
  ) {
    const id =
      action === "bootstrap" ? data.selectedCharacterId : data.characterId;
    if (requestedCharacterId && id !== requestedCharacterId) invalid();
    if (action === "bootstrap") {
      rows(data, "characters");
      rows(data, "players");
      text(object(data.currentPlayer).playerId);
      if (typeof data.selectedCharacterId !== "string") invalid();
      if (
        data.characters.length &&
        !data.characters.some((c: any) => c.characterId === id)
      )
        invalid();
      for (const key of [
        "isDm",
        "territories",
        "retainers",
        "playerManagement",
      ])
        if (typeof object(data.permissions)[key] !== "boolean") invalid();
    } else text(id);
    const required =
      action === "bootstrap"
        ? [
            "transactions",
            "recurringExpenses",
            "retainers",
            "territories",
            "territoryHexes",
            "scoutingMissions",
            "journal",
          ]
        : action === "territory-status"
          ? ["retainers", "territories", "territoryHexes", "scoutingMissions"]
          : action === "retainer-status"
            ? ["retainers"]
            : action === "journal-status"
              ? ["journal"]
              : ["transactions", "recurringExpenses"];
    for (const name of required) rows(data, name, id || undefined);
    if (action === "bootstrap" || action === "territory-status")
      rows(data, "customMissions", id || undefined, true);
    if (action === "bootstrap" || action === "wallet")
      for (const coin of ["pp", "gp", "sp", "cp"])
        number(object(data.balance)[coin]);
  } else if (action === "account-roster" || action === "player-roster") {
    rows(data, "characters");
    rows(data, "players");
    text(object(data.currentPlayer).playerId);
  } else if (action === "auth.options") {
    if (!Array.isArray(data.players)) invalid();
    for (const row of data.players) {
      text(object(row).playerId);
      text(row.displayName);
    }
  } else if (action === "sync-revisions") {
    for (const tab of ["wallet", "journal", "retainers", "territories"]) {
      const value = object(data.revisions)[tab];
      number(value);
      if (value < 0 || !Number.isInteger(value)) invalid();
    }
  }
  // Mutation acknowledgements must contain their promised record before a draft is acknowledged.
  const records: Record<string, [string, string]> = {
    "retainer.create": ["retainer", "retainerId"],
    "retainer.update": ["retainer", "retainerId"],
    "territory.hex.upsert": ["hex", "hexId"],
    "territory.fields.update": ["hex", "hexId"],
    "scouting.start": ["mission", "missionId"],
    "mission.custom.create": ["mission", "missionId"],
    "journal.create": ["entry", "entryId"],
    "journal.update": ["entry", "entryId"],
  };
  if (records[action]) {
    const [key, field] = records[action];
    const record = object(data[key]);
    text(record[field]);
    if (requestedCharacterId && record.characterId !== requestedCharacterId)
      invalid();
    if (key === "retainer")
      rows({ retainers: [record] }, "retainers", requestedCharacterId);
  }
}
export function validateWalletBackup(
  transactions: unknown,
  schedules: unknown,
  characterId: string,
) {
  if (!Array.isArray(transactions) || !Array.isArray(schedules)) invalid();
  const seen = new Set<string>();
  for (const value of transactions) {
    const row = object(value);
    number(row.id);
    const id = row.transactionId ?? String(row.id);
    text(id);
    if (seen.has(id)) invalid();
    seen.add(id);
    if (!["income", "expense"].includes(row.kind)) invalid();
    text(row.label);
    for (const coin of ["pp", "gp", "sp", "cp"])
      number(object(row.coins)[coin]);
  }
  rows({ recurringExpenses: schedules }, "recurringExpenses", characterId);
}
