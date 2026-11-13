-- ---------------------------------------------------------------------------
-- v32: mehrere Excel-Listen parallel (z. B. 2026 und 2027)
-- excel_sync/excel_file bekommen weitere Zeilen (id 2, 3 …) statt nur id = 1.
-- ---------------------------------------------------------------------------
do $$ declare c record; begin
  for c in select conname, conrelid::regclass::text as t from pg_constraint
           where contype = 'c' and conrelid in ('public.excel_sync'::regclass, 'public.excel_file'::regclass)
             and pg_get_constraintdef(oid) ilike '%id = 1%'
  loop execute format('alter table %s drop constraint %I', c.t, c.conname); end loop;
end $$;
alter table public.excel_sync add column if not exists label text;
update public.excel_sync set label = '2026' where id = 1 and label is null;
-- Liste 2027 (Link von Jens):
insert into public.excel_sync (id, share_url, label)
values (2, 'https://kom27-my.sharepoint.com/:x:/g/personal/jens_neumann-cornelius_kom27_de/IQCLw52ftmymRoCgeRI5BiA9AegdiTX5jrShw0xw8hfgQwU?e=gMoMRL', '2027')
on conflict (id) do update set share_url = excluded.share_url, label = excluded.label;
