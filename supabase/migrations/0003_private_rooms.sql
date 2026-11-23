alter table sessions
  add column owner_id uuid references auth.users(id) on delete set null,
  add column is_private boolean not null default false,
  add column title text not null default '';

drop policy "anyone authenticated can read sessions" on sessions;
drop policy "anyone authenticated can insert sessions" on sessions;
drop policy "anyone authenticated can update sessions" on sessions;

create policy "read public or own sessions"
  on sessions for select
  using (not is_private or owner_id = auth.uid());

create policy "insert sessions, private only when truly owned"
  on sessions for insert
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
  using (not is_private or owner_id = auth.uid())
  with check (
    not is_private
    or (owner_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  );

create or replace function session_visibility(p_id text)
returns table (exists_ bool, is_private bool, owner_id uuid, session_type text)
language sql security definer as $$
  select true, is_private, owner_id, session_type from sessions where id = p_id
  union all
  select false, false, null, null where not exists (select 1 from sessions where id = p_id)
  limit 1;
$$;

grant execute on function session_visibility(text) to authenticated;
