-- 叫藥／客人訂購補健保碼與單位；客人訂購加履約狀態（到貨／通知／已拿）

ALTER TABLE public.shop_medicine_requests
  ADD COLUMN IF NOT EXISTS nhi_code VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT '';

ALTER TABLE public.shop_customer_orders
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS goods_arrived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS picked_up BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS goods_arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shop_cust_fulfill
  ON public.shop_customer_orders (site_id, goods_arrived, notified, picked_up);

COMMENT ON COLUMN public.shop_medicine_requests.nhi_code IS '健保碼（選填）';
COMMENT ON COLUMN public.shop_medicine_requests.unit IS '單位（選填，如盒／瓶／顆）';
COMMENT ON COLUMN public.shop_customer_orders.unit IS '單位（選填）';
COMMENT ON COLUMN public.shop_customer_orders.goods_arrived IS '貨到了';
COMMENT ON COLUMN public.shop_customer_orders.notified IS '已通知客人';
COMMENT ON COLUMN public.shop_customer_orders.picked_up IS '客人已拿';
