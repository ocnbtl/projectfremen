-- Remove direct API-role access to infrastructure trigger functions and pin
-- the existing updated-at trigger to a trusted function lookup path.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    execute 'alter function public.set_updated_at() set search_path = pg_catalog';
    execute 'revoke all on function public.set_updated_at() from public, anon, authenticated';
    execute 'grant execute on function public.set_updated_at() to service_role';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
    execute 'grant execute on function public.rls_auto_enable() to service_role';
  end if;
end;
$$;
