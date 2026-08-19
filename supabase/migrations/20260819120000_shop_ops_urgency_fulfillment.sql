-- 客人訂購：一般／緊急、希望到貨日、已訂貨
-- 叫藥：已訂貨／已到貨／已通知、欠藥聯絡電話

ALTER TABLE public.shop_customer_orders
  ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (urgency IN ('normal', 'urgent')),
  ADD COLUMN IF NOT EXISTS wanted_arrive_date DATE,
  ADD COLUMN IF NOT EXISTS ordered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ;

ALTER TABLE public.shop_medicine_requests
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ordered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS goods_arrived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS goods_arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shop_cust_urgency
  ON public.shop_customer_orders (site_id, urgency, status, created_at DESC);

COMMENT ON COLUMN public.shop_customer_orders.urgency IS '一般／緊急';
COMMENT ON COLUMN public.shop_customer_orders.wanted_arrive_date IS '緊急件希望到貨日（選填）';
COMMENT ON COLUMN public.shop_customer_orders.ordered IS '已向廠商訂貨';
COMMENT ON COLUMN public.shop_medicine_requests.contact_phone IS '欠藥聯絡電話';
COMMENT ON COLUMN public.shop_medicine_requests.ordered IS '已訂貨';
COMMENT ON COLUMN public.shop_medicine_requests.goods_arrived IS '已到貨';
COMMENT ON COLUMN public.shop_medicine_requests.notified IS '已通知（欠藥）';
