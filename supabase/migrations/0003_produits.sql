-- T20b : table de référence pour matières et produits, catalogue par entreprise

set statement_timeout = '60s';

-- Matières de référence
create table if not exists public.materials (
  id text primary key,
  type text not null,
  nom text not null,
  unite text not null default 'metre',
  cree_le timestamptz not null default now()
);
alter table public.materials enable row level security;
drop policy if exists "materials_select_all" on public.materials;
create policy "materials_select_all" on public.materials for select using (true);

-- Produits de référence
create table if not exists public.products (
  id text primary key,
  type text not null,
  nom text not null,
  matiere_id text not null references public.materials(id),
  consommation_par_piece numeric not null,
  fournitures_par_piece_centimes bigint not null,
  temps_standard_minutes integer not null,
  cree_le timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists "products_select_all" on public.products;
create policy "products_select_all" on public.products for select using (true);

-- Catalogue de l'entreprise : prix et objectif de production
create table if not exists public.company_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id text not null references public.products(id),
  qualite_visee integer not null default 60 check (qualite_visee between 0 and 100),
  prix_vente_directe_centimes bigint not null,
  prix_revendeur_centimes bigint not null,
  production_mensuelle_cible integer not null default 0,
  cree_le timestamptz not null default now(),
  unique (company_id, product_id)
);
alter table public.company_products enable row level security;
drop policy if exists "company_products_select_own" on public.company_products;
create policy "company_products_select_own"
  on public.company_products for select
  using (
    exists (select 1 from public.companies c
            where c.id = company_products.company_id and c.owner_profile_id = auth.uid())
  );
drop policy if exists "company_products_insert_own" on public.company_products;
create policy "company_products_insert_own"
  on public.company_products for insert
  with check (
    exists (select 1 from public.companies c
            where c.id = company_products.company_id and c.owner_profile_id = auth.uid())
  );
drop policy if exists "company_products_update_own" on public.company_products;
create policy "company_products_update_own"
  on public.company_products for update
  using (
    exists (select 1 from public.companies c
            where c.id = company_products.company_id and c.owner_profile_id = auth.uid())
  );

-- Seed des matières et produits de référence
insert into public.materials (id, type, nom, unite) values
  ('mat_jersey_coton', 'jersey_coton', 'Jersey de coton bio', 'metre'),
  ('mat_popeline', 'popeline', 'Popeline de coton', 'metre'),
  ('mat_toile_coton', 'toile_coton', 'Toile de coton', 'metre'),
  ('mat_fournitures', 'fournitures', 'Fournitures (lot)', 'lot')
on conflict (id) do nothing;

insert into public.products (id, type, nom, matiere_id, consommation_par_piece, fournitures_par_piece_centimes, temps_standard_minutes) values
  ('prod_tshirt', 't_shirt', 'T-shirt basique', 'mat_jersey_coton', 0.8, 60, 25),
  ('prod_chemise', 'chemise', 'Chemise habillée', 'mat_popeline', 1.8, 120, 50),
  ('prod_sac_toile', 'sac_toile', 'Sac en toile', 'mat_toile_coton', 0.6, 40, 15)
on conflict (id) do nothing;
