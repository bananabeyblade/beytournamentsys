-- CX-19 includes a sixth Over Blade whose localized name is not final yet.
-- Keep its three product/colour variants in `parts`, while the fast Deck picker
-- uses one functional canonical row labelled `T`.
INSERT INTO canonical_parts
  (id, name, name_en, code, part_type, system, release_date, active, source_url)
VALUES
  ('beyx:over_blade:t', 'T', 'T', 'T', 'over_blade', 'CX', '2026-09-11', TRUE,
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
SELECT variant.id, 'beyx:over_blade:t', 'type_and_code'
FROM parts AS variant
WHERE variant.id IN (
  'beyx:variant:over_blade:ov-prd-080626-01',
  'beyx:variant:over_blade:ov-prd-080626-02',
  'beyx:variant:over_blade:ov-prd-080626-03'
)
ON CONFLICT (catalog_part_id) DO UPDATE SET
  canonical_part_id = EXCLUDED.canonical_part_id,
  match_method = EXCLUDED.match_method;
