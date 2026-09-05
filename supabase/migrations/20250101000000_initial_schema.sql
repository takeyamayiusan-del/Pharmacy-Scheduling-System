-- ============================================================
-- 耀聖藥局智慧排班系統 - Initial Schema Migration
-- ============================================================

-- ============================================================
-- 1. users 表（擴充 Supabase Auth）
-- ============================================================
CREATE TABLE public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('boss', 'manager', 'employee')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_is_active ON public.users(is_active);

-- ============================================================
-- 2. scheduling_rules 表（排班規則參數）
-- ============================================================
CREATE TABLE public.scheduling_rules (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_leave_quota       SMALLINT NOT NULL DEFAULT 8,
  saturday_leave_quota      SMALLINT NOT NULL DEFAULT 2,
  weekday_leave_quota       SMALLINT NOT NULL DEFAULT 2,
  min_evening_staff         SMALLINT NOT NULL DEFAULT 2,
  updated_by                UUID REFERENCES public.users(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. schedule_entries 表（班表條目）
-- ============================================================
CREATE TABLE public.schedule_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id),
  date        DATE NOT NULL,
  shift_code  VARCHAR(1) NOT NULL CHECK (shift_code IN ('A','B','C','D','E','X')),
  is_fixed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES public.users(id),
  updated_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- Indexes
CREATE INDEX idx_schedule_entries_user_id ON public.schedule_entries(user_id);
CREATE INDEX idx_schedule_entries_date ON public.schedule_entries(date);
CREATE INDEX idx_schedule_entries_user_date ON public.schedule_entries(user_id, date);
CREATE INDEX idx_schedule_entries_shift_code ON public.schedule_entries(shift_code);

-- ============================================================
-- 4. schedule_locks 表（班表鎖定）
-- ============================================================
CREATE TABLE public.schedule_locks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_type   VARCHAR(10) NOT NULL CHECK (lock_type IN ('day', 'week', 'month')),
  lock_date   DATE,
  lock_year   SMALLINT,
  lock_week   SMALLINT,
  lock_month  SMALLINT,
  locked_by   UUID NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_schedule_locks_lock_type ON public.schedule_locks(lock_type);
CREATE INDEX idx_schedule_locks_lock_date ON public.schedule_locks(lock_date);
CREATE INDEX idx_schedule_locks_year_month ON public.schedule_locks(lock_year, lock_month);
CREATE INDEX idx_schedule_locks_year_week ON public.schedule_locks(lock_year, lock_week);

-- ============================================================
-- 5. leave_applications 表（請假申請）
-- ============================================================
CREATE TABLE public.leave_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id),
  leave_date      DATE NOT NULL,
  period          VARCHAR(10) NOT NULL CHECK (period IN ('full_day', 'morning', 'afternoon')),
  leave_type      VARCHAR(20) NOT NULL,
  reason          VARCHAR(200) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason   VARCHAR(200),
  reviewed_by     UUID REFERENCES public.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_leave_applications_user_id ON public.leave_applications(user_id);
CREATE INDEX idx_leave_applications_leave_date ON public.leave_applications(leave_date);
CREATE INDEX idx_leave_applications_status ON public.leave_applications(status);

-- ============================================================
-- 6. leave_attachments 表（請假附件）
-- ============================================================
CREATE TABLE public.leave_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES public.leave_applications(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size       INTEGER NOT NULL,
  mime_type       VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'delete_failed')),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_leave_attachments_application_id ON public.leave_attachments(application_id);
CREATE INDEX idx_leave_attachments_status ON public.leave_attachments(status);
CREATE INDEX idx_leave_attachments_uploaded_at ON public.leave_attachments(uploaded_at);

-- ============================================================
-- 7. shift_swap_applications 表（換班申請）
-- ============================================================
CREATE TABLE public.shift_swap_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES public.users(id),
  target_id       UUID NOT NULL REFERENCES public.users(id),
  swap_date       DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending_confirm'
                  CHECK (status IN ('pending_confirm', 'pending_review', 'approved', 'rejected')),
  reject_reason   VARCHAR(200),
  reviewed_by     UUID REFERENCES public.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shift_swap_requester_id ON public.shift_swap_applications(requester_id);
CREATE INDEX idx_shift_swap_target_id ON public.shift_swap_applications(target_id);
CREATE INDEX idx_shift_swap_status ON public.shift_swap_applications(status);
CREATE INDEX idx_shift_swap_swap_date ON public.shift_swap_applications(swap_date);

