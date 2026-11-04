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

-- Arbeitszeiten: Techniker bestätigen Beginn/Ende/Pause ihrer zugesagten Einsätze
alter table assignments add column if not exists actual_start text;
alter table assignments add column if not exists actual_end text;
alter table assignments add column if not exists break_min int;
alter table assignments add column if not exists time_note text default '';
alter table assignments add column if not exists time_at timestamptz;

create or replace function log_time(p_slot text, p_start text, p_end text, p_break int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_start !~ '^\d{1,2}:\d{2}$' or p_end !~ '^\d{1,2}:\d{2}$' then raise exception 'Ungültige Uhrzeit'; end if;
  if p_break is null or p_break < 0 or p_break > 600 then raise exception 'Ungültige Pause'; end if;
  update assignments
     set actual_start = p_start, actual_end = p_end, break_min = p_break, time_note = coalesce(left(p_note, 300), ''), time_at = now()
   where slot_key = p_slot and tech_id = my_tech_id() and status = 'zugesagt';
  if not found then raise exception 'Kein zugesagter Einsatz gefunden'; end if;
end $$;
grant execute on function log_time(text, text, text, int, text) to authenticated;

-- Offene Einsätze ausschreiben: Techniker melden „Ich hätte Zeit“
create table if not exists offers (
  slot_key text primary key,
  note text default '',
  created_at timestamptz default now()
);
create table if not exists offer_interest (
  slot_key text references offers(slot_key) on delete cascade,
  tech_id uuid references technicians(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (slot_key, tech_id)
);
alter table offers enable row level security;
alter table offer_interest enable row level security;
drop policy if exists offers_read on offers;
create policy offers_read on offers for select to authenticated using (true);
drop policy if exists offers_admin on offers;
create policy offers_admin on offers for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists oi_read on offer_interest;
create policy oi_read on offer_interest for select to authenticated using (is_admin() or tech_id = my_tech_id());
drop policy if exists oi_ins on offer_interest;
create policy oi_ins on offer_interest for insert to authenticated with check (tech_id = my_tech_id() or is_admin());
drop policy if exists oi_upd on offer_interest;
create policy oi_upd on offer_interest for update to authenticated using (tech_id = my_tech_id() or is_admin()) with check (tech_id = my_tech_id() or is_admin());
drop policy if exists oi_del on offer_interest;
create policy oi_del on offer_interest for delete to authenticated using (tech_id = my_tech_id() or is_admin());

do $$
declare t text;
begin
  foreach t in array array['offers','offer_interest'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Projektleiter-Freigabe: Techniker mit eigenem Chef
alter table technicians add column if not exists company text default '';
alter table technicians add column if not exists manager_email text;
alter table assignments add column if not exists tech_reply text;
alter table assignments add column if not exists tech_reply_note text default '';
alter table assignments add column if not exists tech_reply_at timestamptz;

create or replace function my_managed_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from technicians where coalesce(manager_email, '') <> '' and lower(manager_email) = lower(auth.jwt() ->> 'email');
$$;
grant execute on function my_managed_ids() to authenticated;

drop policy if exists tech_read on technicians;
create policy tech_read on technicians for select to authenticated using (is_admin() or id = my_tech_id() or id in (select my_managed_ids()));
drop policy if exists asg_read on assignments;
create policy asg_read on assignments for select to authenticated using (is_admin() or tech_id = my_tech_id() or tech_id in (select my_managed_ids()));
drop policy if exists unav_read on unavailability;
create policy unav_read on unavailability for select to authenticated using (is_admin() or tech_id = my_tech_id() or tech_id in (select my_managed_ids()));
drop policy if exists unav_write on unavailability;
create policy unav_write on unavailability for all to authenticated
  using (is_admin() or tech_id = my_tech_id() or tech_id in (select my_managed_ids()))
  with check (is_admin() or tech_id = my_tech_id() or tech_id in (select my_managed_ids()));

-- Zusagen: Techniker ohne Chef selbst, sonst nur sein Projektleiter
create or replace function respond(p_slot text, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('zugesagt','abgesagt') then raise exception 'Ungültiger Status'; end if;
  update assignments a
     set status = p_status,
         note = coalesce(p_note, ''),
         updated_at = now(),
         declined = case when p_status = 'abgesagt' then array_append(a.declined, a.tech_id) else a.declined end
   where a.slot_key = p_slot
     and ((a.tech_id = my_tech_id() and not exists (select 1 from technicians t where t.id = a.tech_id and coalesce(t.manager_email, '') <> ''))
          or a.tech_id in (select my_managed_ids()));
  if not found then raise exception 'Kein Einsatz gefunden oder keine Berechtigung'; end if;
end $$;

-- Techniker mit Chef: unverbindliche Rückmeldung „könnte / kann nicht“
create or replace function tech_signal(p_slot text, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update assignments
     set tech_reply = case when p_ok then 'kann' else 'kann_nicht' end, tech_reply_note = coalesce(left(p_note, 300), ''), tech_reply_at = now()
   where slot_key = p_slot and tech_id = my_tech_id() and status in ('angefragt', 'geplant');
  if not found then raise exception 'Kein offener Einsatz gefunden'; end if;
end $$;
grant execute on function tech_signal(text, boolean, text) to authenticated;

-- Kalender-Abo: persönlicher Schlüssel je Techniker (kann in der App erneuert werden)
alter table technicians add column if not exists cal_token uuid default gen_random_uuid();
update technicians set cal_token = gen_random_uuid() where cal_token is null;
create or replace function new_cal_token() returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid := gen_random_uuid();
begin
  update technicians set cal_token = t where id = my_tech_id();
  if not found then raise exception 'Kein Techniker-Zugang'; end if;
  return t;
end $$;
grant execute on function new_cal_token() to authenticated;

-- Erinnerung am Vortag: Zeitplan ruft jeden Abend den Dienst „notify“ auf
create table if not exists cron_config (
  id int primary key default 1,
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  remind_last text
);
insert into cron_config (id) values (1) on conflict do nothing;
alter table cron_config enable row level security; -- keine Policy: nur der Server-Dienst darf lesen

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ===== v6: VA-Kalender automatisch von SharePoint abholen =====
create table if not exists excel_sync (
  id int primary key default 1 check (id = 1),
  share_url text, hash text, fetched_at timestamptz, changed_at timestamptz, last_try timestamptz, last_error text
);
create table if not exists excel_file (id int primary key default 1 check (id = 1), hash text, b64 text, fetched_at timestamptz);
alter table excel_sync enable row level security;
alter table excel_file enable row level security;
drop policy if exists sync_admin on excel_sync;
create policy sync_admin on excel_sync for all using (is_admin()) with check (is_admin());
drop policy if exists file_admin on excel_file;
create policy file_admin on excel_file for select using (is_admin());
insert into excel_sync (id) values (1) on conflict do nothing;
do $$ begin
  alter publication supabase_realtime add table excel_sync;
exception when others then null; end $$;

-- Zeitpläne: Erinnerung jeden Abend (17:00 UTC), SharePoint-Abgleich stündlich zwischen 5 und 21 Uhr UTC
do $$ begin perform cron.unschedule(jobid) from cron.job where jobname in ('kom27-erinnerung', 'kom27-excel'); end $$;
select cron.schedule('kom27-erinnerung', '0 17 * * *', $cmd$ select net.http_post(url := 'https://jnwcmusamhijctwjyfbh.supabase.co/functions/v1/notify', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON-KEY aus config.js>', 'apikey', '<ANON-KEY aus config.js>', 'x-kom27-cron', (select secret from public.cron_config where id = 1)), body := '{"action":"remind"}'::jsonb); $cmd$);
select cron.schedule('kom27-excel', '7 5-21 * * *', $cmd$ select net.http_post(url := 'https://jnwcmusamhijctwjyfbh.supabase.co/functions/v1/excel-sync', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON-KEY aus config.js>', 'apikey', '<ANON-KEY aus config.js>', 'x-kom27-cron', (select secret from public.cron_config where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 60000); $cmd$);

-- ===== v8: KOM27-Infos (gemeinsame Wissenssammlung) =====
create table if not exists public.kb_entries (
  id uuid primary key default gen_random_uuid(),
  cat text not null default 'sonst',
  title text not null check (length(title) between 1 and 200),
  body text not null default '',
  login_user text not null default '',
  login_pass text not null default '',
  pinned boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.kb_entries enable row level security;
-- Wer schreibt/ändert, setzt der Server – nicht die App. Anheften darf nur der Master.
create or replace function public.kb_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if tg_op = 'INSERT' then
    new.created_by := me; new.created_at := now();
    if not is_admin() then new.pinned := false; end if;
  else
    new.created_by := old.created_by; new.created_at := old.created_at;
    if not is_admin() then new.pinned := old.pinned; end if;
  end if;
  new.updated_by := me; new.updated_at := now();
  return new;
end $$;
drop trigger if exists kb_stamp on public.kb_entries;
create trigger kb_stamp before insert or update on public.kb_entries for each row execute function public.kb_stamp();
drop policy if exists kb_read on public.kb_entries;
create policy kb_read on public.kb_entries for select to authenticated using (is_admin() or my_tech_id() is not null);
drop policy if exists kb_insert on public.kb_entries;
create policy kb_insert on public.kb_entries for insert to authenticated with check (is_admin() or my_tech_id() is not null);
drop policy if exists kb_update on public.kb_entries;
create policy kb_update on public.kb_entries for update to authenticated using (is_admin() or my_tech_id() is not null) with check (is_admin() or my_tech_id() is not null);
drop policy if exists kb_delete on public.kb_entries;
create policy kb_delete on public.kb_entries for delete to authenticated using (is_admin() or lower(created_by) = lower(auth.jwt() ->> 'email'));
revoke execute on function public.kb_stamp() from public, anon, authenticated;
do $$ begin alter publication supabase_realtime add table public.kb_entries; exception when others then null; end $$;

-- ===== v9: KOM27-Zugänge (Jens, Felix) – alle Termine ansehen, nichts zusagen =====
create table if not exists public.kom_viewers (
  email text primary key check (email = lower(email)),
  name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.kom_viewers enable row level security;
drop policy if exists kv_admin on public.kom_viewers;
create policy kv_admin on public.kom_viewers for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists kv_self on public.kom_viewers;
create policy kv_self on public.kom_viewers for select to authenticated using (email = lower(auth.jwt() ->> 'email'));
create or replace function public.is_viewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from kom_viewers where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke execute on function public.is_viewer() from public, anon;
grant execute on function public.is_viewer() to authenticated;
-- Nur Name + Status je Platz – keine E-Mails, Kalender-Schlüssel oder Abwesenheiten der Techniker
create or replace function public.kom_overview() returns table (slot_key text, status text, name text)
language sql stable security definer set search_path = public as $$
  select a.slot_key, a.status, t.name from assignments a join technicians t on t.id = a.tech_id
  where (is_viewer() or is_admin()) and a.status in ('zugesagt', 'angefragt');
$$;
revoke execute on function public.kom_overview() from public, anon;
grant execute on function public.kom_overview() to authenticated;
drop policy if exists kb_read on public.kb_entries;
create policy kb_read on public.kb_entries for select to authenticated using (is_admin() or my_tech_id() is not null or is_viewer());
drop policy if exists kb_insert on public.kb_entries;
create policy kb_insert on public.kb_entries for insert to authenticated with check (is_admin() or my_tech_id() is not null or is_viewer());
drop policy if exists kb_update on public.kb_entries;
create policy kb_update on public.kb_entries for update to authenticated using (is_admin() or my_tech_id() is not null or is_viewer()) with check (is_admin() or my_tech_id() is not null or is_viewer());

-- ===================== v10: Konto selbst löschen (Art. 17 DSGVO) =====================
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then raise exception 'nicht angemeldet'; end if;
  select lower(email) into mail from auth.users where id = uid;
  delete from public.push_subscriptions where lower(email) = mail;
  delete from auth.users where id = uid;
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ===================== v12: Zugesagte Einsätze nur mit Freigabe absagen =====================
create or replace function public.respond(p_slot text, p_status text, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_status not in ('zugesagt','abgesagt') then raise exception 'Ungültiger Status'; end if;
  update assignments a
     set status = p_status, note = coalesce(p_note, ''), updated_at = now(),
         declined = case when p_status = 'abgesagt' then array_append(a.declined, a.tech_id) else a.declined end
   where a.slot_key = p_slot
     and ((a.tech_id = my_tech_id() and a.status <> 'zugesagt'
           and not exists (select 1 from technicians t where t.id = a.tech_id and coalesce(t.manager_email, '') <> ''))
          or a.tech_id in (select my_managed_ids()));
  if not found then raise exception 'Kein Einsatz gefunden oder keine Berechtigung (zugesagte Einsätze gibt die Planung frei)'; end if;
end $function$;
create or replace function public.request_cancel(p_slot text, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  update assignments set tech_reply = 'absage_wunsch', tech_reply_note = coalesce(left(p_note, 300), ''), tech_reply_at = now()
   where slot_key = p_slot and tech_id = my_tech_id() and status = 'zugesagt';
  if not found then raise exception 'Kein zugesagter Einsatz gefunden'; end if;
end $function$;
revoke all on function public.request_cancel(text, text) from public, anon;
grant execute on function public.request_cancel(text, text) to authenticated;

-- ===================== v13: „Kann nicht“ muss der Master bestätigen =====================
alter table public.unavailability add column if not exists confirmed boolean not null default false;
create or replace function public.unav_confirm_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then new.confirmed := false; end if;
  return new;
end; $$;
drop trigger if exists unav_confirm_guard on public.unavailability;
create trigger unav_confirm_guard before insert or update on public.unavailability for each row execute function public.unav_confirm_guard();
