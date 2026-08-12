-- 訂餐：發布類別、廠商統編庫、活動帶統編快照

CREATE TABLE IF NOT EXISTS public.meal_tax_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  company_name  VARCHAR(120) NOT NULL,
  tax_id        VARCHAR(20) NOT NULL,
  note          TEXT DEFAULT '',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_tax_profiles_site_active
  ON public.meal_tax_profiles (site_id, is_active, company_name);

-- 同店統編不重複（僅對啟用中資料以應用層／部分唯一較複雜；先做一般索引）
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_tax_profiles_site_tax_active
  ON public.meal_tax_profiles (site_id, tax_id)
  WHERE is_active = TRUE;

ALTER TABLE public.meal_orders
  ADD COLUMN IF NOT EXISTS order_category VARCHAR(20) NOT NULL DEFAULT 'drink'
    CHECK (order_category IN ('drink', 'bento', 'both'));

ALTER TABLE public.meal_orders
  ADD COLUMN IF NOT EXISTS tax_profile_id UUID REFERENCES public.meal_tax_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.meal_orders
  ADD COLUMN IF NOT EXISTS tax_company_name VARCHAR(120) DEFAULT '';

ALTER TABLE public.meal_orders
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(20) DEFAULT '';

ALTER TABLE public.meal_tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_tax_profiles_select_auth" ON public.meal_tax_profiles
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "meal_tax_profiles_insert_auth" ON public.meal_tax_profiles
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "meal_tax_profiles_update_auth" ON public.meal_tax_profiles
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "meal_tax_profiles_delete_auth" ON public.meal_tax_profiles
  FOR DELETE USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_tax_profiles TO authenticated;

COMMENT ON TABLE public.meal_tax_profiles IS '訂餐用廠商統編（抬頭／統編），依店隔離，可自行新增刪除';
COMMENT ON COLUMN public.meal_orders.order_category IS '發布活動類別：drink／bento／both';
COMMENT ON COLUMN public.meal_orders.tax_id IS '下單當下統編快照';
