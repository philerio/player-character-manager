-- Repair old synthetic local seeds without resetting data or replacing assigned maps.
-- Run only with: wrangler d1 execute DB --local --file scripts/repair-d1-fixture-maps.sql
UPDATE territories
SET data = json_set(data,
  '$.mapUrl', '/demo-territory-player.svg',
  '$.mapFileName', 'demo-territory-player.svg',
  '$.poiMapUrl', '/demo-territory-details.svg',
  '$.poiMapFileName', 'demo-territory-details.svg')
WHERE id = 'territory' AND character_id = 'player-character'
  AND json_extract(data, '$.name') = 'Test Territory'
  AND COALESCE(json_extract(data, '$.mapUrl'), '') = ''
  AND COALESCE(json_extract(data, '$.mapFileId'), '') = ''
  AND COALESCE(json_extract(data, '$.poiMapUrl'), '') = ''
  AND COALESCE(json_extract(data, '$.poiMapFileId'), '') = ''
  AND EXISTS (SELECT 1 FROM settings WHERE key = 'campaignName' AND value = 'D1 Local Test Campaign')
  AND EXISTS (SELECT 1 FROM characters c JOIN players p ON p.id = c.player_id WHERE c.id = 'player-character' AND p.id = 'player' AND p.email = 'player@example.test');
INSERT INTO revisions(character_id,tab,revision,updated_at)
SELECT 'player-character','territories',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS (SELECT 1 FROM territories WHERE id = 'territory' AND character_id = 'player-character' AND json_extract(data,'$.mapUrl') = '/demo-territory-player.svg')
  AND EXISTS (SELECT 1 FROM characters c JOIN players p ON p.id = c.player_id WHERE c.id = 'player-character' AND p.id = 'player' AND p.email = 'player@example.test')
  AND EXISTS (SELECT 1 FROM settings WHERE key = 'campaignName' AND value = 'D1 Local Test Campaign')
ON CONFLICT(character_id,tab) DO UPDATE SET revision = revisions.revision + 1, updated_at = excluded.updated_at;
SELECT id, json_extract(data,'$.mapUrl') AS mapUrl, json_extract(data,'$.poiMapUrl') AS poiMapUrl FROM territories WHERE id = 'territory' AND character_id = 'player-character';
