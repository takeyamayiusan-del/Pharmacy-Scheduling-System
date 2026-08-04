-- 排班說明文字（可由店長自訂）
CREATE TABLE IF NOT EXISTS public.scheduling_notes (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content  TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.scheduling_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduling_notes_select_all" ON public.scheduling_notes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "scheduling_notes_write_manager" ON public.scheduling_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- 預設內容
INSERT INTO public.scheduling_notes (content) VALUES (
  '全員預設 B 班，A 班代表全天＋晚班。
禮拜日固定公休，不提供編輯。
禮拜六固定上 C 班（上午班），排休選擇仍依個人配額。
每人每月固定 8 天休：4 天禮拜日、2 天禮拜六、2 天平日。'
);
