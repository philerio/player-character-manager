import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker, { type Env } from "../index";
import { validateResponse } from "../../src/app/validation";
// @ts-expect-error The importer is a Node CLI module.
import { convertWorkbook } from "../../scripts/import-workbook.mjs";
// @ts-expect-error Synthetic fixture shared with the CLI seed.
import { fixtureSheets } from "../../scripts/d1-fixture.mjs";
let sqlite: DatabaseSync, env: Env;
let afterJournalRead: (() => Promise<void>) | undefined;
/** Runs Worker SQL against SQLite, including transactions and real constraints. */
function statement(sql: string, args: any[] = []): any {
  return {
    bind: (...values: any[]) => statement(sql, values),
    first: async () => {
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
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => {
      const result = sqlite.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  };
}
beforeEach(() => {
  afterJournalRead = undefined;
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
  const body = { action, ...input };
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
it("expires/revokes sessions and blocks unknown/unported operations", async () => {
  const sessionToken = await signin();
  expect(
    (
      await call("retainer.create", {
        sessionToken,
        characterId: "player-character",
      })
    ).status,
  ).toBe(501);
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
