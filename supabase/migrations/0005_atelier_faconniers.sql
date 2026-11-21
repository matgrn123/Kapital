-- T20d : atelier de l'entreprise, façonniers, ordres de production

set statement_timeout = '60s';

create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade unique,
  surface_m2 integer not null,
  loyer_mensuel_centimes bigint not null,
  nombre_machines integer not null default 1,
  cree_le timestamptz not null default now()
);
alter table public.workshops enable row level security;
drop policy if exists "workshops_select_own" on public.workshops;
create policy "workshops_select_own"
  on public.workshops for select
  using (exists (select 1 from public.companies c where c.id = workshops.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "workshops_insert_own" on public.workshops;
create policy "workshops_insert_own"
  on public.workshops for insert
  with check (exists (select 1 from public.companies c where c.id = workshops.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "workshops_update_own" on public.workshops;
create policy "workshops_update_own"
  on public.workshops for update
  using (exists (select 1 from public.companies c where c.id = workshops.company_id and c.owner_profile_id = auth.uid()));

create table if not exists public.faconniers (
  id text primary key,
  nom text not null,
  pays text not null,
  delai_mois integer not null,
  fiabilite numeric not null default 0.9,
  minimum_commande integer not null,
  delai_paiement_mois integer not null default 1,
  cree_le timestamptz not null default now()
);
alter table public.faconniers enable row level security;
drop policy if exists "faconniers_select_all" on public.faconniers;
create policy "faconniers_select_all" on public.faconniers for select using (true);

create table if not exists public.faconnier_catalogue (
  faconnier_id text not null references public.faconniers(id) on delete cascade,
  product_id text not null references public.products(id),
  prix_par_piece_centimes bigint not null,
  primary key (faconnier_id, product_id)
);
alter table public.faconnier_catalogue enable row level security;
drop policy if exists "faconnier_catalogue_select_all" on public.faconnier_catalogue;
create policy "faconnier_catalogue_select_all" on public.faconnier_catalogue for select using (true);

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id text not null references public.products(id),
  quantite integer not null check (quantite > 0),
  lieu_type text not null check (lieu_type in ('atelier', 'faconnier')),
  faconnier_id text references public.faconniers(id),
  prix_facon_par_piece_centimes bigint,
  instant_commande timestamptz not null default now(),
  instant_livraison_prevue timestamptz not null,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'livree', 'annulee')),
  cree_le timestamptz not null default now()
);
create index if not exists production_orders_company_id_idx on public.production_orders(company_id);
alter table public.production_orders enable row level security;
drop policy if exists "production_orders_select_own" on public.production_orders;
create policy "production_orders_select_own"
  on public.production_orders for select
  using (exists (select 1 from public.companies c where c.id = production_orders.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "production_orders_insert_own" on public.production_orders;
create policy "production_orders_insert_own"
  on public.production_orders for insert
  with check (exists (select 1 from public.companies c where c.id = production_orders.company_id and c.owner_profile_id = auth.uid()));

-- Seed façonniers et catalogues
insert into public.faconniers (id, nom, pays, delai_mois, fiabilite, minimum_commande, delai_paiement_mois) values
  ('fac_pt', 'Confecção Porto', 'Portugal', 2, 0.9, 75, 1),
  ('fac_tr', 'Istanbul Garment', 'Turquie', 2, 0.85, 300, 2)
on conflict (id) do nothing;

insert into public.faconnier_catalogue (faconnier_id, product_id, prix_par_piece_centimes) values
  ('fac_pt', 'prod_tshirt', 450),
  ('fac_pt', 'prod_chemise', 900),
  ('fac_pt', 'prod_sac_toile', 300),
  ('fac_tr', 'prod_tshirt', 300),
  ('fac_tr', 'prod_chemise', 650)
on conflict (faconnier_id, product_id) do nothing;
