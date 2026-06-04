-- ============================================================
-- 耀聖藥局智慧排班系統 - Payroll Tables
-- ============================================================

CREATE TABLE public.employee_payroll_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 UUID NOT NULL REFERENCES public.users(id) UNIQUE,
  title                       VARCHAR(20),
  bank_account                VARCHAR(30),
  monthly_salary              NUMERIC(10,2) NOT NULL DEFAULT 0,
  labor_insurance             NUMERIC(10,2) NOT NULL DEFAULT 0,
  health_insurance            NUMERIC(10,2) NOT NULL DEFAULT 0,
  pension_rate                NUMERIC(5,4) NOT NULL DEFAULT 0.06,
  hourly_rate                 NUMERIC(10,2),
  late_deduction_per_minute   NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime_rate               NUMERIC(5,2) NOT NULL DEFAULT 1.34,
  pay_day                     SMALLINT NOT NULL DEFAULT 5,
  updated_by                  UUID REFERENCES public.users(id),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.employee_payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_select_manager" ON public.employee_payroll_settings
  FOR SELECT USING (
    employee_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "payroll_upsert_manager" ON public.employee_payroll_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE TABLE public.monthly_payroll_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.users(id),
  year        SMALLINT NOT NULL,
  month       SMALLINT NOT NULL,
  label       VARCHAR(50) NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  type        VARCHAR(10) NOT NULL CHECK (type IN ('bonus', 'deduction')),
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.monthly_payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adjustments_manager_all" ON public.monthly_payroll_adjustments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );
