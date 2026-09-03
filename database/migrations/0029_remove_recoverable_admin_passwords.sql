-- Passwords must be one-way only. Dropping the column also destroys every
-- previously encrypted copy; authentication continues to use password_hash.
ALTER TABLE app_users
  DROP COLUMN IF EXISTS password_ciphertext;
