-- ============================================================
-- Ensure manager delete policies exist for application tables
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leave_applications'
      AND policyname = 'leave_applications_delete_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "leave_applications_delete_manager" ON public.leave_applications
        FOR DELETE USING (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('boss', 'manager')
          )
        )
    $policy$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shift_swap_applications'
      AND policyname = 'shift_swap_delete_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "shift_swap_delete_manager" ON public.shift_swap_applications
        FOR DELETE USING (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('boss', 'manager')
          )
        )
    $policy$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'overtime_applications'
      AND policyname = 'overtime_applications_delete_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "overtime_applications_delete_manager" ON public.overtime_applications
        FOR DELETE USING (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('boss', 'manager')
          )
        )
    $policy$;
  END IF;
END;
$$;
