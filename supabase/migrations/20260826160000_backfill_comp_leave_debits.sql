-- 補登：已核准補休假但尚未寫入 leave_debit 的申請，依請假日起依序補扣
INSERT INTO public.comp_leave_ledger (user_id, hours, source_type, source_id, note, created_at)
SELECT
  la.user_id,
  -ABS(
    COALESCE(
      NULLIF(la.leave_hours, 0),
      CASE COALESCE(la.period, 'full_day')
        WHEN 'morning' THEN 4
        WHEN 'afternoon' THEN 4
        ELSE 8
      END
    )
  ),
  'leave_debit',
  la.id,
  '補登：核准補休假補扣 ' || COALESCE(la.leave_date::text, '') ||
    CASE
      WHEN la.end_date IS NOT NULL AND la.end_date <> la.leave_date
        THEN '～' || la.end_date::text
      ELSE ''
    END,
  COALESCE(la.reviewed_at, la.created_at, NOW())
FROM public.leave_applications la
WHERE la.status = 'approved'
  AND la.leave_type = '補休假'
  AND NOT EXISTS (
    SELECT 1
    FROM public.comp_leave_ledger c
    WHERE c.source_id = la.id
      AND c.source_type = 'leave_debit'
  )
ORDER BY
  COALESCE(la.leave_date, la.created_at::date),
  COALESCE(la.reviewed_at, la.created_at),
  la.created_at;
