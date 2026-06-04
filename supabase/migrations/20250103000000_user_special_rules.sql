-- ============================================================
-- 耀聖藥局智慧排班系統 - User Special Rules
-- 為 users 表新增特殊排班規則欄位
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_wednesday_rotation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_weekday_off_rule    BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.is_wednesday_rotation IS '禮拜三晚班輪值員工：此員工參與禮三晚班輪值';
COMMENT ON COLUMN public.users.is_weekday_off_rule IS '平日不排休規則：此員工平日正常上班，排休只能選週六';
