-- Replace the rollout's technical test label with user-facing terminology.
UPDATE organizations
SET name = '系統測試會所',
    updated_at = now()
WHERE name = '多租戶測試會所';
