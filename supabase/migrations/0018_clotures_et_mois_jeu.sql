-- Lot B : table clotures, colonnes mois_jeu, suivi découvert

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Table clotures
--    Suit l'état de la clôture mensuelle par monde.
-- ---------------------------------------------------------------------------

create table if not exists public.clotures (
  id uuid primary key default gen_random_uuid(),
  monde_id uuid not null references public.worlds(id) on delete cascade,
  mois integer not null check (mois >= 0),
  statut text not null default 'en_cours'
    check (statut in ('en_cours', 'termine', 'erreur')),
  debut timestamptz not null default now(),
  fin timestamptz,
  erreur text,
  unique(monde_id, mois)
);

create index if not exists clotures_monde_mois_idx on public.clotures(monde_id, mois);

alter table public.clotures enable row level security;

drop policy if exists "clotures_select_authenticated" on public.clotures;
create policy "clotures_select_authenticated"
  on public.clotures for select
  using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 2. Colonnes mois_jeu sur purchase_orders
-- ---------------------------------------------------------------------------

alter table public.purchase_orders
  add column if not exists mois_jeu_commande integer,
  add column if not exists mois_jeu_livraison integer;

create index if not exists purchase_orders_mois_livraison_idx
  on public.purchase_orders(mois_jeu_livraison)
  where mois_jeu_livraison is not null;

-- ---------------------------------------------------------------------------
-- 3. Colonnes mois_jeu sur production_orders
-- ---------------------------------------------------------------------------

alter table public.production_orders
  add column if not exists mois_jeu_commande integer,
  add column if not exists mois_jeu_livraison integer;

create index if not exists production_orders_mois_livraison_idx
  on public.production_orders(mois_jeu_livraison)
  where mois_jeu_livraison is not null;

-- ---------------------------------------------------------------------------
-- 4. Colonne mois_jeu_debut sur loans
-- ---------------------------------------------------------------------------

alter table public.loans
  add column if not exists mois_jeu_debut integer;

create index if not exists loans_mois_jeu_debut_idx
  on public.loans(mois_jeu_debut)
  where mois_jeu_debut is not null;

-- ---------------------------------------------------------------------------
-- 5. Colonne mois_jeu sur loan_schedules
-- ---------------------------------------------------------------------------

alter table public.loan_schedules
  add column if not exists mois_jeu integer;

create index if not exists loan_schedules_mois_jeu_idx
  on public.loan_schedules(mois_jeu)
  where mois_jeu is not null;

-- ---------------------------------------------------------------------------
-- 6. Colonne mois_jeu_debut sur employees
-- ---------------------------------------------------------------------------

alter table public.employees
  add column if not exists mois_jeu_debut integer;

-- ---------------------------------------------------------------------------
-- 7. Suivi du découvert consécutif sur companies
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists mois_decouvert_consecutifs integer not null default 0;

-- ---------------------------------------------------------------------------
-- 8. Table material_stock
--    Suit le stock de matières premières par entreprise.
--    Note : product_stock (0013) utilise quantite_pieces integer ;
--    material_stock utilise quantite numeric car les matières se mesurent
--    en mètres ou lots (valeurs décimales possibles).
-- ---------------------------------------------------------------------------

create table if not exists public.material_stock (
  company_id uuid not null references public.companies(id) on delete cascade,
  material_id text not null references public.materials(id),
  quantite numeric not null default 0 check (quantite >= 0),
  valeur_totale_centimes bigint not null default 0,
  mise_a_jour_le timestamptz not null default now(),
  primary key (company_id, material_id)
);

create index if not exists material_stock_company_id_idx on public.material_stock(company_id);

alter table public.material_stock enable row level security;

drop policy if exists "material_stock_select_own" on public.material_stock;
create policy "material_stock_select_own"
  on public.material_stock for select
  using (
    exists (select 1 from public.companies c
      where c.id = material_stock.company_id
        and c.owner_profile_id = auth.uid())
  );
