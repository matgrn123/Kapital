-- T18 : table market_data pour les données réelles (€STR, SMIC, inflation, etc.)
--
-- Chaque donnée a plusieurs valeurs successives (horodatées par date_effet).
-- On peut toujours requêter « la valeur de X applicable à la date Y » en
-- prenant la dernière avec date_effet <= Y.

set statement_timeout = '60s';

create table if not exists public.market_data (
  id uuid primary key default gen_random_uuid(),
  donnee text not null,
  valeur jsonb not null,
  source text not null,
  date_effet date not null,
  cree_le timestamptz not null default now(),
  cree_par uuid references public.profiles(id) on delete set null
);

create unique index if not exists market_data_donnee_date_unique
  on public.market_data(donnee, date_effet);

create index if not exists market_data_donnee_date_desc
  on public.market_data(donnee, date_effet desc);

alter table public.market_data enable row level security;

drop policy if exists "market_data_select_all" on public.market_data;
create policy "market_data_select_all"
  on public.market_data for select
  using (true);

drop policy if exists "market_data_write_admin" on public.market_data;
create policy "market_data_write_admin"
  on public.market_data for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Trigger : chaque modification va dans audit_log.
-- SECURITY DEFINER pour contourner la RLS d'audit_log (lecture admin uniquement,
-- insertion par le trigger est autorisée en tant qu'owner de la fonction).
create or replace function public.log_market_data_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (profile_id, action, cible, details)
  values (
    auth.uid(),
    tg_op,
    'market_data:' || coalesce(new.donnee, old.donnee),
    jsonb_build_object(
      'before', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'after', case when tg_op = 'DELETE' then null else to_jsonb(new) end
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists market_data_audit on public.market_data;
create trigger market_data_audit
after insert or update or delete on public.market_data
for each row execute function public.log_market_data_change();
