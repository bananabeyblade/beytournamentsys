-- Keep product/colour variants in `parts`; Decks use one canonical row per functional part.
CREATE TABLE IF NOT EXISTS canonical_parts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  code TEXT NOT NULL,
  part_type TEXT NOT NULL CHECK (part_type IN ('blade','ratchet','bit','lock_chip','main_blade','assist_blade','metal_blade','over_blade')),
  system TEXT NOT NULL,
  release_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS canonical_parts_active_type_idx
  ON canonical_parts (part_type, active, release_date DESC);

CREATE TABLE IF NOT EXISTS catalog_part_aliases (
  catalog_part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  canonical_part_id TEXT NOT NULL REFERENCES canonical_parts(id) ON DELETE RESTRICT,
  match_method TEXT NOT NULL CHECK (match_method IN ('type_and_code')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_part_aliases_canonical_idx
  ON catalog_part_aliases (canonical_part_id);
