import { territoryHexKey } from "./territoryRules";
import type {
  SheetBootstrap,
  SheetSyncTab,
  SheetRetainer,
  SheetTerritory,
  SheetTerritoryHex,
  SheetScoutingMission,
  SheetRecurringExpense,
} from "../google-sheets-api";
import { createMockBootstrap } from "./mockData";
import { demoRole } from "./runtime";
import { appStorage, demoCampaignStorage } from "./storage";

const dataKey = "server-data:v1";
type DemoData = {
  snapshots: Record<string, SheetBootstrap>;
  empty?: SheetBootstrap;
  revisions: Record<string, Record<SheetSyncTab, number>>;
  backups: Record<string, Record<string, unknown>>;
};
function load(): DemoData {
  const saved =
    demoCampaignStorage.getItem(dataKey) || appStorage.getItem(dataKey);
  if (saved) {
    try {
      const data = JSON.parse(saved) as DemoData;
      if (!demoCampaignStorage.getItem(dataKey)) save(data);
      return data;
    } catch {
      /* Reset invalid demo data. */
    }
  }
  const first = createMockBootstrap("player");
  const second = createMockBootstrap("player");
  const otherId = "demo-character-2";
  first.characters.push({
    characterId: otherId,
    playerId: "demo-player",
    name: "Elara Reed",
    class: "Cleric",
    level: 7,
  });
  second.characters = structuredClone(first.characters);
  second.selectedCharacterId = otherId;
  second.balance = { pp: 0, gp: 0, sp: 0, cp: 0 };
  second.transactions = [];
  second.recurringExpenses = [];
  second.retainers = [];
  second.territories = [];
  second.territoryHexes = [];
  second.scoutingMissions = [];
  second.journal = [];
  const data = {
    snapshots: { [first.selectedCharacterId]: first, [otherId]: second },
    revisions: {},
    backups: {},
  };
  save(data);
  return data;
}
function save(data: DemoData) {
  demoCampaignStorage.setItem(dataKey, JSON.stringify(data));
}
function roleView(snapshot: SheetBootstrap): SheetBootstrap {
  const currentPlayer = snapshot.players.find(
    (player) => player.role === demoRole,
  );
  if (!currentPlayer) throw new Error("Demo account not found.");
  return {
    ...snapshot,
    currentPlayer,
    permissions: {
      isDm: demoRole === "dm",
      playerManagement: demoRole === "dm",
      territories: demoRole === "dm" || currentPlayer.territoriesEnabled,
      retainers: demoRole === "dm" || currentPlayer.retainersEnabled,
    },
  };
}
export function getDemoBootstrap(characterId?: string): SheetBootstrap {
  const data = load();
  const snapshot = characterId
    ? data.snapshots[characterId]
    : Object.values(data.snapshots)[0] || data.empty;
  if (!snapshot) throw new Error("This demo character no longer exists.");
  return structuredClone(roleView(snapshot));
}

