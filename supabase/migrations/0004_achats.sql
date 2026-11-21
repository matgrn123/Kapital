-- T20c : fournisseurs, catalogue fournisseur, commandes de matière

set statement_timeout = '60s';

create table if not exists public.suppliers (
  id text primary key,
  nom text not null,
  pays text not null,
  delai_mois integer not null,
  fiabilite numeric not null default 0.9,
  minimum_commande integer not null,
  delai_paiement_mois integer not null default 1,
  cree_le timestamptz not null default now()
);
alter table public.suppliers enable row level security;
drop policy if exists "suppliers_select_all" on public.suppliers;
create policy "suppliers_select_all" on public.suppliers for select using (true);

create table if not exists public.supplier_catalogue (
  supplier_id text not null references public.suppliers(id) on delete cascade,
  material_id text not null references public.materials(id),
  prix_centimes bigint not null,
  primary key (supplier_id, material_id)
);
alter table public.supplier_catalogue enable row level security;
drop policy if exists "supplier_catalogue_select_all" on public.supplier_catalogue;
create policy "supplier_catalogue_select_all" on public.supplier_catalogue for select using (true);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id text not null references public.suppliers(id),
  material_id text not null references public.materials(id),
  quantite numeric not null check (quantite > 0),
  prix_unitaire_centimes bigint not null,
  instant_commande timestamptz not null default now(),
  instant_livraison_prevue timestamptz not null,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'livree', 'annulee')),
  cree_le timestamptz not null default now()
);
create index if not exists purchase_orders_company_id_idx on public.purchase_orders(company_id);
create index if not exists purchase_orders_livraison_idx on public.purchase_orders(instant_livraison_prevue);
alter table public.purchase_orders enable row level security;
drop policy if exists "purchase_orders_select_own" on public.purchase_orders;
create policy "purchase_orders_select_own"
  on public.purchase_orders for select
  using (exists (select 1 from public.companies c where c.id = purchase_orders.company_id and c.owner_profile_id = auth.uid()));
drop policy if exists "purchase_orders_insert_own" on public.purchase_orders;
create policy "purchase_orders_insert_own"
  on public.purchase_orders for insert
  with check (exists (select 1 from public.companies c where c.id = purchase_orders.company_id and c.owner_profile_id = auth.uid()));

-- Seed fournisseurs et catalogues
insert into public.suppliers (id, nom, pays, delai_mois, fiabilite, minimum_commande, delai_paiement_mois) values
  ('four_fr', 'Textile France', 'France', 1, 0.95, 50, 1),
  ('four_pt', 'Têxteis Porto', 'Portugal', 2, 0.9, 100, 1),
  ('four_tr', 'Istanbul Fabrics', 'Turquie', 2, 0.85, 300, 2)
on conflict (id) do nothing;

insert into public.supplier_catalogue (supplier_id, material_id, prix_centimes) values
  ('four_fr', 'mat_jersey_coton', 500),
  ('four_fr', 'mat_popeline', 900),
  ('four_fr', 'mat_toile_coton', 600),
  ('four_fr', 'mat_fournitures', 60),
  ('four_pt', 'mat_jersey_coton', 420),
  ('four_pt', 'mat_popeline', 750),
  ('four_pt', 'mat_toile_coton', 500),
  ('four_tr', 'mat_jersey_coton', 350),
  ('four_tr', 'mat_popeline', 650)
on conflict (supplier_id, material_id) do nothing;
