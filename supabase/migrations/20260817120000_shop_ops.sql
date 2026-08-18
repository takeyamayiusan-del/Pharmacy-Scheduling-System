-- 店務三塊：日常採購／叫藥需求／客人訂購（依店別隔離；結單後保留紀錄）

CREATE TABLE IF NOT EXISTS public.shop_procurement_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  name        VARCHAR(80) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_proc_cat_site
  ON public.shop_procurement_categories (site_id, is_active, name);

CREATE TABLE IF NOT EXISTS public.shop_procurement_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  category_id    UUID REFERENCES public.shop_procurement_categories(id) ON DELETE SET NULL,
  category_name  VARCHAR(80) NOT NULL DEFAULT '',
  item_name      VARCHAR(200) NOT NULL,
  quantity       NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unit           VARCHAR(20) NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'closed')),
  created_by     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  closed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_proc_items_site_status
  ON public.shop_procurement_items (site_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shop_medicine_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  kind            VARCHAR(20) NOT NULL
                  CHECK (kind IN ('prepack', 'shortage', 'below_stock')),
  item_name       VARCHAR(200) NOT NULL,
  qty_mode        VARCHAR(20) NOT NULL DEFAULT 'direct'
                  CHECK (qty_mode IN ('direct', 'refill')),
  quantity        NUMERIC(12, 3),
  use_ic02        BOOLEAN NOT NULL DEFAULT FALSE,
  ic02_qty        NUMERIC(12, 3),
  use_ic03        BOOLEAN NOT NULL DEFAULT FALSE,
  ic03_qty        NUMERIC(12, 3),
  current_stock   NUMERIC(12, 3),
  note            TEXT NOT NULL DEFAULT '',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'closed')),
  created_by      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  closed_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_med_site_status
  ON public.shop_medicine_requests (site_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shop_customer_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  customer_name   VARCHAR(80) NOT NULL,
  customer_phone  VARCHAR(40) NOT NULL,
  handler_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_name    VARCHAR(200) NOT NULL,
  nhi_code        VARCHAR(40) NOT NULL DEFAULT '',
  quantity        NUMERIC(12, 3) NOT NULL DEFAULT 1,
  amount          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_status  VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                  CHECK (payment_status IN ('paid', 'unpaid')),
  note            TEXT NOT NULL DEFAULT '',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'closed')),
  created_by      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  closed_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_cust_site_status
  ON public.shop_customer_orders (site_id, status, created_at DESC);

ALTER TABLE public.shop_procurement_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_medicine_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_customer_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_proc_cat_select_auth" ON public.shop_procurement_categories
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "shop_proc_cat_insert_auth" ON public.shop_procurement_categories
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "shop_proc_cat_update_auth" ON public.shop_procurement_categories
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "shop_proc_cat_delete_auth" ON public.shop_procurement_categories
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "shop_proc_items_select_auth" ON public.shop_procurement_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "shop_proc_items_insert_auth" ON public.shop_procurement_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "shop_proc_items_update_auth" ON public.shop_procurement_items
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "shop_proc_items_delete_auth" ON public.shop_procurement_items
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "shop_med_select_auth" ON public.shop_medicine_requests
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "shop_med_insert_auth" ON public.shop_medicine_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "shop_med_update_auth" ON public.shop_medicine_requests
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "shop_med_delete_auth" ON public.shop_medicine_requests
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "shop_cust_select_auth" ON public.shop_customer_orders
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "shop_cust_insert_auth" ON public.shop_customer_orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "shop_cust_update_auth" ON public.shop_customer_orders
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "shop_cust_delete_auth" ON public.shop_customer_orders
  FOR DELETE USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_procurement_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_procurement_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_medicine_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_customer_orders TO authenticated;

COMMENT ON TABLE public.shop_procurement_items IS '日常採購需求；結單後 status=closed 保留紀錄';
COMMENT ON TABLE public.shop_medicine_requests IS '叫藥：預包／欠藥／低於庫存；IC02／IC03 可選填';
COMMENT ON TABLE public.shop_customer_orders IS '客人訂購；接手人=新增者；健保碼選填';
