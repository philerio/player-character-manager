-- Snapshots are immutable: saving a new backup never deletes an older one.
CREATE TABLE wallet_backups (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  character_id TEXT NOT NULL REFERENCES characters(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  mutation_id TEXT,
  payload_hash TEXT NOT NULL,
  backed_up_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  UNIQUE(character_id, player_id, mutation_id)
);
CREATE INDEX wallet_backups_latest ON wallet_backups(character_id, sequence DESC);
