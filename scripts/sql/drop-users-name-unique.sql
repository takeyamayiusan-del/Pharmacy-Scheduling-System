-- Manual apply (local Docker / psql): drop unique on employee display name.
-- Same as supabase/migrations/20260905120000_drop_users_name_unique.sql

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_name_key;

ALTER TABLE public.users
  ALTER COLUMN name TYPE VARCHAR(50);
