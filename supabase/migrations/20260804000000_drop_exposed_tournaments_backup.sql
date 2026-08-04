-- SECURITY FIX: `tournaments_backup` had RLS disabled and was unused by the
-- app (no code references it), so it was fully readable — and likely
-- writable — by anyone with the public anon/publishable key, no login
-- required. Confirmed exposed: real player names from a finished tournament.
-- Since nothing in the app reads from it, the safe fix is to drop it rather
-- than lock it down with RLS policies for a table nothing uses.
DROP TABLE IF EXISTS public.tournaments_backup;
