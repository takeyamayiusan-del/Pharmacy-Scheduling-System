-- Fix bad Sunday work shifts written by buggy swap / overrides.
-- Sundays are fixed store rest (X). Delete non-X overrides so base logic applies.
--
-- Review first:
--   SELECT u.name, s.date, s.shift_code
--   FROM schedule_entries s
--   JOIN users u ON u.id = s.user_id
--   WHERE EXTRACT(DOW FROM s.date) = 0
--     AND s.shift_code <> 'X'
--   ORDER BY s.date, u.name;
--
-- Then run:

DELETE FROM schedule_entries
WHERE EXTRACT(DOW FROM date) = 0
  AND shift_code <> 'X';
