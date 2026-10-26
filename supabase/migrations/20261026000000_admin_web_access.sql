-- ============================================================================
-- Counterly — Admin Dashboard & Web Module Access Control (ADMIN_SETUP.sql)
-- ============================================================================
-- WHAT THIS DOES
--   * Adds web-module access control to the EXISTING Counterly Supabase
--     project (the same `pos-pro` project used by the mobile app).
--   * Adds profiles.email + profiles.last_activity_at (additive columns only).
--   * Creates 3 new tables, all locked down by Row Level Security (RLS):
--       - public.platform_admins       (who is a platform administrator)
--       - public.user_module_access    (per-user web access, default OFF)
--       - public.web_access_audit_log  (audit trail of grant / revoke actions)
--   * Creates SECURITY DEFINER RPC functions. ALL privileged reads/writes go
--     through these functions. There is NO service_role key anywhere in the
--     web portal, and there are NO insert/update/delete RLS policies on the
--     access tables for normal users, so a user can never grant themselves
--     (or anyone else) web access through the API or a direct database call.
--   * Admin-only functions (admin_list_users, admin_set_web_access,
--     admin_set_web_access_by_email, admin_audit_log) raise 'Not authorized'
--     unless the caller is in public.platform_admins.
--
-- MOBILE APP — COMPLETELY UNAFFECTED
--   * This script does NOT change any existing table, existing RLS policy,
--     existing RPC, or the authentication system used by the mobile app.
--   * Web access (user_module_access.web_access_enabled) is checked ONLY by
--     the web portal (at login and in the protected web layout). The mobile
--     app never reads these tables, so disabling web access can never
--     disable, suspend, or restrict mobile app access.
--   * The only existing object replaced is handle_new_user() (the signup
--     trigger function). The replacement keeps its original behaviour
--     (creates the profile row) and additionally stores the email and
--     creates a default-OFF web access row for the new user.
--
-- HOW ADMIN BOOTSTRAP WORKS
--   * At the bottom of this script, IF public.platform_admins is empty,
--     the earliest-registered user (oldest auth.users.created_at) is made
--     the first platform admin and is granted web access. This only runs
--     when there is no admin yet, so re-running this script is safe and
--     will never add another admin by itself.
--   * To add another admin later, use the commented example SQL at the
--     very bottom of this file (run it in the Supabase SQL Editor).
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. It is idempotent: safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Additive columns on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists last_activity_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. platform_admins — who is a platform administrator
--    RLS enabled with NO policies: authenticated/anon get nothing.
--    Only SECURITY DEFINER functions and the SQL Editor (owner) can touch it.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

-- ---------------------------------------------------------------------------
-- 3. user_module_access — per-user web module access (default OFF)
--    RLS: a user may SELECT only their own row. There are deliberately NO
--    insert/update/delete policies for authenticated users.
-- ---------------------------------------------------------------------------
create table if not exists public.user_module_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  web_access_enabled boolean not null default false,
  access_updated_at timestamptz,
  access_updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_module_access enable row level security;
drop policy if exists user_module_access_select_own on public.user_module_access;
create policy user_module_access_select_own on public.user_module_access
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. web_access_audit_log — every grant/revoke performed by an admin
--    RLS enabled with NO policies: only definer functions can read/write it.
-- ---------------------------------------------------------------------------
create table if not exists public.web_access_audit_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid,
  target_email text,
  action text not null check (action in ('granted', 'revoked')),
  performed_by uuid,
  performed_by_email text,
  created_at timestamptz not null default now()
);
alter table public.web_access_audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- 5. is_platform_admin()
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- 6. handle_new_user() — keep original behaviour, also store email and
--    create a default-OFF web access row. Mobile signup flow is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;

  if new.email is not null then
    insert into public.user_module_access(user_id, email)
    values (new.id, new.email)
    on conflict (user_id) do nothing;
  end if;

  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Backfill existing users (profiles.email + access rows)
-- ---------------------------------------------------------------------------
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email = '');

insert into public.user_module_access(user_id, email)
select id, email from auth.users where email is not null
on conflict (user_id) do nothing;

-- Fallback for any profile that has an email but no matching auth.users join.
insert into public.user_module_access(user_id, email)
select id, email from public.profiles where email is not null and email <> ''
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Admin bootstrap: ONLY when platform_admins is empty, the
--    earliest-registered user becomes the first admin and gets web access.
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin_id uuid;
  v_admin_email text;
begin
  if exists (select 1 from public.platform_admins) then
    return;
  end if;

  select id, email into v_admin_id, v_admin_email
  from auth.users
  order by created_at asc
  limit 1;

  if v_admin_id is null then
    return;
  end if;

  insert into public.platform_admins(user_id, email)
  values (v_admin_id, v_admin_email)
  on conflict (user_id) do nothing;

  if v_admin_email is not null then
    insert into public.user_module_access(user_id, email, web_access_enabled, access_updated_at, updated_at)
    values (v_admin_id, v_admin_email, true, now(), now())
    on conflict (user_id) do update
      set web_access_enabled = true,
          access_updated_at = now(),
          updated_at = now();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. get_my_access() — what the web portal checks at login / per session.
