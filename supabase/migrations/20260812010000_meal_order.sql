-- 訂餐功能：店家／菜單／活動／點選明細（依店別隔離）

CREATE TABLE IF NOT EXISTS public.meal_vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  name        VARCHAR(120) NOT NULL,
  category    VARCHAR(20) NOT NULL DEFAULT 'drink'
              CHECK (category IN ('drink', 'bento', 'both')),
  phone       VARCHAR(40) DEFAULT '',
  address     TEXT DEFAULT '',
  menu_url    TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_vendors_site_active
  ON public.meal_vendors (site_id, is_active, name);

CREATE TABLE IF NOT EXISTS public.meal_menu_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES public.meal_vendors(id) ON DELETE CASCADE,
  site_id     TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  name        VARCHAR(120) NOT NULL,
  category    VARCHAR(20) NOT NULL CHECK (category IN ('drink', 'bento')),
  price       NUMERIC(10, 2) DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_menu_items_vendor
  ON public.meal_menu_items (vendor_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.meal_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  vendor_id     UUID NOT NULL REFERENCES public.meal_vendors(id) ON DELETE RESTRICT,
  title         VARCHAR(200) NOT NULL,
  order_date    DATE NOT NULL,
  budget_note   TEXT DEFAULT '',
  note          TEXT DEFAULT '',
  status        VARCHAR(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'ordered', 'closed')),
  created_by    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bulletin_id   UUID REFERENCES public.bulletin_board(id) ON DELETE SET NULL,
  ordered_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ordered_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_orders_site_date
  ON public.meal_orders (site_id, order_date DESC, status);

CREATE TABLE IF NOT EXISTS public.meal_order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.meal_orders(id) ON DELETE CASCADE,
  site_id         TEXT NOT NULL CHECK (site_id IN ('zhushan', 'jiji')),
  ordered_by      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  for_user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  for_name        VARCHAR(80) NOT NULL,
  item_id         UUID REFERENCES public.meal_menu_items(id) ON DELETE SET NULL,
  item_name       VARCHAR(120) NOT NULL,
  category        VARCHAR(20) NOT NULL CHECK (category IN ('drink', 'bento')),
  sweetness       VARCHAR(40) DEFAULT '',
  ice             VARCHAR(40) DEFAULT '',
  note            TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_order_lines_order
  ON public.meal_order_lines (order_id, created_at);

ALTER TABLE public.meal_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_vendors_select_auth" ON public.meal_vendors
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "meal_vendors_insert_auth" ON public.meal_vendors
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "meal_vendors_update_auth" ON public.meal_vendors
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "meal_vendors_delete_auth" ON public.meal_vendors
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "meal_menu_items_select_auth" ON public.meal_menu_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "meal_menu_items_insert_auth" ON public.meal_menu_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "meal_menu_items_update_auth" ON public.meal_menu_items
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "meal_menu_items_delete_auth" ON public.meal_menu_items
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "meal_orders_select_auth" ON public.meal_orders
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "meal_orders_insert_auth" ON public.meal_orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "meal_orders_update_auth" ON public.meal_orders
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "meal_orders_delete_auth" ON public.meal_orders
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "meal_order_lines_select_auth" ON public.meal_order_lines
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "meal_order_lines_insert_auth" ON public.meal_order_lines
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "meal_order_lines_update_auth" ON public.meal_order_lines
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "meal_order_lines_delete_auth" ON public.meal_order_lines
  FOR DELETE USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_menu_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_order_lines TO authenticated;

COMMENT ON TABLE public.meal_vendors IS '訂餐店家（飲料／便當），依 site_id 隔離';
COMMENT ON TABLE public.meal_orders IS '訂餐活動：一活動一店；同日可開多場（飲料＋便當）';
COMMENT ON TABLE public.meal_order_lines IS '訂餐明細：一列一杯／一份，可代點、可複數';
