// @ts-nocheck
/**
 * Existing campaign rules ported from Code.gs on 2026-10-19.
 * Only game functions and recruitment tables are included; no credentials or Google APIs.
 * This compatibility module is synchronous and request-scoped. Typed D1 boundaries
 * validate inputs and commit its changes atomically in game.ts.
 */
import { createRuleContext } from "./ruleContext";
export const gameActions = new Set([
  "retainer.create",
  "retainer.update",
  "retainer.delete",
  "territory.create",
  "territory.update",
  "territory.tithe.update",
  "territory.management.update",
  "territory.fields.update",
  "territory.fields.expand",
  "territory.farmland.start",
  "territory.recruitment.roll",
  "territory.recruitment.complete",
  "territory.recruitment.deny",
  "territory.recruitment.reset",
  "scouting.start",
  "scouting.complete-due",
  "scouting.complete-test",
  "scouting.view-results",
  "scouting.dismiss",
  "scouting.promote-serjeants",
  "mission.custom.create",
  "transaction.delete",
  "recurring.create",
  "recurring.update",
  "recurring.cancel",
]);
export function runGameRules(context, action, request) {
  const {
    rowsAsObjects_,
    filterByCharacter_,
    appendObject_,
    updateObjectById_,
    deleteRowsByValue_,
    getSheet_,
    withLock_,
    requireCharacterAccess_,
    requireRetainerAccess_,
    requireTerritoryAccess_,
    requireDm_,
    getDiscordWebhookForPlayer_,
    sendScoutingMissionDiscord_,
    sendCustomMissionDiscord_,
    processRecurringExpensesUnlocked_,
    Utilities,
    Session,
  } = createRuleContext(context);
  const ensureScoutingAdjudicationSchema_ = () => {};
  const scoutingStartNoticeWasSent_ = () => false;
  const markScoutingStartNoticeSent_ = () => {};
  const PCM_RECRUIT_WAGES = {
    "archer (longbow)": 4,
    "archer (shortbow)": 2,
    artillerist: 5,
    crossbowman: 2,
    "footman, heavy": 2,
    "footman, light": 1,
    "footman, pikeman": 3,
    "hobilar, heavy": 3,
    "hobilar, light": 2,
    "horseman, archer": 6,
    "horseman, crossbowman": 4,
    "horseman, heavy": 6,
    "horseman, light": 3,
    "horseman, medium": 4,
    "sapper/miner": 4,
    slinger: 3,
    scribe: 15,
    "weapon maker": 100,
  };
  const PCM_RECRUIT_TABLE = [
    [1, 4, "archer (longbow)", [1, 4, 8, 5, 20]],
    [5, 10, "archer (shortbow)", [1, 6, 8, 16, 30]],
    [11, 12, "artillerist", [1, 1, 2, 3, 4]],
    [13, 13, "captain", [1, 1, 1, 1, 1]],
    [14, 20, "crossbowman", [1, 6, 8, 20, 48]],
    [21, 30, "footman, heavy", [1, 6, 12, 30, 60]],
    [31, 37, "footman, light", [1, 4, 8, 12, 20]],
    [38, 40, "footman, pikeman", [2, 5, 12, 20, 40]],
    [41, 41, "lieutenant", [1, 1, 1, 1, 1]],
    [42, 44, "hobilar, heavy", [1, 3, 5, 12, 16]],
    [45, 48, "hobilar, light", [1, 4, 8, 12, 20]],
    [49, 49, "horseman, archer", [1, 2, 6, 8, 12]],
    [50, 53, "horseman, crossbowman", [1, 4, 8, 12, 20]],
    [54, 58, "horseman, heavy", [1, 3, 5, 12, 16]],
    [59, 70, "horseman, light", [1, 4, 8, 16, 30]],
    [71, 78, "horseman, medium", [1, 3, 5, 12, 16]],
    [79, 80, "sapper/miner", [1, 2, 4, 5, 8]],
    [86, 88, "slinger", [1, 3, 6, 8, 12]],
    [89, 90, "Select any type of missile troop", [1, 1, 1, 1, 1]],
    [91, 96, "Select any type of footman", [1, 1, 1, 1, 1]],
    [97, 99, "Select any type of horseman", [1, 1, 1, 1, 1]],
    [100, 100, "Select any type of specialist or leader", [1, 1, 1, 1, 1]],
  ];
  const PCM_RECRUIT_Q = {
    "archer (longbow)": [
      [1, 4],
      [2, 5],
      [3, 12],
      [5, 20],
    ],
    "archer (shortbow)": [
      [1, 6],
      [2, 8],
      [4, 16],
      [5, 30],
    ],
    artillerist: [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ],
    captain: [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    crossbowman: [
      [1, 6],
      [2, 8],
      [5, 20],
      [8, 48],
    ],
    "footman, heavy": [
      [1, 6],
      [2, 12],
      [5, 30],
      [10, 60],
    ],
    "footman, light": [
      [1, 4],
      [2, 8],
      [3, 12],
      [5, 20],
    ],
    "footman, pikeman": [
      [2, 5],
      [3, 12],
      [5, 20],
      [10, 40],
    ],
    lieutenant: [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    "hobilar, heavy": [
      [1, 3],
      [2, 5],
      [3, 12],
      [4, 16],
    ],
    "hobilar, light": [
      [1, 4],
      [2, 8],
      [3, 12],
      [5, 20],
    ],
    "horseman, archer": [
      [1, 2],
      [1, 6],
      [2, 8],
      [3, 12],
    ],
    "horseman, crossbowman": [
      [1, 4],
      [2, 8],
      [3, 12],
      [5, 20],
    ],
    "horseman, heavy": [
      [1, 3],
      [2, 5],
      [3, 12],
      [4, 16],
    ],
    "horseman, light": [
      [1, 4],
      [2, 8],
      [4, 16],
      [5, 30],
    ],
    "horseman, medium": [
      [1, 3],
      [2, 5],
      [3, 12],
      [4, 16],
    ],
    "sapper/miner": [
      [1, 2],
      [1, 4],
      [2, 5],
      [2, 8],
    ],
    slinger: [
      [1, 3],
      [1, 6],
      [2, 8],
      [3, 12],
    ],
  };
  const PCM_RECRUIT_LIGHT_ARMOR = [
    "unarmored",
    "leather armor",
    "padded armor",
    "studded leather",
    "ring mail",
  ];
  const PCM_RECRUIT_MEDIUM_ARMOR = PCM_RECRUIT_LIGHT_ARMOR.concat([
    "scale mail",
    "chain mail",
  ]);
  const PCM_RECRUIT_HEAVY_ARMOR = PCM_RECRUIT_MEDIUM_ARMOR.concat([
    "splint mail",
    "banded mail",
    "plate mail",
  ]);
  const PCM_RECRUIT_SHIELDS = [
    "shield, large",
    "shield, small",
    "shield, small wooden",
  ];
  const PCM_RECRUIT_SHORTBOWS = ["bow, short", "bow, composite short"];
  const PCM_RECRUIT_LONGBOWS = ["bow, long", "bow, composite long"];
  const PCM_RECRUIT_CROSSBOWS = ["crossbow, light", "crossbow, heavy"];
  const PCM_RECRUIT_MISSILE_ONLY = PCM_RECRUIT_SHORTBOWS.concat(
    PCM_RECRUIT_LONGBOWS,
    PCM_RECRUIT_CROSSBOWS,
    ["sling and bullets (dozen)", "dart"],
  );
  const PCM_RECRUIT_LIGHT_HORSE_THROWING = [
    "axe, hand or throwing",
    "javelin",
    "dart",
  ];
  const PCM_RECRUIT_ARMOR_AC = {
    unarmored: 10,
    "leather armor": 8,
    "padded armor": 8,
    "studded leather": 7,
    "ring mail": 7,
    "scale mail": 6,
    "chain mail": 5,
    "splint mail": 4,
    "banded mail": 4,
    "plate mail": 3,
  };
  function createRetainer_(request) {
    requireFields_(request, [
      "characterId",
      "type",
      "name",
      "amount",
      "costCoin",
    ]);
    requireRetainerAccess_(
      request.authPlayer,
      cleanText_(request.characterId, 120),
    );
    if (String(request.authPlayer.role || "").toLowerCase() !== "dm") {
      request.clericFightingForce = false;
    }
    const retainer = normalizeRetainer_(request);
    let schedule = null;
    withLock_(function () {
      appendObject_("Retainers", retainer);
      schedule = syncRetainerExpenseUnlocked_(
        retainer,
        request.authPlayer.playerId,
      );
    });
    delete retainer.loyalty;
    if (retainer.type === "force")
      retainer.roster = JSON.parse(retainer.rosterJson || "[]");
    delete retainer.rosterJson;
    return { ok: true, retainer: retainer, schedule: schedule };
  }

  function requireFields_(object, fields) {
    fields.forEach(function (field) {
      if (
        object[field] === undefined ||
        object[field] === null ||
        object[field] === ""
      ) {
        throw new Error("Missing required field: " + field);
      }
    });
  }

  function cleanText_(value, maximumLength) {
    return String(value).trim().slice(0, maximumLength);
  }

  function normalizeRetainer_(request, currentId, createdAt) {
    const type = cleanText_(request.type, 20).toLowerCase();
    if (type !== "individual" && type !== "force") {
      throw new Error("Retainer type must be individual or force.");
    }

    const name = cleanText_(request.name, 120);
    const role = cleanText_(request.role, 120);
    const amount = Math.max(0, number_(request.amount));
    const costCoin = cleanText_(request.costCoin || "gp", 2).toLowerCase();
    if (["pp", "gp", "sp", "cp"].indexOf(costCoin) < 0) {
      throw new Error("Invalid coin denomination.");
    }

    let wageFrequency = cleanText_(
      request.wageFrequency || "monthly",
      20,
    ).toLowerCase();
    if (
      type === "force" &&
      ["monthly", "annually"].indexOf(wageFrequency) < 0
    ) {
      throw new Error("Fighting-force upkeep must be monthly or annual.");
    }
    if (["weekly", "monthly", "annually"].indexOf(wageFrequency) < 0) {
      throw new Error("Invalid recurring-cost frequency.");
    }

    const level =
      type === "individual" &&
      request.level !== "" &&
      request.level !== undefined
        ? Math.max(1, Math.floor(number_(request.level)))
        : "";
    let roster = [];
    if (type === "force") {
      const submittedRoster = Array.isArray(request.roster)
        ? request.roster
        : [];
      roster = submittedRoster
        .map(function (entry) {
          const armorOptions = {
            None: 10,
            "Leather or padded armor": 8,
            "Studded leather or ring mail": 7,
            "Scale mail": 6,
            "Chain mail": 5,
            "Splint or banded mail": 4,
            "Plate mail": 3,
          };
          const armor = cleanText_(entry.armor || "None", 80);
          const shield = isTruthy_(entry.shield);
          const weapons = Array.isArray(entry.weapons)
            ? entry.weapons
                .map(function (weapon) {
                  return {
                    name: cleanText_(weapon.name, 120),
                    damageSmallMedium: cleanText_(weapon.damageSmallMedium, 12),
                    damageLarge: cleanText_(weapon.damageLarge, 12),
                  };
                })
                .filter(function (weapon) {
                  return weapon.name;
                })
            : [];
          return {
            soldierType: cleanText_(entry.soldierType, 120),
            rosterGroupId: cleanText_(
              entry.rosterGroupId || Utilities.getUuid(),
              120,
            ),
            men: Math.max(1, Math.floor(number_(entry.men))),
            armor: armorOptions[armor] !== undefined ? armor : "None",
            shield: shield,
            armorClass: Math.max(
              2,
              (armorOptions[armor] !== undefined ? armorOptions[armor] : 10) -
                (shield ? 1 : 0),
            ),
            weapons: weapons,
            missingSerjeants: Math.max(
              0,
              Math.floor(number_(entry.missingSerjeants)),
            ),
          };
        })
        .filter(function (entry) {
          return entry.soldierType && entry.men > 0;
        });
      if (!roster.length && role && number_(request.men)) {
        roster = [
          {
            soldierType: role,
            men: Math.max(1, Math.floor(number_(request.men))),
          },
        ];
      }
      if (!roster.length)
        throw new Error("Add at least one soldier type to the fighting force.");
    }
    const men =
      type === "force"
        ? roster.reduce(function (total, entry) {
            return total + entry.men;
          }, 0)
        : "";
    const clericFightingForce =
      type === "force" && isTruthy_(request.clericFightingForce);
    if (clericFightingForce && men > 200) {
      throw new Error("A cleric fighting force cannot exceed 200 soldiers.");
    }
    const rosterRole =
      type === "force"
        ? roster
            .map(function (entry) {
              return entry.soldierType;
            })
            .join(", ")
        : role;
    const hiringDate =
      type === "force"
        ? formatCalendarDate_(
            parseCalendarDate_(request.hiringDate || createdAt || new Date()),
          )
        : "";
    const automaticForceWage =
      type === "force" ? pcmAutomaticRosterWage_(roster) : 0;
    const hasUnpricedForceTypes =
      type === "force" &&
      roster.some(function (entry) {
        return !pcmSoldierMonthlyWage_(entry.soldierType, entry.men);
      });

    return {
      retainerId: currentId || Utilities.getUuid(),
      characterId: cleanText_(request.characterId, 120),
      name: name,
      type: type,
      role: rosterRole,
      wageGp:
        type === "force"
          ? clericFightingForce
            ? 0
            : automaticForceWage +
              (hasUnpricedForceTypes
                ? Math.max(0, amount - automaticForceWage)
                : 0)
          : amount,
      wageFrequency: type === "force" ? "monthly" : wageFrequency,
      status: "",
      loyalty: "",
      playerVisible: true,
      createdAt: createdAt || new Date().toISOString(),
      level: level,
      costCoin: type === "force" ? "gp" : costCoin,
      men: men,
      rosterJson: type === "force" ? JSON.stringify(roster) : "",
      scheduleId: cleanText_(request.scheduleId || "", 120),
      hiringDate: hiringDate,
      clericFightingForce: clericFightingForce,
      active: true,
      updatedAt: new Date().toISOString(),
    };
  }

  function number_(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isTruthy_(value) {
    return (
      value === true || String(value).toLowerCase() === "true" || value === 1
    );
  }

  function formatCalendarDate_(date) {
    return Utilities.formatDate(date, "UTC", "yyyy-MM-dd");
  }

  function parseCalendarDate_(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) throw new Error("Choose a valid calendar date.");
    const date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
    if (
      date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() !== Number(match[2]) - 1 ||
      date.getUTCDate() !== Number(match[3])
    ) {
      throw new Error("Choose a valid calendar date.");
    }
    return date;
  }

  function pcmAutomaticRosterWage_(roster) {
    return (Array.isArray(roster) ? roster : []).reduce(function (
      total,
      entry,
    ) {
      const wage = pcmSoldierMonthlyWage_(entry.soldierType, entry.men);
      return total + (wage ? wage.monthlyTotal : 0);
    }, 0);
  }

  function pcmSoldierMonthlyWage_(soldierType, men) {
    const count = Math.max(0, Math.floor(number_(men)));
    const normalizedType = String(soldierType || "")
      .trim()
      .toLowerCase();
    const baseWage = PCM_RECRUIT_WAGES[normalizedType];
    if (!count || baseWage === undefined) return null;
    const serjeants = Math.ceil(count / 10);
    return {
      ordinary: count - serjeants,
      serjeants: serjeants,
      baseWage: baseWage,
      monthlyTotal: (count - serjeants) * baseWage + serjeants * baseWage * 10,
    };
  }

  function syncRetainerExpenseUnlocked_(retainer, playerId) {
    // Personnel costs are informational only. Wage/upkeep amount, denomination,
    // frequency, and hiring date stay on the Retainers row so the player can
    // manually record the expense in the local wallet. Personnel must never
    // create or drive a recurring wallet transaction.
    const linkedSchedules = rowsAsObjects_("Recurring Expenses").filter(
      function (row) {
        return (
          String(row.characterId) === String(retainer.characterId) &&
          ((retainer.scheduleId &&
            String(row.scheduleId) === String(retainer.scheduleId)) ||
            (String(row.sourceType) === "retainer" &&
              String(row.sourceId) === String(retainer.retainerId)))
        );
      },
    );

    linkedSchedules.forEach(function (row) {
      if (isTruthy_(row.active)) {
        updateObjectById_("Recurring Expenses", "scheduleId", row.scheduleId, {
          active: false,
          delinquentSince: "",
        });
      }
    });

    if (retainer.scheduleId) {
      updateObjectById_("Retainers", "retainerId", retainer.retainerId, {
        scheduleId: "",
      });
      retainer.scheduleId = "";
    }

    return null;
  }

  function updateRetainer_(request) {
    requireFields_(request, [
      "characterId",
      "retainerId",
      "type",
      "name",
      "amount",
      "costCoin",
    ]);
    const characterId = cleanText_(request.characterId, 120);
    const retainerId = cleanText_(request.retainerId, 120);
    requireRetainerAccess_(request.authPlayer, characterId);

    const current = rowsAsObjects_("Retainers").find(function (row) {
      return (
        String(row.retainerId) === retainerId &&
        String(row.characterId) === characterId
      );
    });
    if (!current) throw new Error("Retainer or fighting force not found.");

    request.scheduleId = current.scheduleId || "";
    if (String(request.authPlayer.role || "").toLowerCase() !== "dm") {
      // Players may edit the roster, but only the DM may add/remove the cleric-force designation.
      request.clericFightingForce = isTruthy_(current.clericFightingForce);
    }
    const retainer = normalizeRetainer_(request, retainerId, current.createdAt);
    let schedule = null;
    withLock_(function () {
      updateObjectById_("Retainers", "retainerId", retainerId, retainer);
      schedule = syncRetainerExpenseUnlocked_(
        retainer,
        request.authPlayer.playerId,
      );
    });
    delete retainer.loyalty;
    if (retainer.type === "force")
      retainer.roster = JSON.parse(retainer.rosterJson || "[]");
    delete retainer.rosterJson;
    return { ok: true, retainer: retainer, schedule: schedule };
  }

  function deleteRetainer_(request) {
    requireFields_(request, ["characterId", "retainerId"]);
    const characterId = cleanText_(request.characterId, 120);
    const retainerId = cleanText_(request.retainerId, 120);
    requireRetainerAccess_(request.authPlayer, characterId);
    const current = rowsAsObjects_("Retainers").find(function (row) {
      return (
        String(row.retainerId) === retainerId &&
        String(row.characterId) === characterId
      );
    });
    if (!current) throw new Error("Retainer or fighting force not found.");
    withLock_(function () {
      if (current.scheduleId) {
        updateObjectById_(
          "Recurring Expenses",
          "scheduleId",
          current.scheduleId,
          {
            active: false,
          },
        );
      }
      deleteRowsByValue_("Retainers", "retainerId", retainerId);
    });
    return { ok: true, retainerId: retainerId };
  }

  function createTerritory_(request) {
    requireTerritoryAccess_(
      request.authPlayer,
      cleanText_(request.characterId, 120),
    );
    const territory = normalizeTerritory_(request);
    applyTerritoryScoutingWebhook_(territory, request);
    withLock_(function () {
      appendObject_("Territories", territory);
    });
    return { ok: true, territory: serializeTerritory_(territory) };
  }

  function normalizeTerritory_(request, territoryId, createdAt, current) {
    const name = cleanText_(request.name, 120);
    if (!name) throw new Error("Territory name is required.");
    current = current || {};
    return {
      territoryId: territoryId || Utilities.getUuid(),
      characterId: cleanText_(request.characterId, 120),
      name: name,
      hexNumber: cleanText_(request.hexNumber || "", 40),
      mapFileId: cleanText_(current.mapFileId || "", 160),
      mapUrl: cleanText_(current.mapUrl || "", 500),
      mapFileName: cleanText_(current.mapFileName || "", 200),
      poiMapFileId: cleanText_(current.poiMapFileId || "", 160),
      poiMapUrl: cleanText_(current.poiMapUrl || "", 500),
      poiMapFileName: cleanText_(current.poiMapFileName || "", 200),
      workbookFileId: cleanText_(current.workbookFileId || "", 160),
      workbookFileName: cleanText_(current.workbookFileName || "", 200),
      scoutingWebhookUrl: cleanText_(current.scoutingWebhookUrl || "", 600),
      payChurchTithe: isTruthy_(current.payChurchTithe),
      population: Math.max(0, Math.floor(number_(current.population))),
      assetsJson: cleanText_(current.assetsJson || "[]", 20000),
      active: true,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function applyTerritoryScoutingWebhook_(territory, request) {
    const webhookUrl = String(request.scoutingWebhookUrl || "").trim();
    if (!webhookUrl) return;
    requireDm_(request.authPlayer);
    if (
      !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(
        webhookUrl,
      )
    ) {
      throw new Error(
        "Enter a valid Discord webhook URL for scouting notifications.",
      );
    }
    territory.scoutingWebhookUrl = webhookUrl;
  }

  function serializeTerritory_(territory) {
    const result = Object.assign({}, territory);
    result.scoutingWebhookConfigured = Boolean(result.scoutingWebhookUrl);
    delete result.scoutingWebhookUrl;
    try {
      result.assets = JSON.parse(String(result.assetsJson || "[]"));
    } catch (error) {
      result.assets = [];
    }
    delete result.assetsJson;
    result.population = Math.max(0, Math.floor(number_(result.population)));
    result.payChurchTithe = isTruthy_(result.payChurchTithe);
    return result;
  }

  function updateTerritory_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    const current = rowsAsObjects_("Territories").find(function (row) {
      return (
        String(row.territoryId) === territoryId &&
        String(row.characterId) === characterId
      );
    });
    if (!current) throw new Error("Territory not found.");
    const territory = normalizeTerritory_(
      request,
      territoryId,
      current.createdAt,
      current,
    );
    applyTerritoryScoutingWebhook_(territory, request);
    withLock_(function () {
      updateObjectById_("Territories", "territoryId", territoryId, territory);
    });
    return { ok: true, territory: serializeTerritory_(territory) };
  }

  function updateTerritoryChurchTithe_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    const current = rowsAsObjects_("Territories").find(function (row) {
      return (
        String(row.territoryId) === territoryId &&
        String(row.characterId) === characterId
      );
    });
    if (!current) throw new Error("Territory not found.");
    current.payChurchTithe =
      request.payChurchTithe === true ||
      String(request.payChurchTithe).toLowerCase() === "true";
    current.updatedAt = new Date().toISOString();
    withLock_(function () {
      updateObjectById_("Territories", "territoryId", territoryId, current);
    });
    return { ok: true, territory: serializeTerritory_(current) };
  }

  function updateTerritoryManagement_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    const current = rowsAsObjects_("Territories").find(function (row) {
      return (
        String(row.territoryId) === territoryId &&
        String(row.characterId) === characterId
      );
    });
    if (!current) throw new Error("Territory not found.");
    const assets = (Array.isArray(request.assets) ? request.assets : [])
      .slice(0, 100)
      .map(function (asset) {
        return {
          type: cleanText_(asset.type, 60),
          name: cleanText_(asset.name, 160),
          quantity: Math.max(1, Math.floor(number_(asset.quantity))),
          notes: cleanText_(asset.notes || "", 500),
        };
      });
    current.population = Math.max(0, Math.floor(number_(request.population)));
    current.assetsJson = JSON.stringify(assets);
    current.updatedAt = new Date().toISOString();
    withLock_(function () {
      updateObjectById_("Territories", "territoryId", territoryId, current);
    });
    return { ok: true, territory: serializeTerritory_(current) };
  }

  function updateTerritoryFieldAllocation_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    const hexId = cleanText_(request.hexId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    if (!territoryFieldAllocationOpen_()) {
      throw new Error(
        "Fields can only be reallocated from November through April.",
      );
    }
    let updated;
    withLock_(function () {
      const hex = rowsAsObjects_("Territory Hexes").find(function (row) {
        return (
          String(row.hexId) === hexId &&
          String(row.territoryId) === territoryId &&
          String(row.characterId) === characterId
        );
      });
      if (!hex) throw new Error("That discovered sub-hex could not be found.");
      ensureHexFieldAllocation_(hex);
      completeSettlementFieldExpansionIfDue_(hex, new Date());
      const existingTotal = activeFieldTotal_(hex);
      const fieldCapacity = Math.max(
        existingTotal,
        Math.floor(number_(hex.fieldCapacity)),
      );
      const cereal = Math.max(0, Math.floor(number_(request.cerealFields)));
      const cotton = Math.max(0, Math.floor(number_(request.cottonFields)));
      const pasture = Math.max(0, Math.floor(number_(request.pastureFields)));
      const requestedTotal = cereal + cotton + pasture;
      if (requestedTotal > fieldCapacity)
        throw new Error(
          "This settlement does not have that many available fields.",
        );
      hex.cerealFields = cereal;
      hex.cottonFields = cotton;
      hex.pastureFields = pasture;
      hex.updatedAt = new Date().toISOString();
      updateObjectById_("Territory Hexes", "hexId", hexId, hex);
      updated = hex;
    });
    return { ok: true, hex: updated };
  }

  function territoryFieldAllocationOpen_() {
    const month = Number(
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M"),
    );
    return month <= 4 || month >= 11;
  }

  function ensureHexFieldAllocation_(hex, timestamp) {
    if (!hex) return hex;
    const population = Math.max(0, Math.floor(number_(hex.hexPopulationValue)));
    const currentCapacity = richFieldPopulationCapacity_(
      hex.cerealFields,
      hex.pastureFields,
    );
    const expectedAllocation = richFieldAllocationForPopulation_(population);
    const expectedTotal =
      expectedAllocation.cerealFields + expectedAllocation.pastureFields;
    const currentTotal =
      Math.max(0, Math.floor(number_(hex.cerealFields))) +
      Math.max(0, Math.floor(number_(hex.cottonFields))) +
      Math.max(0, Math.floor(number_(hex.pastureFields)));
    const recordedCapacity = Math.max(
      0,
      Math.floor(number_(hex.fieldCapacity)),
    );
    // Preserve deliberate player allocations after a settlement unlocks more
    // fields. Legacy inflated rows have no explicit field capacity and continue
    // through the migration repair below.
    if (
      recordedCapacity &&
      currentTotal <= recordedCapacity &&
      currentCapacity >= population
    )
      return hex;
    // Older rows can carry fieldsInitializedAt even though their allocation was
    // created before the population value arrived (usually leaving zero fields),
    // can contain an allocation that does not feed the population, or can still
    // contain the old 15-times-inflated allocation.
    if (
      hex.fieldsInitializedAt &&
      currentTotal === expectedTotal &&
      currentCapacity >= population
    ) {
      if (!Math.max(0, Math.floor(number_(hex.fieldCapacity))))
        hex.fieldCapacity = currentTotal;
      return hex;
    }
    hex.cerealFields = expectedAllocation.cerealFields;
    hex.cottonFields = expectedAllocation.cottonFields;
    hex.pastureFields = expectedAllocation.pastureFields;
    hex.fieldsInitializedAt = timestamp || new Date().toISOString();
    if (!Math.max(0, Math.floor(number_(hex.fieldCapacity)))) {
      hex.fieldCapacity = expectedTotal;
    }
    return hex;
  }

  function richFieldPopulationCapacity_(cerealFields, pastureFields) {
    // One rich cereal field supports 61 people; one rich pasture supports 32.
    return (
      Math.max(0, Math.floor(number_(cerealFields))) * 61 +
      Math.max(0, Math.floor(number_(pastureFields))) * 32
    );
  }

  function richFieldAllocationForPopulation_(population) {
    const people = Math.max(0, Math.floor(number_(population)));
    if (!people) return { cerealFields: 0, cottonFields: 0, pastureFields: 0 };
    // In the resource calculator, one rich cereal field supports 61 people and
    // one rich pasture supports 32 people. New settlements use a 65/35 mix.
    const supportPerMixedField = 0.65 * 61 + 0.35 * 32;
    let totalFields = Math.ceil(people / supportPerMixedField);
    let cerealFields = Math.round(totalFields * 0.65);
    // Whole-field rounding must never leave the recorded population unsupported.
    while (cerealFields * 61 + (totalFields - cerealFields) * 32 < people) {
      totalFields += 1;
      cerealFields = Math.round(totalFields * 0.65);
    }
    return {
      cerealFields: cerealFields,
      cottonFields: 0,
      pastureFields: totalFields - cerealFields,
    };
  }

  function completeSettlementFieldExpansionIfDue_(hex, now) {
    if (!hex || !hex.fieldExpansionCompletesAt || hex.fieldExpansionCompletedAt)
      return false;
    const completion = new Date(String(hex.fieldExpansionCompletesAt));
    if (isNaN(completion.getTime()) || completion.getTime() > now.getTime())
      return false;
    hex.fieldCapacity = Math.max(8, Math.floor(number_(hex.fieldCapacity)));
    hex.fieldExpansionCompletedAt = now.toISOString();
    hex.updatedAt = now.toISOString();
    return true;
  }

  function activeFieldTotal_(hex) {
    return (
      Math.max(0, Math.floor(number_(hex && hex.cerealFields))) +
      Math.max(0, Math.floor(number_(hex && hex.cottonFields))) +
      Math.max(0, Math.floor(number_(hex && hex.pastureFields)))
    );
  }

  function startSettlementFieldExpansion_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    const hexId = cleanText_(request.hexId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    let updated;
    let transaction;
    withLock_(function () {
      const hex = rowsAsObjects_("Territory Hexes").find(function (row) {
        return (
          String(row.hexId) === hexId &&
          String(row.territoryId) === territoryId &&
          String(row.characterId) === characterId
        );
      });
      if (!hex) throw new Error("That discovered sub-hex could not be found.");
      if (!String(hex.settlement || "").trim())
        throw new Error(
          "Only a sub-hex containing a settlement can receive this field expansion.",
        );
      ensureHexFieldAllocation_(hex);
      completeSettlementFieldExpansionIfDue_(hex, new Date());
      const activeFields = activeFieldTotal_(hex);
      const capacity = Math.max(
        activeFields,
        Math.floor(number_(hex.fieldCapacity)),
      );
      if (capacity >= 8)
        throw new Error(
          "This settlement already has the full 8-field capacity.",
        );
      if (hex.fieldExpansionStartedAt && !hex.fieldExpansionCompletedAt)
        throw new Error(
          "Field expansion is already underway in this settlement.",
        );
      const payment = walletPaymentDeltas_(
        requestWalletBalance_(request),
        200 * walletCoinValues_().gp,
      );
      if (!payment)
        throw new Error(
          "The character wallet cannot cover the 200 gp development cost.",
        );
      const started = new Date();
      const completes = new Date(started.getTime());
      completes.setMonth(completes.getMonth() + 4);
      hex.fieldCapacity = capacity;
      hex.fieldExpansionStartedAt = started.toISOString();
      hex.fieldExpansionCompletesAt = completes.toISOString();
      hex.fieldExpansionCompletedAt = "";
      hex.updatedAt = started.toISOString();
      updateObjectById_("Territory Hexes", "hexId", hexId, hex);
      transaction = {
        transactionId: Utilities.getUuid(),
        characterId: characterId,
        timestamp: started.toISOString(),
        type: "expense",
        label: "Expand settlement fields · sub-hex " + String(hex.hexNumber),
        pp: payment.pp,
        gp: payment.gp,
        sp: payment.sp,
        cp: payment.cp,
        note:
          "200 gp development project; completes " +
          Utilities.formatDate(
            completes,
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
          ),
        recurring: false,
        createdBy: request.authPlayer.playerId,
      };
      // Wallet state is local-only. Return the payment event to the client but do not persist it here.
      updated = hex;
    });
    return { ok: true, hex: updated, transaction: transaction };
  }

  function walletPaymentDeltas_(balance, costInCopper) {
    const values = walletCoinValues_();
    const coinsLowToHigh = ["cp", "sp", "gp", "pp"];
    const cost = Math.max(0, Math.floor(number_(costInCopper)));
    if (
      coinsLowToHigh.some(function (coin) {
        return number_(balance[coin]) < 0;
      })
    )
      return null;
    const total = coinsLowToHigh.reduce(function (sum, coin) {
      return (
        sum + Math.max(0, Math.floor(number_(balance[coin]))) * values[coin]
      );
    }, 0);
    if (total < cost) return null;

    const next = {
      pp: Math.max(0, Math.floor(number_(balance.pp))),
      gp: Math.max(0, Math.floor(number_(balance.gp))),
      sp: Math.max(0, Math.floor(number_(balance.sp))),
      cp: Math.max(0, Math.floor(number_(balance.cp))),
    };
    let remaining = cost;
    coinsLowToHigh.forEach(function (coin) {
      if (!remaining) return;
      const spend = Math.min(next[coin], Math.floor(remaining / values[coin]));
      next[coin] -= spend;
      remaining -= spend * values[coin];
    });
    if (remaining) {
      const coinToBreak = coinsLowToHigh.find(function (coin) {
        return next[coin] > 0 && values[coin] > remaining;
      });
      if (!coinToBreak) return null;
      next[coinToBreak] -= 1;
      let change = values[coinToBreak] - remaining;
      ["gp", "sp", "cp"].forEach(function (coin) {
        if (values[coin] >= values[coinToBreak]) return;
        const count = Math.floor(change / values[coin]);
        next[coin] += count;
        change -= count * values[coin];
      });
    }
    return {
      pp: next.pp - number_(balance.pp),
      gp: next.gp - number_(balance.gp),
      sp: next.sp - number_(balance.sp),
      cp: next.cp - number_(balance.cp),
    };
  }

  function walletCoinValues_() {
    return { pp: 1000, gp: 200, sp: 10, cp: 1 };
  }

  function requestWalletBalance_(request) {
    const source =
      request && request.walletBalance ? request.walletBalance : {};
    return {
      pp: Math.max(0, number_(source.pp)),
      gp: Math.max(0, number_(source.gp)),
      sp: Math.max(0, number_(source.sp)),
      cp: Math.max(0, number_(source.cp)),
    };
  }

  function startFarmlandDevelopment_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    const plainsHexId = cleanText_(request.plainsHexId, 120);
    const settlementHexId = cleanText_(request.settlementHexId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    let plainsHex;
    let settlementHex;
    let transaction;
    withLock_(function () {
      const allHexes = filterByCharacter_(
        "Territory Hexes",
        characterId,
      ).filter(function (hex) {
        return String(hex.territoryId) === territoryId;
      });
      plainsHex = allHexes.find(function (hex) {
        return String(hex.hexId) === plainsHexId;
      });
      settlementHex = allHexes.find(function (hex) {
        return String(hex.hexId) === settlementHexId;
      });
      if (!plainsHex || !settlementHex)
        throw new Error(
          "Choose a discovered plains sub-hex and known settlement.",
        );
      const revealed = revealedTerritoryHexKeysForCharacter_(characterId);
      const plainsKey =
        territoryId + "::" + normalizedScoutingHexKey_(plainsHex.hexNumber);
      const settlementKey =
        territoryId + "::" + normalizedScoutingHexKey_(settlementHex.hexNumber);
      if (!revealed[plainsKey] || !revealed[settlementKey])
        throw new Error("Only scouted land and known settlements can be used.");
      if (!isPlainsTerrain_(plainsHex))
        throw new Error(
          "Only a plains sub-hex can be developed into farmland.",
        );
      if (!String(settlementHex.settlementName || "").trim())
        throw new Error(
          "The fields must be developed for a known named settlement.",
        );
      if (
        Math.max(0, Math.floor(number_(plainsHex.hexPopulationValue))) > 0 ||
        activeFieldTotal_(plainsHex) > 0 ||
        plainsHex.farmlandStartedAt ||
        plainsHex.farmlandCompletedAt
      ) {
        throw new Error(
          "That plains sub-hex is already developed or under development.",
        );
      }
      const totalPopulation = allHexes.reduce(function (sum, hex) {
        const key =
          territoryId + "::" + normalizedScoutingHexKey_(hex.hexNumber);
        return (
          sum +
          (revealed[key]
            ? Math.max(0, Math.floor(number_(hex.hexPopulationValue)))
            : 0)
        );
      }, 0);
      const reservedWorkers = allHexes.reduce(function (sum, hex) {
        return (
          sum + (hex.farmlandStartedAt && !hex.farmlandCompletedAt ? 50 : 0)
        );
      }, 0);
      if (Math.floor(totalPopulation * 0.5) - reservedWorkers < 50)
        throw new Error(
          "At least 50 unallocated workers are required for eight months.",
        );
      const payment = walletPaymentDeltas_(
        requestWalletBalance_(request),
        500 * walletCoinValues_().gp,
      );
      if (!payment)
        throw new Error(
          "The character wallet cannot cover the 500 gp land-development cost.",
        );
      const started = new Date();
      const completes = new Date(started.getTime());
      completes.setMonth(completes.getMonth() + 8);
      plainsHex.farmlandSettlementHexId = settlementHexId;
      plainsHex.farmlandStartedAt = started.toISOString();
      plainsHex.farmlandCompletesAt = completes.toISOString();
      plainsHex.farmlandCompletedAt = "";
      plainsHex.updatedAt = started.toISOString();
      updateObjectById_("Territory Hexes", "hexId", plainsHexId, plainsHex);
      transaction = {
        transactionId: Utilities.getUuid(),
        characterId: characterId,
        timestamp: started.toISOString(),
        type: "expense",
        label: "Develop plains · sub-hex " + String(plainsHex.hexNumber),
        pp: payment.pp,
        gp: payment.gp,
        sp: payment.sp,
        cp: payment.cp,
        note:
          "500 gp; 50 workers reserved; 8 fields developed for " +
          String(settlementHex.settlementName) +
          " in sub-hex " +
          String(settlementHex.hexNumber) +
          "; completes " +
          Utilities.formatDate(
            completes,
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
          ),
        recurring: false,
        createdBy: request.authPlayer.playerId,
      };
      // Wallet state is local-only. Return the payment event to the client but do not write it to Wallet Transactions.
    });
    return {
      ok: true,
      plainsHex: plainsHex,
      settlementHex: settlementHex,
      transaction: transaction,
    };
  }

  function revealedTerritoryHexKeysForCharacter_(characterId) {
    const revealed = {};
    filterByCharacter_("Territories", characterId).forEach(
      function (territory) {
        // Every territory begins with sub-hex 4.4 already known.
        revealed[
          String(territory.territoryId) +
            "::" +
            normalizedScoutingHexKey_("4.4")
        ] = true;
      },
    );
    filterByCharacter_("Territory Hexes", characterId).forEach(function (hex) {
      if (isTruthy_(hex.dmRevealed)) {
        revealed[
          String(hex.territoryId) +
            "::" +
            normalizedScoutingHexKey_(hex.hexNumber)
        ] = true;
      }
    });
    filterByCharacter_("Scouting Missions", characterId).forEach(
      function (mission) {
        if (String(mission.status) === "completed" && mission.resultsViewedAt) {
          revealed[
            String(mission.territoryId) +
              "::" +
              normalizedScoutingHexKey_(mission.hexNumber)
          ] = true;
        }
      },
    );
    return revealed;
  }

  function normalizedScoutingHexKey_(value) {
    const text = cleanText_(value || "", 40)
      .trim()
      .toLowerCase();
    const numeric = Number(text);
    return text !== "" && Number.isFinite(numeric) ? String(numeric) : text;
  }

  function isPlainsTerrain_(hex) {
    return /(^|\b)plains?(\b|$)/i.test(
      String((hex && hex.terrain) || "").trim(),
    );
  }

  function rollTerritoryRecruitment_(request) {
    const characterId = cleanText_(request.characterId, 120),
      territoryId = cleanText_(request.territoryId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    const territory = rowsAsObjects_("Territories").find(function (r) {
      return (
        String(r.territoryId) === territoryId &&
        String(r.characterId) === characterId
      );
    });
    if (!territory) throw new Error("Territory not found.");
    const today = pcmToday_();
    let offer,
      consumed = false;
    withLock_(function () {
      // The daily roll belongs to the character and territory, not to a browser
      // session. A denied or recruited offer must continue to consume the roll.
      offer = rowsAsObjects_("Territory Recruitment").find(function (r) {
        return (
          String(r.territoryId) === territoryId &&
          String(r.characterId) === characterId &&
          pcmRecruitmentDateKey_(r.rollDate) === today &&
          String(r.status) !== "reset"
        );
      });
      if (
        offer &&
        String(offer.status) === "available" &&
        String(offer.soldierType || "")
          .trim()
          .toLowerCase() === "serjeant"
      ) {
        // Serjeant has been removed from the recruitment table. Retire an old
        // unaccepted Serjeant offer so the same day's roll can be replaced.
        offer.status = "reset";
        updateObjectById_(
          "Territory Recruitment",
          "offerId",
          String(offer.offerId),
          offer,
        );
        offer = null;
      }
      if (offer) {
        consumed = String(offer.status) !== "available";
        return;
      }
      let d100, row;
      do {
        d100 = Math.floor(Math.random() * 100) + 1;
        row = PCM_RECRUIT_TABLE.find(function (x) {
          return d100 >= x[0] && d100 <= x[1];
        });
      } while (!row);
      const d10 = Math.floor(Math.random() * 10) + 1;
      const band = d10 <= 4 ? 0 : d10 <= 7 ? 1 : d10 <= 9 ? 2 : 3,
        range = (PCM_RECRUIT_Q[row[2]] || [
          [1, 1],
          [1, 1],
          [1, 1],
          [1, 1],
        ])[band],
        q = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
      offer = {
        offerId: Utilities.getUuid(),
        territoryId: territoryId,
        characterId: characterId,
        playerId: request.authPlayer.playerId,
        rollDate: today,
        percentileRoll: d100,
        quantityRoll: d10,
        soldierType: row[2],
        quantity: q,
        wageGpPerSoldier: PCM_RECRUIT_WAGES[row[2]] || "",
        status: "available",
        createdAt: new Date().toISOString(),
        recruitedAt: "",
      };
      appendObject_("Territory Recruitment", offer);
    });
    return { ok: true, offer: offer, consumed: consumed };
  }

  function pcmToday_() {
    return Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
  }

  function pcmRecruitmentDateKey_(value) {
    if (
      Object.prototype.toString.call(value) === "[object Date]" &&
      !isNaN(value.getTime())
    ) {
      return Utilities.formatDate(
        value,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      );
    }
    const text = String(value == null ? "" : value).trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
    const parsed = new Date(text);
    return isNaN(parsed.getTime())
      ? text
      : Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  function completeTerritoryRecruitment_(request) {
    const characterId = cleanText_(request.characterId, 120),
      territoryId = cleanText_(request.territoryId, 120),
      offerId = cleanText_(request.offerId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    let result = {};
    withLock_(function () {
      const offer = rowsAsObjects_("Territory Recruitment").find(function (r) {
        return (
          String(r.offerId) === offerId &&
          String(r.territoryId) === territoryId &&
          String(r.characterId) === characterId
        );
      });
      if (!offer || String(offer.status) !== "available")
        throw new Error("This recruitment offer is no longer available.");
      let soldierType = String(offer.soldierType);
      if (soldierType.indexOf("Select any") === 0)
        soldierType = cleanText_(request.chosenSoldierType, 120);
      if (!soldierType) throw new Error("Select the soldier type.");
      const wage =
        PCM_RECRUIT_WAGES[soldierType.toLowerCase()] ||
        number_(offer.wageGpPerSoldier);
      if (!wage)
        throw new Error(
          "The DM must set a wage for this special troop type before recruitment.",
        );
      const gear = pcmRecruitGear_(soldierType, request.equipment),
        equipment = gear.equipment;
      if (!equipment.length && pcmRecruitRules_(soldierType).melee)
        throw new Error("Purchase the required weapons before recruiting.");
      let costCp = 0;
      const coinCp = { pp: 1000, gp: 200, sp: 10, cp: 1 };
      equipment.forEach(function (i) {
        costCp +=
          Math.max(0, number_(i.amount)) *
          number_(offer.quantity) *
          (coinCp[String(i.coin)] || 0);
      });
      const equipmentPayment = walletPaymentDeltas_(
        requestWalletBalance_(request),
        costCp,
      );
      if (!equipmentPayment)
        throw new Error(
          "The character wallet cannot cover the required equipment purchase.",
        );
      let force = rowsAsObjects_("Retainers").find(function (r) {
        return (
          String(r.retainerId) === String(request.forceId || "") &&
          String(r.characterId) === characterId &&
          r.type === "force" &&
          isTruthy_(r.active)
        );
      });
      let roster = [];
      if (force) {
        try {
          roster = JSON.parse(String(force.rosterJson || "[]"));
        } catch (e) {}
        if (
          isTruthy_(force.clericFightingForce) &&
          roster.reduce(function (sum, group) {
            return sum + number_(group.men);
          }, 0) +
            number_(offer.quantity) >
            200
        ) {
          throw new Error(
            "A cleric fighting force cannot exceed 200 soldiers.",
          );
        }
        roster.forEach(function (group) {
          if (!group.rosterGroupId) group.rosterGroupId = Utilities.getUuid();
        });

        const normalizedNewWeapons = gear.weaponNames
          .map(String)
          .sort()
          .join("|")
          .toLowerCase();
        const existing = roster.find(function (group) {
          if (
            String(group.soldierType).toLowerCase() !==
            soldierType.toLowerCase()
          )
            return false;
          const groupWeapons = (
            Array.isArray(group.weaponNames) ? group.weaponNames : []
          )
            .map(String)
            .sort()
            .join("|")
            .toLowerCase();
          return (
            Math.floor(number_(group.armorClass)) === gear.armorClass &&
            Boolean(group.shield) === gear.shield &&
            groupWeapons === normalizedNewWeapons
          );
        });

        const oldGroupWage = existing
          ? pcmSoldierMonthlyWage_(existing.soldierType, existing.men)
          : null;
        if (existing) {
          existing.men += number_(offer.quantity);
        } else {
          roster.push({
            rosterGroupId: Utilities.getUuid(),
            soldierType: soldierType,
            men: number_(offer.quantity),
            armor: gear.armor,
            shield: gear.shield,
            weaponNames: gear.weaponNames,
            armorClass: gear.armorClass,
          });
        }

        const changed = existing || roster[roster.length - 1];
        const newGroupWage = pcmSoldierMonthlyWage_(
          changed.soldierType,
          changed.men,
        );
        force.men = roster.reduce(function (s, x) {
          return s + number_(x.men);
        }, 0);
        force.rosterJson = JSON.stringify(roster);
        force.wageGp = isTruthy_(force.clericFightingForce)
          ? 0
          : (number_(force.wageGp) *
              (coinCp[String(force.costCoin || "gp")] || 200)) /
              200 +
            (newGroupWage ? newGroupWage.monthlyTotal : 0) -
            (oldGroupWage ? oldGroupWage.monthlyTotal : 0);
        force.wageFrequency = "monthly";
        force.costCoin = "gp";
        force.updatedAt = new Date().toISOString();
        updateObjectById_("Retainers", "retainerId", force.retainerId, force);
      } else {
        const firstGroup = {
          rosterGroupId: Utilities.getUuid(),
          soldierType: soldierType,
          men: number_(offer.quantity),
          armor: gear.armor,
          shield: gear.shield,
          weaponNames: gear.weaponNames,
          armorClass: gear.armorClass,
        };
        const initialRoster = [firstGroup];
        const hiredToday = formatCalendarDate_(todayCalendarDate_());
        force = {
          retainerId: Utilities.getUuid(),
          characterId: characterId,
          name: cleanText_(request.newForceName, 120),
          type: "force",
          role: soldierType,
          wageGp: pcmAutomaticRosterWage_(initialRoster),
          wageFrequency: "monthly",
          status: "",
          loyalty: "",
          playerVisible: true,
          createdAt: new Date().toISOString(),
          level: "",
          costCoin: "gp",
          men: number_(offer.quantity),
          active: true,
          updatedAt: new Date().toISOString(),
          rosterJson: JSON.stringify(initialRoster),
          scheduleId: "",
          hiringDate: hiredToday,
        };
        if (!force.name)
          throw new Error("Enter a name for the new fighting force.");
        appendObject_("Retainers", force);
      }
      const schedule = syncRetainerExpenseUnlocked_(
        force,
        request.authPlayer.playerId,
      );
      force.scheduleId = schedule ? schedule.scheduleId : force.scheduleId;
      updateObjectById_("Retainers", "retainerId", force.retainerId, force);
      const tx = {
        transactionId: Utilities.getUuid(),
        characterId: characterId,
        timestamp: new Date().toISOString(),
        type: "expense",
        label: "Equipment for " + offer.quantity + " " + soldierType,
        pp: equipmentPayment.pp,
        gp: equipmentPayment.gp,
        sp: equipmentPayment.sp,
        cp: equipmentPayment.cp,
        note: equipment
          .map(function (i) {
            return (
              number_(i.quantityPerSoldier) * number_(offer.quantity) +
              " " +
              cleanText_(i.name, 120)
            );
          })
          .join(", "),
        recurring: false,
        createdBy: request.authPlayer.playerId,
      };
      offer.status = "recruited";
      offer.recruitedAt = new Date().toISOString();
      updateObjectById_("Territory Recruitment", "offerId", offerId, offer);
      const serial = Object.assign({}, force);
      serial.roster = JSON.parse(serial.rosterJson || "[]");
      delete serial.rosterJson;
      delete serial.loyalty;
      result = {
        ok: true,
        offer: offer,
        retainer: serial,
        schedule: schedule,
        transaction: tx,
      };
    });
    return result;
  }

  function pcmRecruitGear_(soldierType, equipment) {
    const rules = pcmRecruitRules_(soldierType);
    const items = (Array.isArray(equipment) ? equipment : []).map(function (i) {
      return {
        name: cleanText_(i.name, 120),
        lower: cleanText_(i.name, 120).toLowerCase(),
        quantityPerSoldier: Math.max(
          1,
          Math.floor(number_(i.quantityPerSoldier)),
        ),
        amount: number_(i.amount),
        coin: cleanText_(i.coin, 10).toLowerCase(),
      };
    });
    items.forEach(function (i) {
      if (i.quantityPerSoldier !== 1)
        throw new Error("Recruit equipment is issued one item per soldier.");
    });
    const armorItems = items.filter(function (i) {
      return Object.prototype.hasOwnProperty.call(
        PCM_RECRUIT_ARMOR_AC,
        i.lower,
      );
    });
    const shields = items.filter(function (i) {
      return PCM_RECRUIT_SHIELDS.indexOf(i.lower) >= 0;
    });
    const weapons = items.filter(function (i) {
      return (
        !Object.prototype.hasOwnProperty.call(PCM_RECRUIT_ARMOR_AC, i.lower) &&
        PCM_RECRUIT_SHIELDS.indexOf(i.lower) < 0
      );
    });
    if (armorItems.length > 1)
      throw new Error("Recruits can wear only one suit of armor.");
    const armorKey = armorItems.length ? armorItems[0].lower : "unarmored";
    if (rules.armor.indexOf(armorKey) < 0)
      throw new Error("That armor is not permitted for this troop type.");
    if (shields.length > 1)
      throw new Error("Recruits can carry only one shield.");
    if (shields.length && !rules.shield)
      throw new Error("That troop type cannot carry a shield.");
    if (weapons.length > 3)
      throw new Error("Recruits can carry no more than three weapons.");
    const weaponNames = weapons.map(function (i) {
      return i.lower;
    });
    const melee = weaponNames.filter(function (n) {
      return PCM_RECRUIT_MISSILE_ONLY.indexOf(n) < 0;
    });
    if (rules.melee && !melee.length)
      throw new Error("These recruits must carry at least one melee weapon.");
    if (
      rules.missile &&
      !weaponNames.some(function (n) {
        return rules.missile.indexOf(n) >= 0;
      })
    ) {
      throw new Error(
        rules.mode === "shortbow"
          ? "Shortbowmen must carry a shortbow."
          : rules.mode === "longbow"
            ? "Longbowmen must carry a longbow."
            : "Crossbowmen must carry a light or heavy crossbow.",
      );
    }
    const shield = shields.length > 0;
    return {
      equipment: items,
      armor: armorItems.length ? armorItems[0].name : "None",
      shield: shield,
      weaponNames: weapons.map(function (i) {
        return i.name;
      }),
      armorClass: Math.max(
        2,
        PCM_RECRUIT_ARMOR_AC[armorKey] - (shield ? 1 : 0),
      ),
    };
  }

  function pcmRecruitRules_(value) {
    const type = String(value || "")
      .trim()
      .toLowerCase();
    if (type === "archer (shortbow)" || type === "horseman, archer")
      return {
        armor: PCM_RECRUIT_LIGHT_ARMOR,
        mode: "shortbow",
        shield: false,
        melee: true,
        missile: PCM_RECRUIT_SHORTBOWS,
      };
    if (type === "archer (longbow)")
      return {
        armor: PCM_RECRUIT_LIGHT_ARMOR,
        mode: "longbow",
        shield: false,
        melee: true,
        missile: PCM_RECRUIT_LONGBOWS,
      };
    if (type === "crossbowman" || type === "horseman, crossbowman")
      return {
        armor: PCM_RECRUIT_LIGHT_ARMOR,
        mode: "crossbow",
        shield: false,
        melee: true,
        missile: PCM_RECRUIT_CROSSBOWS,
      };
    if (
      ["footman, heavy", "hobilar, heavy", "horseman, heavy"].indexOf(type) >= 0
    )
      return {
        armor: PCM_RECRUIT_HEAVY_ARMOR,
        mode: "melee",
        shield: true,
        melee: true,
      };
    if (type === "horseman, medium")
      return {
        armor: PCM_RECRUIT_MEDIUM_ARMOR,
        mode: "melee",
        shield: true,
        melee: true,
      };
    if (type === "horseman, light")
      return {
        armor: PCM_RECRUIT_LIGHT_ARMOR,
        mode: "melee",
        shield: true,
        melee: true,
        additional: PCM_RECRUIT_LIGHT_HORSE_THROWING,
      };
    if (
      ["footman, light", "hobilar, light", "footman, pikeman"].indexOf(type) >=
      0
    )
      return {
        armor: PCM_RECRUIT_LIGHT_ARMOR,
        mode: "melee",
        shield: true,
        melee: true,
      };
    return {
      armor: PCM_RECRUIT_HEAVY_ARMOR,
      mode: "other",
      shield: true,
      melee: false,
    };
  }

  function todayCalendarDate_() {
    return parseCalendarDate_(
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      ),
    );
  }

  function denyTerritoryRecruitment_(request) {
    const characterId = cleanText_(request.characterId, 120),
      territoryId = cleanText_(request.territoryId, 120),
      offerId = cleanText_(request.offerId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    let offer;
    withLock_(function () {
      offer = rowsAsObjects_("Territory Recruitment").find(function (r) {
        return (
          String(r.offerId) === offerId &&
          String(r.territoryId) === territoryId &&
          String(r.characterId) === characterId &&
          String(r.playerId) === String(request.authPlayer.playerId)
        );
      });
      if (!offer || String(offer.status) !== "available")
        throw new Error("This recruitment offer is no longer available.");
      offer.status = "denied";
      offer.deniedAt = new Date().toISOString();
      updateObjectById_("Territory Recruitment", "offerId", offerId, offer);
    });
    return { ok: true, offer: offer };
  }

  function resetTerritoryRecruitment_(request) {
    requireDm_(request.authPlayer);
    const characterId = cleanText_(request.characterId, 120),
      territoryId = cleanText_(request.territoryId, 120),
      today = pcmToday_();
    requireCharacterAccess_(request.authPlayer, characterId);
    let resetCount = 0;
    withLock_(function () {
      rowsAsObjects_("Territory Recruitment")
        .filter(function (r) {
          return (
            String(r.territoryId) === territoryId &&
            String(r.characterId) === characterId &&
            pcmRecruitmentDateKey_(r.rollDate) === today &&
            String(r.status) !== "reset"
          );
        })
        .forEach(function (offer) {
          offer.status = "reset";
          offer.resetAt = new Date().toISOString();
          updateObjectById_(
            "Territory Recruitment",
            "offerId",
            offer.offerId,
            offer,
          );
          resetCount++;
        });
    });
    if (!resetCount)
      throw new Error(
        "No recruitment roll has been used for this territory today.",
      );
    return { ok: true, resetCount: resetCount };
  }

  function startScoutingMission_(request) {
    // Make the idempotency column self-healing so this targeted path does not
    // depend on a separate full setup/bootstrap run.
    ensureScoutingAdjudicationSchema_();
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    const territory = rowsAsObjects_("Territories").find(function (row) {
      return (
        String(row.territoryId) === territoryId &&
        String(row.characterId) === characterId
      );
    });
    if (!territory || !territory.mapUrl)
      throw new Error("This territory does not have a player map.");
    const hexNumber = cleanText_(request.hexNumber, 40);
    if (!hexNumber) throw new Error("Confirm the numbered hex to scout.");
    const clientMissionId = cleanText_(request.clientMissionId || "", 160);

    // A locally-created mission can be retried safely after a lost response.
    // The client id is never used as the campaign mission id; it is only an
    // idempotency key tying the local placeholder to the server record.
    if (clientMissionId) {
      const existingClientMission = filterByCharacter_(
        "Scouting Missions",
        characterId,
      ).find(function (row) {
        return String(row.clientMissionId || "") === clientMissionId;
      });
      if (existingClientMission) {
        if (
          String(existingClientMission.status || "active") === "active" &&
          new Date(existingClientMission.completesAt || 0).getTime() <=
            Date.now()
        ) {
          withLock_(function () {
            const fresh = rowsAsObjects_("Scouting Missions").find(
              function (row) {
                return (
                  String(row.missionId) ===
                  String(existingClientMission.missionId)
                );
              },
            );
            if (
              fresh &&
              String(fresh.status || "active") === "active" &&
              new Date(fresh.completesAt || 0).getTime() <= Date.now()
            ) {
              resolveCompletedScoutingMission_(fresh);
              updateObjectById_(
                "Scouting Missions",
                "missionId",
                String(fresh.missionId),
                fresh,
              );
              existingClientMission.status = fresh.status;
              existingClientMission.completedAt = fresh.completedAt;
              existingClientMission.resolvedAt = fresh.resolvedAt;
              existingClientMission.encounterRoll = fresh.encounterRoll;
              existingClientMission.encounterOccurred = fresh.encounterOccurred;
              existingClientMission.reactionDisposition =
                fresh.reactionDisposition;
              existingClientMission.reactionModifier = fresh.reactionModifier;
              existingClientMission.reactionRoll = fresh.reactionRoll;
              existingClientMission.adjustedReactionRoll =
                fresh.adjustedReactionRoll;
              existingClientMission.reactionResult = fresh.reactionResult;
              existingClientMission.attackerCount = fresh.attackerCount;
              existingClientMission.attackThac0 = fresh.attackThac0;
              existingClientMission.attackRoll = fresh.attackRoll;
              existingClientMission.attackNeeded = fresh.attackNeeded;
              existingClientMission.attackHit = fresh.attackHit;
              existingClientMission.attackTargetArmorClass =
                fresh.attackTargetArmorClass;
              existingClientMission.attackTargetSoldierType =
                fresh.attackTargetSoldierType;
              existingClientMission.scoutMoraleRoll = fresh.scoutMoraleRoll;
              existingClientMission.scoutMoraleBonus = fresh.scoutMoraleBonus;
              existingClientMission.scoutMoralePassed = fresh.scoutMoralePassed;
              existingClientMission.attackerMoraleRoll =
                fresh.attackerMoraleRoll;
              existingClientMission.attackerMoraleBonus =
                fresh.attackerMoraleBonus;
              existingClientMission.attackerMoralePassed =
                fresh.attackerMoralePassed;
              existingClientMission.missionOutcome = fresh.missionOutcome;
              existingClientMission.casualtyRoll = fresh.casualtyRoll;
              existingClientMission.scoutsKilled = fresh.scoutsKilled;
              existingClientMission.serjeantsChecked = fresh.serjeantsChecked;
              existingClientMission.serjeantsKilled = fresh.serjeantsKilled;
              existingClientMission.survivors = fresh.survivors;
              existingClientMission.encounterKnownToPlayer =
                fresh.encounterKnownToPlayer;
              existingClientMission.encounteredInhabitants =
                fresh.encounteredInhabitants;
              existingClientMission.populationAdded = fresh.populationAdded;
              existingClientMission.allocationsJson = fresh.allocationsJson;
              existingClientMission.strandedMen = fresh.strandedMen;
              existingClientMission.promotionFeeGp = fresh.promotionFeeGp;
            }
          });
        }
        try {
          existingClientMission.allocations = JSON.parse(
            String(existingClientMission.allocationsJson || "[]"),
          );
        } catch (error) {
          existingClientMission.allocations = [];
        }
        delete existingClientMission.allocationsJson;
        const responseMission = serializeScoutingMission_(
          existingClientMission,
          String(request.authPlayer.role) === "dm",
        );
        return scoutingStartResponse_(characterId, responseMission);
      }
    }

    const requested = Array.isArray(request.allocations)
      ? request.allocations
      : [];
    const total = requested.reduce(function (sum, item) {
      return sum + Math.max(0, Math.floor(number_(item.men)));
    }, 0);
    if (total < 10 || total % 10 !== 0)
      throw new Error(
        "A scouting mission must contain one or more complete groups of 10 men.",
      );

    let mission;
    withLock_(function () {
      const forces = filterByCharacter_("Retainers", characterId).filter(
        function (row) {
          return (
            row.type === "force" && (row.active === "" || isTruthy_(row.active))
          );
        },
      );
      const active = filterByCharacter_(
        "Scouting Missions",
        characterId,
      ).filter(function (row) {
        return String(row.status || "active") === "active";
      });
      const customActive = filterByCharacter_(
        "Custom Missions",
        characterId,
      ).filter(function (row) {
        return (
          ["scheduled", "active"].indexOf(String(row.status || "scheduled")) >=
          0
        );
      });
      const duplicate = filterByCharacter_(
        "Scouting Missions",
        characterId,
      ).find(function (row) {
        return (
          String(row.territoryId) === territoryId &&
          normalizedScoutingHexKey_(row.hexNumber) ===
            normalizedScoutingHexKey_(hexNumber) &&
          ["active", "completed"].indexOf(String(row.status || "active")) >= 0
        );
      });

      if (duplicate && String(duplicate.status) === "completed") {
        // Recovery/idempotency path: a device can retain a local scouting-start
        // after the DM has already completed/pushed the same hex. Return the
        // authoritative completed mission instead of trapping the player in an
        // "already scouted" retry loop.
        try {
          duplicate.allocations = JSON.parse(
            String(duplicate.allocationsJson || "[]"),
          );
        } catch (error) {
          duplicate.allocations = [];
        }
        delete duplicate.allocationsJson;
        mission = duplicate;
        return;
      }

      if (duplicate) {
        throw new Error("That hex is already being scouted.");
      }
      const reserved = {};
      active.forEach(function (row) {
        let allocations = [];
        try {
          allocations = JSON.parse(String(row.allocationsJson || "[]"));
        } catch (error) {}
        allocations.forEach(function (item) {
          const key =
            String(item.retainerId) +
            "::" +
            String(item.rosterGroupId || item.soldierType);
          reserved[key] = (reserved[key] || 0) + number_(item.men);
        });
      });
      customActive.forEach(function (row) {
        let allocations = [];
        try {
          allocations = JSON.parse(String(row.allocationsJson || "[]"));
        } catch (error) {}
        allocations.forEach(function (item) {
          const key =
            String(item.retainerId) +
            "::" +
            String(item.rosterGroupId || item.soldierType);
          reserved[key] = (reserved[key] || 0) + number_(item.men);
        });
      });
      const normalized = requested.map(function (item) {
        const force = forces.find(function (row) {
          return String(row.retainerId) === String(item.retainerId);
        });
        if (!force)
          throw new Error("A selected fighting force is no longer available.");
        let roster = [];
        try {
          roster = JSON.parse(String(force.rosterJson || "[]"));
        } catch (error) {}
        const troop = roster.find(function (row) {
          if (item.rosterGroupId && row.rosterGroupId)
            return String(row.rosterGroupId) === String(item.rosterGroupId);
          return String(row.soldierType) === String(item.soldierType);
        });
        const men = Math.max(0, Math.floor(number_(item.men)));
        const key =
          String(force.retainerId) +
          "::" +
          String((troop && troop.rosterGroupId) || item.soldierType);
        const unavailableForMissingSerjeants =
          Math.max(0, Math.floor(number_(troop && troop.missingSerjeants))) * 9;
        const deployableMen = Math.max(
          0,
          Math.floor(number_(troop && troop.men)) -
            unavailableForMissingSerjeants,
        );
        if (!troop || men < 1 || deployableMen - (reserved[key] || 0) < men) {
          throw new Error(
            "Not enough uncommitted " +
              cleanText_(item.soldierType, 100) +
              " are available.",
          );
        }
        return {
          retainerId: String(force.retainerId),
          forceName: String(force.name),
          rosterGroupId: cleanText_((troop && troop.rosterGroupId) || "", 120),
          soldierType: cleanText_(item.soldierType, 100),
          men: men,
          // Snapshot the troop AC for this mission. Later equipment changes to
          // the fighting force should not retroactively alter an encounter that
          // occurred during this scouting deployment.
          armorClass: Math.max(
            2,
            Math.min(10, Math.floor(number_(troop.armorClass) || 10)),
          ),
        };
      });
      const serverNow = new Date();
      const suppliedStarted = request.startedAt
        ? new Date(String(request.startedAt))
        : null;
      const started =
        suppliedStarted &&
        !isNaN(suppliedStarted.getTime()) &&
        suppliedStarted.getTime() <= serverNow.getTime()
          ? suppliedStarted
          : serverNow;
      const suppliedDuration = Math.floor(number_(request.durationDays));
      const durationDays =
        suppliedDuration >= 1 && suppliedDuration <= 3
          ? suppliedDuration
          : Math.floor(Math.random() * 3) + 1;
      const completes = new Date(started.getTime() + durationDays * 86400000);
      mission = {
        missionId: Utilities.getUuid(),
        clientMissionId: clientMissionId,
        characterId: characterId,
        territoryId: territoryId,
        hexNumber: hexNumber,
        mapX: Math.max(0, Math.min(100, number_(request.mapX))),
        mapY: Math.max(0, Math.min(100, number_(request.mapY))),
        allocationsJson: JSON.stringify(normalized),
        men: total,
        status: "active",
        startedAt: started.toISOString(),
        startedBy: request.authPlayer.playerId,
        durationDays: durationDays,
        completesAt: completes.toISOString(),
        completedAt: "",
      };
      appendObject_("Scouting Missions", mission);

      // If the app was closed past the locally stored completion timestamp, this
      // targeted request both creates and adjudicates the mission immediately.
      if (completes.getTime() <= Date.now()) {
        resolveCompletedScoutingMission_(mission);
        updateObjectById_(
          "Scouting Missions",
          "missionId",
          String(mission.missionId),
          mission,
        );
      }

      try {
        mission.allocations = JSON.parse(
          String(mission.allocationsJson || "[]"),
        );
      } catch (error) {
        mission.allocations = normalized;
      }
      delete mission.allocationsJson;
    });
    const missionResolved =
      ["completed", "failed"].indexOf(String(mission.status || "active")) >= 0;
    const recoveredCompletedDuplicate =
      missionResolved &&
      clientMissionId &&
      String(mission.clientMissionId || "") !== clientMissionId;
    const startNoticeAlreadySent =
      clientMissionId &&
      scoutingStartNoticeWasSent_(characterId, clientMissionId);

    if (
      !recoveredCompletedDuplicate &&
      (missionResolved || !startNoticeAlreadySent)
    ) {
      try {
        sendScoutingMissionDiscord_(territory, mission, request.authPlayer);
        if (!missionResolved && clientMissionId) {
          markScoutingStartNoticeSent_(characterId, clientMissionId);
        }
      } catch (error) {
        // Discord is best-effort. The scouting mission is already valid Sheet
        // data at this point; a Discord 429/outage must not roll it back or stop
        // Sync Character.
        console.warn(
          "Scouting Discord notification failed for mission " +
            String(mission.missionId || "") +
            ": " +
            (error && error.message ? error.message : String(error)),
        );
      }
    }
    const responseMission = serializeScoutingMission_(
      mission,
      String(request.authPlayer.role) === "dm",
    );
    return scoutingStartResponse_(characterId, responseMission);
  }

  function resolveCompletedScoutingMission_(mission) {
    if (mission.resolvedAt) return;
    const resolvedAt = new Date().toISOString();
    const hex = findTerritoryHexForScoutingMission_(mission);
    const hasPotentialHostileEncounter =
      scoutingHexHasPotentialHostileEncounter_(hex);
    const encounterRoll = hasPotentialHostileEncounter
      ? Math.floor(Math.random() * 6) + 1
      : "";
    const encounterOccurred =
      hasPotentialHostileEncounter && encounterRoll === 1;
    const disposition = normalizeHexReaction_(hex && hex.reaction);
    const modifier = scoutingReactionModifier_(disposition);

    mission.status = "completed";
    mission.completedAt = resolvedAt;
    mission.encounterRoll = encounterRoll;
    mission.encounterOccurred = encounterOccurred;
    mission.reactionDisposition = disposition;
    mission.reactionModifier = modifier;
    if (encounterOccurred) {
      mission.reactionRoll = Math.floor(Math.random() * 100) + 1;
      mission.adjustedReactionRoll = mission.reactionRoll + modifier;
      mission.reactionResult = scoutingReactionResult_(
        mission.adjustedReactionRoll,
      );
      if (mission.adjustedReactionRoll <= 25)
        adjudicateHostileScoutingEncounter_(mission, hex);
    } else if (hasPotentialHostileEncounter) {
      mission.reactionRoll = "";
      mission.adjustedReactionRoll = "";
      mission.reactionResult = "No encounter";
    } else {
      mission.reactionDisposition = "";
      mission.reactionModifier = 0;
      mission.reactionRoll = "";
      mission.adjustedReactionRoll = "";
      mission.reactionResult = "No potential hostile encounter";
    }

    const missionSucceeded = String(mission.status) !== "failed";
    const populationAdded = missionSucceeded
      ? Math.max(0, Math.floor(number_(hex && hex.hexPopulationValue)))
      : 0;
    mission.populationAdded = populationAdded;
    if (populationAdded > 0) {
      ensureHexFieldAllocation_(hex, resolvedAt);
      updateObjectById_("Territory Hexes", "hexId", String(hex.hexId), hex);
      const territory = rowsAsObjects_("Territories").find(function (row) {
        return (
          String(row.territoryId) === String(mission.territoryId) &&
          String(row.characterId) === String(mission.characterId)
        );
      });
      if (territory) {
        territory.population =
          Math.max(0, Math.floor(number_(territory.population))) +
          populationAdded;
        territory.updatedAt = resolvedAt;
        updateObjectById_(
          "Territories",
          "territoryId",
          String(territory.territoryId),
          territory,
        );
      }
    }
    mission.resolvedAt = resolvedAt;
  }

  function findTerritoryHexForScoutingMission_(mission) {
    const missionHexKey = normalizedScoutingHexKey_(
      mission && mission.hexNumber,
    );
    return rowsAsObjects_("Territory Hexes").find(function (row) {
      return (
        String(row.territoryId) === String(mission && mission.territoryId) &&
        normalizedScoutingHexKey_(row.hexNumber) === missionHexKey
      );
    });
  }

  function scoutingHexHasPotentialHostileEncounter_(hex) {
    return scoutingAttackerCount_(hex) > 0;
  }

  function scoutingAttackerCount_(hex) {
    return Math.max(
      0,
      Math.floor(number_(hex && hex.potentialHostileEncounterPopulation)),
    );
  }

  function normalizeHexReaction_(value) {
    const reaction = cleanText_(value || "", 20).toLowerCase();
    if (reaction === "friendly") return "Friendly";
    if (reaction === "neutral") return "Neutral";
    if (reaction === "hostile") return "Hostile";
    return "";
  }

  function scoutingReactionModifier_(disposition) {
    if (disposition === "Friendly") return 25;
    if (disposition === "Hostile") return -25;
    return 0;
  }

  function scoutingReactionResult_(adjustedRoll) {
    if (adjustedRoll <= 5) return "Violently hostile, immediate attack";
    if (adjustedRoll <= 25) return "Hostile, immediate action";
    if (adjustedRoll <= 45) return "Uncertain but 55% prone toward negative";
    if (adjustedRoll <= 55) return "Neutral — uninterested — uncertain";
    if (adjustedRoll <= 75) return "Uncertain but 55% prone toward positive";
    if (adjustedRoll <= 95) return "Friendly, immediate action";
    return "Enthusiastically friendly, immediate acceptance";
  }

  function adjudicateHostileScoutingEncounter_(mission, hex) {
    const scouts = Math.max(0, Math.floor(number_(mission.men)));
    const attackers = scoutingAttackerCount_(hex);
    const attack = scoutingHostileAttack_(mission);

    mission.attackerCount = attackers;
    mission.attackThac0 = attack.thac0;
    mission.attackRoll = attack.roll;
    mission.attackNeeded = attack.needed;
    mission.attackHit = attack.hit;
    mission.attackTargetArmorClass = attack.armorClass;
    mission.attackTargetSoldierType = attack.soldierType;
    mission.casualtyRoll = "";
    mission.scoutsKilled = 0;
    mission.serjeantsChecked = 0;
    mission.serjeantsKilled = 0;
    mission.survivors = scouts;
    mission.encounterKnownToPlayer = true;
    mission.encounteredInhabitants = cleanText_(
      (hex && hex.inhabitants) || "Unknown attackers",
      2000,
    );

    // One hostile attack is the scouts' chance to break contact before morale.
    // If it misses, the party escapes automatically and scouting continues.
    if (!attack.hit) {
      mission.scoutMoraleRoll = "";
      mission.scoutMoraleBonus = 0;
      mission.scoutMoralePassed = "";
      mission.attackerMoraleRoll = "";
      mission.attackerMoraleBonus = 0;
      mission.attackerMoralePassed = "";
      mission.missionOutcome =
        "The hostile attack missed; the scouts escaped and the scouting mission continued.";
      return;
    }

    const scoutMorale = scoutingMoraleCheck_(scouts, attackers);
    const attackerMorale = scoutingMoraleCheck_(attackers, scouts);
    mission.scoutMoraleRoll = scoutMorale.roll;
    mission.scoutMoraleBonus = scoutMorale.bonus;
    mission.scoutMoralePassed = scoutMorale.passed;
    mission.attackerMoraleRoll = attackerMorale.roll;
    mission.attackerMoraleBonus = attackerMorale.bonus;
    mission.attackerMoralePassed = attackerMorale.passed;

    if (!scoutMorale.passed && !attackerMorale.passed) {
      mission.status = "failed";
      mission.missionOutcome =
        "Both sides withdrew; mission failed with no casualties.";
      return;
    }
    if (!scoutMorale.passed && attackerMorale.passed) {
      mission.status = "failed";
      if (attackers < 1) {
        mission.missionOutcome =
          "Scouts withdrew; no hostile encounter population was recorded, so no casualties occurred.";
        return;
      }
      const casualtyRoll = Math.floor(Math.random() * scouts) + 1;
      const scoutsKilled = Math.min(casualtyRoll, attackers, scouts);
      const survivorsBeforeSerjeants = scouts - scoutsKilled;
      let serjeantsKilled = 0;
      const serjeantsChecked =
        survivorsBeforeSerjeants > 0 ? Math.ceil(scouts / 10) : 0;
      for (let index = 0; index < serjeantsChecked; index += 1) {
        if (Math.floor(Math.random() * 10) + 1 === 1) serjeantsKilled += 1;
      }
      serjeantsKilled = Math.min(serjeantsKilled, survivorsBeforeSerjeants);
      mission.casualtyRoll = casualtyRoll;
      mission.scoutsKilled = scoutsKilled + serjeantsKilled;
      mission.serjeantsChecked = serjeantsChecked;
      mission.serjeantsKilled = serjeantsKilled;
      mission.survivors = Math.max(0, scouts - mission.scoutsKilled);
      mission.encounterKnownToPlayer = mission.survivors > 0;
      if (!mission.encounterKnownToPlayer) mission.encounteredInhabitants = "";
      mission.missionOutcome =
        mission.survivors > 0
          ? "Mission failed; surviving scouts returned with encounter information."
          : "The scouting party did not return; no information was gained.";
      applyScoutingLosses_(mission, scoutsKilled, serjeantsKilled);
      return;
    }
    mission.missionOutcome = !attackerMorale.passed
      ? "Attackers withdrew; scouting mission continued with no casualties."
      : "Scouts held their ground; scouting mission continued with no casualties.";
  }

  function scoutingHostileAttack_(mission) {
    const thac0 = 18;
    const target = scoutingAttackTarget_(mission);
    const roll = Math.floor(Math.random() * 20) + 1;
    const needed = thac0 - target.armorClass;
    const hit = roll >= needed;

    return {
      thac0: thac0,
      roll: roll,
      needed: needed,
      hit: hit,
      armorClass: target.armorClass,
      soldierType: target.soldierType,
    };
  }

  function scoutingAttackTarget_(mission) {
    let allocations = [];
    try {
      allocations = JSON.parse(String(mission.allocationsJson || "[]"));
    } catch (error) {}
    const viable = allocations.filter(function (allocation) {
      return Math.max(0, Math.floor(number_(allocation.men))) > 0;
    });
    const total = viable.reduce(function (sum, allocation) {
      return sum + Math.max(0, Math.floor(number_(allocation.men)));
    }, 0);
    if (!total) return { armorClass: 10, soldierType: "Scout" };

    let pick = Math.floor(Math.random() * total) + 1;
    for (let index = 0; index < viable.length; index += 1) {
      const allocation = viable[index];
      pick -= Math.max(0, Math.floor(number_(allocation.men)));
      if (pick > 0) continue;

      let armorClass = Math.floor(number_(allocation.armorClass));
      if (armorClass < 2 || armorClass > 10) {
        // Backward compatibility for scouting missions that were started before
        // armorClass was saved into allocations.
        const force = rowsAsObjects_("Retainers").find(function (row) {
          return String(row.retainerId) === String(allocation.retainerId);
        });
        if (force) {
          let roster = [];
          try {
            roster = JSON.parse(String(force.rosterJson || "[]"));
          } catch (error) {}
          const troop = roster.find(function (row) {
            if (allocation.rosterGroupId && row.rosterGroupId)
              return (
                String(row.rosterGroupId) === String(allocation.rosterGroupId)
              );
            return String(row.soldierType) === String(allocation.soldierType);
          });
          armorClass = Math.floor(number_(troop && troop.armorClass));
        }
      }

      return {
        armorClass: armorClass >= 2 && armorClass <= 10 ? armorClass : 10,
        soldierType: cleanText_(allocation.soldierType || "Scout", 100),
      };
    }

    return { armorClass: 10, soldierType: "Scout" };
  }

  function scoutingMoraleCheck_(ownCount, opposingCount) {
    const rawRoll = Math.floor(Math.random() * 100) + 1;
    const bonus =
      ownCount > 0 && opposingCount > 0 && ownCount >= opposingCount * 3
        ? 20
        : 0;
    const adjustedRoll = Math.min(100, rawRoll + bonus);
    return {
      roll: rawRoll,
      bonus: bonus,
      adjusted: adjustedRoll,
      passed: adjustedRoll > 50,
    };
  }

  function applyScoutingLosses_(mission, scoutsKilled, serjeantsKilled) {
    let remainingOrdinaryLosses = Math.max(
      0,
      Math.floor(number_(scoutsKilled)),
    );
    let remainingSerjeantLosses = Math.max(
      0,
      Math.floor(number_(serjeantsKilled)),
    );
    let allocations = [];
    try {
      allocations = JSON.parse(String(mission.allocationsJson || "[]"));
    } catch (error) {}
    allocations.forEach(function (allocation) {
      const force = rowsAsObjects_("Retainers").find(function (row) {
        return String(row.retainerId) === String(allocation.retainerId);
      });
      if (!force) return;
      let roster = [];
      try {
        roster = JSON.parse(String(force.rosterJson || "[]"));
      } catch (error) {}
      const troop = roster.find(function (row) {
        if (allocation.rosterGroupId && row.rosterGroupId)
          return String(row.rosterGroupId) === String(allocation.rosterGroupId);
        return String(row.soldierType) === String(allocation.soldierType);
      });
      if (!troop) return;
      const allocated = Math.max(0, Math.floor(number_(allocation.men)));
      const ordinaryHere = Math.max(0, allocated - Math.ceil(allocated / 10));
      const ordinaryLost = Math.min(remainingOrdinaryLosses, ordinaryHere);
      remainingOrdinaryLosses -= ordinaryLost;
      const serjeantsHere = Math.ceil(allocated / 10);
      const serjeantsLost = Math.min(remainingSerjeantLosses, serjeantsHere);
      remainingSerjeantLosses -= serjeantsLost;
      if (serjeantsLost > 0) {
        allocation.strandedMen = Math.min(
          Math.max(0, allocated - ordinaryLost - serjeantsLost),
          Math.max(0, Math.floor(number_(allocation.strandedMen))) +
            serjeantsLost * 9,
        );
      }
      troop.men = Math.max(
        0,
        Math.floor(number_(troop.men)) - ordinaryLost - serjeantsLost,
      );
      troop.missingSerjeants = Math.max(
        0,
        Math.floor(number_(troop.missingSerjeants)) + serjeantsLost,
      );
      force.men = roster.reduce(function (sum, entry) {
        return sum + Math.max(0, Math.floor(number_(entry.men)));
      }, 0);
      force.rosterJson = JSON.stringify(
        roster.filter(function (entry) {
          return number_(entry.men) > 0;
        }),
      );
      force.wageGp = pcmAutomaticRosterWage_(roster);
      force.updatedAt = new Date().toISOString();
      updateObjectById_(
        "Retainers",
        "retainerId",
        String(force.retainerId),
        force,
      );
      syncRetainerExpenseUnlocked_(force, mission.startedBy || "system");
    });
    mission.allocationsJson = JSON.stringify(allocations);
    mission.strandedMen = allocations.reduce(function (sum, allocation) {
      return sum + Math.max(0, Math.floor(number_(allocation.strandedMen)));
    }, 0);
    mission.promotionFeeGp = allocations.reduce(function (sum, allocation) {
      const missing = Math.ceil(
        Math.max(0, Math.floor(number_(allocation.strandedMen))) / 9,
      );
      const baseWage =
        PCM_RECRUIT_WAGES[
          String(allocation.soldierType || "")
            .trim()
            .toLowerCase()
        ] || 0;
      return sum + missing * baseWage * 10;
    }, 0);
  }

  function serializeScoutingMission_(mission, isDm) {
    const result = Object.assign({}, mission);
    if (!Array.isArray(result.allocations))
      result.allocations = JSON.parse(result.allocationsJson || "[]");
    delete result.allocationsJson;
    if (String(result.status) === "completed") {
      const savedEncounterRoll = Math.floor(number_(result.encounterRoll));
      if (savedEncounterRoll >= 1 && savedEncounterRoll <= 6) {
        result.encounterRoll = savedEncounterRoll;
        result.encounterOccurred = savedEncounterRoll === 1;
      }
    }
    if (!isDm) {
      delete result.startedAt;
      delete result.startedBy;
      delete result.durationDays;
      delete result.completesAt;
      delete result.completedAt;
      delete result.encounterRoll;
      delete result.encounterOccurred;
      delete result.reactionDisposition;
      delete result.reactionModifier;
      delete result.reactionRoll;
      delete result.adjustedReactionRoll;
      delete result.reactionResult;
      delete result.attackThac0;
      delete result.attackRoll;
      delete result.attackNeeded;
      delete result.attackHit;
      delete result.attackTargetArmorClass;
      delete result.attackTargetSoldierType;
      delete result.scoutMoraleRoll;
      delete result.scoutMoraleBonus;
      delete result.scoutMoralePassed;
      delete result.attackerMoraleRoll;
      delete result.attackerMoraleBonus;
      delete result.attackerMoralePassed;
      delete result.casualtyRoll;
      delete result.serjeantsChecked;
      delete result.serjeantsKilled;
      delete result.resolvedAt;
    }
    return result;
  }

  function scoutingStartResponse_(characterId, responseMission) {
    const affectedIds = {};
    (responseMission.allocations || []).forEach(function (allocation) {
      affectedIds[String(allocation.retainerId || "")] = true;
    });
    const affectedRetainers = filterByCharacter_("Retainers", characterId)
      .filter(function (retainer) {
        return affectedIds[String(retainer.retainerId || "")];
      })
      .map(function (retainer) {
        if (retainer.type === "force") {
          try {
            retainer.roster = retainer.rosterJson
              ? JSON.parse(String(retainer.rosterJson))
              : [
                  {
                    soldierType: String(retainer.role || ""),
                    men: number_(retainer.men),
                  },
                ];
          } catch (error) {
            retainer.roster = [
              {
                soldierType: String(retainer.role || ""),
                men: number_(retainer.men),
              },
            ];
          }
        }
        delete retainer.rosterJson;
        delete retainer.loyalty;
        return retainer;
      });
    const territory = rowsAsObjects_("Territories").find(function (row) {
      return (
        String(row.characterId) === String(characterId) &&
        String(row.territoryId) === String(responseMission.territoryId || "")
      );
    });
    return {
      ok: true,
      mission: responseMission,
      affectedRetainers: affectedRetainers,
      territoryPopulation: territory
        ? {
            territoryId: String(territory.territoryId),
            population: Math.max(0, Math.floor(number_(territory.population))),
          }
        : undefined,
    };
  }

  function completeDueScoutingMission_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const missionId = cleanText_(request.missionId, 120);
    requireTerritoryAccess_(request.authPlayer, characterId);
    if (!missionId) throw new Error("Select a scouting mission to complete.");

    let completedMission;
    withLock_(function () {
      const mission = rowsAsObjects_("Scouting Missions").find(function (row) {
        return (
          String(row.missionId) === missionId &&
          String(row.characterId) === characterId
        );
      });
      if (!mission)
        throw new Error("That scouting mission could not be found.");

      const status = String(mission.status || "active");
      if (status === "completed" || status === "failed") {
        completedMission = mission;
        return;
      }
      if (status !== "active") {
        throw new Error("That scouting mission is no longer active.");
      }

      let completesAt = new Date(mission.completesAt || 0).getTime();
      if (!isFinite(completesAt) || completesAt <= 0) {
        const startedAt = new Date(mission.startedAt || 0).getTime();
        const durationDays = Math.max(0, number_(mission.durationDays));
        if (isFinite(startedAt) && startedAt > 0 && durationDays > 0) {
          completesAt = startedAt + durationDays * 86400000;
          mission.completesAt = new Date(completesAt).toISOString();
        }
      }

      if (!isFinite(completesAt) || completesAt <= 0) {
        throw new Error(
          "This scouting mission does not have a valid completion time.",
        );
      }
      if (completesAt > Date.now()) {
        throw new Error("This scouting mission is not complete yet.");
      }

      resolveCompletedScoutingMission_(mission);
      updateObjectById_("Scouting Missions", "missionId", missionId, mission);
      completedMission = mission;
    });

    try {
      completedMission.allocations = JSON.parse(
        String(completedMission.allocationsJson || "[]"),
      );
    } catch (error) {
      completedMission.allocations = [];
    }
    delete completedMission.allocationsJson;

    const responseMission = serializeScoutingMission_(
      completedMission,
      String(request.authPlayer.role) === "dm",
    );
    return scoutingStartResponse_(characterId, responseMission);
  }

  function completeScoutingMissionForTesting_(request) {
    requireDm_(request.authPlayer);
    const characterId = cleanText_(request.characterId, 120);
    const missionId = cleanText_(request.missionId, 120);
    requireCharacterAccess_(request.authPlayer, characterId);
    if (!missionId) throw new Error("Select a scouting mission to complete.");

    let completedMission;
    withLock_(function () {
      const mission = rowsAsObjects_("Scouting Missions").find(function (row) {
        return (
          String(row.missionId) === missionId &&
          String(row.characterId) === characterId
        );
      });
      if (!mission)
        throw new Error("That scouting mission could not be found.");
      if (String(mission.status || "active") !== "active") {
        throw new Error("That scouting mission is no longer active.");
      }
      resolveCompletedScoutingMission_(mission);
      updateObjectById_("Scouting Missions", "missionId", missionId, mission);
      completedMission = mission;
    });
    return {
      ok: true,
      mission: serializeScoutingMission_(completedMission, true),
    };
  }

  function viewScoutingMissionResults_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const missionId = cleanText_(request.missionId, 120);
    requireCharacterAccess_(request.authPlayer, characterId);
    let saved;
    withLock_(function () {
      const mission = rowsAsObjects_("Scouting Missions").find(function (row) {
        return (
          String(row.missionId) === missionId &&
          String(row.characterId) === characterId
        );
      });
      if (
        !mission ||
        ["completed", "failed"].indexOf(String(mission.status)) < 0
      ) {
        throw new Error("That scouting mission has not produced results yet.");
      }
      if (!mission.resultsViewedAt)
        mission.resultsViewedAt = new Date().toISOString();
      updateObjectById_("Scouting Missions", "missionId", missionId, mission);
      saved = mission;
    });
    return {
      ok: true,
      mission: serializeScoutingMission_(
        saved,
        String(request.authPlayer.role) === "dm",
      ),
    };
  }

  function dismissScoutingMission_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const missionId = cleanText_(request.missionId, 120);
    requireCharacterAccess_(request.authPlayer, characterId);
    let saved;
    withLock_(function () {
      const mission = rowsAsObjects_("Scouting Missions").find(function (row) {
        return (
          String(row.missionId) === missionId &&
          String(row.characterId) === characterId
        );
      });
      if (!mission || String(mission.status) !== "completed") {
        throw new Error("Only a successful scouting mission can be dismissed.");
      }
      if (!mission.resultsViewedAt)
        throw new Error("View the mission results before dismissing them.");
      mission.dismissedAt = mission.dismissedAt || new Date().toISOString();
      updateObjectById_("Scouting Missions", "missionId", missionId, mission);
      saved = mission;
    });
    return {
      ok: true,
      mission: serializeScoutingMission_(
        saved,
        String(request.authPlayer.role) === "dm",
      ),
    };
  }

  function promoteScoutingSerjeants_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const missionId = cleanText_(request.missionId, 120);
    requireCharacterAccess_(request.authPlayer, characterId);
    let updatedMission;
    let transaction;
    withLock_(function () {
      const mission = rowsAsObjects_("Scouting Missions").find(function (row) {
        return (
          String(row.missionId) === missionId &&
          String(row.characterId) === characterId
        );
      });
      if (
        !mission ||
        ["completed", "failed"].indexOf(String(mission.status)) < 0
      ) {
        throw new Error("That completed scouting mission could not be found.");
      }
      let allocations = [];
      try {
        allocations = JSON.parse(String(mission.allocationsJson || "[]"));
      } catch (error) {}
      const feeGp = allocations.reduce(function (sum, allocation) {
        const missing = Math.ceil(
          Math.max(0, Math.floor(number_(allocation.strandedMen))) / 9,
        );
        const baseWage =
          PCM_RECRUIT_WAGES[
            String(allocation.soldierType || "")
              .trim()
              .toLowerCase()
          ] || 0;
        return sum + missing * baseWage * 10;
      }, 0);
      if (feeGp < 1)
        throw new Error(
          "This scouting party has no serjeant promotion fee due.",
        );
      const promotionPayment = walletPaymentDeltas_(
        requestWalletBalance_(request),
        feeGp * 200,
      );
      if (!promotionPayment)
        throw new Error(
          "The character wallet cannot cover the " +
            feeGp +
            " gp promotion fee.",
        );

      allocations.forEach(function (allocation) {
        const stranded = Math.max(
          0,
          Math.floor(number_(allocation.strandedMen)),
        );
        if (!stranded) return;
        const force = rowsAsObjects_("Retainers").find(function (row) {
          return String(row.retainerId) === String(allocation.retainerId);
        });
        if (force) {
          let roster = [];
          try {
            roster = JSON.parse(String(force.rosterJson || "[]"));
          } catch (error) {}
          const troop = roster.find(function (row) {
            if (allocation.rosterGroupId && row.rosterGroupId)
              return (
                String(row.rosterGroupId) === String(allocation.rosterGroupId)
              );
            return String(row.soldierType) === String(allocation.soldierType);
          });
          if (troop) {
            troop.missingSerjeants = Math.max(
              0,
              Math.floor(number_(troop.missingSerjeants)) -
                Math.ceil(stranded / 9),
            );
            force.rosterJson = JSON.stringify(roster);
            force.updatedAt = new Date().toISOString();
            updateObjectById_(
              "Retainers",
              "retainerId",
              String(force.retainerId),
              force,
            );
          }
        }
        allocation.strandedMen = 0;
      });
      const now = new Date().toISOString();
      mission.allocationsJson = JSON.stringify(allocations);
      mission.strandedMen = 0;
      mission.promotionFeeGp = 0;
      mission.promotionPaidAt = now;
      updateObjectById_("Scouting Missions", "missionId", missionId, mission);
      transaction = {
        transactionId: Utilities.getUuid(),
        characterId: characterId,
        timestamp: now,
        type: "expense",
        label:
          "Promote replacement scouting serjeant" + (feeGp === 1 ? "" : "s"),
        pp: promotionPayment.pp,
        gp: promotionPayment.gp,
        sp: promotionPayment.sp,
        cp: promotionPayment.cp,
        note:
          "Promotion fee for scouting mission to sub-hex " +
          String(mission.hexNumber),
        recurring: false,
        createdBy: request.authPlayer.playerId,
      };
      // Wallet state is local-only. The client records this returned payment event locally.
      mission.allocations = allocations;
      delete mission.allocationsJson;
      updatedMission = mission;
    });
    return {
      ok: true,
      mission: serializeScoutingMission_(
        updatedMission,
        String(request.authPlayer.role) === "dm",
      ),
      transaction: transaction,
    };
  }

  function createCustomMission_(request) {
    const characterId = cleanText_(request.characterId, 120);
    const territoryId = cleanText_(request.territoryId, 120);
    const orderCharacter = requireTerritoryAccess_(
      request.authPlayer,
      characterId,
    );
    if (
      !getDiscordWebhookForPlayer_(orderCharacter.playerId) ||
      !/^\d{17,20}$/.test(String(orderCharacter.discordThreadId || ""))
    ) {
      throw new Error("The DM has not configured Discord for this character.");
    }
    const objective = cleanText_(request.objective, 500);
    const missionLocation = cleanText_(request.missionLocation, 300);
    const startDate = cleanText_(request.startDate, 10);
    const durationDays = Math.max(1, Math.floor(number_(request.durationDays)));
    if (!objective) throw new Error("Enter the mission objective.");
    if (!missionLocation) throw new Error("Enter the mission location.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate))
      throw new Error("Choose a valid start date.");
    const starts = Utilities.calendarMidnight(startDate);
    if (isNaN(starts.getTime())) throw new Error("Choose a valid start date.");
    const completes = new Date(starts.getTime() + durationDays * 86400000);
    const requested = Array.isArray(request.allocations)
      ? request.allocations
      : [];
    const total = requested.reduce(function (sum, item) {
      return sum + Math.max(0, Math.floor(number_(item.men)));
    }, 0);
    if (total < 10 || total % 10 !== 0)
      throw new Error(
        "Assign one or more complete 10-man squads to these orders.",
      );
    if (
      requested.some(function (item) {
        const men = Math.max(0, Math.floor(number_(item.men)));
        return men < 10 || men % 10 !== 0;
      })
    )
      throw new Error(
        "Each soldier allocation must be made in complete groups of 10 men.",
      );

    let mission;
    withLock_(function () {
      const forces = filterByCharacter_("Retainers", characterId).filter(
        function (row) {
          return (
            row.type === "force" && (row.active === "" || isTruthy_(row.active))
          );
        },
      );
      const officerRetainerId = cleanText_(
        request.officerRetainerId || "",
        120,
      );
      let attachedOfficer = null;
      if (officerRetainerId) {
        attachedOfficer = filterByCharacter_("Retainers", characterId).find(
          function (row) {
            return (
              String(row.retainerId) === officerRetainerId &&
              row.type === "individual" &&
              /^(lieutenant|captain)$/i.test(String(row.role || "").trim()) &&
              (row.active === "" || isTruthy_(row.active))
            );
          },
        );
        if (!attachedOfficer)
          throw new Error(
            "The selected lieutenant or captain is no longer available.",
          );
        const officerReserved = filterByCharacter_(
          "Custom Missions",
          characterId,
        ).some(function (row) {
          return (
            ["scheduled", "active"].indexOf(
              String(row.status || "scheduled"),
            ) >= 0 && String(row.officerRetainerId || "") === officerRetainerId
          );
        });
        if (officerReserved)
          throw new Error(
            "That officer is already attached to another mission.",
          );
      }
      const reserved = {};
      ["Scouting Missions", "Custom Missions"].forEach(function (sheetName) {
        filterByCharacter_(sheetName, characterId)
          .filter(function (row) {
            const status = String(
              row.status ||
                (sheetName === "Scouting Missions" ? "active" : "scheduled"),
            );
            return sheetName === "Scouting Missions"
              ? status === "active"
              : ["scheduled", "active"].indexOf(status) >= 0;
          })
          .forEach(function (row) {
            let allocations = [];
            try {
              allocations = JSON.parse(String(row.allocationsJson || "[]"));
            } catch (error) {}
            allocations.forEach(function (item) {
              const key =
                String(item.retainerId) + "::" + String(item.soldierType);
              reserved[key] = (reserved[key] || 0) + number_(item.men);
            });
          });
      });
      const normalized = requested.map(function (item) {
        const force = forces.find(function (row) {
          return String(row.retainerId) === String(item.retainerId);
        });
        if (!force)
          throw new Error("A selected fighting force is no longer available.");
        let roster = [];
        try {
          roster = JSON.parse(String(force.rosterJson || "[]"));
        } catch (error) {}
        const troop = roster.find(function (row) {
          return String(row.soldierType) === String(item.soldierType);
        });
        const men = Math.max(0, Math.floor(number_(item.men)));
        const key = String(force.retainerId) + "::" + String(item.soldierType);
        const leaderlessMen =
          Math.max(0, Math.floor(number_(troop && troop.missingSerjeants))) * 9;
        const deployableMen = Math.max(
          0,
          Math.floor(number_(troop && troop.men)) - leaderlessMen,
        );
        if (!troop || men < 1 || deployableMen - (reserved[key] || 0) < men) {
          throw new Error(
            "Not enough uncommitted " +
              cleanText_(item.soldierType, 100) +
              " are available.",
          );
        }
        return {
          retainerId: String(force.retainerId),
          forceName: String(force.name),
          soldierType: cleanText_(item.soldierType, 100),
          men: men,
        };
      });
      const now = new Date();
      mission = {
        missionId: Utilities.getUuid(),
        characterId: characterId,
        territoryId: territoryId,
        objective: objective,
        missionLocation: missionLocation,
        startDate: startDate,
        durationDays: durationDays,
        completesAt: completes.toISOString(),
        allocationsJson: JSON.stringify(normalized),
        men: total,
        additionalNotes: cleanText_(request.additionalNotes || "", 5000),
        officerRetainerId: attachedOfficer
          ? String(attachedOfficer.retainerId)
          : "",
        officerName: attachedOfficer ? String(attachedOfficer.name) : "",
        officerRole: attachedOfficer ? String(attachedOfficer.role) : "",
        status: now.getTime() >= starts.getTime() ? "active" : "scheduled",
        createdAt: now.toISOString(),
        startedAt: now.getTime() >= starts.getTime() ? now.toISOString() : "",
        completedAt: "",
        discordSentAt: "",
        createdBy: request.authPlayer.playerId,
      };
      appendObject_("Custom Missions", mission);
      mission.allocations = normalized;
      delete mission.allocationsJson;
    });
    try {
      sendCustomMissionDiscord_(mission);
      /* Delivery is recorded by the durable outbox after Discord acknowledges it. */
      withLock_(function () {
        updateObjectById_(
          "Custom Missions",
          "missionId",
          mission.missionId,
          mission,
        );
      });
    } catch (error) {
      withLock_(function () {
        deleteRowsByValue_("Custom Missions", "missionId", mission.missionId);
      });
      throw error;
    }
    return { ok: true, mission: mission };
  }

  function deleteTransaction_(request) {
    requireFields_(request, ["characterId", "transactionId"]);
    const characterId = cleanText_(request.characterId, 120);
    const transactionId = cleanText_(request.transactionId, 120);
    requireCharacterAccess_(request.authPlayer, characterId);

    const transaction = rowsAsObjects_("Wallet Transactions").find(
      function (row) {
        return (
          String(row.transactionId) === transactionId &&
          String(row.characterId) === characterId
        );
      },
    );
    if (!transaction) throw new Error("Transaction not found.");

    withLock_(function () {
      updateObjectById_("Wallet Transactions", "transactionId", transactionId, {
        deleted: true,
      });
    });

    return { ok: true, transactionId: transactionId };
  }

  function createRecurringExpense_(request) {
    requireFields_(request, ["characterId", "label", "frequency", "startDate"]);
    requireCharacterAccess_(request.authPlayer, request.characterId);
    if (["weekly", "monthly", "annually"].indexOf(request.frequency) < 0) {
      throw new Error(
        "Recurring frequency must be weekly, monthly, or annually.",
      );
    }
    const startDate = parseCalendarDate_(request.startDate);
    const row = {
      scheduleId: Utilities.getUuid(),
      characterId: request.characterId,
      label: cleanText_(request.label, 160),
      pp: Math.abs(number_(request.pp)),
      gp: Math.abs(number_(request.gp)),
      sp: Math.abs(number_(request.sp)),
      cp: Math.abs(number_(request.cp)),
      note: cleanText_(request.note || "", 500),
      frequency: request.frequency,
      startDate: formatCalendarDate_(startDate),
      occurrenceCount: 0,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: request.authPlayer.playerId,
      sourceType: cleanText_(request.sourceType || "", 40),
      sourceId: cleanText_(request.sourceId || "", 120),
    };
    if (!(row.pp || row.gp || row.sp || row.cp)) {
      throw new Error("A recurring expense must have an amount.");
    }

    withLock_(function () {
      appendObject_("Recurring Expenses", row);
      // A newly created schedule only needs its own due occurrence processed.
      // Processing every active recurring schedule here can make the create
      // request take long enough that the app appears to hang.
      processRecurringExpensesUnlocked_(row.scheduleId);
    });
    return { ok: true, schedule: row };
  }

  function updateRecurringExpense_(request) {
    requireFields_(request, [
      "characterId",
      "scheduleId",
      "label",
      "frequency",
      "startDate",
    ]);
    const characterId = cleanText_(request.characterId, 120);
    const scheduleId = cleanText_(request.scheduleId, 120);
    requireCharacterAccess_(request.authPlayer, characterId);
    if (["weekly", "monthly", "annually"].indexOf(request.frequency) < 0) {
      throw new Error(
        "Recurring frequency must be weekly, monthly, or annually.",
      );
    }

    const sheet = getSheet_("Recurring Expenses");
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const scheduleIdColumn = headers.indexOf("scheduleId");
    const characterIdColumn = headers.indexOf("characterId");
    const rowIndex = values.slice(1).findIndex(function (row) {
      return (
        String(row[scheduleIdColumn]) === scheduleId &&
        String(row[characterIdColumn]) === characterId
      );
    });
    if (rowIndex < 0) throw new Error("Recurring expense not found.");

    const current = {};
    headers.forEach(function (header, columnIndex) {
      current[header] = serializeCell_(values[rowIndex + 1][columnIndex]);
    });
    if (!isTruthy_(current.active))
      throw new Error("This recurring expense is no longer active.");

    const updated = {
      scheduleId: scheduleId,
      characterId: characterId,
      label: cleanText_(request.label, 160),
      pp: Math.abs(number_(request.pp)),
      gp: Math.abs(number_(request.gp)),
      sp: Math.abs(number_(request.sp)),
      cp: Math.abs(number_(request.cp)),
      note: cleanText_(request.note || "", 500),
      frequency: request.frequency,
      startDate: formatCalendarDate_(parseCalendarDate_(request.startDate)),
      occurrenceCount: number_(current.occurrenceCount),
      active: true,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      sourceType: current.sourceType || "",
      sourceId: current.sourceId || "",
    };
    let linkedRetainer;
    if (updated.sourceType === "retainer" && updated.sourceId) {
      linkedRetainer = rowsAsObjects_("Retainers").find(function (row) {
        return (
          String(row.retainerId) === String(updated.sourceId) &&
          String(row.characterId) === characterId
        );
      });
      if (!linkedRetainer)
        throw new Error(
          "The linked retainer or fighting force no longer exists.",
        );
      if (
        linkedRetainer.type === "force" &&
        ["monthly", "annually"].indexOf(updated.frequency) < 0
      ) {
        throw new Error("Fighting-force upkeep must be monthly or annual.");
      }
    }
    if (!(updated.pp || updated.gp || updated.sp || updated.cp)) {
      throw new Error("A recurring expense must have an amount.");
    }

    const timingChanged =
      updated.frequency !== current.frequency ||
      updated.startDate !==
        formatCalendarDate_(parseCalendarDate_(current.startDate));
    if (timingChanged) {
      updated.occurrenceCount = firstFutureOccurrenceIndex_(updated);
    }

    withLock_(function () {
      headers.forEach(function (header, columnIndex) {
        if (Object.prototype.hasOwnProperty.call(updated, header)) {
          sheet
            .getRange(rowIndex + 2, columnIndex + 1)
            .setValue(updated[header]);
        }
      });
      if (updated.sourceType === "retainer" && updated.sourceId) {
        const amountCoin =
          ["pp", "gp", "sp", "cp"].find(function (coin) {
            return number_(updated[coin]) > 0;
          }) || "gp";
        updateObjectById_("Retainers", "retainerId", updated.sourceId, {
          wageGp: number_(updated[amountCoin]),
          costCoin: amountCoin,
          wageFrequency: updated.frequency,
          hiringDate:
            linkedRetainer.type === "force"
              ? updated.startDate
              : linkedRetainer.hiringDate,
          scheduleId: scheduleId,
          updatedAt: new Date().toISOString(),
        });
      }
    });
    return { ok: true, schedule: updated };
  }

  function serializeCell_(value) {
    return value instanceof Date ? value.toISOString() : value;
  }

  function firstFutureOccurrenceIndex_(schedule) {
    const today = parseCalendarDate_(
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      ),
    );
    let occurrenceIndex = 0;
    let dueDate = recurringOccurrenceDate_(schedule, occurrenceIndex);
    while (dueDate.getTime() <= today.getTime()) {
      occurrenceIndex += 1;
      dueDate = recurringOccurrenceDate_(schedule, occurrenceIndex);
    }
    return occurrenceIndex;
  }

  function recurringOccurrenceDate_(schedule, occurrenceIndex) {
    const anchor = parseCalendarDate_(schedule.startDate);
    if (schedule.frequency === "weekly") {
      return new Date(
        Date.UTC(
          anchor.getUTCFullYear(),
          anchor.getUTCMonth(),
          anchor.getUTCDate() + occurrenceIndex * 7,
        ),
      );
    }
    const monthOffset =
      schedule.frequency === "annually"
        ? occurrenceIndex * 12
        : occurrenceIndex;
    const targetMonth = anchor.getUTCMonth() + monthOffset;
    const targetYear = anchor.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(
      Date.UTC(targetYear, normalizedMonth + 1, 0),
    ).getUTCDate();
    return new Date(
      Date.UTC(
        targetYear,
        normalizedMonth,
        Math.min(anchor.getUTCDate(), lastDay),
      ),
    );
  }

  function cancelRecurringExpense_(request) {
    requireFields_(request, ["characterId", "scheduleId"]);
    const characterId = cleanText_(request.characterId, 120);
    const scheduleId = cleanText_(request.scheduleId, 120);
    requireCharacterAccess_(request.authPlayer, characterId);
    const sheet = getSheet_("Recurring Expenses");
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0]
      .map(String);
    const values =
      sheet.getLastRow() > 1
        ? sheet
            .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
            .getValues()
        : [];
    const scheduleIdColumn = headers.indexOf("scheduleId");
    const characterIdColumn = headers.indexOf("characterId");
    const activeColumn = headers.indexOf("active");
    const rowIndex = values.findIndex(function (row) {
      return (
        String(row[scheduleIdColumn]) === scheduleId &&
        String(row[characterIdColumn]) === characterId
      );
    });
    if (rowIndex < 0) throw new Error("Recurring expense not found.");
    const schedule = {};
    headers.forEach(function (header, columnIndex) {
      schedule[header] = serializeCell_(values[rowIndex][columnIndex]);
    });
    if (schedule.sourceType === "retainer") {
      throw new Error(
        "Retainer and fighting-force expenses must be ended from the Retainers tab.",
      );
    }
    withLock_(function () {
      sheet.getRange(rowIndex + 2, activeColumn + 1).setValue(false);
    });
    return {
      ok: true,
      scheduleId: scheduleId,
      sourceType: schedule.sourceType,
      sourceId: schedule.sourceId,
    };
  }

  function processScoutingMissions_(onlyCharacterId) {
    const now = Date.now();
    withLock_(function () {
      rowsAsObjects_("Scouting Missions").forEach(function (mission) {
        if (
          onlyCharacterId &&
          String(mission.characterId) !== String(onlyCharacterId)
        )
          return;
        const status = String(mission.status || "active");
        if (status === "completed") {
          if (completedScoutingMissionNeedsRepair_(mission)) {
            repairCompletedScoutingEncounter_(mission);
            updateObjectById_(
              "Scouting Missions",
              "missionId",
              String(mission.missionId),
              mission,
            );
          }
          return;
        }
        if (status !== "active") return;
        let durationDays = Math.floor(number_(mission.durationDays));
        if (durationDays < 1 || durationDays > 3)
          durationDays = Math.floor(Math.random() * 3) + 1;
        const started = new Date(mission.startedAt || new Date().toISOString());
        let completes = new Date(
          mission.completesAt || started.getTime() + durationDays * 86400000,
        );
        mission.durationDays = durationDays;
        mission.completesAt = completes.toISOString();
        if (completes.getTime() <= now) {
          resolveCompletedScoutingMission_(mission);
        }
        updateObjectById_(
          "Scouting Missions",
          "missionId",
          String(mission.missionId),
          mission,
        );
      });
    });
  }

  function completedScoutingMissionNeedsRepair_(mission) {
    const hex = findTerritoryHexForScoutingMission_(mission);
    if (!scoutingHexHasPotentialHostileEncounter_(hex)) {
      return (
        String(mission.encounterRoll || "") !== "" ||
        String(mission.encounterOccurred || "").toLowerCase() === "true" ||
        String(mission.reactionRoll || "") !== "" ||
        String(mission.adjustedReactionRoll || "") !== "" ||
        String(mission.reactionDisposition || "") !== "" ||
        number_(mission.reactionModifier) !== 0 ||
        String(mission.reactionResult || "") !==
          "No potential hostile encounter"
      );
    }
    const encounterRoll = Math.floor(number_(mission.encounterRoll));
    if (encounterRoll < 1 || encounterRoll > 6) return true;
    if (encounterRoll !== 1) {
      return String(mission.reactionResult || "") !== "No encounter";
    }
    const expectedDisposition = normalizeHexReaction_(hex && hex.reaction);
    const expectedModifier = scoutingReactionModifier_(expectedDisposition);
    const reactionRoll = Math.floor(number_(mission.reactionRoll));
    return (
      reactionRoll < 1 ||
      reactionRoll > 100 ||
      String(mission.adjustedReactionRoll) === "" ||
      !String(mission.reactionResult || "").trim() ||
      normalizeHexReaction_(mission.reactionDisposition) !==
        expectedDisposition ||
      number_(mission.reactionModifier) !== expectedModifier ||
      number_(mission.adjustedReactionRoll) !==
        reactionRoll + expectedModifier ||
      String(mission.reactionResult) !==
        scoutingReactionResult_(reactionRoll + expectedModifier)
    );
  }

  function repairCompletedScoutingEncounter_(mission) {
    const hex = findTerritoryHexForScoutingMission_(mission);
    if (!scoutingHexHasPotentialHostileEncounter_(hex)) {
      mission.encounterRoll = "";
      mission.encounterOccurred = false;
      mission.reactionDisposition = "";
      mission.reactionModifier = 0;
      mission.reactionRoll = "";
      mission.adjustedReactionRoll = "";
      mission.reactionResult = "No potential hostile encounter";
      mission.resolvedAt =
        mission.resolvedAt || mission.completedAt || new Date().toISOString();
      return;
    }
    const savedEncounterRoll = Math.floor(number_(mission.encounterRoll));
    const encounterRoll =
      savedEncounterRoll >= 1 && savedEncounterRoll <= 6
        ? savedEncounterRoll
        : Math.floor(Math.random() * 6) + 1;
    const encounterOccurred = encounterRoll === 1;
    const disposition = normalizeHexReaction_(hex && hex.reaction);
    const modifier = scoutingReactionModifier_(disposition);

    mission.encounterRoll = encounterRoll;
    mission.encounterOccurred = encounterOccurred;
    mission.reactionDisposition = disposition;
    mission.reactionModifier = modifier;
    if (encounterOccurred) {
      const savedReactionRoll = Math.floor(number_(mission.reactionRoll));
      mission.reactionRoll =
        savedReactionRoll >= 1 && savedReactionRoll <= 100
          ? savedReactionRoll
          : Math.floor(Math.random() * 100) + 1;
      mission.adjustedReactionRoll = mission.reactionRoll + modifier;
      mission.reactionResult = scoutingReactionResult_(
        mission.adjustedReactionRoll,
      );
    } else {
      mission.reactionRoll = "";
      mission.adjustedReactionRoll = "";
      mission.reactionResult = "No encounter";
    }
    mission.resolvedAt =
      mission.resolvedAt || mission.completedAt || new Date().toISOString();
  }

  function processCustomMissions_() {
    const now = Date.now();
    rowsAsObjects_("Custom Missions").forEach(function (mission) {
      let changed = false;
      const starts = Utilities.calendarMidnight(
        String(mission.startDate || ""),
      ).getTime();
      const completes = new Date(String(mission.completesAt || "")).getTime();
      if (
        String(mission.status || "scheduled") === "scheduled" &&
        isFinite(starts) &&
        now >= starts
      ) {
        mission.status = "active";
        mission.startedAt = new Date().toISOString();
        changed = true;
      }
      if (mission.status === "active" && !mission.discordSentAt) {
        try {
          sendCustomMissionDiscord_(mission);
          /* Delivery is recorded by the durable outbox after Discord acknowledges it. */
          changed = true;
        } catch (error) {
          console.error(
            "Could not send custom mission " +
              String(mission.missionId) +
              " to Discord: " +
              String(error),
          );
        }
      }
      if (
        mission.status === "active" &&
        isFinite(completes) &&
        now >= completes
      ) {
        mission.status = "completed";
        mission.completedAt = new Date().toISOString();
        changed = true;
      }
      if (changed)
        withLock_(function () {
          updateObjectById_(
            "Custom Missions",
            "missionId",
            String(mission.missionId),
            mission,
          );
        });
    });
  }

  function processMonthlyTerritoryPopulationUnlocked_() {
    const now = new Date();
    const updateMonth = Utilities.formatDate(
      now,
      Session.getScriptTimeZone(),
      "yyyy-MM",
    );
    const revealedByCharacter = {};
    rowsAsObjects_("Characters").forEach(function (character) {
      const characterId = String(character.characterId || "");
      if (characterId)
        revealedByCharacter[characterId] =
          revealedTerritoryHexKeysForCharacter_(characterId);
    });

    const populationByTerritory = {};
    rowsAsObjects_("Territory Hexes").forEach(function (hex) {
      const characterId = String(hex.characterId || "");
      const territoryId = String(hex.territoryId || "");
      const revealed = revealedByCharacter[characterId] || {};
      const revealKey =
        territoryId + "::" + normalizedScoutingHexKey_(hex.hexNumber);
      if (!revealed[revealKey]) return;

      let population = Math.max(0, Math.floor(number_(hex.hexPopulationValue)));
      if (String(hex.lastPopulationUpdateMonth || "") !== updateMonth) {
        const supportablePopulation = richFieldPopulationCapacity_(
          hex.cerealFields,
          hex.pastureFields,
        );
        // At the monthly population update, the settlement moves to the ceiling
        // supported by its saved cereal and pasture allocation. This applies in
        // both directions, so reducing food fields lowers population at the same
        // month-end boundary used when additional fields raise it.
        population = supportablePopulation;
        hex.hexPopulationValue = population;
        hex.lastPopulationUpdateMonth = updateMonth;
        hex.updatedAt = now.toISOString();
        updateObjectById_("Territory Hexes", "hexId", String(hex.hexId), hex);
      }

      populationByTerritory[territoryId] =
        (populationByTerritory[territoryId] || 0) + population;
    });

    rowsAsObjects_("Territories").forEach(function (territory) {
      const territoryId = String(territory.territoryId || "");
      const recalculatedPopulation = Math.max(
        0,
        Math.floor(number_(populationByTerritory[territoryId])),
      );
      if (
        Math.max(0, Math.floor(number_(territory.population))) ===
        recalculatedPopulation
      )
        return;
      territory.population = recalculatedPopulation;
      territory.updatedAt = now.toISOString();
      updateObjectById_("Territories", "territoryId", territoryId, territory);
    });
  }

  function completeFarmlandDevelopmentIfDue_(plainsHex, allHexes, now) {
    if (
      !plainsHex ||
      !plainsHex.farmlandCompletesAt ||
      plainsHex.farmlandCompletedAt
    )
      return false;
    const completion = new Date(String(plainsHex.farmlandCompletesAt));
    if (isNaN(completion.getTime()) || completion.getTime() > now.getTime())
      return false;
    const settlementHex = allHexes.find(function (hex) {
      return (
        String(hex.hexId) === String(plainsHex.farmlandSettlementHexId) &&
        String(hex.territoryId) === String(plainsHex.territoryId) &&
        String(hex.characterId) === String(plainsHex.characterId)
      );
    });
    if (!settlementHex) return false;
    const existingTotal = activeFieldTotal_(settlementHex);
    settlementHex.fieldCapacity =
      Math.max(
        existingTotal,
        Math.floor(number_(settlementHex.fieldCapacity)),
      ) + 8;
    settlementHex.updatedAt = now.toISOString();
    plainsHex.farmlandCompletedAt = now.toISOString();
    plainsHex.updatedAt = now.toISOString();
    updateObjectById_(
      "Territory Hexes",
      "hexId",
      String(settlementHex.hexId),
      settlementHex,
    );
    updateObjectById_(
      "Territory Hexes",
      "hexId",
      String(plainsHex.hexId),
      plainsHex,
    );
    return true;
  }
  const handlers = {
    "retainer.create": createRetainer_,
    "retainer.update": updateRetainer_,
    "retainer.delete": deleteRetainer_,
    "territory.create": createTerritory_,
    "territory.update": updateTerritory_,
    "territory.tithe.update": updateTerritoryChurchTithe_,
    "territory.management.update": updateTerritoryManagement_,
    "territory.fields.update": updateTerritoryFieldAllocation_,
    "territory.fields.expand": startSettlementFieldExpansion_,
    "territory.farmland.start": startFarmlandDevelopment_,
    "territory.recruitment.roll": rollTerritoryRecruitment_,
    "territory.recruitment.complete": completeTerritoryRecruitment_,
    "territory.recruitment.deny": denyTerritoryRecruitment_,
    "territory.recruitment.reset": resetTerritoryRecruitment_,
    "scouting.start": startScoutingMission_,
    "scouting.complete-due": completeDueScoutingMission_,
    "scouting.complete-test": completeScoutingMissionForTesting_,
    "scouting.view-results": viewScoutingMissionResults_,
    "scouting.dismiss": dismissScoutingMission_,
    "scouting.promote-serjeants": promoteScoutingSerjeants_,
    "mission.custom.create": createCustomMission_,
    "transaction.delete": deleteTransaction_,
    "recurring.create": createRecurringExpense_,
    "recurring.update": updateRecurringExpense_,
    "recurring.cancel": cancelRecurringExpense_,
  };
  if (action === "initialize-fields") {
    const revealed = revealedTerritoryHexKeysForCharacter_(request.characterId);
    for (const hex of rowsAsObjects_("Territory Hexes"))
      if (
        revealed[
          hex.territoryId + "::" + normalizedScoutingHexKey_(hex.hexNumber)
        ] &&
        number_(hex.hexPopulationValue) > 0
      ) {
        ensureHexFieldAllocation_(hex);
        updateObjectById_("Territory Hexes", "hexId", hex.hexId, hex);
      }
    return { ok: true };
  }
  if (action === "scheduled") {
    processScoutingMissions_(request.characterId);
    processCustomMissions_();
    const hexes = rowsAsObjects_("Territory Hexes");
    for (const hex of hexes) {
      if (completeSettlementFieldExpansionIfDue_(hex, new Date()))
        updateObjectById_("Territory Hexes", "hexId", hex.hexId, hex);
      completeFarmlandDevelopmentIfDue_(hex, hexes, new Date());
    }
    // Wallet schedules are device-local; personnel costs and domain income remain informational.
    // Population follows the original month-end boundary, rather than being changed on every read.
    const today = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    );
    const parts = today.split("-").map(Number);
    if (parts[2] === new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate())
      processMonthlyTerritoryPopulationUnlocked_();
    return { ok: true };
  }
  return handlers[action](request);
}
