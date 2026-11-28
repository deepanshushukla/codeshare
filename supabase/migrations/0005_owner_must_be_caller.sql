-- Rooms now record their creator as owner_id even when that creator is an
-- anonymous user (signing up converts the anonymous user in place, keeping
-- the same id, so the creator can later make the room private). That makes
-- owner_id meaningful for public rooms too, so the insert policy must stop a
-- client from creating a room "owned" by somebody else: owner_id has to be
-- either null or the caller's own id. Private rooms keep their existing,
-- stricter rule (owned by the caller AND the caller is not anonymous).
--
-- Upserts that hit an existing row (content saves, privacy flips) take the
-- ON CONFLICT DO UPDATE path, which Postgres checks against the UPDATE policy
-- and the ownership trigger from 0003, not this INSERT check.
drop policy "insert sessions, private only when truly owned" on sessions;

create policy "insert sessions, owned by caller or nobody, private only when truly owned"
  on sessions for insert
  to authenticated
  with check (
    auth.role() = 'authenticated'
    and (owner_id is null or owner_id = auth.uid())
    and (
      not is_private
      or (owner_id = auth.uid()
          and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
    )
  );
