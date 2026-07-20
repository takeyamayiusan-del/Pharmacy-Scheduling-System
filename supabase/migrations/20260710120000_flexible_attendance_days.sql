-- 彈性出勤日（颱風／天災）：時段設定、結算結果、待補時數

ALTER TABLE public.comp_leave_ledger
  DROP CONSTRAINT IF EXISTS comp_leave_ledger_source_type_check;

ALTER TABLE public.comp_leave_ledger
  ADD CONSTRAINT comp_leave_ledger_source_type_check
  CHECK (source_type IN (
    'overtime_credit',
    'leave_debit',
    'reversal',
    'expiry',
    'adjustment',
    'typhoon_credit',
    'typhoon_debit'
  ));

CREATE TABLE IF NOT EXISTS public.flexible_attendance_days (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_date      DATE NOT NULL UNIQUE,
  title         TEXT NOT NULL DEFAULT '颱風／彈性出勤日',
  period_mode   VARCHAR(20) NOT NULL CHECK (period_mode IN ('full_day', 'from_time')),
  from_time     TIME,
  note          TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'announced'
                CHECK (status IN ('announced', 'settled', 'cancelled')),
  bulletin_id   UUID,
  -- 發布當下原班表快照：[{ userId, shift }]；原本 X 者不納入結算
  original_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 店長確認「預計會來」的員工 id 列表；確認後班表會改成只顯示這些人上班
  expected_attendee_ids UUID[] NOT NULL DEFAULT '{}',
  attendees_confirmed_at TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES public.users(id),
  settled_at    TIMESTAMPTZ,
  settled_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flexible_attendance_from_time_required
    CHECK (period_mode = 'full_day' OR from_time IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.flexible_attendance_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id              UUID NOT NULL REFERENCES public.flexible_attendance_days(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheduled_shift     VARCHAR(1) NOT NULL,
  affected_hours      NUMERIC(8,2) NOT NULL DEFAULT 0,
  actual_punch_hours  NUMERIC(8,2) NOT NULL DEFAULT 0,
  outcome             VARCHAR(30) NOT NULL
                      CHECK (outcome IN (
                        'comp_leave_granted',
                        'pending_makeup',
                        'skipped_not_scheduled',
                        'skipped_no_affected_hours'
                      )),
  comp_leave_hours    NUMERIC(8,2) NOT NULL DEFAULT 0,
  pending_hours       NUMERIC(8,2) NOT NULL DEFAULT 0,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (day_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.pending_makeup_hours (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_day_id   UUID NOT NULL REFERENCES public.flexible_attendance_days(id) ON DELETE CASCADE,
  source_date     DATE NOT NULL,
  hours           NUMERIC(8,2) NOT NULL CHECK (hours > 0),
  status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending',
                    'makeup_assigned',
                    'comp_leave_deducted',
                    'manually_cleared'
                  )),
  makeup_date     DATE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES public.users(id),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flexible_days_date
  ON public.flexible_attendance_days(day_date);
CREATE INDEX IF NOT EXISTS idx_flexible_results_day
  ON public.flexible_attendance_results(day_id);
CREATE INDEX IF NOT EXISTS idx_pending_makeup_user_status
  ON public.pending_makeup_hours(user_id, status);

ALTER TABLE public.flexible_attendance_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flexible_attendance_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_makeup_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flexible_days_select" ON public.flexible_attendance_days;
CREATE POLICY "flexible_days_select" ON public.flexible_attendance_days
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "flexible_days_manage" ON public.flexible_attendance_days;
CREATE POLICY "flexible_days_manage" ON public.flexible_attendance_days
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

DROP POLICY IF EXISTS "flexible_results_select" ON public.flexible_attendance_results;
CREATE POLICY "flexible_results_select" ON public.flexible_attendance_results
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

DROP POLICY IF EXISTS "flexible_results_manage" ON public.flexible_attendance_results;
CREATE POLICY "flexible_results_manage" ON public.flexible_attendance_results
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

DROP POLICY IF EXISTS "pending_makeup_select" ON public.pending_makeup_hours;
CREATE POLICY "pending_makeup_select" ON public.pending_makeup_hours
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

DROP POLICY IF EXISTS "pending_makeup_manage" ON public.pending_makeup_hours;
CREATE POLICY "pending_makeup_manage" ON public.pending_makeup_hours
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flexible_attendance_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flexible_attendance_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_makeup_hours TO authenticated;
GRANT ALL ON public.flexible_attendance_days TO service_role;
GRANT ALL ON public.flexible_attendance_results TO service_role;
GRANT ALL ON public.pending_makeup_hours TO service_role;
