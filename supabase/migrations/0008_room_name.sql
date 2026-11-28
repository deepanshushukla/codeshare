-- A name the creator can give a room when making it (optional, skippable).
-- Kept apart from `title`, which is re-derived from the code on every
-- structural edit (titleFromCode): a chosen name must survive those writes.
-- Empty means "no name given" -- the derived title is shown instead.
alter table public.sessions
  add column name text not null default ''
  constraint sessions_name_length check (char_length(name) <= 80);
