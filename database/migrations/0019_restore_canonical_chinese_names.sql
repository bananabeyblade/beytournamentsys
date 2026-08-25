-- The canonical import source can temporarily lag behind the localized catalogue.
-- Restore player-facing Chinese names from the matching legacy canonical rows.
UPDATE canonical_parts AS canonical
SET name = localized.name
FROM parts AS localized
WHERE localized.id = canonical.id
  AND localized.name ~ '[一-龥]'
  AND canonical.name IS DISTINCT FROM localized.name;

-- These source placeholders are not selectable Beyblade parts.
UPDATE canonical_parts
SET active = FALSE
WHERE id IN (
  'beyx:bit:',
  'beyx:blade:bit',
  'beyx:ratchet:',
  'beyx:ratchet:ratchet-integrated'
);
