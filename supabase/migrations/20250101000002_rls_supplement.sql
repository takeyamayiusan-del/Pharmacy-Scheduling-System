-- ============================================================
-- 耀聖藥局智慧排班系統 - RLS Supplement (Additional Policies)
-- ============================================================
-- This file adds policies that are missing from the initial schema
-- and the first supplement (20250101000001_rls_policies.sql).
--
-- Policies already defined in 20250101000000_initial_schema.sql:
--   users, scheduling_rules, schedule_entries, schedule_locks,
--   leave_applications, leave_attachments, shift_swap_applications,
--   overtime_applications, monthly_attendance_stats, tardiness_records,
--   notifications, storage.objects
--
-- Policies added in 20250101000001_rls_policies.sql:
--   scheduling_rules_insert_manager
--   tardiness_insert_boss
--   notifications_insert_system
-- ============================================================

-- ============================================================
-- leave_attachments: UPDATE policy for Edge Function cleanup
-- The cleanup-expired-attachments Edge Function (running with
-- service role) needs to update attachment status to 'expired'
-- or 'delete_failed'. Boss/manager also need UPDATE access for
-- manual management.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leave_attachments'
      AND policyname = 'leave_attachments_update_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "leave_attachments_update_manager" ON public.leave_attachments
        FOR UPDATE USING (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('boss', 'manager')
          )
        )
    $policy$;
  END IF;
END;
$$;

-- ============================================================
-- leave_attachments: DELETE policy for manager/boss
-- Managers and bosses should be able to delete attachments
-- (e.g., manual cleanup or moderation).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leave_attachments'
      AND policyname = 'leave_attachments_delete_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "leave_attachments_delete_manager" ON public.leave_attachments
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

-- ============================================================
-- leave_applications: DELETE policy for manager/boss
-- Manage application cleanup and record correction by authorized staff.
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

-- ============================================================
-- shift_swap_applications: DELETE policy for manager/boss
-- Allow managers to remove stale or invalid shift swap requests.
-- ============================================================
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

-- ============================================================
-- overtime_applications: DELETE policy for manager/boss
-- Allow managers to remove incorrect or cancelled overtime requests.
-- ============================================================
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

-- ============================================================
-- scheduling_rules: DELETE policy (optional, for completeness)
-- Only boss/manager should be able to delete scheduling rules
-- (rare operation, but policy should exist for completeness).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduling_rules'
      AND policyname = 'scheduling_rules_delete_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "scheduling_rules_delete_manager" ON public.scheduling_rules
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

-- ============================================================
-- monthly_attendance_stats: DELETE policy
-- Boss/manager should be able to delete stats records if needed
-- (e.g., recalculation requires deleting and re-inserting).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monthly_attendance_stats'
      AND policyname = 'monthly_stats_delete_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "monthly_stats_delete_manager" ON public.monthly_attendance_stats
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

-- ============================================================
-- tardiness_records: UPDATE policy for manager/boss
-- Managers and bosses should be able to update tardiness records
-- (e.g., correcting minutes_late or adding a note).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tardiness_records'
      AND policyname = 'tardiness_update_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "tardiness_update_manager" ON public.tardiness_records
        FOR UPDATE USING (
          EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('boss', 'manager')
          )
        )
    $policy$;
  END IF;
END;
$$;

-- ============================================================
-- tardiness_records: DELETE policy for manager/boss
-- Managers and bosses should be able to delete incorrect records.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tardiness_records'
      AND policyname = 'tardiness_delete_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "tardiness_delete_manager" ON public.tardiness_records
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

-- ============================================================
-- notifications: DELETE policy for recipient
-- Users should be able to delete their own notifications
-- (e.g., clearing old notifications from the list).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_delete_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "notifications_delete_own" ON public.notifications
        FOR DELETE USING (recipient_id = auth.uid())
    $policy$;
  END IF;
END;
$$;

