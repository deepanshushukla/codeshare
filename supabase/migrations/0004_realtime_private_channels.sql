create policy "session channel visibility matches room visibility (read)"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = replace(realtime.topic(), 'session:', '')
      and (not s.is_private or s.owner_id = auth.uid())
  )
);

create policy "session channel visibility matches room visibility (write)"
on realtime.messages
for insert
to authenticated
with check (
  exists (
    select 1 from public.sessions s
    where s.id = replace(realtime.topic(), 'session:', '')
      and (not s.is_private or s.owner_id = auth.uid())
  )
);