/** Local fake campaign service. Unsupported operations fail explicitly. */
export async function demoRequest(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const requestUrl = new URL(url);
  const input: Record<string, any> = options?.body
    ? JSON.parse(String(options.body))
    : Object.fromEntries(requestUrl.searchParams);
  const action = String(input.action || "bootstrap");
  try {
    const data = load();
    const id = String(
      input.characterId || Object.keys(data.snapshots)[0] || "",
    );
    const storedSnapshot = data.snapshots[id] || (!id ? data.empty : undefined);
    if (!storedSnapshot) throw new Error("Demo character not found.");
    const snapshot = roleView(storedSnapshot);
    if (id) data.snapshots[id] = snapshot;
    else data.empty = snapshot;
    const {
      action: _action,
      accessKey: _accessKey,
      sessionToken: _sessionToken,
      scoutingWebhookUrl: _webhook,
      expectedUpdatedAt: _expectedUpdatedAt,
      ...payload
    } = input;
    const now = new Date().toISOString();
    const uuid = () => `demo-${crypto.randomUUID()}`;
    const revision = (data.revisions[id] ||= {
      wallet: 0,
      journal: 0,
      retainers: 0,
      territories: 0,
    });
    // Demo requests are serialized within this synchronous mutation section.
    // The live Apps Script must compare and mutate under the same server lock.
    if (input.expectedUpdatedAt !== undefined) {
      const previous = action.startsWith("journal.")
        ? snapshot.journal.find((row) => row.entryId === input.entryId)
        : action.startsWith("retainer.")
          ? snapshot.retainers.find(
              (row) => row.retainerId === input.retainerId,
            )
          : action === "territory.hex.upsert"
            ? snapshot.territoryHexes.find(
                (row) =>
                  row.territoryId === input.territoryId &&
                  territoryHexKey(row.hexNumber) ===
                    territoryHexKey(input.hexNumber),
              )
            : undefined;
      if (
        (!previous &&
          !(
            action === "territory.hex.upsert" && input.expectedUpdatedAt === ""
          )) ||
        (previous?.updatedAt || previous?.createdAt || "") !==
          input.expectedUpdatedAt
      )
        throw new Error("Conflict: record changed in the campaign.");
    }
    let result: Record<string, unknown> = { ok: true };
    switch (action) {
      case "bootstrap":
      case "wallet":
      case "territory-status":
      case "retainer-status":
      case "journal-status":
        result = { ...snapshot, characterId: id };
        break;
      case "account-roster":
      case "player-roster":
        result = {
          ...result,
          currentPlayer: snapshot.currentPlayer,
          players: snapshot.players,
          characters: snapshot.characters,
        };
        break;
      case "sync-revisions":
        result.revisions = revision;
        break;
      case "tab.push":
        if (
          !["wallet", "journal", "retainers", "territories"].includes(input.tab)
        )
          throw new Error("Unknown demo tab.");
        result = {
          ...result,
          tab: input.tab,
          revision: ++revision[input.tab as SheetSyncTab],
          updatedAt: now,
        };
        break;
      case "campaign.update":
        for (const item of Object.values(data.snapshots))
          item.campaignName = input.campaignName;
        result.campaignName = input.campaignName;
        break;
      case "player.access.update": {
        const player = snapshot.players.find(
          (p) => p.playerId === input.targetPlayerId,
        );
        if (!player) throw new Error("Demo player not found.");
        Object.assign(player, {
          territoriesEnabled: Boolean(input.territoriesEnabled),
          retainersEnabled: player.retainersEnabled,
        });
        for (const item of Object.values(data.snapshots)) {
          item.players = snapshot.players;
          if (item.currentPlayer.playerId === player.playerId) {
            item.currentPlayer = player;
            item.permissions.territories =
              player.role === "dm" || player.territoriesEnabled;
          }
        }
        result.player = player;
        break;
      }
      case "character.create": {
        const character = {
          characterId: uuid(),
          playerId: input.targetPlayerId || snapshot.currentPlayer.playerId,
          name: input.name,
          class: input.class,
          level: Number(input.level),
        };
        const empty = structuredClone(snapshot);
        empty.selectedCharacterId = character.characterId;
        empty.balance = { pp: 0, gp: 0, sp: 0, cp: 0 };
        empty.transactions = [];
        empty.recurringExpenses = [];
        empty.retainers = [];
        empty.territories = [];
        empty.territoryHexes = [];
        empty.scoutingMissions = [];
        empty.customMissions = [];
        empty.journal = [];
        data.snapshots[character.characterId] = empty;
        const characters = [...snapshot.characters, character];
        for (const item of Object.values(data.snapshots))
          item.characters = characters;
        result.character = character;
        break;
      }
      case "character.update": {
        const character = snapshot.characters.find((c) => c.characterId === id);
        if (!character) throw new Error("Demo character not found.");
        Object.assign(character, {
          name: input.name,
          class: input.class,
          level: Number(input.level),
        });
        for (const item of Object.values(data.snapshots))
          item.characters = snapshot.characters;
        result.character = character;
        break;
      }
      case "character.delete":
        delete data.snapshots[id];
        delete data.revisions[id];
        delete data.backups[id];
        if (!Object.keys(data.snapshots).length)
          data.empty = {
            ...snapshot,
            characters: [],
            selectedCharacterId: "",
            balance: { pp: 0, gp: 0, sp: 0, cp: 0 },
            transactions: [],
            recurringExpenses: [],
            retainers: [],
            territories: [],
            managedTerritories: [],
            territoryHexes: [],
            scoutingMissions: [],
            customMissions: [],
            journal: [],
          };
        for (const item of Object.values(data.snapshots))
          item.characters = item.characters.filter((c) => c.characterId !== id);
        result.deletedCharacterId = id;
        break;
      case "journal.create":
      case "journal.update": {
        const previous = snapshot.journal.find(
          (e) => e.entryId === input.entryId,
        );
        if (action.endsWith("update") && !previous)
          throw new Error("Demo journal entry not found.");
        const entry = {
          ...previous,
          clientMutationId:
            input.clientMutationId || previous?.clientMutationId,
          entryId: previous?.entryId || uuid(),
          characterId: id,
          playerId: snapshot.currentPlayer.playerId,
          title: input.title,
          category: input.category,
          notes: input.notes,
          createdAt: previous?.createdAt || now,
          updatedAt: now,
        };
        snapshot.journal = [
          entry,
          ...snapshot.journal.filter((e) => e.entryId !== entry.entryId),
        ];
        result.entry = entry;
        break;
      }
      case "journal.delete":
        snapshot.journal = snapshot.journal.filter(
          (e) => e.entryId !== input.entryId,
        );
        result.deletedEntryId = input.entryId;
        break;
      case "retainer.create":
      case "retainer.update": {
        const previous = snapshot.retainers.find(
          (r) => r.retainerId === input.retainerId,
        );
        if (action.endsWith("update") && !previous)
          throw new Error("Demo retainer not found.");
        const retainer: SheetRetainer = {
          ...previous,
          ...payload,
          retainerId: previous?.retainerId || uuid(),
          characterId: id,
          name: String(input.name),
          type: input.type,
          role: String(input.role),
          costCoin: input.costCoin,
          wageFrequency: input.wageFrequency,
          wageGp: Number(input.amount),
          createdAt: previous?.createdAt || now,
          updatedAt: now,
        };
        snapshot.retainers = [
          retainer,
          ...snapshot.retainers.filter(
            (r) => r.retainerId !== retainer.retainerId,
          ),
        ];
        const schedule: SheetRecurringExpense = {
          scheduleId: previous?.scheduleId || uuid(),
          characterId: id,
          label: `${retainer.name} wages`,
          pp: 0,
          gp: 0,
          sp: 0,
          cp: 0,
          frequency: retainer.wageFrequency,
          startDate: input.hiringDate || now.slice(0, 10),
          occurrenceCount: 0,
          active: true,
          sourceType: "retainer",
          sourceId: retainer.retainerId,
        };
        const oldSchedule = snapshot.recurringExpenses.find(
          (e) => e.scheduleId === schedule.scheduleId,
        );
        if (oldSchedule && !input.hiringDate)
          Object.assign(schedule, {
            startDate: oldSchedule.startDate,
            occurrenceCount: oldSchedule.occurrenceCount,
          });
        schedule[retainer.costCoin] = retainer.wageGp;
        retainer.scheduleId = schedule.scheduleId;
        snapshot.recurringExpenses = [
          schedule,
          ...snapshot.recurringExpenses.filter(
            (e) => e.scheduleId !== schedule.scheduleId,
          ),
        ];
        result.retainer = retainer;
        result.schedule = schedule;
        break;
      }
      case "retainer.delete":
        snapshot.recurringExpenses = snapshot.recurringExpenses.filter(
          (e) => e.sourceId !== input.retainerId,
        );
        snapshot.retainers = snapshot.retainers.filter(
          (r) => r.retainerId !== input.retainerId,
        );
        result.retainerId = input.retainerId;
        break;
      case "territory.create":
      case "territory.update":
      case "territory.tithe.update":
      case "territory.management.update": {
        const previous = snapshot.territories.find(
          (t) => t.territoryId === input.territoryId,
        );
        if (action !== "territory.create" && !previous)
          throw new Error("Demo territory not found.");
        const territory: SheetTerritory = {
          ...previous,
          ...payload,
          territoryId: previous?.territoryId || uuid(),
          characterId: id,
          name: String(input.name ?? previous?.name ?? "Demo territory"),
          active: true,
          createdAt: previous?.createdAt || now,
          updatedAt: now,
        };
        snapshot.territories = [
          territory,
          ...snapshot.territories.filter(
            (t) => t.territoryId !== territory.territoryId,
          ),
        ];
        result.territory = territory;
        break;
      }
      case "territory.delete":
        snapshot.territories = snapshot.territories.filter(
          (t) => t.territoryId !== input.territoryId,
        );
        snapshot.territoryHexes = snapshot.territoryHexes.filter(
          (h) => h.territoryId !== input.territoryId,
        );
        result.deletedTerritoryId = input.territoryId;
        break;
      case "territory.hex.upsert":
      case "territory.fields.update": {
        const previous = snapshot.territoryHexes.find((h) =>
          input.hexId
            ? h.hexId === input.hexId
            : h.territoryId === input.territoryId &&
              territoryHexKey(h.hexNumber) === territoryHexKey(input.hexNumber),
        );
        const hex: SheetTerritoryHex = {
          ...previous,
          ...(input.revealOnly ? { dmRevealed: input.dmRevealed } : payload),
          hexId: previous?.hexId || uuid(),
          characterId: id,
          territoryId: String(input.territoryId),
          hexNumber: String(input.hexNumber ?? previous?.hexNumber),
          mapX: Number(
            input.revealOnly && previous
              ? previous.mapX
              : (input.mapX ?? previous?.mapX),
          ),
          mapY: Number(
            input.revealOnly && previous
              ? previous.mapY
              : (input.mapY ?? previous?.mapY),
          ),
          createdAt: previous?.createdAt || now,
          updatedAt: now,
          isDiscovered: true,
        };
        snapshot.territoryHexes = [
          hex,
          ...snapshot.territoryHexes.filter((h) => h.hexId !== hex.hexId),
        ];
        result.hex = hex;
        break;
      }
      case "wallet.backup.save": {
        const backup = {
          characterId: id,
          backedUpAt: now,
          transactions: input.transactions,
          recurringExpenses: input.recurringExpenses,
        };
        data.backups[id] = backup;
        result = {
          ...result,
          ...backup,
          transactionCount: input.transactions.length,
          recurringExpenseCount: input.recurringExpenses.length,
        };
        break;
      }
      case "wallet.backup.load":
        if (!data.backups[id])
          throw new Error("Create a demo wallet backup first.");
        result = { ...result, ...data.backups[id] };
        break;
      case "scouting.notify-start":
      case "scouting.notify-started":
        break;
      case "scouting.start": {
        const existing =
          input.clientMissionId &&
          snapshot.scoutingMissions.find(
            (m) => m.clientMissionId === input.clientMissionId,
          );
        if (existing) {
          result.mission = existing;
          result.duplicatePrevented = true;
          break;
        }
        const startedAt = input.startedAt || now;
        const durationDays = Number(input.durationDays) || 2;
        const completesAt =
          input.completesAt ||
          new Date(
            new Date(startedAt).getTime() + durationDays * 86400000,
          ).toISOString();
        const mission: SheetScoutingMission = {
          ...payload,
          territoryId: input.territoryId,
          hexNumber: input.hexNumber,
          mapX: input.mapX,
          mapY: input.mapY,
          allocations: input.allocations.map((a: Record<string, unknown>) => ({
            ...a,
            forceName:
              snapshot.retainers.find((r) => r.retainerId === a.retainerId)
                ?.name || "Demo force",
          })),
          missionId: uuid(),
          characterId: id,
          men: input.allocations.reduce(
            (n: number, a: { men: number }) => n + a.men,
            0,
          ),
          status: "active" as const,
          startedAt,
          durationDays,
          completesAt,
        };
        if (new Date(completesAt).getTime() <= Date.now())
          Object.assign(mission, {
            status: "completed",
            completedAt: now,
            encounterOccurred: false,
            survivors: mission.men,
          });
        snapshot.scoutingMissions.unshift(mission);
        result.mission = mission;
        break;
      }
      case "scouting.complete-test":
      case "scouting.complete-due":
      case "scouting.view-results":
      case "scouting.dismiss": {
        const mission = snapshot.scoutingMissions.find(
          (m) =>
            m.missionId === input.missionId ||
            Boolean(
              input.clientMissionId &&
              m.clientMissionId === input.clientMissionId,
            ),
        );
        if (!mission)
          throw new Error("Sync this demo mission before completing it.");
        if (action === "scouting.view-results") mission.resultsViewedAt = now;
        else if (action === "scouting.dismiss") mission.dismissedAt = now;
        else
          Object.assign(mission, {
            status: "completed",
            completedAt: now,
            encounterOccurred: false,
            survivors: mission.men,
          });
        result.mission = mission;
        break;
      }
      case "auth.logout":
        break;
      default:
        throw new Error(
          "This action is unavailable in the demo. Campaign services and uploads require a live connection.",
        );
    }
    // Reads must not rewrite shared campaign data while another tab is publishing.
    if (options?.body) save(data);
    return Response.json(result);
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Demo request failed.",
    });
  }
}
