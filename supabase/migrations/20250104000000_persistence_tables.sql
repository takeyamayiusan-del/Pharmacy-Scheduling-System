-- ============================================================
-- 耀聖藥局智慧排班系統 - Persistence Tables
-- 將原本存在 localStorage 的資料改存 Supabase
-- ============================================================

-- ============================================================
-- 1. leave_selections 表（排休選擇 - 原 leaveSelections）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_selections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_leave_selections_user_id ON public.leave_selections(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_selections_date ON public.leave_selections(date);

ALTER TABLE public.leave_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_selections_select_all" ON public.leave_selections
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "leave_selections_insert_own" ON public.leave_selections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "leave_selections_delete_own_or_manager" ON public.leave_selections
  FOR DELETE USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ============================================================
-- 2. fixed_shifts 表（固定班設定 - 原 fixedShifts localStorage）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fixed_shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  shift_code    VARCHAR(1) NOT NULL CHECK (shift_code IN ('A','B','C','D','E','X')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_fixed_shifts_user_id ON public.fixed_shifts(user_id);

ALTER TABLE public.fixed_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_shifts_select_all" ON public.fixed_shifts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "fixed_shifts_write_manager" ON public.fixed_shifts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ============================================================
-- 3. shift_time_config 表（班別時間設定 - 原 shiftTimeConfig）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shift_time_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_code  VARCHAR(1) NOT NULL UNIQUE CHECK (shift_code IN ('A','B','C','D','E','X')),
  time_ranges TEXT[] NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.shift_time_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_time_config_select_all" ON public.shift_time_config
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "shift_time_config_write_manager" ON public.shift_time_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- 預設班別時間
INSERT INTO public.shift_time_config (shift_code, time_ranges) VALUES
  ('A', ARRAY['08:30-12:00', '13:30-17:00', '19:00-21:00']),
  ('B', ARRAY['08:30-12:00', '13:30-18:00']),
  ('C', ARRAY['08:30-12:00']),
  ('D', ARRAY['13:30-18:00']),
  ('E', ARRAY['13:30-17:00', '19:00-21:00']),
  ('X', ARRAY['休假'])
ON CONFLICT (shift_code) DO NOTHING;

-- ============================================================
-- 4. wednesday_off_selections 表（禮三選休 - 原 wednesdayOffSelections）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wednesday_off_selections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_wed_off_user_id ON public.wednesday_off_selections(user_id);
CREATE INDEX IF NOT EXISTS idx_wed_off_date ON public.wednesday_off_selections(date);

ALTER TABLE public.wednesday_off_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wed_off_select_all" ON public.wednesday_off_selections
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "wed_off_insert_own" ON public.wednesday_off_selections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "wed_off_delete_own_or_manager" ON public.wednesday_off_selections
  FOR DELETE USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ============================================================
-- 5. leave_month_locks 表（排休月份鎖定 - 原 leaveMonthLocks）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_month_locks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year        SMALLINT NOT NULL,
  month       SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  locked_by   UUID NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month)
);

CREATE INDEX IF NOT EXISTS idx_leave_month_locks_year_month ON public.leave_month_locks(year, month);

ALTER TABLE public.leave_month_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_month_locks_select_all" ON public.leave_month_locks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "leave_month_locks_write_manager" ON public.leave_month_locks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ============================================================
-- 6. schedule_overrides 表（班表覆蓋 - 原 schedule localStorage）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.schedule_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  shift_code  VARCHAR(1) NOT NULL CHECK (shift_code IN ('A','B','C','D','E','X')),
  updated_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_overrides_user_id ON public.schedule_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_date ON public.schedule_overrides(date);

ALTER TABLE public.schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_overrides_select_all" ON public.schedule_overrides
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "schedule_overrides_write_manager" ON public.schedule_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- updated_at trigger for fixed_shifts
CREATE TRIGGER trg_fixed_shifts_updated_at
  BEFORE UPDATE ON public.fixed_shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_shift_time_config_updated_at
  BEFORE UPDATE ON public.shift_time_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_schedule_overrides_updated_at
  BEFORE UPDATE ON public.schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
