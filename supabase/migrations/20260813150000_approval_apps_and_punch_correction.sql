-- 申請類審核關卡：遞延加關卡、打卡補登申請表、副店可審本店申請

-- 1) 特休／補休遞延走同一套關卡
ALTER TABLE public.leave_deferral_requests
  ADD COLUMN IF NOT EXISTS approval_step SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.leave_deferral_requests
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;

ALTER TABLE public.leave_deferral_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2) 打卡補登申請（員工申請；店長打卡管理代改不走此表）
CREATE TABLE IF NOT EXISTS public.punch_correction_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_id             TEXT,
  punch_date          DATE NOT NULL,
  punch_action        VARCHAR(10) NOT NULL CHECK (punch_action IN ('work_in', 'work_out')),
  segment_index       SMALLINT NOT NULL DEFAULT 0,
  requested_time      TIME NOT NULL,
  original_record_id  UUID REFERENCES public.punch_records(id) ON DELETE SET NULL,
  reason              TEXT DEFAULT '',
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_step       SMALLINT NOT NULL DEFAULT 0,
  reject_reason       TEXT,
  reviewed_by         UUID REFERENCES public.users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_punch_correction_user_created
  ON public.punch_correction_requests (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_punch_correction_status
  ON public.punch_correction_requests (status);

ALTER TABLE public.punch_correction_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "punch_correction_select" ON public.punch_correction_requests;
CREATE POLICY "punch_correction_select" ON public.punch_correction_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_correction_requests.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_correction_insert" ON public.punch_correction_requests;
CREATE POLICY "punch_correction_insert" ON public.punch_correction_requests
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "punch_correction_update" ON public.punch_correction_requests;
CREATE POLICY "punch_correction_update" ON public.punch_correction_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_correction_requests.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_correction_delete" ON public.punch_correction_requests;
CREATE POLICY "punch_correction_delete" ON public.punch_correction_requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_correction_requests TO authenticated;
GRANT ALL ON public.punch_correction_requests TO service_role;

COMMENT ON TABLE public.punch_correction_requests IS '員工打卡補登申請；走審核關卡。店長打卡管理代改不入此表、不佔次數。';

-- 3) 副店可審／看本店請假、加班、換班、打卡（與店長同店）
DROP POLICY IF EXISTS "leave_select_own_or_site_manager" ON public.leave_applications;
CREATE POLICY "leave_select_own_or_site_manager" ON public.leave_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = leave_applications.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "leave_update_site_manager" ON public.leave_applications;
CREATE POLICY "leave_update_site_manager" ON public.leave_applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = leave_applications.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "overtime_select_own_or_site_manager" ON public.overtime_applications;
CREATE POLICY "overtime_select_own_or_site_manager" ON public.overtime_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = overtime_applications.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "overtime_update_site_manager" ON public.overtime_applications;
CREATE POLICY "overtime_update_site_manager" ON public.overtime_applications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = overtime_applications.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "swap_select_own_or_site_manager" ON public.shift_swap_applications;
CREATE POLICY "swap_select_own_or_site_manager" ON public.shift_swap_applications
  FOR SELECT USING (
    requester_id = auth.uid()
    OR target_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = shift_swap_applications.requester_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "swap_update_site_manager" ON public.shift_swap_applications;
CREATE POLICY "swap_update_site_manager" ON public.shift_swap_applications
  FOR UPDATE USING (
    target_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = shift_swap_applications.requester_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_select_own_or_manager" ON public.punch_records;
CREATE POLICY "punch_select_own_or_manager" ON public.punch_records
  FOR SELECT USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_insert_manager" ON public.punch_records;
CREATE POLICY "punch_insert_manager" ON public.punch_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_update_manager" ON public.punch_records;
CREATE POLICY "punch_update_manager" ON public.punch_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_delete_manager" ON public.punch_records;
CREATE POLICY "punch_delete_manager" ON public.punch_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "leave_applications_delete_manager" ON public.leave_applications;
CREATE POLICY "leave_applications_delete_manager" ON public.leave_applications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "shift_swap_delete_manager" ON public.shift_swap_applications;
CREATE POLICY "shift_swap_delete_manager" ON public.shift_swap_applications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "overtime_applications_delete_manager" ON public.overtime_applications;
CREATE POLICY "overtime_applications_delete_manager" ON public.overtime_applications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );
