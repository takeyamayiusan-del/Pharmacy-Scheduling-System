-- 會計職位、員工基本資料、緊急聯絡人、眷屬加保

-- ─── users 基本資料欄位 ───────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS national_id TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS registered_address TEXT,
  ADD COLUMN IF NOT EXISTS mailing_address TEXT,
  ADD COLUMN IF NOT EXISTS mailing_same_as_registered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_gender_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));

COMMENT ON COLUMN public.users.national_id IS '身分證字號';
COMMENT ON COLUMN public.users.birth_date IS '出生日期';
COMMENT ON COLUMN public.users.gender IS 'male=男, female=女, other=其他';
COMMENT ON COLUMN public.users.registered_address IS '戶籍地址';
COMMENT ON COLUMN public.users.mailing_address IS '通訊地址';
COMMENT ON COLUMN public.users.mailing_same_as_registered IS '通訊地址同戶籍';
COMMENT ON COLUMN public.users.phone IS '聯絡電話';

-- ─── 會計職位 ─────────────────────────────────────────────────
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('boss', 'manager', 'deputy', 'employee', 'director', 'accountant'));

COMMENT ON COLUMN public.users.role IS
  'boss=老闆, manager=店長, deputy=副店, employee=員工, director=主任, accountant=會計（跨店薪資、仍屬單店上班）';

-- ─── 緊急聯絡人（每員工 1～2 筆）────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user
  ON public.employee_emergency_contacts(user_id, sort_order);

-- ─── 眷屬加保（健保）──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  national_id TEXT,
  birth_date DATE,
  enrollment_date DATE,
  relationship TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_dependents_user
  ON public.employee_dependents(user_id);

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.employee_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_dependents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emergency_contacts_select_auth"
  ON public.employee_emergency_contacts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "emergency_contacts_manage"
  ON public.employee_emergency_contacts
  FOR ALL
  USING (public.can_manage_employees_rls())
  WITH CHECK (public.can_manage_employees_rls());

CREATE POLICY "dependents_select_auth"
  ON public.employee_dependents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "dependents_manage"
  ON public.employee_dependents
  FOR ALL
  USING (public.can_manage_employees_rls())
  WITH CHECK (public.can_manage_employees_rls());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_emergency_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_dependents TO authenticated;

-- ─── 會計視為薪資結算使用者（跨店讀取工時／薪資）──────────────
CREATE OR REPLACE FUNCTION public.is_payroll_settlement_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('boss', 'owner', 'accountant')
  )
  OR public.user_has_capability('payroll');
$$;
