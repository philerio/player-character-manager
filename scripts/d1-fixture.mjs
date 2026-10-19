import { createHash } from "node:crypto";
const hash = (value) =>
  createHash("sha256").update(value).digest("base64url") + "=";
const at = "2026-10-14T12:00:00.000Z";
export function fixtureSheets() {
  return {
    Players: ["dm", "player", "other"].map((role) => ({
      playerId: role,
      displayName: `Test ${role}`,
      email: `${role}@example.test`,
      role: role === "dm" ? "dm" : "player",
      active: true,
      territoriesEnabled: true,
      retainersEnabled: true,
      passwordSalt: "fixture-salt",
      passwordHash: hash("fixture-salt:local-test-password"),
      mustChangePassword: false,
    })),
    Characters: ["player", "other"].map((role) => ({
      characterId: `${role}-character`,
      playerId: role,
      name: `Test ${role}`,
      class: "Fighter",
      level: 1,
      active: true,
      createdAt: at,
    })),
    Territories: [
      {
        territoryId: "territory",
        characterId: "player-character",
        name: "Test Territory",
        mapUrl: "/demo-territory-player.svg",
        mapFileName: "demo-territory-player.svg",
        poiMapUrl: "/demo-territory-details.svg",
        poiMapFileName: "demo-territory-details.svg",
        active: true,
        hexNumber: "1",
        population: 0,
        assetsJson: "[]",
        createdAt: at,
      },
    ],
    "Territory Hexes": ["4.4", "2.0", "3"].map((hex, index) => ({
      hexId: `hex-${index}`,
      characterId: "player-character",
      territoryId: "territory",
      hexNumber: hex,
      mapX: 40 + index,
      mapY: 40,
      title: "Test Hex",
      contents: "Public content",
      dmOnlyInformation: "DM secret",
      reaction: "Hostile",
      dmRevealed: false,
      createdAt: at,
      updatedAt: at,
    })),
    "Scouting Missions": [],
    "Custom Missions": [],
    Retainers: [],
    "Recurring Expenses": [],
    "Wallet Transactions": [],
    Journal: [],
    Settings: [{ key: "campaignName", value: "D1 Local Test Campaign" }],
  };
}
