-- Keep the rollout test organization aligned with the neutral UI terminology.
UPDATE organizations
SET name = '系統測試組織',
    updated_at = now()
WHERE name = '系統測試會所';