-- ============================================================
-- Complete RLS Policy Inventory (all tables)
-- ============================================================
--
-- users:
--   SELECT  : users_select_all              (authenticated)
--   INSERT  : users_insert_boss_only        (boss only)
--   UPDATE  : users_update_boss_only        (boss only)
--   DELETE  : users_delete_boss_only        (boss only)
--
-- scheduling_rules:
--   SELECT  : scheduling_rules_select_all       (authenticated)
--   INSERT  : scheduling_rules_insert_manager   (boss/manager) [added in _rls_policies.sql]
--   UPDATE  : scheduling_rules_update_manager   (boss/manager)
--   DELETE  : scheduling_rules_delete_manager   (boss/manager) [added here]
--
-- schedule_entries:
--   SELECT  : schedule_select_all               (authenticated)
--   INSERT  : schedule_insert_manager           (boss/manager OR own user)
--   UPDATE  : schedule_update_manager           (boss/manager — any entry)
--             schedule_update_employee_self     (employee — own non-fixed entries)
--   DELETE  : (none — entries are not deleted, only updated)
--
-- schedule_locks:
--   SELECT  : schedule_locks_select_all         (authenticated)
--   INSERT  : schedule_locks_insert_manager     (boss/manager)
--   DELETE  : schedule_locks_delete_manager     (boss/manager)
--
-- leave_applications:
--   SELECT  : leave_select_own_or_manager       (own OR boss/manager)
--   INSERT  : leave_insert_own                  (own user_id)
--   UPDATE  : leave_update_manager              (boss/manager)
--   DELETE  : leave_applications_delete_manager (boss/manager) [added here]
--
-- leave_attachments:
--   SELECT  : leave_attachments_select          (own application owner OR boss/manager)
--   INSERT  : leave_attachments_insert_own      (owner of the application)
--   UPDATE  : leave_attachments_update_manager  (boss/manager) [added here]
--   DELETE  : leave_attachments_delete_manager  (boss/manager) [added here]
--
-- shift_swap_applications:
--   SELECT  : shift_swap_select                 (requester/target/boss/manager)
--   INSERT  : shift_swap_insert_employee        (requester = auth.uid())
--   UPDATE  : shift_swap_update_target_or_manager (target OR boss/manager)
--   DELETE  : shift_swap_delete_manager         (boss/manager) [added here]
--
-- overtime_applications:
--   SELECT  : overtime_select_own_or_manager    (own OR boss/manager)
--   INSERT  : overtime_insert_own               (own user_id)
--   UPDATE  : overtime_update_manager           (boss/manager)
--   DELETE  : overtime_applications_delete_manager (boss/manager) [added here]
--
-- monthly_attendance_stats:
--   SELECT  : monthly_stats_select_own_or_manager (own OR boss/manager)
--   INSERT  : monthly_stats_insert_system         (boss/manager / Edge Function)
--   UPDATE  : monthly_stats_update_system         (boss/manager / Edge Function)
--   DELETE  : monthly_stats_delete_manager        (boss/manager) [added here]
--
-- tardiness_records:
--   SELECT  : tardiness_select_manager_or_own   (own OR boss/manager)
--   INSERT  : tardiness_insert_manager          (manager only — initial schema)
--             tardiness_insert_boss             (boss only) [added in _rls_policies.sql]
--   UPDATE  : tardiness_update_manager          (boss/manager) [added here]
--   DELETE  : tardiness_delete_manager          (boss/manager) [added here]
--
-- notifications:
--   SELECT  : notifications_select_own          (recipient = auth.uid())
--   INSERT  : notifications_insert_system       (authenticated) [added in _rls_policies.sql]
--   UPDATE  : notifications_update_own          (recipient = auth.uid())
--   DELETE  : notifications_delete_own          (recipient = auth.uid()) [added here]
--
-- Storage bucket 'leave-attachments':
--   SELECT  : leave_attachments_storage_select  (authenticated)
--   INSERT  : leave_attachments_storage_insert  (authenticated)
--   DELETE  : leave_attachments_storage_delete  (boss/manager)
-- ============================================================
