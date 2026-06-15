-- 增強佈告欄功能
-- 1. 新增 is_pinned 欄位（釘選）
-- 2. 新增 target_type 欄位（發布對象：all 或 specific）
-- 3. 新增 target_ids 欄位（特定員工 ID 列表）
-- 4. 新增 bulletin_reads 表（已讀狀態追蹤）
-- 5. 新增 shift_handoff 公告類型（交班留言）

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
