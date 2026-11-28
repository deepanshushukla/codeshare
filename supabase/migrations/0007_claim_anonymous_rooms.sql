-- Let a visitor keep their rooms when they LOG IN to an existing account.
--
-- Every visitor starts as an anonymous user and owns the rooms they create
-- (0005). Signing up converts that anonymous user in place, so ownership
-- survives. Logging in to an existing account does not: it is a different
-- user id, so the rooms stayed owned by the now-abandoned anonymous id and the
-- owner lost their privacy switch.
--
-- Handover, in two steps, so only the anonymous user itself can authorise it:
--   1. While still anonymous, the client calls create_room_claim(), which
--      records a one-time token for auth.uid().
--   2. After logging in, the client calls claim_anonymous_rooms(token), which
--      moves every room that anonymous user owned to the new auth.uid(), and
--      can make one of them private in the same transaction (the "Private"
--      switch that started the login).
-- A token is single-use and expires after an hour. Nobody can mint one for an
-- anonymous id other than their own, so nobody can claim someone else's rooms.

create table public.room_claims (
  token uuid primary key default gen_random_uuid(),
  anon_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Only reachable through the two security-definer functions below.
alter table public.room_claims enable row level security;
revoke all on public.room_claims from anon, authenticated;

create or replace function public.create_room_claim()
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_token uuid;
begin
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false then
    raise exception 'only an anonymous user can create a room claim';
  end if;
  delete from public.room_claims
    where anon_user_id = auth.uid() or created_at < now() - interval '1 hour';
  insert into public.room_claims (anon_user_id) values (auth.uid()) returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.claim_anonymous_rooms(p_token uuid, p_make_private text default null)
returns setof text
language plpgsql security definer set search_path = '' as $$
declare
  v_anon uuid;
begin
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = true then
    raise exception 'log in to a real account to claim rooms';
  end if;

  delete from public.room_claims
    where token = p_token and created_at > now() - interval '1 hour'
    returning anon_user_id into v_anon;
  if v_anon is null or v_anon = auth.uid() then
    return;
  end if;

  return query
    update public.sessions
       set owner_id = auth.uid(),
           is_private = is_private or (p_make_private is not null and id = p_make_private)
     where owner_id = v_anon
    returning id;
end;
$$;

revoke execute on function public.create_room_claim() from public, anon;
revoke execute on function public.claim_anonymous_rooms(uuid, text) from public, anon;
grant execute on function public.create_room_claim() to authenticated;
grant execute on function public.claim_anonymous_rooms(uuid, text) to authenticated;

-- The hijack guard (0003) only lets a row's current owner change owner_id or
-- is_private, judged by auth.uid() -- which, inside claim_anonymous_rooms, is
-- the NEW owner, so the guard would refuse the handover. Trusted server-side
-- code runs as a privileged role (the security-definer function's owner, or
-- service_role), never as the API's `authenticated`/`anon` roles, so the
-- guard now applies only to those API roles. Every client request still runs
-- as `authenticated`/`anon` and is checked exactly as before.
create or replace function prevent_session_ownership_hijack()
returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.owner_id is distinct from old.owner_id
          or new.is_private is distinct from old.is_private)
     and not (old.owner_id is not null and old.owner_id = auth.uid()) then
    raise exception 'cannot change ownership or privacy of a session you do not own';
  end if;
  return new;
end;
$$;
