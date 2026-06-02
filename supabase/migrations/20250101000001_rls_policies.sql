-- ============================================================
-- 耀聖藥局智慧排班系統 - RLS Policies Supplement
-- ============================================================
-- NOTE: All RLS policies are already defined in the initial schema migration
-- (20250101000000_initial_schema.sql). This file documents the complete
-- policy set for reference and adds any supplementary configurations.
-- ============================================================

-- ============================================================
-- RLS Policy Summary (already defined in initial schema)
-- ============================================================
--
-- users:
--   - users_select_all          : authenticated users can SELECT
--   - users_insert_boss_only    : only boss can INSERT
--   - users_update_boss_only    : only boss can UPDATE
--   - users_delete_boss_only    : only boss can DELETE
--
-- scheduling_rules:
--   - scheduling_rules_select_all       : authenticated users can SELECT
--   - scheduling_rules_update_manager   : boss/manager can UPDATE
--
-- schedule_entries:
--   - schedule_select_all               : authenticated users can SELECT
--   - schedule_insert_manager           : boss/manager OR own user can INSERT
--   - schedule_update_manager           : boss/manager can UPDATE any entry
--   - schedule_update_employee_self     : employee can UPDATE own non-fixed entries
--
-- schedule_locks:
--   - schedule_locks_select_all         : authenticated users can SELECT
--   - schedule_locks_insert_manager     : boss/manager can INSERT
--   - schedule_locks_delete_manager     : boss/manager can DELETE
--
-- leave_applications:
--   - leave_select_own_or_manager       : own records OR boss/manager can SELECT
--   - leave_insert_own                  : employee can INSERT own applications
--   - leave_update_manager              : boss/manager can UPDATE (review)
--
-- leave_attachments:
--   - leave_attachments_select          : own application owner OR boss/manager can SELECT
--   - leave_attachments_insert_own      : owner of the application can INSERT
--
-- shift_swap_applications:
--   - shift_swap_select                 : requester/target/boss/manager can SELECT
--   - shift_swap_insert_employee        : requester can INSERT
--   - shift_swap_update_target_or_manager : target employee OR boss/manager can UPDATE
--
-- overtime_applications:
--   - overtime_select_own_or_manager    : own records OR boss/manager can SELECT
--   - overtime_insert_own               : employee can INSERT own applications
--   - overtime_update_manager           : boss/manager can UPDATE (review)
--
-- monthly_attendance_stats:
--   - monthly_stats_select_own_or_manager : own records OR boss/manager can SELECT
--   - monthly_stats_insert_system         : boss/manager can INSERT (system/Edge Function)
--   - monthly_stats_update_system         : boss/manager can UPDATE (system/Edge Function)
--
-- tardiness_records:
--   - tardiness_select_manager_or_own   : own records OR boss/manager can SELECT
--   - tardiness_insert_manager          : only manager can INSERT
--
-- notifications:
--   - notifications_select_own          : recipient can SELECT own notifications
--   - notifications_update_own          : recipient can UPDATE own notifications (mark as read)
--
-- Storage bucket 'leave-attachments':
--   - leave_attachments_storage_select  : authenticated users can SELECT
--   - leave_attachments_storage_insert  : authenticated users can INSERT
--   - leave_attachments_storage_delete  : boss/manager can DELETE
-- ============================================================

-- ============================================================
-- Supplementary: Ensure scheduling_rules INSERT policy exists
-- (initial schema only has SELECT and UPDATE for scheduling_rules)
-- Boss/manager should be able to insert the initial rules row
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduling_rules'
      AND policyname = 'scheduling_rules_insert_manager'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "scheduling_rules_insert_manager" ON public.scheduling_rules
        FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
        )
    $policy$;
  END IF;
END;
$$;

-- ============================================================
-- Supplementary: Ensure tardiness_records boss can also INSERT
-- Design doc says only manager inserts tardiness, but boss should
-- also have the ability per the role permission matrix
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tardiness_records'
      AND policyname = 'tardiness_insert_boss'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "tardiness_insert_boss" ON public.tardiness_records
        FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'boss')
        )
    $policy$;
  END IF;
END;
$$;

-- ============================================================
-- Supplementary: notifications INSERT policy for triggers
-- Database triggers run as SECURITY DEFINER so they bypass RLS,
-- but adding an explicit policy for completeness / service role usage
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_insert_system'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "notifications_insert_system" ON public.notifications
        FOR INSERT WITH CHECK (
          -- Triggers (SECURITY DEFINER) bypass RLS.
          -- This policy allows authenticated users to insert notifications
          -- via the notification service / edge functions.
          auth.role() = 'authenticated'
        )
    $policy$;
  END IF;
END;
$$;
