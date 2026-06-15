-- 增強佈告欄功能
-- 1. 新增 is_pinned 欄位（釘選）
-- 2. 新增 target_type 欄位（發布對象：all 或 specific）
-- 3. 新增 target_ids 欄位（特定員工 ID 列表）
-- 4. 新增 bulletin_reads 表（已讀狀態追蹤）

-- 1. bulletin_board 表新增欄位
ALTER TABLE public.bulletin_board
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS target_type VARCHAR(50) DEFAULT 'all', -- 'all', 'specific'
  ADD COLUMN IF NOT EXISTS target_ids UUID[] DEFAULT '{}';

-- 2. 新增 bulletin_reads 表（已讀狀態）
CREATE TABLE IF NOT EXISTS public.bulletin_reads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id UUID NOT NULL REFERENCES public.bulletin_board(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bulletin_id, user_id)
);

-- 3. 設置 RLS
ALTER TABLE public.bulletin_reads ENABLE ROW LEVEL SECURITY;

-- 讀取：所有已認證用戶可以讀取
CREATE POLICY "bulletin_reads_select_all" ON public.bulletin_reads
  FOR SELECT USING (auth.role() = 'authenticated');

-- 插入：用戶只能標記自己的已讀
CREATE POLICY "bulletin_reads_insert_own" ON public.bulletin_reads
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND
    user_id = auth.uid()
  );

-- 刪除：用戶可以刪除自己的已讀記錄
CREATE POLICY "bulletin_reads_delete_own" ON public.bulletin_reads
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- 交班留言功能
-- ====================================

-- 4. 新增 shift_handoffs 表（交班留言）
CREATE TABLE IF NOT EXISTS public.shift_handoffs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,                           -- 交班日期
  shift           VARCHAR(10) NOT NULL,                    -- 'A', 'B', 'C'
  author_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_name     VARCHAR(100) NOT NULL,
  target_shift    VARCHAR(10) NOT NULL,                     -- 交給哪個班：'A', 'B', 'all'
  content         TEXT NOT NULL,
  is_completed    BOOLEAN DEFAULT FALSE,                   -- 接班人是否已確認
  completed_by_id UUID REFERENCES public.users(id),
  completed_by_name VARCHAR(100),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 設置 RLS
ALTER TABLE public.shift_handoffs ENABLE ROW LEVEL SECURITY;

-- 讀取：所有已認證用戶可以讀取
CREATE POLICY "shift_handoffs_select_all" ON public.shift_handoffs
  FOR SELECT USING (auth.role() = 'authenticated');

-- 插入：所有已認證用戶可以發布交班
CREATE POLICY "shift_handoffs_insert_all" ON public.shift_handoffs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 更新：作者或接班人可以更新
CREATE POLICY "shift_handoffs_update_author_target" ON public.shift_handoffs
  FOR UPDATE USING (
    author_id = auth.uid() OR
    completed_by_id = auth.uid()
  );

-- 刪除：作者可以刪除
CREATE POLICY "shift_handoffs_delete_author" ON public.shift_handoffs
  FOR DELETE USING (author_id = auth.uid());

-- 觸發器更新 updated_at
CREATE TRIGGER trg_shift_handoffs_updated_at
  BEFORE UPDATE ON public.shift_handoffs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
