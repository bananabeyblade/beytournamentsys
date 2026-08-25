-- CX-19 adds a nineteenth Assist Blade whose localized name is not final yet.
-- Preserve all three catalogue variants and expose one functional `Q` option
-- in the fast Deck picker.
INSERT INTO canonical_parts
  (id, name, name_en, code, part_type, system, release_date, active, source_url)
VALUES
  ('beyx:assist_blade:q', 'Q', 'Q', 'Q', 'assist_blade', 'CX', '2026-09-11', TRUE,
   'https://beyblade.phstudy.org/data/main.json')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  code = EXCLUDED.code,
  part_type = EXCLUDED.part_type,
  system = EXCLUDED.system,
  release_date = EXCLUDED.release_date,
  active = TRUE,
  source_url = EXCLUDED.source_url;

INSERT INTO catalog_part_aliases (catalog_part_id, canonical_part_id, match_method)
SELECT variant.id, 'beyx:assist_blade:q', 'type_and_code'
FROM parts AS variant
WHERE variant.id IN (
  'beyx:variant:assist_blade:ab-prd-080626-01',
  'beyx:variant:assist_blade:ab-prd-080626-02',
  'beyx:variant:assist_blade:ab-prd-080626-03'
)
ON CONFLICT (catalog_part_id) DO UPDATE SET
  canonical_part_id = EXCLUDED.canonical_part_id,
  match_method = EXCLUDED.match_method;
