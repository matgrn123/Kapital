-- T20g : prêts bancaires + échéanciers

set statement_timeout = '60s';

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  capital_initial_centimes bigint not null check (capital_initial_centimes > 0),
  capital_restant_centimes bigint not null,
  taux_annuel numeric not null check (taux_annuel >= 0),
  duree_mois integer not null check (duree_mois > 0),
  instant_debut timestamptz not null default now(),
  statut text not null default 'actif' check (statut in ('actif', 'solde', 'defaut')),
  cree_le timestamptz not null default now()
);
create index if not exists loans_company_id_idx on public.loans(company_id);
alter table public.loans enable row level security;
drop policy if exists "loans_select_own" on public.loans;
create policy "loans_select_own"
  on public.loans for select
  using (exists (select 1 from public.companies c where c.id = loans.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "loans_insert_own" on public.loans;
create policy "loans_insert_own"
  on public.loans for insert
  with check (exists (select 1 from public.companies c where c.id = loans.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "loans_update_own" on public.loans;
create policy "loans_update_own"
  on public.loans for update
  using (exists (select 1 from public.companies c where c.id = loans.company_id and c.owner_profile_id = auth.uid()));

create table if not exists public.loan_schedules (
  loan_id uuid not null references public.loans(id) on delete cascade,
  numero integer not null check (numero >= 1),
  mensualite_centimes bigint not null,
  interets_centimes bigint not null,
  amortissement_centimes bigint not null,
  capital_restant_apres_centimes bigint not null,
  instant_prevu timestamptz not null,
  statut text not null default 'a_venir' check (statut in ('a_venir', 'payee')),
  primary key (loan_id, numero)
);
create index if not exists loan_schedules_instant_idx on public.loan_schedules(instant_prevu);
alter table public.loan_schedules enable row level security;
drop policy if exists "loan_schedules_select_own" on public.loan_schedules;
create policy "loan_schedules_select_own"
  on public.loan_schedules for select
  using (exists (
    select 1 from public.loans l join public.companies c on c.id = l.company_id
    where l.id = loan_schedules.loan_id and c.owner_profile_id = auth.uid()
  ));
drop policy if exists "loan_schedules_insert_own" on public.loan_schedules;
create policy "loan_schedules_insert_own"
  on public.loan_schedules for insert
  with check (exists (
    select 1 from public.loans l join public.companies c on c.id = l.company_id
    where l.id = loan_schedules.loan_id and c.owner_profile_id = auth.uid()
  ));
