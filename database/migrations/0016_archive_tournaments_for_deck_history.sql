-- Keep tournament-owned Deck/Combo records available for statistics and audit.
-- The developer "delete" action now archives the event instead of cascading
-- through registrations, snapshots, and participant_decks.
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_status_check
  CHECK (status IN ('open', 'finished', 'archived'));

CREATE INDEX IF NOT EXISTS tournaments_archived_idx ON tournaments (status, created_at DESC);
