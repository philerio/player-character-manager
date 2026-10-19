/** Record field rules shared by frontend response validation and the Node importer. */
function receivedType(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string") return value.trim() ? "text" : "blank text";
  if (typeof value === "number" && !Number.isFinite(value))
    return "non-finite number";
  return Array.isArray(value) ? "array" : typeof value;
}
export class RecordFieldError extends Error {
  constructor(path, expected, value) {
    super(`${path}: expected ${expected}`);
    this.path = path;
    this.expected = expected;
    this.received = receivedType(value);
  }
}
function invalid(path, expected, value) {
  throw new RecordFieldError(path, expected, value);
}
function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path, "an object", value);
  return value;
}
function text(value, path) {
  if (typeof value !== "string" || !value.trim())
    invalid(path, "non-empty text", value);
}
function string(value, path) {
  if (typeof value !== "string") invalid(path, "text", value);
}
function number(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value))
    invalid(path, "a finite number", value);
}
function boolean(value, path) {
  if (typeof value !== "boolean") invalid(path, "a boolean", value);
}
function count(value, path) {
  number(value, path);
  if (!Number.isSafeInteger(value) || value < 0)
    invalid(path, "a non-negative safe integer", value);
}
function oneOf(value, allowed, path) {
  if (!allowed.includes(value))
    invalid(path, `one of: ${allowed.join(", ")}`, value);
}
export function validateRecordFields(name, row, rowPath = "record") {
  if (["characters", "players", "retainers", "territories"].includes(name)) {
    const field = name === "players" ? "displayName" : "name";
    text(row[field], `${rowPath}.${field}`);
  }
  if (name !== "characters" && name !== "players")
    text(row.characterId, `${rowPath}.characterId`);
  if (name === "players") {
    oneOf(row.role, ["dm", "player"], `${rowPath}.role`);
    for (const field of ["active", "territoriesEnabled", "retainersEnabled"])
      boolean(row[field], `${rowPath}.${field}`);
  }
  if (name === "characters") {
    if (row.version !== undefined) {
      count(row.version, `${rowPath}.version`);
      if (row.version < 1)
        invalid(`${rowPath}.version`, "a positive version", row.version);
    }
    text(row.playerId, `${rowPath}.playerId`);
    text(row.class, `${rowPath}.class`);
    number(row.level, `${rowPath}.level`);
  }
  if (name === "retainers") {
    oneOf(row.type, ["force", "individual"], `${rowPath}.type`);
    number(row.wageGp, `${rowPath}.wageGp`);
    string(row.role, `${rowPath}.role`);
    oneOf(row.costCoin, ["pp", "gp", "sp", "cp"], `${rowPath}.costCoin`);
    oneOf(
      row.wageFrequency,
      ["weekly", "monthly", "annually"],
      `${rowPath}.wageFrequency`,
    );
    text(row.createdAt, `${rowPath}.createdAt`);
  }
  if (name === "transactions" || name === "recurringExpenses")
    for (const coin of ["pp", "gp", "sp", "cp"])
      number(row[coin], `${rowPath}.${coin}`);
  if (name === "transactions") {
    oneOf(row.type, ["income", "expense"], `${rowPath}.type`);
    text(row.label, `${rowPath}.label`);
    text(row.timestamp, `${rowPath}.timestamp`);
  }
  if (name === "recurringExpenses") {
    text(row.label, `${rowPath}.label`);
    text(row.startDate, `${rowPath}.startDate`);
    count(row.occurrenceCount, `${rowPath}.occurrenceCount`);
    boolean(row.active, `${rowPath}.active`);
    oneOf(
      row.frequency,
      ["weekly", "monthly", "annually"],
      `${rowPath}.frequency`,
    );
  }
  if (name === "territories") {
    boolean(row.active, `${rowPath}.active`);
    text(row.createdAt, `${rowPath}.createdAt`);
  }
  if (["territoryHexes", "scoutingMissions", "customMissions"].includes(name))
    text(row.territoryId, `${rowPath}.territoryId`);
  if (name === "territoryHexes") {
    text(row.hexNumber, `${rowPath}.hexNumber`);
    number(row.mapX, `${rowPath}.mapX`);
    number(row.mapY, `${rowPath}.mapY`);
    text(row.createdAt, `${rowPath}.createdAt`);
    for (const key of ["dmRevealed", "isDiscovered"])
      if (row[key] !== undefined) boolean(row[key], `${rowPath}.${key}`);
  }
  if (["scoutingMissions", "customMissions"].includes(name)) {
    if (!Array.isArray(row.allocations))
      invalid(`${rowPath}.allocations`, "an array", row.allocations);
    for (const [allocationIndex, allocation] of row.allocations.entries()) {
      const allocationPath = `${rowPath}.allocations[${allocationIndex}]`;
      const item = object(allocation, allocationPath);
      text(item.retainerId, `${allocationPath}.retainerId`);
      text(item.soldierType, `${allocationPath}.soldierType`);
      count(item.men, `${allocationPath}.men`);
    }
    count(row.men, `${rowPath}.men`);
    if (name === "scoutingMissions") {
      text(row.hexNumber, `${rowPath}.hexNumber`);
      number(row.mapX, `${rowPath}.mapX`);
      number(row.mapY, `${rowPath}.mapY`);
      oneOf(
        row.status,
        ["active", "completed", "failed", "cancelled"],
        `${rowPath}.status`,
      );
    } else {
      text(row.objective, `${rowPath}.objective`);
      text(row.missionLocation, `${rowPath}.missionLocation`);
      text(row.startDate, `${rowPath}.startDate`);
      number(row.durationDays, `${rowPath}.durationDays`);
      oneOf(
        row.status,
        ["scheduled", "active", "completed", "cancelled"],
        `${rowPath}.status`,
      );
    }
  }
  if (name === "journal") {
    text(row.title, `${rowPath}.title`);
    string(row.notes, `${rowPath}.notes`);
    string(row.category, `${rowPath}.category`);
    text(row.playerId, `${rowPath}.playerId`);
    text(row.createdAt, `${rowPath}.createdAt`);
    text(row.updatedAt, `${rowPath}.updatedAt`);
  }
}

