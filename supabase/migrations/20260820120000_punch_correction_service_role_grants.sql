-- 打卡補登表若用 psql 補建，PostgREST / service_role 可能還沒權限，網站會一直送出失敗
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.punch_correction_requests TO authenticated;
GRANT ALL ON public.punch_correction_requests TO service_role;

NOTIFY pgrst, 'reload schema';
