ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS password_ciphertext text;
