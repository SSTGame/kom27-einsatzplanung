-- KOM27 Einsatzplanung – einmalig im Supabase SQL Editor ausführen.
-- WICHTIG: In der letzten Zeile deine eigene E-Mail als Master eintragen.

create table if not exists admins (email text primary key);

create table if not exists plan (
  id int primary key default 1,
  data jsonb not null,
  imported_at timestamptz default now()
);

create table if not exists technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  aliases text default '',
  active boolean default true
);

create table if not exists assignments (
  slot_key text primary key,
  tech_id uuid references technicians(id) on delete cascade,
  status text not null default 'geplant' check (status in ('geplant','angefragt','zugesagt','abgesagt')),
  note text default '',
  declined uuid[] default '{}',
  requested_at timestamptz,
  updated_at timestamptz default now()
);

-- Hilfsfunktionen
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

create or replace function my_tech_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from technicians where lower(email) = lower(auth.jwt() ->> 'email') limit 1;
$$;

-- Techniker dürfen NUR ihre eigenen Einsätze beantworten
create or replace function respond(p_slot text, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('zugesagt','abgesagt') then raise exception 'Ungültiger Status'; end if;
  update assignments
     set status = p_status,
         note = coalesce(p_note, ''),
         updated_at = now(),
         declined = case when p_status = 'abgesagt' then array_append(declined, tech_id) else declined end
   where slot_key = p_slot and tech_id = my_tech_id();
  if not found then raise exception 'Kein Einsatz gefunden'; end if;
end $$;

grant execute on function is_admin(), my_tech_id(), respond(text, text, text) to authenticated;

-- Zugriffsregeln (Row Level Security)
alter table admins enable row level security;
alter table plan enable row level security;
alter table technicians enable row level security;
alter table assignments enable row level security;

drop policy if exists admins_read on admins;
create policy admins_read on admins for select to authenticated using (is_admin());

drop policy if exists plan_read on plan;
create policy plan_read on plan for select to authenticated using (true);
drop policy if exists plan_admin on plan;
create policy plan_admin on plan for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists tech_read on technicians;
create policy tech_read on technicians for select to authenticated using (is_admin() or id = my_tech_id());
drop policy if exists tech_admin on technicians;
create policy tech_admin on technicians for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists asg_read on assignments;
create policy asg_read on assignments for select to authenticated using (is_admin() or tech_id = my_tech_id());
drop policy if exists asg_admin on assignments;
create policy asg_admin on assignments for all to authenticated using (is_admin()) with check (is_admin());

-- >>> HIER deine Login-E-Mail als Master eintragen <<<
insert into admins (email) values ('DEINE-EMAIL@BEISPIEL.DE') on conflict do nothing;

-- Abwesenheiten: Techniker tragen selbst ein, wann sie nicht können
create table if not exists unavailability (
  tech_id uuid references technicians(id) on delete cascade,
  day date not null,
  note text default '',
  created_at timestamptz default now(),
  primary key (tech_id, day)
);
alter table unavailability enable row level security;
drop policy if exists unav_read on unavailability;
create policy unav_read on unavailability for select to authenticated using (is_admin() or tech_id = my_tech_id());
drop policy if exists unav_write on unavailability;
create policy unav_write on unavailability for all to authenticated using (is_admin() or tech_id = my_tech_id()) with check (is_admin() or tech_id = my_tech_id());

-- Live-Aktualisierung: Änderungen an diese Tabellen sofort an geöffnete Seiten melden
do $$
declare t text;
begin
  foreach t in array array['assignments','unavailability','technicians','plan'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
