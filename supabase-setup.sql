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

-- Push-Mitteilungen: welche Geräte benachrichtigt werden wollen
create table if not exists push_subscriptions (
  endpoint text primary key,
  email text not null,
  p256dh text not null,
  auth text not null,
  user_agent text default '',
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own on push_subscriptions;
create policy push_own on push_subscriptions for all to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email') or is_admin())
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- Schlüsselpaar für Push (legt der Dienst "notify" selbst an; für Seitenbesucher gesperrt – keine Policy)
create table if not exists push_config (
  id int primary key default 1,
  public_key text not null,
  private_key text not null
);
alter table push_config enable row level security;

-- Techniker sehen, wer am selben Tag mit im Einsatz ist (nur Name, Tag, Status)
create or replace function my_colleagues() returns table(slot_key text, name text, status text)
language sql stable security definer set search_path = public as $$
  select a.slot_key, t.name, a.status
    from assignments a join technicians t on t.id = a.tech_id
   where a.status in ('angefragt', 'zugesagt')
     and a.tech_id is distinct from my_tech_id()
     and split_part(a.slot_key, '#', 1) in (select split_part(slot_key, '#', 1) from assignments where tech_id = my_tech_id() and status in ('angefragt', 'zugesagt'));
$$;
grant execute on function my_colleagues() to authenticated;
