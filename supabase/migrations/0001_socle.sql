-- T15 : socle base Supabase (tables essentielles + RLS)
--
-- Tables : profiles, worlds, companies, ledger_entries, audit_log
-- RLS : un joueur ne peut lire que les lignes de son entreprise ; la vue
-- companies_publiques expose uniquement les colonnes partageables (classement).
--
-- Cette migration est idempotente : chaque objet est créé avec IF NOT EXISTS
-- ou DROP POLICY IF EXISTS pour supporter un rejeu.

set statement_timeout = '60s';

-- Extension
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null unique,
  role text not null default 'joueur' check (role in ('joueur', 'admin')),
  cree_le timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- worlds
-- ---------------------------------------------------------------------------

create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  mois_courant integer not null default 0 check (mois_courant >= 0),
  heure_cloture time not null default '06:00:00',
  etat text not null default 'actif' check (etat in ('actif', 'ferme')),
  cree_le timestamptz not null default now()
);

alter table public.worlds enable row level security;

drop policy if exists "worlds_select_all" on public.worlds;
create policy "worlds_select_all"
  on public.worlds for select
  using (true);

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  nom text not null,
  gamme text not null check (gamme in ('entree', 'milieu', 'haut')),
  etape smallint not null default 0 check (etape between 0 and 2),
  statut text not null default 'active' check (statut in ('active', 'en_difficulte', 'liquidee')),
  tresorerie_centimes bigint not null default 0,
  cree_le timestamptz not null default now()
);

create index if not exists companies_owner_profile_id_idx
  on public.companies(owner_profile_id);

alter table public.companies enable row level security;

drop policy if exists "companies_select_own" on public.companies;
create policy "companies_select_own"
  on public.companies for select
  using (owner_profile_id = auth.uid());

drop policy if exists "companies_insert_own" on public.companies;
create policy "companies_insert_own"
  on public.companies for insert
  with check (owner_profile_id = auth.uid());

drop policy if exists "companies_update_own" on public.companies;
create policy "companies_update_own"
  on public.companies for update
  using (owner_profile_id = auth.uid());

-- Vue publique pour le futur classement (nom, gamme, étape seulement)
create or replace view public.companies_publiques as
  select id, world_id, nom, gamme, etape, statut
  from public.companies;

grant select on public.companies_publiques to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ledger_entries (écritures comptables en partie double)
-- ---------------------------------------------------------------------------

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ecriture_id text not null,
  mois_jeu integer not null check (mois_jeu >= 0),
  libelle text not null,
  compte text not null,
  sens text not null check (sens in ('debit', 'credit')),
  montant_centimes bigint not null check (montant_centimes > 0),
  cree_le timestamptz not null default now()
);

create index if not exists ledger_entries_company_id_idx
  on public.ledger_entries(company_id);
create index if not exists ledger_entries_ecriture_id_idx
  on public.ledger_entries(company_id, ecriture_id);

alter table public.ledger_entries enable row level security;

drop policy if exists "ledger_entries_select_own_company" on public.ledger_entries;
create policy "ledger_entries_select_own_company"
  on public.ledger_entries for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = ledger_entries.company_id
        and c.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "ledger_entries_insert_own_company" on public.ledger_entries;
create policy "ledger_entries_insert_own_company"
  on public.ledger_entries for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = ledger_entries.company_id
        and c.owner_profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  cible text,
  details jsonb,
  cree_le timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
  on public.audit_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
