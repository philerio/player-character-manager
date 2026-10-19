import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker, { type Env } from "../index";
import { migratedGameActions } from "../game";
import { mediaActions } from "../media";
import { validateResponse } from "../../src/app/validation";
// @ts-expect-error The importer is a Node CLI module.
import { convertWorkbook } from "../../scripts/import-workbook.mjs";
// @ts-expect-error Synthetic fixture shared with the CLI seed.
import { fixtureSheets } from "../../scripts/d1-fixture.mjs";
let sqlite: DatabaseSync, env: Env;
let queryCount = 0;
let afterJournalRead: (() => Promise<void>) | undefined;
/** Runs Worker SQL against SQLite, including transactions and real constraints. */
function statement(sql: string, args: any[] = []): any {
  return {
    bind: (...values: any[]) => statement(sql, values),
    first: async () => {
      queryCount++;
      const row = sqlite.prepare(sql).get(...args) ?? null;
      if (
        afterJournalRead &&
        sql.startsWith("SELECT data, updated_at FROM records")
      ) {
        const hook = afterJournalRead;
        afterJournalRead = undefined;
        await hook();
      }
      return row;
    },
    all: async () => {
      queryCount++;
      return { results: sqlite.prepare(sql).all(...args) };
    },
    run: async () => {
      queryCount++;
      const result = sqlite.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  };
}
beforeEach(() => {
  afterJournalRead = undefined;
  queryCount = 0;
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("worker/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`worker/migrations/${file}`, "utf8"));
  const result = convertWorkbook(fixtureSheets());
  expect(result.errors).toEqual([]);
  sqlite.exec(result.sql);
  env = {
    DB: {
      prepare: statement,
      batch: async (statements: any[]) => {
        sqlite.exec("BEGIN");
        try {
          const result = [];
          for (const item of statements) result.push(await item.run());
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    } as unknown as D1Database,
    ALLOWED_ORIGINS: "http://localhost:5173",
  };
});
afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});
async function call(
  action: string,
  input: Record<string, unknown> = {},
  read = false,
) {
  const url = new URL("http://localhost:8787/");
  const body = {
    action,
    ...(migratedGameActions.has(action) || mediaActions.has(action)
      ? { commandId: crypto.randomUUID() }
      : {}),
    ...input,
  };
  if (read)
    for (const [key, value] of Object.entries(body))
      url.searchParams.set(key, String(value));
  const request = new Request(url, {
    method: read ? "GET" : "POST",
    ...(read ? {} : { body: JSON.stringify(body) }),
  });
  const response = await worker.fetch(request as any, env);
  const data: any = await response.json();
  if (response.ok)
    validateResponse(
      action,
      data,
      input.characterId as string | undefined,
      body,
    );
  return { status: response.status, data };
}
async function signin(id = "player") {
  const result = await call("auth.login", {
    playerId: id,
    email: `${id}@example.test`,
    password: "local-test-password",
  });
  expect(result.status).toBe(200);
  expect(JSON.stringify(result.data)).not.toMatch(
    /passwordSalt|passwordHash|recoveryAnswer/,
  );
  return result.data.sessionToken as string;
}
it("signs in existing sheet accounts and serves frontend-valid bootstrap/rosters/statuses", async () => {
  const sessionToken = await signin();
  for (const action of [
    "account-roster",
    "bootstrap",
    "journal-status",
    "retainer-status",
    "territory-status",
    "wallet",
    "sync-revisions",
  ]) {
    const result = await call(
      action,
      { sessionToken, characterId: "player-character" },
      true,
    );
    expect(result.status, action).toBe(200);
    expect(JSON.stringify(result.data)).not.toContain("DM secret");
  }
  const roster = await call("account-roster", { sessionToken }, true);
  expect(roster.data.characters).toHaveLength(1);
  expect(roster.data.players).toEqual([]);
  const bootstrap = await call(
    "bootstrap",
    { sessionToken, characterId: "player-character" },
    true,
  );
  expect(bootstrap.data.territories[0]).toMatchObject({
    name: "Test Territory",
    mapUrl: "/demo-territory-player.svg",
    poiMapUrl: "/demo-territory-details.svg",
  });
  expect(
    bootstrap.data.territoryHexes.map((row: any) => row.hexNumber),
  ).toEqual(["4.4"]);
});
it("shares canonical DM reveals with players and preserves imported details", async () => {
  const player = await signin(),
    dm = await signin("dm");
  const update = {
    characterId: "player-character",
    territoryId: "territory",
    hexNumber: "2",
    mapX: 41,
    mapY: 40,
    dmRevealed: true,
  };
  expect(
    (await call("territory.hex.upsert", { sessionToken: player, ...update }))
      .status,
  ).toBe(403);
  const changed = await call("territory.hex.upsert", {
    sessionToken: dm,
    ...update,
  });
  expect(changed.status).toBe(200);
  expect(changed.data.hex.hexId).toBe("hex-1");
  expect(changed.data.hex.dmOnlyInformation).toBe("DM secret");
  expect(
    sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind='hex'").get()!
      .n,
  ).toBe(3);
  const push = await call("tab.push", {
    sessionToken: dm,
    characterId: "player-character",
    tab: "territories",
  });
  expect(push.data.revision).toBe(1);
  const status = await call(
    "territory-status",
    { sessionToken: player, characterId: "player-character" },
    true,
  );
  expect(status.data.territoryHexes).toHaveLength(2);
  expect(
    status.data.territoryHexes.find((row: any) => row.hexId === "hex-1")
      .isDiscovered,
  ).toBe(true);
  expect(JSON.stringify(status.data)).not.toMatch(/DM secret|reaction/);
  const revisions = await call(
    "sync-revisions",
    { sessionToken: player, characterId: "player-character" },
    true,
  );
  expect(revisions.data.revisions.territories).toBe(1);
});
it("prevents cross-character reads and writes, including spoofed territory ownership", async () => {
  const sessionToken = await signin("other"),
    dm = await signin("dm");
  expect(
    (
      await call(
        "bootstrap",
        { sessionToken, characterId: "player-character" },
        true,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call("journal.create", {
        sessionToken,
        characterId: "player-character",
        title: "x",
        notes: "x",
        clientMutationId: "x",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("territory.hex.upsert", {
        sessionToken: dm,
        characterId: "other-character",
        territoryId: "territory",
        hexNumber: "4",
        mapX: 0,
        mapY: 0,
      })
    ).status,
  ).toBe(400);
  expect(() =>
    sqlite
      .prepare(
        "INSERT INTO records(kind,id,character_id,territory_id,hex_key,updated_at,data) VALUES ('hex','wrong','other-character','territory','wrong','','{}')",
      )
      .run(),
  ).toThrow();
});
it("deduplicates journal creates and rejects stale updates/deletes", async () => {
  const sessionToken = await signin();
  const input = {
    sessionToken,
    characterId: "player-character",
    title: "Notes",
    category: "Travel",
    notes: "First",
    clientMutationId: "journal-retry",
  };
  const first = await call("journal.create", input),
    retry = await call("journal.create", input);
  expect(first.status).toBe(200);
  expect(retry.data.entry.entryId).toBe(first.data.entry.entryId);
  expect(
    (await call("journal.create", { ...input, notes: "Different" })).status,
  ).toBe(409);
  const edit = {
    ...input,
    entryId: first.data.entry.entryId,
    expectedUpdatedAt: first.data.entry.updatedAt,
    notes: "Second",
  };
  expect((await call("journal.update", edit)).status).toBe(200);
  expect((await call("journal.update", edit)).status).toBe(409);
  expect((await call("journal.delete", edit)).status).toBe(409);
  const latest = (
    await call(
      "journal-status",
      { sessionToken, characterId: "player-character" },
      true,
    )
  ).data.journal[0];
  expect(latest.notes).toBe("Second");
  expect(
    (
      await call("journal.delete", {
        ...edit,
        expectedUpdatedAt: latest.updatedAt,
      })
    ).status,
  ).toBe(200);
});
it("expires/revokes sessions and blocks unknown operations", async () => {
  const sessionToken = await signin();
  expect(
    (
      await call("not.a.real.action", {
        sessionToken,
        characterId: "player-character",
      })
    ).status,
  ).toBe(400);
  expect((await call("auth.logout", { sessionToken })).status).toBe(200);
  expect((await call("bootstrap", { sessionToken }, true)).status).toBe(401);
  const fresh = await signin();
  sqlite.exec("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'");
  expect(
    (await call("account-roster", { sessionToken: fresh }, true)).status,
  ).toBe(401);
});
it("enforces origin checks, malformed body checks and persistent login throttling", async () => {
  const blocked = await worker.fetch(
    new Request("http://localhost/", {
      headers: { Origin: "https://evil.invalid" },
    }) as any,
    env,
  );
  expect(blocked.status).toBe(403);
  const preflight = await worker.fetch(
    new Request("http://localhost/", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    }) as any,
    env,
  );
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost:5173",
  );
  const invalid = await worker.fetch(
    new Request("http://localhost/", { method: "POST", body: "null" }) as any,
    env,
  );
  expect(invalid.status).toBe(400);
  for (let i = 0; i < 10; i++)
    expect(
      (
        await call("auth.login", {
          playerId: "player",
          email: "player@example.test",
          password: "wrong",
        })
      ).status,
    ).toBe(400);
  expect(
    (
      await call("auth.login", {
        playerId: "player",
        email: "player@example.test",
        password: "local-test-password",
      })
    ).status,
  ).toBe(429);
});
it("blocks import of orphaned records, duplicate canonical hexes, malformed JSON and unsafe SQL", () => {
  const sheets = fixtureSheets();
  sheets.Journal.push({
    entryId: "orphan",
    characterId: "missing",
    playerId: "player",
    title: "x",
    notes: "x",
    category: "",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  sheets["Territory Hexes"].push({
    ...sheets["Territory Hexes"][1],
    hexId: "duplicate",
    hexNumber: "2",
  });
  sheets.Territories[0].assetsJson = "{bad";
  const result = convertWorkbook(sheets);
  expect(result.sql).toBeNull();
  expect(result.errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining("character does not exist"),
      expect.stringContaining("duplicate normalized hex"),
      expect.stringContaining("valid JSON array"),
    ]),
  );
  const good = fixtureSheets();
  good.Players[0].displayName = "Test'); DROP TABLE players; --";
  const safe = convertWorkbook(good);
  sqlite.exec(
    "DELETE FROM migration_archive; DELETE FROM records; DELETE FROM territories; DELETE FROM characters; DELETE FROM players; DELETE FROM settings;",
  );
  sqlite.exec(safe.sql);
  expect(sqlite.prepare("SELECT count(*) as n FROM players").get()!.n).toBe(3);
});

it("retains journal tombstones so old retries cannot recreate deleted entries", async () => {
  const sessionToken = await signin();
  const input = {
    sessionToken,
    characterId: "player-character",
    title: "Notes",
    notes: "Text",
    clientMutationId: "deleted-retry",
  };
  const created = await call("journal.create", input);
  const deletion = await call("journal.delete", {
    sessionToken,
    characterId: "player-character",
    entryId: created.data.entry.entryId,
    expectedUpdatedAt: created.data.entry.updatedAt,
  });
  expect(deletion.status).toBe(200);
  expect((await call("journal.create", input)).status).toBe(409);
  expect(
    (
      await call(
        "journal-status",
        { sessionToken, characterId: "player-character" },
        true,
      )
    ).data.journal,
  ).toEqual([]);
});
it("supports character lifecycle and retains owner/history after soft deletion", async () => {
  const sessionToken = await signin(),
    dm = await signin("dm");
  expect(
    (
      await call("character.create", {
        sessionToken,
        targetPlayerId: "other",
        clientMutationId: "spoof",
        name: "Spoof",
        class: "Fighter",
        level: 1,
      })
    ).status,
  ).toBe(403);
  const created = await call("character.create", {
    sessionToken: dm,
    targetPlayerId: "player",
    clientMutationId: "new-hero",
    name: "New hero",
    class: "Cleric",
    level: 2,
  });
  expect(created.status).toBe(200);
  const characterId = created.data.character.characterId;
  expect(
    (
      await call("character.update", {
        sessionToken,
        characterId,
        expectedVersion: created.data.character.version,
        name: "Updated hero",
        class: "Cleric",
        level: 3,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("character.delete", {
        sessionToken,
        characterId,
        expectedVersion: 2,
      })
    ).status,
  ).toBe(200);
  expect(
    (await call("journal-status", { sessionToken, characterId }, true)).status,
  ).toBe(403);
  expect(
    sqlite
      .prepare("SELECT active FROM characters WHERE id = ?")
      .get(characterId)!.active,
  ).toBe(0);
  expect(
    (await call("account-roster", { sessionToken }, true)).data.characters,
  ).toHaveLength(1);
});

function holdJournalRead() {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  afterJournalRead = async () => {
    started();
    await held;
  };
  return { release, ready };
}
it("does not resurrect a journal entry when a stale update races a successful delete", async () => {
  const sessionToken = await signin();
  const created = await call("journal.create", {
    sessionToken,
    characterId: "player-character",
    clientMutationId: "delete-race",
    title: "Before",
    notes: "Before",
  });
  const input = {
    sessionToken,
    characterId: "player-character",
    entryId: created.data.entry.entryId,
    expectedUpdatedAt: created.data.entry.updatedAt,
  };
  const hold = holdJournalRead();
  const staleUpdate = call("journal.update", {
    ...input,
    title: "Stale",
    notes: "Stale",
  });
  await hold.ready;
  const deletion = await call("journal.delete", input);
  hold.release();
  expect(deletion.status).toBe(200);
  expect((await staleUpdate).status).toBe(409);
  const row = sqlite
    .prepare("SELECT updated_at,data FROM records WHERE id = ?")
    .get(input.entryId)!;
  expect(Date.parse(String(row.updated_at))).toBeGreaterThan(
    Date.parse(input.expectedUpdatedAt),
  );
  expect(JSON.parse(String(row.data)).updatedAt).toBe(row.updated_at);
  expect(
    (
      await call(
        "journal-status",
        { sessionToken, characterId: "player-character" },
        true,
      )
    ).data.journal,
  ).toEqual([]);
});
it("rejects a stale delete when a competing journal update commits first", async () => {
  const sessionToken = await signin();
  const created = await call("journal.create", {
    sessionToken,
    characterId: "player-character",
    clientMutationId: "update-race",
    title: "Before",
    notes: "Before",
  });
  const input = {
    sessionToken,
    characterId: "player-character",
    entryId: created.data.entry.entryId,
    expectedUpdatedAt: created.data.entry.updatedAt,
  };
  const hold = holdJournalRead();
  const staleDelete = call("journal.delete", input);
  await hold.ready;
  const edit = await call("journal.update", {
    ...input,
    title: "After",
    notes: "After",
  });
  hold.release();
  expect(edit.status).toBe(200);
  expect((await staleDelete).status).toBe(409);
  expect(
    (
      await call(
        "journal-status",
        { sessionToken, characterId: "player-character" },
        true,
      )
    ).data.journal[0].notes,
  ).toBe("After");
});
it("reveals from stale DM tabs only change visibility and stale hex edits are rejected", async () => {
  const sessionToken = await signin("dm");
  const input = {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    hexNumber: "2",
    mapX: 60,
    mapY: 70,
  };
  const original = JSON.parse(
    String(
      sqlite.prepare("SELECT data FROM records WHERE id='hex-1'").get()!.data,
    ),
  );
  const edit = await call("territory.hex.upsert", {
    ...input,
    title: "Current title",
    contents: "Current notes",
    expectedUpdatedAt: original.updatedAt,
  });
  expect(edit.status).toBe(200);
  const reveal = await call("territory.hex.upsert", {
    ...input,
    mapX: 1,
    mapY: 1,
    title: "Stale title",
    contents: "Stale notes",
    dmRevealed: true,
    revealOnly: true,
  });
  expect(reveal.status).toBe(200);
  expect(reveal.data.hex).toMatchObject({
    title: "Current title",
    contents: "Current notes",
    mapX: 60,
    mapY: 70,
    dmRevealed: true,
  });
  expect(Date.parse(reveal.data.hex.updatedAt)).toBeGreaterThan(
    Date.parse(edit.data.hex.updatedAt),
  );
  expect(
    (
      await call("territory.hex.upsert", {
        ...input,
        title: "Stale title",
        contents: "Stale notes",
        expectedUpdatedAt: original.updatedAt,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call("territory.hex.upsert", {
        ...input,
        title: "No version",
        contents: "No version",
      })
    ).status,
  ).toBe(409);
});
it("imports Excel calendar dates that the actual wallet recurrence function can use", async () => {
  const sheets = fixtureSheets();
  sheets["Recurring Expenses"] = [
    {
      scheduleId: "date",
      characterId: "player-character",
      label: "Monthly",
      pp: 0,
      gp: 1,
      sp: 0,
      cp: 0,
      frequency: "monthly",
      startDate: new Date("2026-01-02T00:00:00Z"),
      occurrenceCount: 0,
      active: true,
    },
  ];
  const converted = convertWorkbook(sheets);
  expect(converted.errors).toEqual([]);
  const destination = new DatabaseSync(":memory:");
  try {
    destination.exec(
      readFileSync("worker/migrations/0001_initial.sql", "utf8"),
    );
    destination.exec(converted.sql);
    const schedule = JSON.parse(
      String(
        destination
          .prepare("SELECT data FROM records WHERE kind='recurring'")
          .get()!.data,
      ),
    );
    expect(schedule.startDate).toBe("2026-01-02");

    expect(
      JSON.parse(
        String(
          destination
            .prepare("SELECT data FROM records WHERE kind='hex' LIMIT 1")
            .get()!.data,
        ),
      ).createdAt,
    ).toContain("T");
  } finally {
    destination.close();
  }
  sheets["Recurring Expenses"][0].startDate = "2026-02-31";
  expect(convertWorkbook(sheets).sql).toBeNull();
});
it("blocks importer payloads that would fail frontend record validation", () => {
  const sheets = fixtureSheets();
  sheets.Journal = [
    {
      entryId: "missing-notes",
      characterId: "player-character",
      playerId: "player",
      title: "Missing notes",
      category: "",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];
  sheets["Recurring Expenses"] = [
    {
      scheduleId: "count",
      characterId: "player-character",
      label: "Bad count",
      pp: 0,
      gp: 1,
      sp: 0,
      cp: 0,
      frequency: "monthly",
      startDate: "2026-01-01",
      occurrenceCount: -1,
      active: true,
    },
  ];
  const converted = convertWorkbook(sheets);
  expect(converted.sql).toBeNull();
  expect(converted.errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Journal, row 2, notes"),
      expect.stringContaining("Recurring Expenses, row 2, occurrenceCount"),
    ]),
  );
  const noEmail = fixtureSheets();
  delete noEmail.Players[0].email;
  expect(convertWorkbook(noEmail).sql).toBeNull();
});
it("returns journals in newest-update order with a stable ID tie breaker", async () => {
  const at = "2026-01-01T00:00:00Z",
    later = "2026-10-01T00:00:00Z";
  for (const [id, date] of [
    ["a-old", at],
    ["z-new", later],
    ["b-new", later],
  ]) {
    const entry = {
      entryId: id,
      characterId: "player-character",
      playerId: "player",
      title: id,
      notes: id,
      category: "",
      createdAt: date,
      updatedAt: date,
    };
    sqlite
      .prepare(
        "INSERT INTO records(kind,id,character_id,updated_at,data) VALUES ('journal',?,'player-character',?,?)",
      )
      .run(id, date, JSON.stringify(entry));
  }
  const sessionToken = await signin();
  for (const action of ["journal-status", "bootstrap"])
    expect(
      (
        await call(
          action,
          { sessionToken, characterId: "player-character" },
          true,
        )
      ).data.journal.map((row: any) => row.entryId),
    ).toEqual(["b-new", "z-new", "a-old"]);
});
it("returns matching diagnostic references and sanitized server logs for unexpected D1 failures", async () => {
  const sessionToken = await signin();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  env.DB.prepare = () => {
    throw new Error(
      "D1_ERROR: no such table: sessions PRIVATE_TOKEN user@example.test secret SQL",
    );
  };
  const response = await worker.fetch(
    new Request(
      `http://localhost/?action=journal-status&characterId=player-character&sessionToken=${sessionToken}`,
    ) as any,
    env,
  );
  const data: any = await response.json();
  expect(response.status).toBe(500);
  expect(data.code).toBe("internal_error");
  expect(response.headers.get("X-Request-ID")).toBe(data.requestId);
  expect(data.error).toContain(data.requestId);
  expect(log).toHaveBeenCalledWith(
    "campaign_request_failed",
    expect.objectContaining({
      requestId: data.requestId,
      action: "journal-status",
      failure: "database_schema",
      resource: "sessions",
    }),
  );
  expect(JSON.stringify([data, log.mock.calls])).not.toMatch(
    /PRIVATE_TOKEN|user@example.test|secret SQL/,
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain(sessionToken);
});
it("provides machine-readable throttling errors and Retry-After metadata", async () => {
  for (let i = 0; i < 10; i++)
    await call("auth.login", {
      playerId: "player",
      email: "player@example.test",
      password: "wrong",
    });
  const response = await worker.fetch(
    new Request("http://localhost/", {
      method: "POST",
      headers: { Origin: "http://localhost:5173" },
      body: JSON.stringify({
        action: "auth.login",
        playerId: "player",
        email: "player@example.test",
        password: "wrong",
      }),
    }) as any,
    env,
  );
  expect(response.status).toBe(429);
  expect(((await response.json()) as any).code).toBe("rate_limited");
  expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect(Number(response.headers.get("Retry-After"))).toBeLessThanOrEqual(900);
  expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
    "Retry-After",
  );
});

const backupTransaction = (id = 1, gp = 12) => ({
  id,
  transactionId: `local-${id}`,
  label: "Savings",
  kind: "income",
  coins: { pp: 0, gp, sp: 0, cp: 0 },
  timestamp: "Oct 15, 2026",
});
it("stores immutable wallet snapshots and retries the same request without replacing a newer backup", async () => {
  const sessionToken = await signin();
  const input = {
    sessionToken,
    characterId: "player-character",
    clientMutationId: "backup-one",
    expectedBackupId: "",
    transactions: [backupTransaction()],
    recurringExpenses: [],
  };
  const first = await call("wallet.backup.save", input);
  expect(first.status).toBe(200);
  expect(first.data).toMatchObject({
    transactionCount: 1,
    recurringExpenseCount: 0,
    isLatest: true,
  });
  // Object key order is irrelevant to the idempotency hash.
  const retry = await call("wallet.backup.save", {
    ...input,
    transactions: [
      { ...backupTransaction(), coins: { cp: 0, sp: 0, gp: 12, pp: 0 } },
    ],
  });
  expect(retry.data).toEqual(first.data);
  const second = await call("wallet.backup.save", {
    ...input,
    clientMutationId: "backup-two",
    expectedBackupId: first.data.backupId,
    transactions: [],
  });
  expect(second.status).toBe(200);
  expect((await call("wallet.backup.save", input)).data).toMatchObject({
    backupId: first.data.backupId,
    isLatest: false,
  });
  const changedRetry = await call("wallet.backup.save", {
    ...input,
    transactions: [backupTransaction(1, 99)],
  });
  expect(changedRetry.status).toBe(409);
  expect(
    sqlite.prepare("SELECT count(*) AS n FROM wallet_backups").get()!.n,
  ).toBe(2);
  const loaded = await call("wallet.backup.load", {
    sessionToken,
    characterId: "player-character",
  });
  expect(loaded.status).toBe(200);
  expect(loaded.data).toMatchObject({
    backupId: second.data.backupId,
    transactions: [],
    recurringExpenses: [],
  });
  expect(
    JSON.parse(
      String(
        sqlite
          .prepare("SELECT data FROM wallet_backups WHERE id=?")
          .get(first.data.backupId)!.data,
      ),
    ).transactions,
  ).toEqual(input.transactions);
});
it("enforces wallet backup ownership, DM access and soft deletion", async () => {
  const player = await signin(),
    other = await signin("other"),
    dm = await signin("dm");
  const input = {
    characterId: "player-character",
    clientMutationId: "owned",
    expectedBackupId: "",
    transactions: [backupTransaction()],
    recurringExpenses: [],
  };
  expect(
    (await call("wallet.backup.save", { ...input, sessionToken: other }))
      .status,
  ).toBe(403);
  expect(
    (
      await call("wallet.backup.load", {
        characterId: input.characterId,
        sessionToken: other,
      })
    ).status,
  ).toBe(403);
  expect(
    (await call("wallet.backup.save", { ...input, sessionToken: dm })).status,
  ).toBe(200);
  expect(
    (
      await call("wallet.backup.load", {
        characterId: input.characterId,
        sessionToken: player,
      })
    ).status,
  ).toBe(200);
  sqlite
    .prepare("UPDATE characters SET active=0 WHERE id=?")
    .run(input.characterId);
  expect(
    (
      await call("wallet.backup.load", {
        characterId: input.characterId,
        sessionToken: dm,
      })
    ).status,
  ).toBe(403);
  expect(
    sqlite.prepare("SELECT count(*) AS n FROM wallet_backups").get()!.n,
  ).toBe(1);
});
it("rejects invalid wallet snapshots atomically and locates the bad field without leaking values", async () => {
  const sessionToken = await signin();
  const input = {
    sessionToken,
    characterId: "player-character",
    clientMutationId: "safe",
    expectedBackupId: "",
    transactions: [backupTransaction()],
    recurringExpenses: [],
  };
  const saved = await call("wallet.backup.save", input);
  const bad = await call("wallet.backup.save", {
    ...input,
    clientMutationId: "bad",
    transactions: [
      {
        ...backupTransaction(),
        coins: { pp: 0, gp: "PRIVATE_INVALID_VALUE", sp: 0, cp: 0 },
      },
    ],
  });
  expect(bad.status).toBe(400);
  expect(bad.data.error).toContain("transactions[0].coins.gp");
  expect(JSON.stringify(bad.data)).not.toContain("PRIVATE_INVALID_VALUE");
  for (const transactions of [
    [backupTransaction(), backupTransaction()],
    [{ ...backupTransaction(), note: { secret: true } }],
  ]) {
    expect(
      (
        await call("wallet.backup.save", {
          ...input,
          clientMutationId: "bad-duplicate",
          transactions,
        })
      ).status,
    ).toBe(400);
  }
  expect(
    (
      await call("wallet.backup.save", {
        ...input,
        clientMutationId: undefined,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("wallet.backup.load", {
        sessionToken,
        characterId: input.characterId,
      })
    ).data.backupId,
  ).toBe(saved.data.backupId);
  expect(
    sqlite.prepare("SELECT count(*) AS n FROM wallet_backups").get()!.n,
  ).toBe(1);
});
it("reports a missing wallet backup and sanitizes an invalid stored snapshot", async () => {
  const sessionToken = await signin();
  const input = { sessionToken, characterId: "player-character" };
  const missing = await call("wallet.backup.load", input);
  expect(missing.status).toBe(404);
  expect(missing.data).toMatchObject({ code: "not_found" });
  await call("wallet.backup.save", {
    ...input,
    clientMutationId: "bad-store",
    expectedBackupId: "",
    transactions: [],
    recurringExpenses: [],
  });
  sqlite.prepare("UPDATE wallet_backups SET data=?").run(
    JSON.stringify({
      transactions: [{ note: "PRIVATE_SAVED_DATA" }],
      recurringExpenses: [],
    }),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const corrupt = await call("wallet.backup.load", input);
  expect(corrupt.status).toBe(500);
  expect(corrupt.data.requestId).toBeTruthy();
  expect(JSON.stringify([corrupt.data, log.mock.calls])).not.toContain(
    "PRIVATE_SAVED_DATA",
  );
});

it("rejects stale and missing wallet versions, including competing saves from two devices", async () => {
  const sessionToken = await signin();
  const input = {
    sessionToken,
    characterId: "player-character",
    expectedBackupId: "",
    transactions: [backupTransaction()],
    recurringExpenses: [],
  };
  const results = await Promise.all([
    call("wallet.backup.save", { ...input, clientMutationId: "device-a" }),
    call("wallet.backup.save", {
      ...input,
      clientMutationId: "device-b",
      transactions: [],
    }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const winner = results.find((result) => result.status === 200)!;
  const loaded = await call("wallet.backup.load", {
    sessionToken,
    characterId: input.characterId,
  });
  expect(loaded.data.backupId).toBe(winner.data.backupId);
  expect(
    sqlite.prepare("SELECT count(*) AS n FROM wallet_backups").get()!.n,
  ).toBe(1);
  expect(
    (
      await call("wallet.backup.save", {
        ...input,
        expectedBackupId: undefined,
        clientMutationId: "missing-version",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("wallet.backup.save", {
        ...input,
        clientMutationId: "stale-version",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call("wallet.backup.save", {
        ...input,
        expectedBackupId: winner.data.backupId,
        clientMutationId: "reviewed-version",
      })
    ).status,
  ).toBe(200);
});
it("creates one character for concurrent/retried requests and rejects reused keys with different details", async () => {
  const sessionToken = await signin();
  const input = {
    sessionToken,
    name: "Retry hero",
    class: "Fighter",
    level: 1,
    clientMutationId: "create-once",
  };
  const [first, retry] = await Promise.all([
    call("character.create", input),
    call("character.create", input),
  ]);
  expect(first.status).toBe(200);
  expect(retry.status).toBe(200);
  expect(first.data.character).toEqual(retry.data.character);
  expect(first.data.character.version).toBe(1);
  expect(
    sqlite
      .prepare(
        "SELECT count(*) AS n FROM characters WHERE creation_mutation_id=?",
      )
      .get("create-once")!.n,
  ).toBe(1);
  expect(
    (await call("character.create", { ...input, name: "Different hero" }))
      .status,
  ).toBe(409);
  expect(
    (await call("character.create", { ...input, clientMutationId: undefined }))
      .status,
  ).toBe(400);
  const id = first.data.character.characterId;
  await call("character.update", {
    sessionToken,
    characterId: id,
    name: "Renamed",
    class: "Fighter",
    level: 2,
    expectedVersion: 1,
  });
  expect((await call("character.create", input)).data.character).toMatchObject({
    name: "Renamed",
    version: 2,
  });
  await call("character.delete", {
    sessionToken,
    characterId: id,
    expectedVersion: 2,
  });
  expect((await call("character.create", input)).status).toBe(409);
  expect(
    sqlite.prepare("SELECT active FROM characters WHERE id=?").get(id)!.active,
  ).toBe(0);
});
it("rejects stale character edits/deletions and exposes current versions through the roster", async () => {
  const sessionToken = await signin();
  const input = {
    sessionToken,
    characterId: "player-character",
    name: "New name",
    class: "Fighter",
    level: 1,
    expectedVersion: 1,
  };
  const changed = await call("character.update", input);
  expect(changed.status).toBe(200);
  expect(changed.data.character.version).toBe(2);
  expect(
    (await call("character.update", { ...input, name: "Old name", level: 2 }))
      .status,
  ).toBe(409);
  expect(
    (await call("character.update", { ...input, expectedVersion: undefined }))
      .status,
  ).toBe(400);
  expect(
    (
      await call("character.delete", {
        sessionToken,
        characterId: input.characterId,
        expectedVersion: 1,
      })
    ).status,
  ).toBe(409);
  const roster = await call("account-roster", { sessionToken }, true);
  expect(roster.data.characters[0]).toMatchObject({
    name: "New name",
    level: 1,
    version: 2,
  });
  expect(
    (await call("character.update", { ...input, expectedVersion: 2, level: 2 }))
      .data.character,
  ).toMatchObject({ name: "New name", version: 3, level: 2 });
});
it("repairs older local map fixtures while preserving assigned maps and real campaigns", () => {
  const repair = readFileSync("scripts/repair-d1-fixture-maps.sql", "utf8");
  const removeMaps = () =>
    sqlite
      .prepare(
        "UPDATE territories SET data=json_remove(data,'$.mapUrl','$.mapFileName','$.poiMapUrl','$.poiMapFileName') WHERE id='territory'",
      )
      .run();
  const territory = () =>
    JSON.parse(
      String(
        sqlite
          .prepare("SELECT data FROM territories WHERE id='territory'")
          .get()!.data,
      ),
    );
  removeMaps();
  sqlite.exec(repair);
  expect(territory().mapUrl).toBe("/demo-territory-player.svg");
  expect(territory().name).toBe("Test Territory");
  sqlite
    .prepare(
      "UPDATE territories SET data=json_set(data,'$.mapUrl','/my-map.svg') WHERE id='territory'",
    )
    .run();
  sqlite.exec(repair);
  expect(territory().mapUrl).toBe("/my-map.svg");
  removeMaps();
  sqlite
    .prepare(
      "UPDATE settings SET value='Actual campaign' WHERE key='campaignName'",
    )
    .run();
  sqlite.exec(repair);
  expect(territory().mapUrl).toBeUndefined();
  expect(sqlite.prepare("SELECT count(*) AS n FROM characters").get()!.n).toBe(
    2,
  );
});

async function createForce(sessionToken: string, men = 30) {
  const result = await call("retainer.create", {
    sessionToken,
    characterId: "player-character",
    type: "force",
    name: "Scouts",
    role: "Footman, light",
    amount: 30,
    costCoin: "gp",
    wageFrequency: "monthly",
    hiringDate: "2026-10-01",
    roster: [{ soldierType: "Footman, light", men }],
  });
  expect(result.status, JSON.stringify(result.data)).toBe(200);
  return result.data.retainer;
}
it("migrates scouting start, completion, player result reveal and dismissal without repeating population", async () => {
  const sessionToken = await signin(),
    dm = await signin("dm");
  const force = await createForce(sessionToken);
  sqlite.exec(
    "UPDATE records SET data=json_set(data,'$.hexPopulationValue',100,'$.potentialHostileEncounterPopulation',0) WHERE kind='hex' AND id='hex-1'",
  );
  const start = await call("scouting.start", {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    hexNumber: "2",
    mapX: 41,
    mapY: 40,
    allocations: [
      { retainerId: force.retainerId, soldierType: "Footman, light", men: 10 },
    ],
    clientMissionId: "local-start",
    commandId: "start-key",
  });
  expect(start.status, JSON.stringify(start.data)).toBe(200);
  expect(start.data.mission).not.toHaveProperty("startedAt");
  const missionId = start.data.mission.missionId;
  expect(
    (
      await call("scouting.complete-test", {
        sessionToken,
        characterId: "player-character",
        missionId,
      })
    ).status,
  ).toBe(403);
  const complete = await call("scouting.complete-test", {
    sessionToken: dm,
    characterId: "player-character",
    missionId,
    commandId: "complete-key",
  });
  expect(complete.status, JSON.stringify(complete.data)).toBe(200);
  const before = await call(
    "territory-status",
    { sessionToken, characterId: "player-character" },
    true,
  );
  expect(before.data.territoryHexes).toHaveLength(1);
  const seen = await call("scouting.view-results", {
    sessionToken,
    characterId: "player-character",
    missionId,
    commandId: "view-key",
  });
  expect(seen.status, JSON.stringify(seen.data)).toBe(200);
  const after = await call(
    "territory-status",
    { sessionToken, characterId: "player-character" },
    true,
  );
  expect(after.data.territoryHexes).toHaveLength(2);
  expect(after.data.territories[0].population).toBe(100);
  expect(JSON.stringify(after.data)).not.toContain("DM secret");
  const retry = await call("scouting.complete-test", {
    sessionToken: dm,
    characterId: "player-character",
    missionId,
    commandId: "complete-key",
  });
  expect(retry.data).toEqual(complete.data);
  expect(
    (
      await call("scouting.dismiss", {
        sessionToken,
        characterId: "player-character",
        missionId,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("scouting.view-results", {
        sessionToken: await signin("other"),
        characterId: "player-character",
        missionId,
      })
    ).status,
  ).toBe(403);
});
it("rejects reused command IDs, duplicate allocations and overcommitted troops", async () => {
  const sessionToken = await signin(),
    force = await createForce(sessionToken, 20);
  const input = {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    hexNumber: "2",
    mapX: 41,
    mapY: 40,
    allocations: [
      { retainerId: force.retainerId, soldierType: "Footman, light", men: 20 },
    ],
    commandId: "same-start",
  };
  const first = await call("scouting.start", input);
  expect(first.status, JSON.stringify(first.data)).toBe(200);
  expect((await call("scouting.start", input)).data).toEqual(first.data);
  expect(
    (await call("scouting.start", { ...input, hexNumber: "3" })).status,
  ).toBe(409);
  expect(
    (
      await call("scouting.start", {
        ...input,
        hexNumber: "3",
        commandId: "new-start",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call("retainer.delete", {
        sessionToken,
        characterId: "player-character",
        retainerId: force.retainerId,
        expectedUpdatedAt: force.updatedAt,
      })
    ).status,
  ).toBe(409);
});
it("saves territory edits, journals and wallet actions with original ownership intact", async () => {
  const sessionToken = await signin();
  const territory = await call("territory.create", {
    sessionToken,
    characterId: "player-character",
    name: "New Territory",
  });
  expect(territory.status, JSON.stringify(territory.data)).toBe(200);
  const territoryId = territory.data.territory.territoryId;
  expect(
    (
      await call("territory.management.update", {
        sessionToken,
        characterId: "player-character",
        territoryId,
        population: 42,
        assets: [],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("territory.delete", {
        sessionToken,
        characterId: "player-character",
        territoryId,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("territory.delete", {
        sessionToken: await signin("dm"),
        characterId: "player-character",
        territoryId,
      })
    ).status,
  ).toBe(200);
  const tx = await call("transaction.create", {
    sessionToken,
    characterId: "player-character",
    type: "expense",
    label: "Test",
    gp: 5,
    commandId: "tx-key",
  });
  expect(tx.status, JSON.stringify(tx.data)).toBe(200);
  expect(tx.data.transaction.gp).toBe(-5);
  expect(
    (
      await call("transaction.delete", {
        sessionToken,
        characterId: "player-character",
        transactionId: tx.data.transaction.transactionId,
      })
    ).status,
  ).toBe(200);
  const schedule = await call("recurring.create", {
    sessionToken,
    characterId: "player-character",
    label: "Supplies",
    gp: 2,
    frequency: "monthly",
    startDate: "2026-10-19",
  });
  expect(schedule.status, JSON.stringify(schedule.data)).toBe(200);
  expect(
    (
      await call("recurring.cancel", {
        sessionToken,
        characterId: "player-character",
        scheduleId: schedule.data.schedule.scheduleId,
      })
    ).status,
  ).toBe(200);
});

it("migrates registration, one-time password setup and recovery with session revocation", async () => {
  env.REGISTRATION_PLAYER_KEY = "synthetic-setup-key";
  const registered = await call("auth.register", {
    displayName: "New player",
    email: "new@example.test",
    setupPassword: "synthetic-setup-key",
  });
  expect(registered.status, JSON.stringify(registered.data)).toBe(200);
  const changed = await call("auth.password.change", {
    passwordChangeToken: registered.data.passwordChangeToken,
    newPassword: "new-secret-password",
    recoveryQuestion: "What is the test word?",
    recoveryAnswer: "Test answer",
  });
  expect(changed.status, JSON.stringify(changed.data)).toBe(200);
  const playerId = changed.data.currentPlayer.playerId;
  const replay = await call("auth.password.change", {
    passwordChangeToken: registered.data.passwordChangeToken,
    newPassword: "another-password",
    recoveryQuestion: "A recovery question",
    recoveryAnswer: "answer",
  });
  expect(replay.status).toBe(401);
  expect(
    (
      await call("auth.recovery.question", {
        playerId,
        email: "new@example.test",
      })
    ).data.recoveryQuestion,
  ).toBe("What is the test word?");
  expect(
    (
      await call("auth.recovery.reset", {
        playerId,
        email: "new@example.test",
        recoveryAnswer: "wrong",
        newPassword: "replacement-password",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("auth.recovery.reset", {
        playerId,
        email: "new@example.test",
        recoveryAnswer: "  TEST answer ",
        newPassword: "replacement-password",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "account-roster",
        { sessionToken: changed.data.sessionToken },
        true,
      )
    ).status,
  ).toBe(401);
  const loggedIn = await call("auth.login", {
    playerId,
    email: "new@example.test",
    password: "replacement-password",
  });
  expect(loggedIn.status, JSON.stringify(loggedIn.data)).toBe(200);
  expect(
    sqlite
      .prepare("SELECT password_hash FROM players WHERE id=?")
      .get(playerId)!.password_hash,
  ).toMatch(/^pbkdf2:/);
  expect(JSON.stringify(loggedIn.data)).not.toMatch(
    /recoveryAnswer|passwordHash|passwordSalt/,
  );
});
it("migrates DM settings, keeps webhook secrets private and enables custom orders", async () => {
  const dm = await signin("dm"),
    sessionToken = await signin();
  expect(
    (await call("campaign.update", { sessionToken, campaignName: "Blocked" }))
      .status,
  ).toBe(403);
  expect(
    (
      await call("campaign.update", {
        sessionToken: dm,
        campaignName: "New campaign",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("discord.webhook.update", {
        sessionToken: dm,
        targetPlayerId: "player",
        webhookUrl: "http://localhost/internal",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("discord.webhook.update", {
        sessionToken: dm,
        targetPlayerId: "player",
        webhookUrl:
          "https://discord.com/api/webhooks/12345678901234567/synthetic-token",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("discord.thread.update", {
        sessionToken: dm,
        characterId: "player-character",
        threadId: "12345678901234567",
      })
    ).status,
  ).toBe(200);
  const roster = await call("account-roster", { sessionToken }, true);
  expect(roster.data.currentPlayer.discordWebhookConfigured).toBe(true);
  expect(roster.data.characters[0].discordConfigured).toBe(true);
  expect(JSON.stringify(roster.data)).not.toContain("synthetic-token");
  const force = await createForce(sessionToken);
  const mission = await call("mission.custom.create", {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    objective: "Patrol",
    missionLocation: "Forest",
    startDate: "2026-11-01",
    durationDays: 2,
    allocations: [
      { retainerId: force.retainerId, soldierType: "Footman, light", men: 10 },
    ],
  });
  expect(mission.status, JSON.stringify(mission.data)).toBe(200);
  expect(
    sqlite.prepare("SELECT COUNT(*) AS n FROM notification_outbox").get()!.n,
  ).toBe(1);
  expect(
    (
      await call("player.access.update", {
        sessionToken: dm,
        targetPlayerId: "player",
        territoriesEnabled: false,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("territory.create", {
        sessionToken,
        characterId: "player-character",
        name: "Blocked",
      })
    ).status,
  ).toBe(403);
});
it("serves D1 maps and portraits, preserves versions and prevents cross-character uploads", async () => {
  const dm = await signin("dm"),
    sessionToken = await signin();
  const file = {
    fileName: "map.png",
    mimeType: "image/png",
    base64: btoa(String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10)),
  };
  const input = {
    sessionToken: dm,
    characterId: "player-character",
    territoryId: "territory",
    ...file,
    commandId: "map-upload",
  };
  const uploaded = await call("territory.map.upload", input);
  expect(uploaded.status, JSON.stringify(uploaded.data)).toBe(200);
  expect(uploaded.data.territory.mapFileId).toMatch(/^d1:/);
  expect((await call("territory.map.upload", input)).data).toEqual(
    uploaded.data,
  );
  expect(sqlite.prepare("SELECT count(*) AS n FROM media_files").get()!.n).toBe(
    1,
  );
  const image = await worker.fetch(
    new Request(uploaded.data.territory.mapUrl) as any,
    env,
  );
  expect(image.status).toBe(200);
  expect(image.headers.get("Content-Type")).toBe("image/png");
  expect(
    (
      await call("character.portrait.upload", {
        sessionToken: await signin("other"),
        characterId: "player-character",
        ...file,
      })
    ).status,
  ).toBe(403);
  const portrait = await call("character.portrait.upload", {
    sessionToken,
    characterId: "player-character",
    ...file,
    commandId: "portrait",
  });
  expect(portrait.status, JSON.stringify(portrait.data)).toBe(200);
  expect(portrait.data.character.version).toBe(2);
  expect(portrait.data.character.portraitUrl).toContain("/files/");
  expect(
    (
      await call("character.portrait.delete", {
        sessionToken,
        characterId: "player-character",
      })
    ).status,
  ).toBe(200);
});
it("runs scheduled mission completion exactly once and retains device-local wallet policy", async () => {
  const sessionToken = await signin();
  const force = await createForce(sessionToken);
  const started = await call("scouting.start", {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    hexNumber: "3",
    mapX: 30,
    mapY: 40,
    allocations: [
      { retainerId: force.retainerId, soldierType: "Footman, light", men: 10 },
    ],
  });
  expect(started.status, JSON.stringify(started.data)).toBe(200);
  sqlite.exec(
    "UPDATE records SET data=json_set(data,'$.completesAt','2000-01-01T00:00:00.000Z') WHERE kind='scouting'",
  );
  const { runScheduled } = await import("../scheduled");
  await runScheduled(env.DB);
  await runScheduled(env.DB);
  await runScheduled(env.DB);
  const rows = sqlite
    .prepare("SELECT data FROM records WHERE kind='scouting'")
    .all();
  expect(JSON.parse(String(rows[0].data)).status).toBe("completed");
  expect(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM records WHERE kind='transaction'")
      .get()!.n,
  ).toBe(0);
});

it("rejects stale snapshots atomically and never commits half a game operation", async () => {
  const { loadGameContext, commitGame } = await import("../game");
  const player = {
    playerId: "player",
    role: "player",
    territoriesEnabled: true,
  };
  const snapshot = await loadGameContext(env.DB, player, "player-character");
  const before = JSON.parse(JSON.stringify(snapshot.context.sheets));
  snapshot.context.sheets.Territories[0].population = 123;
  sqlite.exec(
    "UPDATE records SET data=json_set(data,'$.title','Concurrent DM edit') WHERE id='hex-1' AND kind='hex'",
  );
  await expect(
    commitGame(
      env.DB,
      snapshot.context,
      before,
      snapshot.clock,
      "player-character",
      player,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    JSON.parse(
      String(
        sqlite
          .prepare("SELECT data FROM territories WHERE id='territory'")
          .get()!.data,
      ),
    ).population,
  ).toBe(0);
  expect(
    sqlite.prepare("SELECT COUNT(*) AS n FROM transaction_guards").get()!.n,
  ).toBe(0);
  const fresh = await loadGameContext(env.DB, player, "player-character");
  const baseline = JSON.parse(JSON.stringify(fresh.context.sheets));
  fresh.context.sheets.Territories[0].population = 321;
  fresh.context.sheets["Territory Hexes"][0].title = "Should roll back";
  sqlite.exec(
    "CREATE TRIGGER reject_hex BEFORE UPDATE ON records WHEN NEW.kind='hex' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END;",
  );
  await expect(
    commitGame(
      env.DB,
      fresh.context,
      baseline,
      fresh.clock,
      "player-character",
      player,
    ),
  ).rejects.toThrow();
  expect(
    JSON.parse(
      String(
        sqlite
          .prepare("SELECT data FROM territories WHERE id='territory'")
          .get()!.data,
      ),
    ).population,
  ).toBe(0);
});
it("preserves recruitment offers, accepts and denies them once, and limits resets to the DM", async () => {
  const sessionToken = await signin(),
    dm = await signin("dm");
  vi.spyOn(Math, "random").mockReturnValue(0.12);
  const rolled = await call("territory.recruitment.roll", {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
  });
  expect(rolled.status, JSON.stringify(rolled.data)).toBe(200);
  const offerId = rolled.data.offer.offerId;
  const again = await call("territory.recruitment.roll", {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
  });
  expect(again.data.offer.offerId).toBe(offerId);
  expect(
    (
      await call("territory.recruitment.deny", {
        sessionToken,
        characterId: "player-character",
        territoryId: "territory",
        offerId,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("territory.recruitment.reset", {
        sessionToken,
        characterId: "player-character",
        territoryId: "territory",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("territory.recruitment.reset", {
        sessionToken: dm,
        characterId: "player-character",
        territoryId: "territory",
      })
    ).status,
  ).toBe(200);
});
it("validates all territory-workbook rows before uploading or committing and bulk-imports 61 hexes", async () => {
  const sessionToken = await signin("dm");
  const rows = Array.from({ length: 61 }, (_, i) => ({
    hexNumber: `${Math.floor(i / 9) + 1}.${(i % 9) + 1}`,
    terrain: "Plains",
    inhabitants: "",
    dungeon: "",
    settlement: "",
    settlementName: "",
    details: "Imported",
    reaction: "Neutral",
    dmOnlyInformation: "Private",
    hexPopulationValue: 0,
    potentialHostileEncounterPopulation: 0,
  }));
  const input = {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    fileName: "territory.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64: btoa("PKsynthetic-file"),
    rows,
  };
  expect(
    (
      await call("territory.workbook.import", {
        ...input,
        rows: [rows[0], rows[0]],
      })
    ).status,
  ).toBe(400);
  expect(sqlite.prepare("SELECT count(*) AS n FROM media_files").get()!.n).toBe(
    0,
  );
  const result = await call("territory.workbook.import", input);
  expect(result.status, JSON.stringify(result.data)).toBe(200);
  expect(result.data.hexes.length).toBeGreaterThanOrEqual(61);
  const returnedHex = result.data.hexes[0];
  expect(returnedHex.updatedAt).toBe(
    sqlite
      .prepare("SELECT updated_at FROM records WHERE kind='hex' AND id=?")
      .get(returnedHex.hexId)!.updated_at,
  );
  expect(sqlite.prepare("SELECT count(*) AS n FROM media_files").get()!.n).toBe(
    1,
  );
  expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("retries Discord rate limits through a durable lease without exposing credentials or mentioning members", async () => {
  const { deliverNotifications } = await import("../notifications");
  const now = new Date().toISOString();
  sqlite
    .prepare("INSERT INTO discord_webhooks VALUES(?,?)")
    .run(
      "player",
      "https://discord.com/api/webhooks/12345678901234567/synthetic-token",
    );
  sqlite
    .prepare(
      "INSERT INTO notification_outbox(id,character_id,event,data,next_attempt_at,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      "notice",
      "player-character",
      "journal",
      JSON.stringify({ title: "Entry", notes: "Hello @everyone" }),
      now,
      now,
    );
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "Retry-After": "30" } }),
    )
    .mockResolvedValueOnce(new Response("{}", { status: 200 }));
  await deliverNotifications(env.DB, send as typeof fetch);
  expect(
    sqlite.prepare("SELECT status FROM notification_outbox").get()!.status,
  ).toBe("pending");
  sqlite.exec(
    "UPDATE notification_outbox SET next_attempt_at='2000-01-01T00:00:00.000Z'",
  );
  await deliverNotifications(env.DB, send as typeof fetch);
  await deliverNotifications(env.DB, send as typeof fetch);
  expect(send).toHaveBeenCalledTimes(2);
  expect(JSON.parse(send.mock.calls[1][1].body).allowed_mentions).toEqual({
    parse: [],
  });
  expect(
    sqlite.prepare("SELECT status FROM notification_outbox").get()!.status,
  ).toBe("sent");
});

it("migrates field allocation and paid development with stable payment events and season checks", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  try {
    const sessionToken = await signin();
    sqlite.exec(
      "UPDATE records SET data=json_set(data,'$.hexPopulationValue',100,'$.settlement','Village','$.settlementName','Home','$.cerealFields',2,'$.pastureFields',0,'$.cottonFields',0,'$.fieldCapacity',2,'$.fieldsInitializedAt','2026-11-01T00:00:00Z') WHERE id='hex-0' AND kind='hex'",
    );
    const allocate = await call("territory.fields.update", {
      sessionToken,
      characterId: "player-character",
      territoryId: "territory",
      hexId: "hex-0",
      cerealFields: 2,
      pastureFields: 0,
      cottonFields: 0,
    });
    expect(allocate.status, JSON.stringify(allocate.data)).toBe(200);
    const input = {
      sessionToken,
      characterId: "player-character",
      territoryId: "territory",
      hexId: "hex-0",
      walletBalance: { pp: 0, gp: 1000, sp: 0, cp: 0 },
      commandId: "expand-fields",
    };
    const expanded = await call("territory.fields.expand", input);
    expect(expanded.status, JSON.stringify(expanded.data)).toBe(200);
    expect(expanded.data.transaction.gp).toBe(-200);
    expect((await call("territory.fields.expand", input)).data).toEqual(
      expanded.data,
    );
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM records WHERE kind='transaction'")
        .get()!.n,
    ).toBe(0);
    expect(
      (
        await call("territory.fields.update", {
          ...input,
          hexId: "hex-1",
          cerealFields: 0,
          pastureFields: 0,
          cottonFields: 0,
          commandId: "hidden-fields",
        })
      ).status,
    ).toBe(403);
  } finally {
    vi.useRealTimers();
  }
});

it("recruits a fighting force once and returns one stable local-wallet equipment payment", async () => {
  const sessionToken = await signin();
  vi.spyOn(Math, "random").mockReturnValue(0.3);
  const rolled = await call("territory.recruitment.roll", {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
  });
  expect(rolled.data.offer.soldierType).toBe("footman, light");
  const input = {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    offerId: rolled.data.offer.offerId,
    newForceName: "New recruits",
    equipment: [
      { name: "Sword, short", quantityPerSoldier: 1, amount: 10, coin: "gp" },
    ],
    walletBalance: { pp: 0, gp: 10000, sp: 0, cp: 0 },
    commandId: "recruit-once",
  };
  const hired = await call("territory.recruitment.complete", input);
  expect(hired.status, JSON.stringify(hired.data)).toBe(200);
  expect(hired.data.offer.status).toBe("recruited");
  expect(hired.data.retainer.men).toBe(rolled.data.offer.quantity);
  expect(hired.data.transaction.gp).toBe(-10 * rolled.data.offer.quantity);
  expect((await call("territory.recruitment.complete", input)).data).toEqual(
    hired.data,
  );
  expect(
    sqlite
      .prepare("SELECT count(*) AS n FROM records WHERE kind='retainer'")
      .get()!.n,
  ).toBe(1);
  expect(
    sqlite
      .prepare("SELECT count(*) AS n FROM records WHERE kind='transaction'")
      .get()!.n,
  ).toBe(0);
});
it("promotes stranded scouts once, restores troop availability and returns a stable fee event", async () => {
  const sessionToken = await signin(),
    force = await createForce(sessionToken, 10);
  const allocation = {
    retainerId: force.retainerId,
    soldierType: "Footman, light",
    rosterGroupId: force.roster[0].rosterGroupId,
    men: 10,
    strandedMen: 9,
  };
  const mission = {
    missionId: "stranded-mission",
    characterId: "player-character",
    territoryId: "territory",
    hexNumber: "2",
    mapX: 40,
    mapY: 40,
    men: 10,
    allocations: [allocation],
    status: "failed",
    strandedMen: 9,
    promotionFeeGp: 10,
  };
  sqlite
    .prepare(
      "INSERT INTO records(kind,id,character_id,territory_id,updated_at,data) VALUES('scouting',?,'player-character','territory',?,?)",
    )
    .run(mission.missionId, new Date().toISOString(), JSON.stringify(mission));
  sqlite
    .prepare(
      "UPDATE records SET data=json_set(data,'$.roster[0].missingSerjeants',1) WHERE kind='retainer' AND id=?",
    )
    .run(force.retainerId);
  const input = {
    sessionToken,
    characterId: "player-character",
    missionId: mission.missionId,
    walletBalance: { pp: 0, gp: 100, sp: 0, cp: 0 },
    commandId: "promote-once",
  };
  const promoted = await call("scouting.promote-serjeants", input);
  expect(promoted.status, JSON.stringify(promoted.data)).toBe(200);
  expect(promoted.data.transaction.gp).toBe(-10);
  expect(promoted.data.mission.strandedMen).toBe(0);
  expect((await call("scouting.promote-serjeants", input)).data).toEqual(
    promoted.data,
  );
  expect(
    JSON.parse(
      String(
        sqlite
          .prepare("SELECT data FROM records WHERE kind='retainer' AND id=?")
          .get(force.retainerId)!.data,
      ),
    ).roster[0].missingSerjeants,
  ).toBe(0);
  expect(
    sqlite
      .prepare("SELECT count(*) AS n FROM records WHERE kind='transaction'")
      .get()!.n,
  ).toBe(0);
});

it("uses the campaign timezone for custom mission dates across daylight-saving boundaries", async () => {
  const { createRuleContext } = await import("../ruleContext");
  const rules = createRuleContext({
    sheets: {},
    player: {},
    timeZone: "America/New_York",
    notifications: [],
    webhook: "",
  });
  expect(rules.Utilities.calendarMidnight("2026-11-01").toISOString()).toBe(
    "2026-11-01T04:00:00.000Z",
  );
  expect(rules.Utilities.calendarMidnight("2026-11-02").toISOString()).toBe(
    "2026-11-02T05:00:00.000Z",
  );
  expect(() => rules.Utilities.calendarMidnight("2026-02-30")).toThrow();
});

it("stores a maximum-size multipart image within the Free query cap and rejects incomplete or corrupted content", async () => {
  const sessionToken = await signin("dm");
  const bytes = Buffer.alloc(5 * 1024 * 1024, 65);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  queryCount = 0;
  const upload = await call("territory.map.upload", {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    fileName: "large.png",
    mimeType: "image/png",
    base64: bytes.toString("base64"),
  });
  expect(upload.status, JSON.stringify(upload.data)).toBe(200);
  expect(queryCount).toBeLessThanOrEqual(50);
  const id = upload.data.territory.mapFileId.slice(3);
  expect(
    sqlite
      .prepare("SELECT count(*) AS n FROM media_file_parts WHERE file_id=?")
      .get(id)!.n,
  ).toBe(14);
  const getImage = () =>
    worker.fetch(new Request(upload.data.territory.mapUrl) as any, env);
  expect(
    Buffer.from(await (await getImage()).arrayBuffer()).equals(bytes),
  ).toBe(true);
  sqlite
    .prepare(
      "UPDATE media_file_parts SET data=substr(data,1,length(data)-4)||'AAAA' WHERE file_id=? AND part=1",
    )
    .run(id);
  const corrupt = await getImage();
  expect(corrupt.status).toBe(500);
  expect(((await corrupt.json()) as any).error).toMatch(/integrity check/);
  sqlite
    .prepare("DELETE FROM media_file_parts WHERE file_id=? AND part=1")
    .run(id);
  const incomplete = await getImage();
  expect(incomplete.status).toBe(500);
  expect(((await incomplete.json()) as any).error).toMatch(/incomplete/);
}, 30000);

it("rolls back a partial file replacement together with its reference and retry receipt", async () => {
  const sessionToken = await signin("dm");
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const input = {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    fileName: "map.png",
    mimeType: "image/png",
    base64: bytes.toString("base64"),
  };
  const old = await call("territory.map.upload", input);
  sqlite.exec(
    "CREATE TRIGGER simulate_file_failure BEFORE INSERT ON media_file_parts WHEN NEW.part=1 BEGIN SELECT RAISE(ABORT,'synthetic file write failure'); END",
  );
  const large = Buffer.alloc(600000, 65);
  large.set(bytes);
  const replacement = {
    ...input,
    base64: large.toString("base64"),
    commandId: "retry-file",
  };
  expect((await call("territory.map.upload", replacement)).status).toBe(500);
  expect(sqlite.prepare("SELECT count(*) AS n FROM media_files").get()!.n).toBe(
    1,
  );
  expect(
    sqlite
      .prepare(
        "SELECT count(*) AS n FROM command_receipts WHERE mutation_id='retry-file'",
      )
      .get()!.n,
  ).toBe(0);
  const territory = JSON.parse(
    String(
      sqlite.prepare("SELECT data FROM territories WHERE id='territory'").get()!
        .data,
    ),
  );
  expect(territory.mapFileId).toBe(old.data.territory.mapFileId);
  const image = await worker.fetch(
    new Request(old.data.territory.mapUrl) as any,
    env,
  );
  expect(Buffer.from(await image.arrayBuffer())).toEqual(bytes);
  sqlite.exec("DROP TRIGGER simulate_file_failure");
  expect((await call("territory.map.upload", replacement)).status).toBe(200);
  expect(sqlite.prepare("SELECT count(*) AS n FROM media_files").get()!.n).toBe(
    1,
  );
  expect(
    (await worker.fetch(new Request(old.data.territory.mapUrl) as any, env))
      .status,
  ).toBe(404);
});

it("enforces the upload budget while allowing replacements and frees deleted territory files", async () => {
  const { FILE_STORAGE_BUDGET } = await import("../fileStorage");
  const sessionToken = await signin("dm");
  const input = {
    sessionToken,
    characterId: "player-character",
    territoryId: "territory",
    fileName: "map.png",
    mimeType: "image/png",
    base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
  };
  expect((await call("territory.map.upload", input)).status).toBe(200);
  sqlite
    .prepare(
      "INSERT INTO media_files(id,character_id,category,name,mime_type,created_at,storage,encoded_length) VALUES('quota-fixture','player-character','test','test','image/png','2026-10-19','d1',?)",
    )
    .run(FILE_STORAGE_BUDGET - input.base64.length);
  const blocked = await call("territory.poi-map.upload", input);
  expect(blocked.status).toBe(413);
  expect(blocked.data.error).toMatch(/storage is full/);
  expect((await call("territory.map.upload", input)).status).toBe(200);
  expect(
    (
      await call("territory.delete", {
        sessionToken,
        characterId: "player-character",
        territoryId: "territory",
      })
    ).status,
  ).toBe(200);
  expect(
    sqlite.prepare("SELECT count(*) AS n FROM media_file_parts").get()!.n,
  ).toBe(0);
  expect(sqlite.prepare("SELECT id FROM media_files").all()).toEqual([
    { id: "quota-fixture" },
  ]);
});
