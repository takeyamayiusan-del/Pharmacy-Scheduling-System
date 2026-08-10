-- 請假／加班／換班：店長僅能存取本店員工；老闆（owner／boss）可跨店
-- 表本身無 site_id，透過 users.site_id 關聯

-- ─── leave_applications ───────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'leave_applications' AND cmd = 'SELECT'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.leave_applications', policyname), '; ')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'leave_applications' AND cmd = 'SELECT'
    );
  END IF;
END $$;

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
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'leave_applications' AND cmd = 'UPDATE'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.leave_applications', policyname), '; ')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'leave_applications' AND cmd = 'UPDATE'
    );
  END IF;
END $$;

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
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

-- ─── overtime_applications ────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'overtime_applications' AND cmd = 'SELECT'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.overtime_applications', policyname), '; ')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'overtime_applications' AND cmd = 'SELECT'
    );
  END IF;
END $$;

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
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'overtime_applications' AND cmd = 'UPDATE'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.overtime_applications', policyname), '; ')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'overtime_applications' AND cmd = 'UPDATE'
    );
  END IF;
END $$;

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
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

-- ─── shift_swap_applications ──────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_swap_applications' AND cmd = 'SELECT'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.shift_swap_applications', policyname), '; ')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'shift_swap_applications' AND cmd = 'SELECT'
    );
  END IF;
END $$;

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
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_swap_applications' AND cmd = 'UPDATE'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.shift_swap_applications', policyname), '; ')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'shift_swap_applications' AND cmd = 'UPDATE'
    );
  END IF;
END $$;

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
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );
