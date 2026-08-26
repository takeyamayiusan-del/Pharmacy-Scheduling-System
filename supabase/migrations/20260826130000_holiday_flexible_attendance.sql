-- 國定假日也可走彈性出勤：規定上班／當天休兩種結算政策
ALTER TABLE public.flexible_attendance_days
  ADD COLUMN IF NOT EXISTS event_kind TEXT NOT NULL DEFAULT 'typhoon';

ALTER TABLE public.flexible_attendance_days
  ADD COLUMN IF NOT EXISTS settlement_policy TEXT NOT NULL DEFAULT 'typhoon_default';

ALTER TABLE public.flexible_attendance_days
  DROP CONSTRAINT IF EXISTS flexible_attendance_days_event_kind_check;

ALTER TABLE public.flexible_attendance_days
  ADD CONSTRAINT flexible_attendance_days_event_kind_check
  CHECK (event_kind IN ('typhoon', 'national_holiday'));

ALTER TABLE public.flexible_attendance_days
  DROP CONSTRAINT IF EXISTS flexible_attendance_days_settlement_policy_check;

ALTER TABLE public.flexible_attendance_days
  ADD CONSTRAINT flexible_attendance_days_settlement_policy_check
  CHECK (settlement_policy IN (
    'typhoon_default',
    'required_work',
    'day_off_no_penalty'
  ));

COMMENT ON COLUMN public.flexible_attendance_days.event_kind IS
  'typhoon=颱風／天災；national_holiday=國定假日彈性出勤';

COMMENT ON COLUMN public.flexible_attendance_days.settlement_policy IS
  'typhoon_default=原本休假完全跳過；required_work=應來未到要待補，本休有來仍給；day_off_no_penalty=有來給時數、沒來不罰';
