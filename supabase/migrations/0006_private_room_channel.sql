-- Cut already-connected viewers off when a room goes private.
--
-- Realtime evaluates the realtime.messages SELECT policy when a client
-- *joins* a channel, not per message, so a viewer who joined `session:<id>`
-- while the room was public kept receiving the owner's live edits after the
-- room went private (verified against the local stack). Sends are re-checked
-- per message, which is why only the read side leaked.
--
-- Fix: private rooms broadcast on a different topic, `session-private:<id>`,
-- which only the owner can join. When the owner makes a room private their
-- client moves to that topic, so a stale viewer is left subscribed to a topic
-- nobody sends on any more -- enforced by the server, not by the stale
-- client's good behaviour. `session-private:%` does not match the existing
-- `session:%` policies (0004), which keep governing the public topic.
create policy "private session channel is owner-only (read)"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'session-private:%'
  and exists (
    select 1 from public.sessions s
    where s.id = substring(realtime.topic() from 17)   -- 'session-private:' is 16 characters
      and s.owner_id = auth.uid()
  )
);

create policy "private session channel is owner-only (write)"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'session-private:%'
  and exists (
    select 1 from public.sessions s
    where s.id = substring(realtime.topic() from 17)   -- 'session-private:' is 16 characters
      and s.owner_id = auth.uid()
  )
);
