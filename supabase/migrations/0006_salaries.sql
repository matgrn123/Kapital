-- T20e : salariés

set statement_timeout = '60s';

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  poste text not null check (poste in ('artisan', 'encadrement')),
  salaire_brut_mensuel_centimes bigint not null check (salaire_brut_mensuel_centimes > 0),
  anciennete_mois_debut integer not null default 0,
  experience_mois_debut integer not null default 0,
  cree_le timestamptz not null default now(),
  statut text not null default 'actif' check (statut in ('actif', 'licencie'))
);
create index if not exists employees_company_id_idx on public.employees(company_id);
alter table public.employees enable row level security;
drop policy if exists "employees_select_own" on public.employees;
create policy "employees_select_own"
  on public.employees for select
  using (exists (select 1 from public.companies c where c.id = employees.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "employees_insert_own" on public.employees;
create policy "employees_insert_own"
  on public.employees for insert
  with check (exists (select 1 from public.companies c where c.id = employees.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "employees_update_own" on public.employees;
create policy "employees_update_own"
  on public.employees for update
  using (exists (select 1 from public.companies c where c.id = employees.company_id and c.owner_profile_id = auth.uid()));