-- ============================================================
-- 8. overtime_applications 表（加班申請）
-- ============================================================
CREATE TABLE public.overtime_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id),
  overtime_date   DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  reason          VARCHAR(200) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  compensation    VARCHAR(10)
                  CHECK (compensation IN ('pay', 'comp_leave') OR compensation IS NULL),
  reject_reason   VARCHAR(200),
  reviewed_by     UUID REFERENCES public.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_overtime_user_id ON public.overtime_applications(user_id);
CREATE INDEX idx_overtime_overtime_date ON public.overtime_applications(overtime_date);
CREATE INDEX idx_overtime_status ON public.overtime_applications(status);

-- ============================================================
-- 9. monthly_attendance_stats 表（月度工時統計）
-- ============================================================
CREATE TABLE public.monthly_attendance_stats (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id),
  year                SMALLINT NOT NULL,
  month               SMALLINT NOT NULL,
  work_days           SMALLINT NOT NULL DEFAULT 0,
  work_hours          NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
  comp_leave_hours    NUMERIC(6,2) NOT NULL DEFAULT 0,
  leave_hours         NUMERIC(6,2) NOT NULL DEFAULT 0,
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month)
);

-- Indexes
CREATE INDEX idx_monthly_stats_user_id ON public.monthly_attendance_stats(user_id);
CREATE INDEX idx_monthly_stats_year_month ON public.monthly_attendance_stats(year, month);

-- ============================================================
-- 10. tardiness_records 表（遲到紀錄）
-- ============================================================
CREATE TABLE public.tardiness_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id),
  record_date     DATE NOT NULL,
  minutes_late    SMALLINT NOT NULL CHECK (minutes_late BETWEEN 1 AND 999),
  note            TEXT,
  recorded_by     UUID NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, record_date)
);

-- Indexes
CREATE INDEX idx_tardiness_user_id ON public.tardiness_records(user_id);
CREATE INDEX idx_tardiness_record_date ON public.tardiness_records(record_date);

-- ============================================================
-- 11. notifications 表（站內通知）
-- ============================================================
CREATE TABLE public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID NOT NULL REFERENCES public.users(id),
  type            VARCHAR(50) NOT NULL,
  -- 類型：leave_submitted, leave_reviewed, shift_swap_requested,
  --       shift_swap_confirmed, shift_swap_reviewed, overtime_submitted,
  --       overtime_reviewed, schedule_changed
  title           VARCHAR(100) NOT NULL,
  body            TEXT NOT NULL,
  related_id      UUID,
  related_type    VARCHAR(30),
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);

-- ============================================================
-- 12. is_date_locked PostgreSQL Function
-- ============================================================
CREATE OR REPLACE FUNCTION is_date_locked(check_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.schedule_locks
    WHERE
      (lock_type = 'day' AND lock_date = check_date) OR
      (lock_type = 'week' AND lock_year = EXTRACT(YEAR FROM check_date)::SMALLINT
        AND lock_week = EXTRACT(WEEK FROM check_date)::SMALLINT) OR
      (lock_type = 'month' AND lock_year = EXTRACT(YEAR FROM check_date)::SMALLINT
        AND lock_month = EXTRACT(MONTH FROM check_date)::SMALLINT)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 13. updated_at 自動更新 Trigger Function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_schedule_entries_updated_at
  BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_leave_applications_updated_at
  BEFORE UPDATE ON public.leave_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_shift_swap_updated_at
  BEFORE UPDATE ON public.shift_swap_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_overtime_updated_at
  BEFORE UPDATE ON public.overtime_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 14. 通知 Trigger：請假申請提交後自動通知店長/老闆
-- ============================================================
CREATE OR REPLACE FUNCTION notify_leave_submitted()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  SELECT
    u.id,
    'leave_submitted',
    '新請假申請',
    (SELECT name FROM public.users WHERE id = NEW.user_id) || ' 提交了請假申請，請審核。',
    NEW.id,
    'leave'
  FROM public.users u
  WHERE u.role IN ('boss', 'manager') AND u.is_active = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_leave_submitted
  AFTER INSERT ON public.leave_applications
  FOR EACH ROW EXECUTE FUNCTION notify_leave_submitted();

-- ============================================================
-- 15. 通知 Trigger：加班申請提交後自動通知店長/老闆
-- ============================================================
CREATE OR REPLACE FUNCTION notify_overtime_submitted()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  SELECT
    u.id,
    'overtime_submitted',
    '新加班申請',
    (SELECT name FROM public.users WHERE id = NEW.user_id) || ' 提交了加班申請，請審核。',
    NEW.id,
    'overtime'
  FROM public.users u
  WHERE u.role IN ('boss', 'manager') AND u.is_active = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_overtime_submitted
  AFTER INSERT ON public.overtime_applications
  FOR EACH ROW EXECUTE FUNCTION notify_overtime_submitted();

-- ============================================================
-- 16. 通知 Trigger：換班申請提交後自動通知換班對象
-- ============================================================
CREATE OR REPLACE FUNCTION notify_shift_swap_requested()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  VALUES (
    NEW.target_id,
    'shift_swap_requested',
    '換班申請',
    (SELECT name FROM public.users WHERE id = NEW.requester_id) || ' 向您提出換班申請，請確認。',
    NEW.id,
    'shift_swap'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_shift_swap_requested
  AFTER INSERT ON public.shift_swap_applications
  FOR EACH ROW EXECUTE FUNCTION notify_shift_swap_requested();

-- ============================================================
-- 17. Row Level Security (RLS) 政策
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_swap_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_attendance_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tardiness_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ---- users ----
CREATE POLICY "users_select_all" ON public.users
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "users_insert_boss_only" ON public.users
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'boss')
  );

