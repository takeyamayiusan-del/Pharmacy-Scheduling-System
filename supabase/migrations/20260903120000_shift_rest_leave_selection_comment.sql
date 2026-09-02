-- 語意更新：is_half_day_leave_rule = 排休選擇改排特定班別（非休上午／下午）

COMMENT ON COLUMN public.users.is_half_day_leave_rule IS '排休變特定班別：排休選擇點日期後班表排指定班，非全日休假 X';
COMMENT ON COLUMN public.users.half_day_work_shift IS '排休變特定班別時的預設班碼（員工管理／固定班表可調）';
