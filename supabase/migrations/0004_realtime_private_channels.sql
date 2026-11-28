create policy "session channel visibility matches room visibility (read)"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'session:%'
  and exists (
    select 1 from public.sessions s
    where s.id = substring(realtime.topic() from 9)   -- 'session:' is 8 characters
      and (not s.is_private or s.owner_id = auth.uid())
  )
);

create policy "session channel visibility matches room visibility (write)"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'session:%'
  and exists (
    select 1 from public.sessions s
    where s.id = substring(realtime.topic() from 9)   -- 'session:' is 8 characters
      and (not s.is_private or s.owner_id = auth.uid())
  )
);
