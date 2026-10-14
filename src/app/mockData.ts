import type { SheetBootstrap } from "../google-sheets-api";

/** Synthetic fixtures modeled on playerData workbook columns, never live rows.
 * Each call returns fresh objects. This module performs no I/O or cache writes.
 */
export function createMockBootstrap(
  role: "dm" | "player" = "player",
): SheetBootstrap {
  const createdAt = "2026-10-01T12:00:00.000Z";
  const playerId = "demo-player";
  const characterId = "demo-character";
  const territoryId = "demo-territory";
  const players: SheetBootstrap["players"] = [
    {
      playerId,
      displayName: "Demo Player",
      role: "player",
      active: true,
      territoriesEnabled: true,
      retainersEnabled: true,
    },
    {
      playerId: "demo-dm",
      displayName: "Demo DM",
      role: "dm",
      active: true,
      territoriesEnabled: true,
      retainersEnabled: true,
    },
  ];
  return {
    ok: true,
    campaignName: "Sample Evermoor Campaign",
    coinWeightPerPound: 10,
    discordWebhookConfigured: false,
    currentPlayer: players[role === "dm" ? 1 : 0],
    players,
    permissions: {
      isDm: role === "dm",
      territories: true,
      retainers: true,
      playerManagement: role === "dm",
    },
    characters: [
      {
        characterId,
        playerId,
        name: "Rowan Ashford",
        class: "Fighter",
        level: 9,
        discordConfigured: false,
      },
    ],
    selectedCharacterId: characterId,
    balance: { pp: 0, gp: 462, sp: 5, cp: 0 },
    transactions: [
      {
        transactionId: "demo-income",
        characterId,
        timestamp: createdAt,
        type: "income",
        label: "Adventure proceeds",
        pp: 0,
        gp: 500,
        sp: 5,
        cp: 0,
      },
      {
        transactionId: "demo-wages",
        characterId,
        timestamp: "2026-10-02T12:00:00.000Z",
        type: "expense",
        label: "Scout wages",
        pp: 0,
        gp: 38,
        sp: 0,
        cp: 0,
      },
    ],
    recurringExpenses: [
      {
        scheduleId: "demo-schedule",
        characterId,
        label: "Scout wages",
        pp: 0,
        gp: 38,
        sp: 0,
        cp: 0,
        frequency: "monthly",
        startDate: "2026-10-02",
        occurrenceCount: 1,
        active: true,
        sourceType: "retainer",
        sourceId: "demo-force",
      },
    ],
    retainers: [
      {
        retainerId: "demo-force",
        characterId,
        name: "Ashford Scouts",
        type: "force",
        role: "footman, light",
        wageGp: 38,
        costCoin: "gp",
        wageFrequency: "monthly",
        men: 20,
        status: "active",
        createdAt,
        scheduleId: "demo-schedule",
        roster: [
          {
            rosterGroupId: "demo-roster",
            soldierType: "footman, light",
            men: 20,
            armor: "Studded leather or ring mail",
            shield: true,
            armorClass: 6,
            weapons: [
              {
                name: "Sword, Long",
                damageSmallMedium: "1-8",
                damageLarge: "1-12",
              },
            ],
          },
        ],
      },
      {
        retainerId: "demo-steward",
        characterId,
        name: "Mira",
        type: "individual",
        role: "Steward",
        level: 3,
        wageGp: 5,
        costCoin: "gp",
        wageFrequency: "monthly",
        status: "active",
        createdAt,
      },
    ],
    territories: [
      {
        territoryId,
        characterId,
        name: "Ashford Vale",
        mapUrl: "/demo-territory-player.svg",
        mapFileName: "demo-territory-player.svg",
        poiMapUrl: "/demo-territory-details.svg",
        poiMapFileName: "demo-territory-details.svg",
        hexNumber: "I2",
        population: 1200,
        assets: [{ type: "farm", name: "North Fields", quantity: 3 }],
        payChurchTithe: true,
        active: true,
        createdAt,
      },
    ],
    managedTerritories: [],
    territoryHexes: [
      {
        hexId: "demo-hex",
        characterId,
        territoryId,
        hexNumber: "3.3",
        mapX: 400 / 9,
        mapY: 275 / 7,
        title: "Old Watchtower",
        contents: "An abandoned tower beside a stream.",
        terrain: "Hills",
        isDiscovered: true,
        createdAt,
      },
    ],
    scoutingMissions: [
      {
        missionId: "demo-mission",
        characterId,
        territoryId,
        hexNumber: "3.3",
        mapX: 400 / 9,
        mapY: 275 / 7,
        allocations: [
          {
            retainerId: "demo-force",
            forceName: "Ashford Scouts",
            rosterGroupId: "demo-roster",
            soldierType: "footman, light",
            men: 5,
          },
        ],
        men: 5,
        status: "completed",
        startedAt: createdAt,
        durationDays: 2,
        completesAt: "2026-10-03T12:00:00.000Z",
        completedAt: "2026-10-03T12:00:00.000Z",
        encounterOccurred: false,
        survivors: 5,
      },
    ],
    customMissions: [],
    journal: [
      {
        entryId: "demo-journal",
        characterId,
        playerId,
        title: "Arrival in the Vale",
        category: "Adventure",
        notes:
          "We secured the watchtower and hired scouts to survey the surrounding hills.",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}
