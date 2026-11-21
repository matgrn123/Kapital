-- T20f : jauges de marque + actions marketing

set statement_timeout = '60s';

create table if not exists public.brand_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  notoriete numeric not null default 0 check (notoriete between 0 and 100),
  desirabilite numeric not null default 0 check (desirabilite between 0 and 100),
  mise_a_jour_le timestamptz not null default now()
);
alter table public.brand_state enable row level security;
drop policy if exists "brand_state_select_own" on public.brand_state;
create policy "brand_state_select_own"
  on public.brand_state for select
  using (exists (select 1 from public.companies c where c.id = brand_state.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "brand_state_insert_own" on public.brand_state;
create policy "brand_state_insert_own"
  on public.brand_state for insert
  with check (exists (select 1 from public.companies c where c.id = brand_state.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "brand_state_update_own" on public.brand_state;
create policy "brand_state_update_own"
  on public.brand_state for update
  using (exists (select 1 from public.companies c where c.id = brand_state.company_id and c.owner_profile_id = auth.uid()));

create table if not exists public.marketing_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in ('publicite', 'image_marque', 'promotion', 'relations_presse')),
  montant_centimes bigint not null check (montant_centimes > 0),
  instant timestamptz not null default now(),
  cree_le timestamptz not null default now()
);
create index if not exists marketing_actions_company_id_idx on public.marketing_actions(company_id);
alter table public.marketing_actions enable row level security;
drop policy if exists "marketing_actions_select_own" on public.marketing_actions;
create policy "marketing_actions_select_own"
  on public.marketing_actions for select
  using (exists (select 1 from public.companies c where c.id = marketing_actions.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "marketing_actions_insert_own" on public.marketing_actions;
create policy "marketing_actions_insert_own"
  on public.marketing_actions for insert
  with check (exists (select 1 from public.companies c where c.id = marketing_actions.company_id and c.owner_profile_id = auth.uid()));
