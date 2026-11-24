-- 3D-4 : plan d'aménagement de l'atelier (grille + modules posés)

set statement_timeout = '60s';

-- Ajouter les dimensions de la grille et l'entrée aux ateliers
alter table public.workshops
  add column if not exists largeur_grille integer not null default 10,
  add column if not exists hauteur_grille integer not null default 5,
  add column if not exists entree_x integer not null default 0,
  add column if not exists entree_y integer not null default 3;

-- Recalculer pour les lignes déjà existantes
-- Pour 50 m² : largeur = ceil(sqrt(100)) = 10, hauteur = ceil(50/10) = 5
update public.workshops
set
  largeur_grille = ceil(sqrt(surface_m2 * 2.0))::integer,
  hauteur_grille = ceil(surface_m2::float / ceil(sqrt(surface_m2 * 2.0)))::integer,
  entree_y = ceil(ceil(surface_m2::float / ceil(sqrt(surface_m2 * 2.0))) / 2.0)::integer;

-- Table des modules posés dans l'atelier
create table if not exists public.placed_modules (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  module_type_id text not null,
  x integer not null,
  y integer not null,
  pivote boolean not null default false,
  cree_le timestamptz not null default now()
);

alter table public.placed_modules enable row level security;

drop policy if exists "placed_modules_select_own" on public.placed_modules;
create policy "placed_modules_select_own"
  on public.placed_modules for select
  using (
    exists (
      select 1 from public.workshops w
      join public.companies c on c.id = w.company_id
      where w.id = placed_modules.workshop_id
      and c.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "placed_modules_insert_own" on public.placed_modules;
create policy "placed_modules_insert_own"
  on public.placed_modules for insert
  with check (
    exists (
      select 1 from public.workshops w
      join public.companies c on c.id = w.company_id
      where w.id = placed_modules.workshop_id
      and c.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "placed_modules_update_own" on public.placed_modules;
create policy "placed_modules_update_own"
  on public.placed_modules for update
  using (
    exists (
      select 1 from public.workshops w
      join public.companies c on c.id = w.company_id
      where w.id = placed_modules.workshop_id
      and c.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "placed_modules_delete_own" on public.placed_modules;
create policy "placed_modules_delete_own"
  on public.placed_modules for delete
  using (
    exists (
      select 1 from public.workshops w
      join public.companies c on c.id = w.company_id
      where w.id = placed_modules.workshop_id
      and c.owner_profile_id = auth.uid()
    )
  );
