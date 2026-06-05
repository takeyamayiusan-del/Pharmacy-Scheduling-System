ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT '2026-04-01';
UPDATE public.users SET hire_date = '2026-04-01' WHERE hire_date IS NULL;
