alter table sessions
  add column owner_id uuid references auth.users(id) on delete set null,
  add column is_private boolean not null default false,
  add column title text not null default '';

drop policy "anyone authenticated can read sessions" on sessions;
drop policy "anyone authenticated can insert sessions" on sessions;
drop policy "anyone authenticated can update sessions" on sessions;

create policy "read public or own sessions"
  on sessions for select
  to authenticated
  using (not is_private or owner_id = auth.uid());

create policy "insert sessions, private only when truly owned"
  on sessions for insert
  to authenticated
  with check (
    auth.role() = 'authenticated'
    and (
      not is_private
      or (owner_id = auth.uid()
          and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
    )
  );

create policy "update own or public sessions"
  on sessions for update
  to authenticated
  using (not is_private or owner_id = auth.uid())
  with check (
    not is_private
    or (owner_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  );

-- `with check` only sees the new row, so it can't tell a legitimate owner's
-- privacy toggle apart from a stranger hijacking a public/ownerless room by
-- flipping is_private/owner_id in the same statement. A before-update trigger
-- can compare old vs new and block any such ownership/privacy change unless
-- the caller is already the row's current owner.
create or replace function prevent_session_ownership_hijack()
returns trigger
language plpgsql as $$
begin
  if (new.owner_id is distinct from old.owner_id
      or new.is_private is distinct from old.is_private)
     and not (old.owner_id is not null and old.owner_id = auth.uid()) then
    raise exception 'cannot change ownership or privacy of a session you do not own';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_prevent_ownership_hijack on sessions;
create trigger sessions_prevent_ownership_hijack
  before update on sessions
  for each row
  execute function prevent_session_ownership_hijack();

create or replace function session_visibility(p_id text)
returns table (exists_ bool, is_private bool, owner_id uuid, session_type text)
language sql security definer set search_path = '' as $$
  select true, is_private, owner_id, session_type from public.sessions where id = p_id
  union all
  select false, false, null, null where not exists (select 1 from public.sessions where id = p_id)
  limit 1;
$$;

revoke execute on function session_visibility(text) from public, anon;
grant execute on function session_visibility(text) to authenticated;
