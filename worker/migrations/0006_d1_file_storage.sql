-- Keep the existing metadata table and campaign records intact. New file
-- content lives in D1; previously external file references are not rewritten.
ALTER TABLE media_files ADD COLUMN storage TEXT NOT NULL DEFAULT 'external';
ALTER TABLE media_files ADD COLUMN byte_length INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media_files ADD COLUMN encoded_length INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media_files ADD COLUMN part_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media_files ADD COLUMN sha256 TEXT;
CREATE INDEX media_files_storage ON media_files(storage,active);
CREATE TABLE media_file_parts (
  file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  part INTEGER NOT NULL CHECK(part>=0),
  data TEXT NOT NULL CHECK(length(data)<=524288),
  PRIMARY KEY(file_id,part)
);
