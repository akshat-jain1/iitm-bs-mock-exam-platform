-- Custom Access Token Hook to inject user_role into JWT claims
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  user_role text;
begin
  -- Safely extract user_id and fetch role from public.users
  if (event->>'user_id') is not null then
    select role into user_role from public.users where id = (event->>'user_id')::uuid;
  end if;

  claims := coalesce(event->'claims', '{}'::jsonb);

  -- Only inject user_role claim when an authoritative profile row is found.
  -- If no row exists yet (e.g. IDs diverged before callback syncs by email),
  -- omit the claim entirely so the application falls back to the resilient DB lookup.
  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Grant required permissions to supabase_auth_admin
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on table public.users to supabase_auth_admin;

-- Revoke execute permissions from public/anon/authenticated to prevent unauthorized invocation
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
