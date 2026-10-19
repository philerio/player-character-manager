-- Existing imported characters start at version 1. Retry keys never change.
ALTER TABLE characters ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE characters ADD COLUMN creation_player_id TEXT REFERENCES players(id);
ALTER TABLE characters ADD COLUMN creation_mutation_id TEXT;
ALTER TABLE characters ADD COLUMN creation_payload_hash TEXT;
CREATE UNIQUE INDEX character_creation_retry ON characters(creation_player_id, creation_mutation_id)
  WHERE creation_mutation_id IS NOT NULL;

-- Store the version a save was based on so retries remain tied to that version.
ALTER TABLE wallet_backups ADD COLUMN base_backup_id TEXT;
