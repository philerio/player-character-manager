CREATE TABLE auth_challenges (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  password_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
-- Recover the legacy recovery hashes that earlier importer versions archived
-- without adding to the private account record. Public serializers omit them.
UPDATE players SET data=json_set(data,
  '$.recoveryAnswerSalt',(SELECT json_extract(a.data,'$.recoveryAnswerSalt') FROM migration_archive a WHERE a.sheet='Players' AND json_extract(a.data,'$.playerId')=players.id),
  '$.recoveryAnswerHash',(SELECT json_extract(a.data,'$.recoveryAnswerHash') FROM migration_archive a WHERE a.sheet='Players' AND json_extract(a.data,'$.playerId')=players.id))
WHERE NOT json_extract(data,'$.recoveryAnswerHash') AND EXISTS(SELECT 1 FROM migration_archive a WHERE a.sheet='Players' AND json_extract(a.data,'$.playerId')=players.id AND json_extract(a.data,'$.recoveryAnswerHash') IS NOT NULL);