CREATE POLICY "users_update_boss_only" ON public.users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'boss')
  );

CREATE POLICY "users_delete_boss_only" ON public.users
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'boss')
  );

-- ---- scheduling_rules ----
CREATE POLICY "scheduling_rules_select_all" ON public.scheduling_rules
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scheduling_rules_update_manager" ON public.scheduling_rules
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ---- schedule_entries ----
CREATE POLICY "schedule_select_all" ON public.schedule_entries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "schedule_insert_manager" ON public.schedule_entries
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
    OR (user_id = auth.uid())
  );

CREATE POLICY "schedule_update_manager" ON public.schedule_entries
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "schedule_update_employee_self" ON public.schedule_entries
  FOR UPDATE USING (
    user_id = auth.uid() AND is_fixed = FALSE
  );

-- ---- schedule_locks ----
CREATE POLICY "schedule_locks_select_all" ON public.schedule_locks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "schedule_locks_insert_manager" ON public.schedule_locks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "schedule_locks_delete_manager" ON public.schedule_locks
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ---- leave_applications ----
CREATE POLICY "leave_select_own_or_manager" ON public.leave_applications
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "leave_insert_own" ON public.leave_applications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "leave_update_manager" ON public.leave_applications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ---- leave_attachments ----
CREATE POLICY "leave_attachments_select" ON public.leave_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leave_applications la
      WHERE la.id = application_id AND (
        la.user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
      )
    )
  );

CREATE POLICY "leave_attachments_insert_own" ON public.leave_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leave_applications la
      WHERE la.id = application_id AND la.user_id = auth.uid()
    )
  );

-- ---- shift_swap_applications ----
CREATE POLICY "shift_swap_select" ON public.shift_swap_applications
  FOR SELECT USING (
    requester_id = auth.uid() OR
    target_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "shift_swap_insert_employee" ON public.shift_swap_applications
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "shift_swap_update_target_or_manager" ON public.shift_swap_applications
  FOR UPDATE USING (
    target_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ---- overtime_applications ----
CREATE POLICY "overtime_select_own_or_manager" ON public.overtime_applications
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "overtime_insert_own" ON public.overtime_applications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "overtime_update_manager" ON public.overtime_applications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ---- monthly_attendance_stats ----
CREATE POLICY "monthly_stats_select_own_or_manager" ON public.monthly_attendance_stats
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "monthly_stats_insert_system" ON public.monthly_attendance_stats
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "monthly_stats_update_system" ON public.monthly_attendance_stats
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ---- tardiness_records ----
CREATE POLICY "tardiness_select_manager_or_own" ON public.tardiness_records
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "tardiness_insert_manager" ON public.tardiness_records
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
  );

-- ---- notifications ----
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());

-- ============================================================
-- 18. Supabase Storage: leave-attachments bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leave-attachments',
  'leave-attachments',
  FALSE,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "leave_attachments_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'leave-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "leave_attachments_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'leave-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "leave_attachments_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'leave-attachments' AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );
