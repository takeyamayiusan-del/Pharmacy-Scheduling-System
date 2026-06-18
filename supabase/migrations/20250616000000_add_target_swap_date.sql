-- 新增目標換班日期欄位
ALTER TABLE public.shift_swap_applications
ADD COLUMN IF NOT EXISTS target_swap_date DATE;

-- 允許 NULL（舊記錄）
ALTER TABLE public.shift_swap_applications
ALTER COLUMN target_swap_date DROP NOT NULL;

-- 對於現有記錄，預設等於 swap_date
UPDATE public.shift_swap_applications
SET target_swap_date = swap_date
WHERE target_swap_date IS NULL;
