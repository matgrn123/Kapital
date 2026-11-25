-- ADM-1 : cockpit d'administration.
--
-- 1. journal_avance : une ligne par passage de l'orchestrateur (minuterie, mise à jour
--    manuelle, avance du temps). Le cockpit y lit la santé de la minuterie.
-- 2. Lecture pour les administrateurs : sans elle, un admin ne voit que les écritures de
--    sa propre entreprise, donc ni les ventes des autres en direct (Realtime respecte la
--    RLS) ni les commandes en cours. Aucun droit d'écriture n'est ajouté.

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Est-on administrateur ? (fonction réutilisée par les politiques de lecture)
-- ---------------------------------------------------------------------------

create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Journal des passages de l'orchestrateur
-- ---------------------------------------------------------------------------

create table if not exists public.journal_avance (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  monde_id uuid not null references public.worlds(id) on delete cascade,
  declencheur text not null check (declencheur in ('minuterie', 'manuel', 'avance-temps')),
  pas_cible integer not null,
  mois_courant integer not null,
  nb_entreprises integer not null,
  nb_avancees integer not null,
  nb_erreurs integer not null,
  erreurs jsonb not null default '[]'::jsonb,
  duree_ms integer not null
);

create index if not exists journal_avance_cree_le_idx on public.journal_avance (cree_le desc);

alter table public.journal_avance enable row level security;

drop policy if exists "journal_avance_select_admin" on public.journal_avance;
create policy "journal_avance_select_admin"
  on public.journal_avance for select
  using (public.est_admin());

-- ---------------------------------------------------------------------------
-- 3. Lecture admin des tables que le cockpit affiche (lecture seule)
-- ---------------------------------------------------------------------------

drop policy if exists "companies_select_admin" on public.companies;
create policy "companies_select_admin"
  on public.companies for select
  using (public.est_admin());

drop policy if exists "ledger_entries_select_admin" on public.ledger_entries;
create policy "ledger_entries_select_admin"
  on public.ledger_entries for select
  using (public.est_admin());

drop policy if exists "purchase_orders_select_admin" on public.purchase_orders;
create policy "purchase_orders_select_admin"
  on public.purchase_orders for select
  using (public.est_admin());

drop policy if exists "production_orders_select_admin" on public.production_orders;
create policy "production_orders_select_admin"
  on public.production_orders for select
  using (public.est_admin());
