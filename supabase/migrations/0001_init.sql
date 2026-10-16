create table sessions (
  id text primary key,
  html text not null default '',
  css text not null default '',
  js text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint html_length check (char_length(html) < 200000),
  constraint css_length check (char_length(css) < 200000),
  constraint js_length check (char_length(js) < 200000)
);

create table session_users (
  session_id text not null references sessions(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table sessions enable row level security;
alter table session_users enable row level security;

create policy "anyone authenticated can read sessions"
  on sessions for select using (auth.role() = 'authenticated');
create policy "anyone authenticated can insert sessions"
  on sessions for insert with check (auth.role() = 'authenticated');
create policy "anyone authenticated can update sessions"
  on sessions for update using (auth.role() = 'authenticated');

create policy "anyone authenticated can read session_users"
  on session_users for select using (auth.role() = 'authenticated');
create policy "users manage only their own presence row (insert)"
  on session_users for insert with check (auth.uid() = user_id);
create policy "users manage only their own presence row (update)"
  on session_users for update using (auth.uid() = user_id);
