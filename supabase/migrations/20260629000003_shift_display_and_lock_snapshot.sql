-- 班別顯示客製化（色彩 / 文字）與鎖定月份快照支援

ALTER TABLE public.shift_time_config
  ADD COLUMN IF NOT EXISTS display_label TEXT,
  ADD COLUMN IF NOT EXISTS display_text TEXT,
  ADD COLUMN IF NOT EXISTS bg_color TEXT,
  ADD COLUMN IF NOT EXISTS text_color TEXT,
  ADD COLUMN IF NOT EXISTS border_color TEXT;

UPDATE public.shift_time_config
SET
  display_label = COALESCE(display_label, CASE shift_code
    WHEN 'A' THEN '全天'
    WHEN 'B' THEN '白班'
    WHEN 'C' THEN '上午'
    WHEN 'D' THEN '下午'
    WHEN 'E' THEN '下午+晚'
    WHEN 'X' THEN '休假'
    ELSE shift_code
  END),
  display_text = COALESCE(display_text, shift_code),
  bg_color = COALESCE(bg_color, CASE shift_code
    WHEN 'A' THEN '#bfdbfe'
    WHEN 'B' THEN '#a7f3d0'
    WHEN 'C' THEN '#fde68a'
    WHEN 'D' THEN '#ddd6fe'
    WHEN 'E' THEN '#fecdd3'
    WHEN 'X' THEN '#e2e8f0'
    ELSE '#e5e7eb'
  END),
  text_color = COALESCE(text_color, CASE shift_code
    WHEN 'A' THEN '#1e3a8a'
    WHEN 'B' THEN '#065f46'
    WHEN 'C' THEN '#92400e'
    WHEN 'D' THEN '#5b21b6'
    WHEN 'E' THEN '#9f1239'
    WHEN 'X' THEN '#334155'
    ELSE '#111827'
  END),
  border_color = COALESCE(border_color, CASE shift_code
    WHEN 'A' THEN '#60a5fa'
    WHEN 'B' THEN '#34d399'
    WHEN 'C' THEN '#f59e0b'
    WHEN 'D' THEN '#a78bfa'
    WHEN 'E' THEN '#fb7185'
    WHEN 'X' THEN '#94a3b8'
    ELSE '#9ca3af'
  END)
WHERE shift_code IN ('A', 'B', 'C', 'D', 'E', 'X');
