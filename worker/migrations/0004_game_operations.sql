CREATE TABLE command_receipts (
  actor_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  character_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  response TEXT NOT NULL CHECK(json_valid(response)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, mutation_id)
);
-- A failed guard aborts the entire D1 batch before any campaign data is written.
CREATE TABLE transaction_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
CREATE TABLE campaign_clocks (character_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO campaign_clocks(character_id) SELECT id FROM characters;
CREATE TRIGGER records_clock_insert AFTER INSERT ON records BEGIN
  INSERT INTO campaign_clocks VALUES(NEW.character_id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER records_clock_update AFTER UPDATE ON records BEGIN
  INSERT INTO campaign_clocks VALUES(NEW.character_id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER records_clock_delete AFTER DELETE ON records BEGIN
  INSERT INTO campaign_clocks VALUES(OLD.character_id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER territories_clock_insert AFTER INSERT ON territories BEGIN
  INSERT INTO campaign_clocks VALUES(NEW.character_id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER territories_clock_update AFTER UPDATE ON territories BEGIN
  INSERT INTO campaign_clocks VALUES(NEW.character_id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER territories_clock_delete AFTER DELETE ON territories BEGIN
  INSERT INTO campaign_clocks VALUES(OLD.character_id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER characters_clock_insert AFTER INSERT ON characters BEGIN
  INSERT INTO campaign_clocks VALUES(NEW.id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER characters_clock_update AFTER UPDATE ON characters BEGIN
  INSERT INTO campaign_clocks VALUES(NEW.id,1) ON CONFLICT(character_id) DO UPDATE SET revision=revision+1;
END;
CREATE TABLE discord_webhooks(player_id TEXT PRIMARY KEY REFERENCES players(id), url TEXT NOT NULL);
CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  event TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE media_files (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
-- Earlier imports kept recruitment offers only in the recovery archive.
INSERT INTO records(kind,id,character_id,territory_id,hex_key,mutation_id,updated_at,data)
SELECT 'recruitment',json_extract(a.data,'$.offerId'),json_extract(a.data,'$.characterId'),json_extract(a.data,'$.territoryId'),NULL,NULL,COALESCE(json_extract(a.data,'$.createdAt'),''),a.data
FROM migration_archive a JOIN territories t ON t.id=json_extract(a.data,'$.territoryId') AND t.character_id=json_extract(a.data,'$.characterId')
WHERE a.sheet='Territory Recruitment' AND json_extract(a.data,'$.offerId') IS NOT NULL
ON CONFLICT(kind,id) DO NOTHING;
