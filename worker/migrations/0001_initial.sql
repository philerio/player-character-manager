PRAGMA foreign_keys = ON;
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('dm','player')),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX characters_owner ON characters(player_id, active);
CREATE TABLE territories (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  data TEXT NOT NULL CHECK (json_valid(data)),
  UNIQUE(id, character_id)
);
CREATE INDEX territories_character ON territories(character_id, active);
-- JSON preserves sheet fields during the staged migration. Ownership is relational.
CREATE TABLE records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  character_id TEXT NOT NULL REFERENCES characters(id),
  territory_id TEXT,
  hex_key TEXT,
  mutation_id TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY(kind, id),
  FOREIGN KEY(territory_id, character_id) REFERENCES territories(id, character_id),
  CHECK (kind <> 'hex' OR (territory_id IS NOT NULL AND hex_key IS NOT NULL))
);
CREATE INDEX records_character ON records(kind, character_id);
CREATE UNIQUE INDEX unique_hex ON records(territory_id, hex_key) WHERE kind = 'hex';
CREATE UNIQUE INDEX unique_mutation ON records(kind, character_id, mutation_id) WHERE mutation_id IS NOT NULL;
CREATE TABLE revisions (
  character_id TEXT NOT NULL REFERENCES characters(id),
  tab TEXT NOT NULL CHECK (tab IN ('wallet','journal','retainers','territories')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(character_id, tab)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Preserve source rows not yet served by the Worker. Never expose these over the API.
CREATE TABLE migration_archive (
  sheet TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY(sheet, row_number)
);
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
