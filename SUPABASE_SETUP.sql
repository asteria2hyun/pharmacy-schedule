create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_state (id, data)
values ('shared_schedule', '{}')
on conflict (id) do nothing;

alter table public.app_state enable row level security;

drop policy if exists app_state_shared_read on public.app_state;
drop policy if exists app_state_shared_insert on public.app_state;
drop policy if exists app_state_shared_update on public.app_state;

create policy app_state_shared_read
on public.app_state
for select
to anon
using (id = 'shared_schedule');

create policy app_state_shared_insert
on public.app_state
for insert
to anon
with check (id = 'shared_schedule');

create policy app_state_shared_update
on public.app_state
for update
to anon
using (id = 'shared_schedule')
with check (id = 'shared_schedule');

grant usage on schema public to anon;
grant select, insert, update on public.app_state to anon;
