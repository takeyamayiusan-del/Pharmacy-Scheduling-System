-- Allow duplicate employee display names (common in Chinese workplaces).
-- Uniqueness for login remains on users.username / auth email.
-- Postgres constraint name for UNIQUE on users.name is users_name_key
-- (clients may report it as user_name_key).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_name_key;

-- Widen display name beyond the original VARCHAR(10) for longer names.
ALTER TABLE public.users
  ALTER COLUMN name TYPE VARCHAR(50);
