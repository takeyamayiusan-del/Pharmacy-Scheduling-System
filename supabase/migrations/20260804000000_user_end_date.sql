-- 員工到期日（離職／合約結束）；NULL 表示尚未設定（持續在職）
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS end_date DATE;

COMMENT ON COLUMN public.users.end_date IS '員工到期日（含當日）；NULL=未設定，持續顯示於班表';