/** Browser ledger shape, distinct from Wallet Transactions sheet rows. */
export function validateWalletBackupFields(
  transactions,
  schedules,
  characterId,
) {
  if (!Array.isArray(transactions))
    invalid("transactions", "an array", transactions);
  if (!Array.isArray(schedules))
    invalid("recurringExpenses", "an array", schedules);
  if (transactions.length > 5000)
    invalid("transactions", "at most 5000 transactions", transactions);
  if (schedules.length > 1000)
    invalid("recurringExpenses", "at most 1000 recurring expenses", schedules);
  const seen = new Set(),
    localIds = new Set();
  const totals = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const [index, value] of transactions.entries()) {
    const path = `transactions[${index}]`;
    let id;
    try {
      const row = object(value, path);
      number(row.id, `${path}.id`);
      if (row.characterId !== undefined && row.characterId !== characterId)
        invalid(
          `${path}.characterId`,
          "the requested character ID",
          row.characterId,
        );
      id = row.transactionId ?? String(row.id);
      text(id, `${path}.transactionId`);
      if (seen.has(id))
        invalid(`${path}.transactionId`, "a unique transaction ID", id);
      if (localIds.has(row.id))
        invalid(`${path}.id`, "a unique local transaction ID", row.id);
      seen.add(id);
      localIds.add(row.id);
      oneOf(row.kind, ["income", "expense"], `${path}.kind`);
      text(row.label, `${path}.label`);
      for (const field of ["note", "timestamp"])
        if (row[field] !== undefined) string(row[field], `${path}.${field}`);
      for (const coin of ["pp", "gp", "sp", "cp"]) {
        const coins = object(row.coins, `${path}.coins`);
        number(coins[coin], `${path}.coins.${coin}`);
        totals[coin] += coins[coin];
        number(totals[coin], `${path}.coins.${coin}`);
      }
    } catch (error) {
      if (error instanceof RecordFieldError)
        Object.assign(error, {
          collection: "transactions",
          recordIndex: index + 1,
          recordId: typeof id === "string" ? id : undefined,
        });
      throw error;
    }
  }
  const scheduleIds = new Set();
  for (const [index, value] of schedules.entries()) {
    const path = `recurringExpenses[${index}]`;
    try {
      const row = object(value, path);
      text(row.scheduleId, `${path}.scheduleId`);
      if (scheduleIds.has(row.scheduleId))
        invalid(`${path}.scheduleId`, "a unique record ID", row.scheduleId);
      scheduleIds.add(row.scheduleId);
      if (row.characterId !== characterId)
        invalid(
          `${path}.characterId`,
          "the requested character ID",
          row.characterId,
        );
      validateRecordFields("recurringExpenses", row, path);
      if (row.note !== undefined) string(row.note, `${path}.note`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(row.startDate) ||
        !Number.isFinite(Date.parse(row.startDate + "T00:00:00Z")) ||
        new Date(row.startDate + "T00:00:00Z").toISOString().slice(0, 10) !==
          row.startDate
      )
        invalid(
          `${path}.startDate`,
          "a valid calendar date (YYYY-MM-DD)",
          row.startDate,
        );
    } catch (error) {
      if (error instanceof RecordFieldError)
        Object.assign(error, {
          collection: "recurringExpenses",
          recordIndex: index + 1,
          recordId:
            typeof value?.scheduleId === "string"
              ? value.scheduleId
              : undefined,
        });
      throw error;
    }
  }
}
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