--    Platform admins always have web access.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_access()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_is_admin boolean;
  v_enabled boolean;
  v_has_row boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid;
  v_is_admin := public.is_platform_admin();
  select web_access_enabled into v_enabled
  from public.user_module_access where user_id = v_uid;
  v_has_row := v_enabled is not null;
  v_enabled := coalesce(v_enabled, false);

  return jsonb_build_object(
    'email', coalesce(v_email, ''),
    'is_admin', coalesce(v_is_admin, false),
    'web_access_enabled', (coalesce(v_is_admin, false) or v_enabled),
    'has_access_row', v_has_row
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 10. touch_my_activity() — the web portal calls this after a successful
--     login / during use. (Mobile activity is represented separately, e.g.
--     by sales rows; see admin_list_users.)
-- ---------------------------------------------------------------------------
create or replace function public.touch_my_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.profiles set last_activity_at = now() where id = auth.uid();
end
$$;

-- ---------------------------------------------------------------------------
-- 11. admin_list_users() — admin-only user analytics.
--     last_activity_at = greatest(profile activity, latest sale by the user)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(t.row_obj order by t.registered_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      u.created_at as registered_at,
      jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'full_name', coalesce(p.full_name, ''),
        'registered_at', u.created_at,
        'last_login_at', u.last_sign_in_at,
        'last_activity_at', greatest(
          p.last_activity_at,
          (select max(s.created_at) from public.sales s where s.cashier_id = u.id)
        ),
        'stores_count', (select count(*) from public.store_members sm where sm.user_id = u.id),
        'web_access_enabled', coalesce(a.web_access_enabled, false),
        'access_updated_at', a.access_updated_at,
        'access_updated_by', a.access_updated_by,
        'is_admin', exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
      ) as row_obj
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_module_access a on a.user_id = u.id
  ) t;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------------
-- 12. admin_set_web_access(p_target_user_id, p_enabled) — admin-only.
--     Upserts the access row and writes an audit log entry.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_web_access(p_target_user_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_performer_email text;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select email into v_email from auth.users where id = p_target_user_id;
  if v_email is null then
    select email into v_email from public.profiles where id = p_target_user_id;
  end if;
  if v_email is null then
    raise exception 'User not found';
  end if;

  select email into v_performer_email from auth.users where id = auth.uid();

  insert into public.user_module_access(
    user_id, email, web_access_enabled, access_updated_at, access_updated_by, created_at, updated_at
  )
  values (p_target_user_id, v_email, p_enabled, now(), auth.uid(), now(), now())
  on conflict (user_id) do update
    set email = excluded.email,
        web_access_enabled = excluded.web_access_enabled,
        access_updated_at = now(),
        access_updated_by = auth.uid(),
        updated_at = now();

  insert into public.web_access_audit_log(target_user_id, target_email, action, performed_by, performed_by_email)
  values (
    p_target_user_id,
    v_email,
    case when p_enabled then 'granted' else 'revoked' end,
    auth.uid(),
    v_performer_email
  );

  return jsonb_build_object('user_id', p_target_user_id, 'web_access_enabled', p_enabled);
end
$$;

-- ---------------------------------------------------------------------------
-- 13. admin_set_web_access_by_email(p_email, p_enabled) — admin-only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_web_access_by_email(p_email text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'No registered user with that email';
  end if;

  return public.admin_set_web_access(v_user_id, p_enabled);
end
$$;

-- ---------------------------------------------------------------------------
-- 14. admin_audit_log(p_limit) — admin-only, latest first.
-- ---------------------------------------------------------------------------
create or replace function public.admin_audit_log(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(t.row_obj order by t.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      l.created_at,
      jsonb_build_object(
        'id', l.id,
        'target_user_id', l.target_user_id,
        'target_email', l.target_email,
        'action', l.action,
        'performed_by', l.performed_by,
        'performed_by_email', l.performed_by_email,
        'created_at', l.created_at
      ) as row_obj
    from public.web_access_audit_log l
    order by l.created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
  ) t;

  return v_result;
end
$$;

-- ---------------------------------------------------------------------------
-- 15. Execute grants — authenticated only, never public/anon.
-- ---------------------------------------------------------------------------
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to authenticated;

revoke all on function public.touch_my_activity() from public;
grant execute on function public.touch_my_activity() to authenticated;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

revoke all on function public.admin_set_web_access(uuid, boolean) from public;
grant execute on function public.admin_set_web_access(uuid, boolean) to authenticated;

revoke all on function public.admin_set_web_access_by_email(text, boolean) from public;
grant execute on function public.admin_set_web_access_by_email(text, boolean) to authenticated;

revoke all on function public.admin_audit_log(int) from public;
grant execute on function public.admin_audit_log(int) to authenticated;

-- ============================================================================
-- ADD ANOTHER ADMIN LATER (example — run in the Supabase SQL Editor)
-- ============================================================================
-- Replace the email below with the registered user's email, then run:
--
-- insert into public.platform_admins(user_id, email)
-- select id, email from auth.users where lower(email) = lower('other-admin@example.com')
-- on conflict (user_id) do nothing;
--
-- Platform admins always pass the web access check (see get_my_access()).
-- ============================================================================
