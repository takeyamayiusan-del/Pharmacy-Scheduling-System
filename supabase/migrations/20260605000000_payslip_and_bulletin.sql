-- ============================================================
-- 耀聖藥局智慧排班系統 - Payslip & Bulletin Board
-- ============================================================

-- 1. 擴充 payroll_records 表，增加發布狀態
ALTER TABLE public.payroll_records 
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 2. 創建 bulletin_board 表（佈告欄）
CREATE TABLE IF NOT EXISTS public.bulletin_board (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  content     TEXT NOT NULL,
  type        VARCHAR(50) NOT NULL DEFAULT 'announcement', -- 'announcement', 'shift_swap_request'
  status      VARCHAR(50) NOT NULL DEFAULT 'active',      -- 'active', 'archived', 'completed'
  related_id  UUID,                                       -- 關聯的 ID (例如換班申請 ID)
  is_urgent   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 設置 RLS 策略
ALTER TABLE public.bulletin_board ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bulletin_board_select_all" ON public.bulletin_board
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "bulletin_board_insert_all" ON public.bulletin_board
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "bulletin_board_update_owner_manager" ON public.bulletin_board
  FOR UPDATE USING (
    author_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "bulletin_board_delete_owner_manager" ON public.bulletin_board
  FOR DELETE USING (
    author_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- 4. 觸發器更新 updated_at
CREATE TRIGGER trg_bulletin_board_updated_at
  BEFORE UPDATE ON public.bulletin_board
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
