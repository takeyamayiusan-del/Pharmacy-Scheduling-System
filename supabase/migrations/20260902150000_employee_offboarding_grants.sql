-- employee_offboarding 建表時漏了 GRANT，導致 authenticated / service_role 無法存取

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_offboarding TO authenticated;
GRANT ALL ON public.employee_offboarding TO service_role;
