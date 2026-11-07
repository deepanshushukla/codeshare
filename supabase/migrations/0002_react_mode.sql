alter table sessions
  add column session_type text not null default 'web',
  add column app_jsx text not null default '',
  add column components_jsx text not null default '',
  add column react_css text not null default '';

alter table sessions
  add constraint session_type_valid check (session_type in ('web', 'react')),
  add constraint app_jsx_length check (char_length(app_jsx) < 200000),
  add constraint components_jsx_length check (char_length(components_jsx) < 200000),
  add constraint react_css_length check (char_length(react_css) < 200000);
