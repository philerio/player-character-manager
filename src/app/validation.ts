import { AppError, type DataIssue } from "./errors";
import { territoryHexKey } from "./territoryRules";
let recordContext: Partial<DataIssue> = {};
function receivedType(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string") return value.trim() ? "text" : "blank text";
  if (typeof value === "number" && !Number.isFinite(value))
    return "non-finite number";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function invalid(
  path = "response",
  expected = "valid campaign data",
  value?: unknown,
): never {
  throw new AppError(
    "validation",
    "The campaign returned incomplete or invalid data. The existing working copy was kept. Retry or contact the DM.",
    false,
    { ...recordContext, path, expected, received: receivedType(value) },
  );
}
function object(value: unknown, path = "response"): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path, "an object", value);
  return value as Record<string, any>;
}
function text(value: unknown, path = "response") {
  if (typeof value !== "string" || !value.trim())
    invalid(path, "non-empty text", value);
}
function number(value: unknown, path = "response") {
  if (typeof value !== "number" || !Number.isFinite(value))
    invalid(path, "a finite number", value);
}
function oneOf(value: unknown, allowed: readonly string[], path: string) {
  if (!allowed.includes(value as string))
    invalid(path, `one of: ${allowed.join(", ")}`, value);
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
  path = name,
  single = false,
) {
  if (optional && data[name] === undefined) return;
  if (!Array.isArray(data[name])) invalid(path, "an array", data[name]);
  const ids = new Set<string>();
  for (const [index, value] of data[name].entries()) {
    const rowPath = single ? path : `${path}[${index}]`;
    const previous = recordContext;
    recordContext = {
      collection: name,
      recordIndex: single ? undefined : index + 1,
    };
    try {
      const row = object(value, rowPath);
      const idField = identifiers[name];
      text(row[idField], `${rowPath}.${idField}`);
      recordContext.recordId = row[idField];
      if (ids.has(row[idField]))
        invalid(`${rowPath}.${idField}`, "a unique record ID", row[idField]);
      ids.add(row[idField]);
      if (characterId && row.characterId !== characterId)
        invalid(
          `${rowPath}.characterId`,
          "the requested character ID",
          row.characterId,
        );
      if (
        ["characters", "players", "retainers", "territories"].includes(name)
      ) {
        const field = name === "players" ? "displayName" : "name";
        text(row[field], `${rowPath}.${field}`);
      }
      if (name !== "characters" && name !== "players")
        text(row.characterId, `${rowPath}.characterId`);
      if (name === "players") {
        oneOf(row.role, ["dm", "player"], `${rowPath}.role`);
        for (const field of [
          "active",
          "territoriesEnabled",
          "retainersEnabled",
        ])
          boolean(row[field], `${rowPath}.${field}`);
      }
      if (name === "characters") {
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
      if (
        ["territoryHexes", "scoutingMissions", "customMissions"].includes(name)
      )
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
    } finally {
      recordContext = previous;
    }
  }
}
/** Sheets may coerce hex labels to numbers and checkbox values to text.
 * Normalize only recognized representations; never infer discovery from row existence.
 */
export function normalizeSheetResponse(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const data = input as Record<string, unknown>;
  let changed = false;
  const normalize = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const row = value as Record<string, unknown>;
    if (typeof row.hexNumber === "number" && Number.isFinite(row.hexNumber)) {
      row.hexNumber = String(row.hexNumber);
      changed = true;
    }
    for (const key of ["dmRevealed", "isDiscovered"]) {
      const flag = row[key];
      // Apps Script returns unset spreadsheet checkbox cells as empty strings.
      if (flag === "" || flag === 0 || flag === 1) {
        row[key] = flag === 1;
        changed = true;
      } else if (
        typeof flag === "string" &&
        /^(true|false)$/i.test(flag.trim())
      ) {
        row[key] = flag.trim().toLowerCase() === "true";
        changed = true;
      }
    }
  };
  for (const key of [
    "territories",
    "managedTerritories",
    "territoryHexes",
    "hexes",
    "scoutingMissions",
  ])
    if (Array.isArray(data[key])) for (const row of data[key]) normalize(row);
  for (const key of [
    "territory",
    "hex",
    "plainsHex",
    "settlementHex",
    "mission",
  ])
    normalize(data[key]);
  return changed;
}
export function validateResponse(
  action: string,
  input: unknown,
  requestedCharacterId?: string,
  request: Record<string, unknown> = {},
): void {
  const data = object(input);
  if (typeof data.ok !== "boolean") invalid("ok", "a boolean", data.ok);
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
    if (requestedCharacterId && id !== requestedCharacterId)
      invalid(
        action === "bootstrap" ? "selectedCharacterId" : "characterId",
        "the requested character ID",
        id,
      );
    if (action === "bootstrap") {
      rows(data, "characters");
      rows(data, "players");
      text(
        object(data.currentPlayer, "currentPlayer").playerId,
        "currentPlayer" + ".playerId",
      );
      if (typeof data.selectedCharacterId !== "string")
        invalid("selectedCharacterId", "text", data.selectedCharacterId);
      if (
        data.characters.length &&
        !data.characters.some((c: any) => c.characterId === id)
      )
        invalid("selectedCharacterId", "a character in the roster", id);
      for (const key of [
        "isDm",
        "territories",
        "retainers",
        "playerManagement",
      ])
        if (typeof object(data.permissions, "permissions")[key] !== "boolean")
          invalid(`permissions.${key}`, "a boolean", data.permissions[key]);
    } else text(id, "characterId");
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
        number(object(data.balance, "balance")[coin], "balance" + "." + coin);
  } else if (action === "account-roster" || action === "player-roster") {
    rows(data, "characters");
    rows(data, "players");
    text(
      object(data.currentPlayer, "currentPlayer").playerId,
      "currentPlayer" + ".playerId",
    );
  } else if (action === "auth.options") {
    if (!Array.isArray(data.players))
      invalid("players", "an array", data.players);
    for (const [index, row] of data.players.entries()) {
      const rowPath = `players[${index}]`;
      text(object(row, rowPath).playerId, rowPath + ".playerId");
      text(row.displayName, rowPath + ".displayName");
    }
  } else if (action === "sync-revisions") {
    for (const tab of ["wallet", "journal", "retainers", "territories"]) {
      const value = object(data.revisions, "revisions")[tab];
      count(value, `revisions.${tab}`);
    }
  }
  validateActionResult(action, data, requestedCharacterId, request);
}
// Validate the data each API method promises before callers change local state.
const mutationRecords: Record<string, Array<[string, string, string?]>> = {
  "character.create": [["character", "characters"]],
  "character.update": [["character", "characters", "characterId"]],
  "character.portrait.upload": [["character", "characters", "characterId"]],
  "character.portrait.delete": [["character", "characters", "characterId"]],
  "discord.thread.update": [["character", "characters", "characterId"]],
  "player.access.update": [["player", "players", "targetPlayerId"]],
  "transaction.create": [["transaction", "transactions"]],
  "recurring.create": [["schedule", "recurringExpenses"]],
  "recurring.update": [["schedule", "recurringExpenses", "scheduleId"]],
  "retainer.create": [["retainer", "retainers"]],
  "retainer.update": [["retainer", "retainers", "retainerId"]],
  "territory.create": [["territory", "territories"]],
  "territory.update": [["territory", "territories", "territoryId"]],
  "territory.tithe.update": [["territory", "territories", "territoryId"]],
  "territory.management.update": [["territory", "territories", "territoryId"]],
  "territory.map.upload": [["territory", "territories", "territoryId"]],
  "territory.poi-map.upload": [["territory", "territories", "territoryId"]],
  "territory.workbook.import": [["territory", "territories", "territoryId"]],
  "territory.hex.upsert": [["hex", "territoryHexes"]],
  "territory.fields.update": [["hex", "territoryHexes", "hexId"]],
  "territory.fields.expand": [
    ["hex", "territoryHexes", "hexId"],
    ["transaction", "transactions"],
  ],
  "territory.farmland.start": [
    ["plainsHex", "territoryHexes", "plainsHexId"],
    ["settlementHex", "territoryHexes", "settlementHexId"],
    ["transaction", "transactions"],
  ],
  "scouting.start": [["mission", "scoutingMissions"]],
  "scouting.complete-due": [["mission", "scoutingMissions", "missionId"]],
  "scouting.complete-test": [["mission", "scoutingMissions", "missionId"]],
  "scouting.view-results": [["mission", "scoutingMissions", "missionId"]],
  "scouting.dismiss": [["mission", "scoutingMissions", "missionId"]],
  "scouting.promote-serjeants": [
    ["mission", "scoutingMissions", "missionId"],
    ["transaction", "transactions"],
  ],
  "mission.custom.create": [["mission", "customMissions"]],
  "journal.create": [["entry", "journal"]],
  "journal.update": [["entry", "journal", "entryId"]],
  "territory.recruitment.complete": [
    ["retainer", "retainers"],
    ["schedule", "recurringExpenses"],
    ["transaction", "transactions"],
  ],
};
const deletionIds: Record<string, [string, string]> = {
  "character.delete": ["deletedCharacterId", "characterId"],
  "transaction.delete": ["transactionId", "transactionId"],
  "recurring.cancel": ["scheduleId", "scheduleId"],
  "retainer.delete": ["retainerId", "retainerId"],
  "territory.delete": ["deletedTerritoryId", "territoryId"],
  "journal.delete": ["deletedEntryId", "entryId"],
};
function match(value: unknown, expected: unknown, path = "response") {
  if (expected !== undefined && value !== expected)
    invalid(path, "a value matching the requested record", value);
}
function string(value: unknown, path = "response") {
  if (typeof value !== "string") invalid(path, "text", value);
}
function boolean(value: unknown, path = "response") {
  if (typeof value !== "boolean") invalid(path, "a boolean", value);
}
function count(value: unknown, path = "response") {
  number(value, path);
  if ((value as number) < 0 || !Number.isSafeInteger(value))
    invalid(path, "a non-negative safe integer", value);
}
function roster(data: Record<string, any>, optionalLists = false) {
  rows(
    { players: [object(data.currentPlayer, "currentPlayer")] },
    "players",
    undefined,
    false,
    "currentPlayer",
    true,
  );
  rows(data, "players", undefined, optionalLists);
  rows(data, "characters", undefined, optionalLists);
}
function validateActionResult(
  action: string,
  data: Record<string, any>,
  characterId: string | undefined,
  request: Record<string, unknown>,
) {
  for (const [key, collection, expectedId] of mutationRecords[action] || []) {
    const previous = recordContext;
    recordContext = {
      collection,
      recordId:
        typeof data[key]?.[identifiers[collection]] === "string"
          ? data[key][identifiers[collection]]
          : undefined,
    };
    try {
      const record = object(data[key], key);
      // Character rows identify themselves by characterId; player records have no characterId.
      rows(
        { [collection]: [record] },
        collection,
        collection === "characters" || collection === "players"
          ? undefined
          : characterId,
        false,
        key,
        true,
      );
      if (expectedId)
        match(
          record[identifiers[collection]],
          request[expectedId],
          key + "." + identifiers[collection],
        );
      if (
        request.territoryId !== undefined &&
        ["territoryHexes", "scoutingMissions", "customMissions"].includes(
          collection,
        )
      )
        match(record.territoryId, request.territoryId, key + ".territoryId");
      if (action === "territory.hex.upsert") {
        if (
          request.hexNumber !== undefined &&
          territoryHexKey(record.hexNumber) !==
            territoryHexKey(request.hexNumber)
        )
          invalid(
            `${key}.hexNumber`,
            "the requested hex number",
            record.hexNumber,
          );
        for (const field of ["mapX", "mapY"]) {
          if (
            request[field] !== undefined &&
            (typeof request[field] !== "number" ||
              Math.abs(record[field] - (request[field] as number)) > 0.000001)
          )
            invalid(
              `${key}.${field}`,
              "the requested map coordinate",
              record[field],
            );
        }
      }
      if (
        action.endsWith(".create") &&
        request.clientMutationId !== undefined &&
        record.clientMutationId !== undefined
      )
        match(
          record.clientMutationId,
          request.clientMutationId,
          key + ".clientMutationId",
        );
    } finally {
      recordContext = previous;
    }
  }
  if (deletionIds[action]) {
    const [field, requested] = deletionIds[action];
    text(data[field], String(field));
    match(data[field], request[requested], String(field));
  }
  if (action === "auth.login") {
    boolean(data.mustChangePassword, "mustChangePassword");
    if (data.mustChangePassword)
      text(data.passwordChangeToken, "passwordChangeToken");
    else {
      text(data.sessionToken, "sessionToken");
      roster(data, true);
      match(
        data.currentPlayer.playerId,
        request.playerId,
        "currentPlayer" + ".playerId",
      );
    }
  } else if (action === "auth.password.change") {
    text(data.sessionToken, "sessionToken");
    roster(data);
  } else if (action === "auth.register") {
    if (data.mustChangePassword !== true)
      invalid(
        "mustChangePassword",
        "true for initial registration",
        data.mustChangePassword,
      );
    text(data.passwordChangeToken, "passwordChangeToken");
  } else if (action === "auth.recovery.question") {
    text(data.recoveryQuestion, "recoveryQuestion");
  } else if (
    action === "wallet.backup.load" ||
    action === "wallet.backup.save"
  ) {
    text(data.characterId, "characterId");
    match(data.characterId, characterId, "characterId");
    text(data.backedUpAt, "backedUpAt");
    if (action.endsWith("load"))
      validateWalletBackup(
        data.transactions,
        data.recurringExpenses,
        data.characterId,
      );
    else {
      count(data.transactionCount, "transactionCount");
      count(data.recurringExpenseCount, "recurringExpenseCount");
    }
  } else if (action === "tab.push") {
    oneOf(data.tab, ["wallet", "journal", "retainers", "territories"], "tab");
    match(data.tab, request.tab, "tab");
    count(data.revision, "revision");
    text(data.updatedAt, "updatedAt");
  } else if (action === "campaign.update") {
    text(data.campaignName, "campaignName");
  } else if (action === "discord.webhook.update") {
    boolean(data.configured, "configured");
  } else if (action === "journal.discord.send") {
    count(data.messagesSent, "messagesSent");
  } else if (action === "territory.recruitment.reset") {
    count(data.resetCount, "resetCount");
  }
  if (["retainer.create", "retainer.update"].includes(action)) {
    if (data.schedule !== null)
      rows(
        { recurringExpenses: [object(data.schedule, "schedule")] },
        "recurringExpenses",
        characterId,
        false,
        "schedule",
        true,
      );
  }
  if (action === "territory.workbook.import") {
    rows(
      { territoryHexes: data.hexes },
      "territoryHexes",
      characterId,
      false,
      "hexes",
    );
    for (const [index, hex] of data.hexes.entries())
      match(
        hex.territoryId,
        request.territoryId,
        `hexes[${index}].territoryId`,
      );
  }
  if (
    action.startsWith("territory.recruitment.") &&
    action !== "territory.recruitment.reset"
  ) {
    const offer = object(data.offer, "offer");
    text(offer.offerId, "offer" + ".offerId");
    match(offer.offerId, request.offerId, "offer" + ".offerId");
    match(offer.characterId, characterId, "offer" + ".characterId");
    match(offer.territoryId, request.territoryId, "offer" + ".territoryId");
    text(offer.rollDate, "offer" + ".rollDate");
    text(offer.soldierType, "offer" + ".soldierType");
    number(offer.percentileRoll, "offer" + ".percentileRoll");
    number(offer.quantityRoll, "offer" + ".quantityRoll");
    count(offer.quantity, "offer" + ".quantity");
    oneOf(
      offer.status,
      ["available", "recruited", "denied", "reset"],
      "offer.status",
    );
  }
  if (data.affectedRetainers !== undefined)
    rows(
      { retainers: data.affectedRetainers },
      "retainers",
      characterId,
      false,
      "affectedRetainers",
    );
  if (data.territoryPopulation !== undefined) {
    const population = object(data.territoryPopulation, "territoryPopulation");
    text(population.territoryId, "territoryPopulation" + ".territoryId");
    number(population.population, "territoryPopulation" + ".population");
    match(
      population.territoryId,
      request.territoryId,
      "territoryPopulation" + ".territoryId",
    );
  }
}
export function validateWalletBackup(
  transactions: unknown,
  schedules: unknown,
  characterId: string,
) {
  if (!Array.isArray(transactions))
    invalid("transactions", "an array", transactions);
  if (!Array.isArray(schedules))
    invalid("recurringExpenses", "an array", schedules);
  const seen = new Set<string>();
  for (const [index, value] of transactions.entries()) {
    const rowPath = `transactions[${index}]`;
    const previous = recordContext;
    recordContext = { collection: "transactions", recordIndex: index + 1 };
    try {
      const row = object(value, rowPath);
      number(row.id, rowPath + ".id");
      if (row.characterId !== undefined && row.characterId !== characterId)
        invalid(
          `${rowPath}.characterId`,
          "the requested character ID",
          row.characterId,
        );
      const id = row.transactionId ?? String(row.id);
      text(id, `${rowPath}.transactionId`);
      recordContext.recordId = id;
      if (seen.has(id))
        invalid(`${rowPath}.transactionId`, "a unique transaction ID", id);
      seen.add(id);
      oneOf(row.kind, ["income", "expense"], `${rowPath}.kind`);
      text(row.label, rowPath + ".label");
      for (const coin of ["pp", "gp", "sp", "cp"])
        number(
          object(row.coins, rowPath + ".coins")[coin],
          rowPath + ".coins" + "." + coin,
        );
    } finally {
      recordContext = previous;
    }
  }
  rows({ recurringExpenses: schedules }, "recurringExpenses", characterId);
}
