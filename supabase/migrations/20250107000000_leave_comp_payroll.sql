-- 請假欄位擴充、補休帳本、假別費率

ALTER TABLE public.leave_applications
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS leave_hours NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS shift_mode VARCHAR(20) DEFAULT 'schedule';

UPDATE public.leave_applications
SET end_date = leave_date
WHERE end_date IS NULL;

-- 補休時數帳本（正數=加班累積，負數=請假使用）
CREATE TABLE IF NOT EXISTS public.comp_leave_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  hours       NUMERIC(8,2) NOT NULL,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('overtime_credit', 'leave_debit', 'reversal', 'expiry', 'adjustment')),
  source_id   UUID,
  expires_at  TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_leave_user ON public.comp_leave_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_comp_leave_expires ON public.comp_leave_ledger(expires_at);

ALTER TABLE public.comp_leave_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_leave_select_own_or_manager" ON public.comp_leave_ledger
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "comp_leave_insert_system" ON public.comp_leave_ledger
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- 假別分項費率（補休假不設費率，僅用補休帳本）
INSERT INTO public.payroll_rate_config (item_key, label, amount, unit, is_deduction, sort_order) VALUES
  ('leave_personal',    '事假扣薪（每小時）', 0, '元/小時', TRUE,  10),
  ('leave_sick',        '病假扣薪（每小時）', 0, '元/小時', TRUE,  11),
  ('leave_bereavement', '喪假扣薪（每小時）', 0, '元/小時', TRUE,  12),
  ('leave_annual',      '特休扣薪（每小時）', 0, '元/小時', TRUE,  13),
  ('leave_other',       '其他假扣薪（每小時）', 0, '元/小時', TRUE,  14)
ON CONFLICT (item_key) DO NOTHING;
