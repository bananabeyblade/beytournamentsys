-- Giveaway and colour information belongs to catalogue variants, not the
-- functional Blade label used by the fast Deck picker and statistics.
UPDATE canonical_parts
SET name = '飛龍懸浮'
WHERE id = 'beyx:blade:wyvernhover';

-- Keep the legacy canonical catalogue row aligned so a future localization
-- restore cannot reintroduce the giveaway description. Detailed variants are
-- intentionally left unchanged.
UPDATE parts
SET name = '飛龍懸浮'
WHERE id = 'beyx:blade:wyvernhover';
