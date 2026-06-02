-- ============================================================
-- 耀聖藥局智慧排班系統 - Notification Database Triggers
-- 完整通知觸發器集合（冪等，可重複執行）
-- ============================================================

-- ============================================================
-- 1. notify_leave_submitted()
--    AFTER INSERT on leave_applications
--    → 通知所有 boss/manager 使用者
-- ============================================================
CREATE OR REPLACE FUNCTION notify_leave_submitted()
RETURNS TRIGGER AS $$
DECLARE
  v_applicant_name VARCHAR(10);
BEGIN
  SELECT name INTO v_applicant_name
  FROM public.users
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  SELECT
    u.id,
    'leave_submitted',
    '新請假申請',
    v_applicant_name || ' 提交了請假申請，請審核。',
    NEW.id,
    'leave'
  FROM public.users u
  WHERE u.role IN ('boss', 'manager')
    AND u.is_active = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_leave_submitted ON public.leave_applications;
CREATE TRIGGER on_leave_submitted
  AFTER INSERT ON public.leave_applications
  FOR EACH ROW EXECUTE FUNCTION notify_leave_submitted();

-- ============================================================
-- 2. notify_shift_swap_requested()
--    AFTER INSERT on shift_swap_applications
--    → 通知換班目標員工（target_id）
-- ============================================================
CREATE OR REPLACE FUNCTION notify_shift_swap_requested()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_name VARCHAR(10);
BEGIN
  SELECT name INTO v_requester_name
  FROM public.users
  WHERE id = NEW.requester_id;

  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  VALUES (
    NEW.target_id,
    'shift_swap_requested',
    '換班申請',
    v_requester_name || ' 向您提出換班申請（' || TO_CHAR(NEW.swap_date, 'YYYY/MM/DD') || '），請確認。',
    NEW.id,
    'shift_swap'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_shift_swap_requested ON public.shift_swap_applications;
CREATE TRIGGER on_shift_swap_requested
  AFTER INSERT ON public.shift_swap_applications
  FOR EACH ROW EXECUTE FUNCTION notify_shift_swap_requested();

-- ============================================================
-- 3. notify_shift_swap_confirmed()
--    AFTER UPDATE on shift_swap_applications
--    WHEN NEW.status = 'pending_review' AND OLD.status = 'pending_confirm'
--    → 通知所有 boss/manager 使用者進行審核
-- ============================================================
CREATE OR REPLACE FUNCTION notify_shift_swap_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_name VARCHAR(10);
  v_target_name    VARCHAR(10);
BEGIN
  -- 僅在狀態從 pending_confirm 轉為 pending_review 時觸發
  IF NEW.status = 'pending_review' AND OLD.status = 'pending_confirm' THEN
    SELECT name INTO v_requester_name
    FROM public.users
    WHERE id = NEW.requester_id;

    SELECT name INTO v_target_name
    FROM public.users
    WHERE id = NEW.target_id;

    INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
    SELECT
      u.id,
      'shift_swap_confirmed',
      '換班申請待審核',
      v_requester_name || ' 與 ' || v_target_name || ' 的換班申請（' ||
        TO_CHAR(NEW.swap_date, 'YYYY/MM/DD') || '）已獲確認，請審核。',
      NEW.id,
      'shift_swap'
    FROM public.users u
    WHERE u.role IN ('boss', 'manager')
      AND u.is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_shift_swap_confirmed ON public.shift_swap_applications;
CREATE TRIGGER on_shift_swap_confirmed
  AFTER UPDATE ON public.shift_swap_applications
  FOR EACH ROW EXECUTE FUNCTION notify_shift_swap_confirmed();

-- ============================================================
-- 4. notify_shift_swap_responded()
--    AFTER UPDATE on shift_swap_applications
--    WHEN NEW.status = 'rejected' AND OLD.status = 'pending_confirm'
--    → 通知申請人（requester_id）換班被拒絕
-- ============================================================
CREATE OR REPLACE FUNCTION notify_shift_swap_responded()
RETURNS TRIGGER AS $$
DECLARE
  v_target_name VARCHAR(10);
BEGIN
  -- 僅在目標員工拒絕（pending_confirm → rejected）時觸發
  IF NEW.status = 'rejected' AND OLD.status = 'pending_confirm' THEN
    SELECT name INTO v_target_name
    FROM public.users
    WHERE id = NEW.target_id;

    INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
    VALUES (
      NEW.requester_id,
      'shift_swap_reviewed',
      '換班申請已拒絕',
      v_target_name || ' 拒絕了您的換班申請（' || TO_CHAR(NEW.swap_date, 'YYYY/MM/DD') || '）。',
      NEW.id,
      'shift_swap'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_shift_swap_responded ON public.shift_swap_applications;
CREATE TRIGGER on_shift_swap_responded
  AFTER UPDATE ON public.shift_swap_applications
  FOR EACH ROW EXECUTE FUNCTION notify_shift_swap_responded();

-- ============================================================
-- 5. notify_overtime_submitted()
--    AFTER INSERT on overtime_applications
--    → 通知所有 boss/manager 使用者
-- ============================================================
CREATE OR REPLACE FUNCTION notify_overtime_submitted()
RETURNS TRIGGER AS $$
DECLARE
  v_applicant_name VARCHAR(10);
BEGIN
  SELECT name INTO v_applicant_name
  FROM public.users
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  SELECT
    u.id,
    'overtime_submitted',
    '新加班申請',
    v_applicant_name || ' 提交了加班申請（' || TO_CHAR(NEW.overtime_date, 'YYYY/MM/DD') || '），請審核。',
    NEW.id,
    'overtime'
  FROM public.users u
  WHERE u.role IN ('boss', 'manager')
    AND u.is_active = TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_overtime_submitted ON public.overtime_applications;
CREATE TRIGGER on_overtime_submitted
  AFTER INSERT ON public.overtime_applications
  FOR EACH ROW EXECUTE FUNCTION notify_overtime_submitted();

-- ============================================================
-- 6. notify_application_reviewed()
--    AFTER UPDATE on leave_applications / overtime_applications / shift_swap_applications
--    WHEN NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' (or 'pending_review')
--    → 通知申請人審核結果
-- ============================================================
CREATE OR REPLACE FUNCTION notify_application_reviewed()
RETURNS TRIGGER AS $$
DECLARE
  v_recipient_id   UUID;
  v_notif_type     VARCHAR(50);
  v_related_type   VARCHAR(30);
  v_title          VARCHAR(100);
  v_body           TEXT;
  v_status_text    TEXT;
BEGIN
  -- 判斷申請人 ID、通知類型與關聯類型
  IF TG_TABLE_NAME = 'leave_applications' THEN
    -- 請假：pending → approved/rejected
    IF NOT (NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending') THEN
      RETURN NEW;
    END IF;
    v_recipient_id := NEW.user_id;
    v_notif_type   := 'leave_reviewed';
    v_related_type := 'leave';
    v_status_text  := CASE NEW.status WHEN 'approved' THEN '已通過' ELSE '已拒絕' END;
    v_title        := '請假申請' || v_status_text;
    v_body         := '您的請假申請（' || TO_CHAR(NEW.leave_date, 'YYYY/MM/DD') || '）' || v_status_text || '。' ||
                      CASE WHEN NEW.status = 'rejected' AND NEW.reject_reason IS NOT NULL
                           THEN '拒絕原因：' || NEW.reject_reason
                           ELSE '' END;

  ELSIF TG_TABLE_NAME = 'overtime_applications' THEN
    -- 加班：pending → approved/rejected
    IF NOT (NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending') THEN
      RETURN NEW;
    END IF;
    v_recipient_id := NEW.user_id;
    v_notif_type   := 'overtime_reviewed';
    v_related_type := 'overtime';
    v_status_text  := CASE NEW.status WHEN 'approved' THEN '已通過' ELSE '已拒絕' END;
    v_title        := '加班申請' || v_status_text;
    v_body         := '您的加班申請（' || TO_CHAR(NEW.overtime_date, 'YYYY/MM/DD') || '）' || v_status_text || '。' ||
                      CASE WHEN NEW.status = 'rejected' AND NEW.reject_reason IS NOT NULL
                           THEN '拒絕原因：' || NEW.reject_reason
                           ELSE '' END;

  ELSIF TG_TABLE_NAME = 'shift_swap_applications' THEN
    -- 換班：pending_review → approved/rejected（店長審核結果）
    IF NOT (NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending_review') THEN
      RETURN NEW;
    END IF;
    v_notif_type   := 'shift_swap_reviewed';
    v_related_type := 'shift_swap';
    v_status_text  := CASE NEW.status WHEN 'approved' THEN '已通過' ELSE '已拒絕' END;
    v_title        := '換班申請' || v_status_text;
    v_body         := '您的換班申請（' || TO_CHAR(NEW.swap_date, 'YYYY/MM/DD') || '）' || v_status_text || '。' ||
                      CASE WHEN NEW.status = 'rejected' AND NEW.reject_reason IS NOT NULL
                           THEN '拒絕原因：' || NEW.reject_reason
                           ELSE '' END;

    -- 通知申請人
    INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
    VALUES (NEW.requester_id, v_notif_type, v_title, v_body, NEW.id, v_related_type);

    -- 通知目標員工（換班對象也需知道結果）
    INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
    VALUES (NEW.target_id, v_notif_type, v_title, v_body, NEW.id, v_related_type);

    RETURN NEW;
  ELSE
    RETURN NEW;
  END IF;

  -- 對請假與加班申請，通知申請人
  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  VALUES (v_recipient_id, v_notif_type, v_title, v_body, NEW.id, v_related_type);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_application_reviewed_leave ON public.leave_applications;
CREATE TRIGGER on_application_reviewed_leave
  AFTER UPDATE ON public.leave_applications
  FOR EACH ROW EXECUTE FUNCTION notify_application_reviewed();

DROP TRIGGER IF EXISTS on_application_reviewed_overtime ON public.overtime_applications;
CREATE TRIGGER on_application_reviewed_overtime
  AFTER UPDATE ON public.overtime_applications
  FOR EACH ROW EXECUTE FUNCTION notify_application_reviewed();

DROP TRIGGER IF EXISTS on_application_reviewed_swap ON public.shift_swap_applications;
CREATE TRIGGER on_application_reviewed_swap
  AFTER UPDATE ON public.shift_swap_applications
  FOR EACH ROW EXECUTE FUNCTION notify_application_reviewed();

-- ============================================================
-- 7. notify_schedule_changed()
--    AFTER UPDATE on schedule_entries
--    WHEN OLD.shift_code IS DISTINCT FROM NEW.shift_code
--    → 通知受影響員工（user_id）班表異動
-- ============================================================
CREATE OR REPLACE FUNCTION notify_schedule_changed()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_name VARCHAR(10);
BEGIN
  -- 僅在班別代碼實際變更時觸發
  IF OLD.shift_code IS NOT DISTINCT FROM NEW.shift_code THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_employee_name
  FROM public.users
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (recipient_id, type, title, body, related_id, related_type)
  VALUES (
    NEW.user_id,
    'schedule_changed',
    '班表異動通知',
    '您 ' || TO_CHAR(NEW.date, 'YYYY/MM/DD') || ' 的班別已由「' ||
      OLD.shift_code || '」更改為「' || NEW.shift_code || '」，請確認。',
    NEW.id,
    'schedule'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_schedule_changed ON public.schedule_entries;
CREATE TRIGGER on_schedule_changed
  AFTER UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION notify_schedule_changed();
