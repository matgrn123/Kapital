-- Journal d'événements (cahier des charges § 3 point 4 : « chaque connexion, il consulte ce qui
-- s'est passé depuis sa dernière visite »).
--
-- 1. Table evenements : ce que le serveur constate après chaque pas (livraisons, rupture de stock,
--    découvert, créances encaissées, étape franchie, clôture du mois avec les explications du
--    moteur) et les missions validées. Écrite seulement par le serveur (clé de service), lue
--    seulement par le propriétaire de la société.
--    Idempotence : (company_id, cle) est unique ; rejouer un pas redonne les mêmes clés et
--    l'insertion les ignore (packages/server/src/evenements).
-- 2. companies.derniere_visite_le : dernière fois que le joueur a vu son journal (carte
--    « Pendant ton absence » du tableau de bord, page Journal). Null = jamais.
--
-- Aucune fonction SQL reprise. Rejouable : if not exists partout, politique supprimée puis recréée.

set statement_timeout = '60s';

-- 1. Table evenements ---------------------------------------------------------------------------
create table if not exists public.evenements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null
    check (type in ('livraison_matiere', 'livraison_production', 'rupture_stock', 'decouvert', 'creance_encaissee', 'etape_franchie', 'cloture_mois', 'mission_validee')),
  cle text not null,
  mois_jeu integer not null check (mois_jeu >= 0),
  pas integer check (pas is null or pas >= 0),
  instant timestamptz not null,
  titre text not null,
  detail jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  constraint evenements_company_cle_key unique (company_id, cle)
);

-- Lecture du site : les nouveautés d'une société depuis une date, les plus récentes d'abord.
create index if not exists evenements_company_cree_le_idx
  on public.evenements(company_id, cree_le desc);

alter table public.evenements enable row level security;
drop policy if exists "evenements_select_own" on public.evenements;
create policy "evenements_select_own"
  on public.evenements for select
  using (exists (
    select 1 from public.companies c
    where c.id = evenements.company_id and c.owner_profile_id = auth.uid()
  ));
-- Aucune politique d'écriture : seules les fonctions serveur (service_role) écrivent.
revoke insert, update, delete on public.evenements from anon, authenticated;

-- 2. Dernière visite ----------------------------------------------------------------------------
-- Lue par le propriétaire (politique companies_select_own de 0001), écrite par le serveur
-- seulement (route /api/journal/vu, clé de service) : aucune politique d'écriture (0017).
alter table public.companies add column if not exists derniere_visite_le timestamptz;
