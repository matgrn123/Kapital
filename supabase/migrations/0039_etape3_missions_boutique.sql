-- AE-11 : étape 3 (la boutique) et deux nouvelles missions.
--
-- 1. companies.etape : la contrainte de 0001 (entre 0 et 2) passe à 0 à 3. Le constat d'étape est
--    fait par le moteur à la clôture (packages/engine/src/etapes) et enregistré tel quel par
--    appliquer_pas_entreprise (0025) : aucune fonction à changer.
-- 2. mission_progress : la contrainte de 0011 accepte mission4 (« Ouvrir ma boutique sans
--    découvert ») et mission5 (« Louer ou acheter ») ; le déclencheur des nouvelles sociétés crée
--    les cinq lignes, et les sociétés existantes reçoivent les deux nouvelles (rattrapage).
--    Les règles des missions vivent en code (packages/engine/src/missions) ; la table ne garde que
--    l'état et la date de validation (une mission validée reste validée).
--
-- Rejouable : contraintes supprimées puis recréées, insertions sans doublon (clé primaire).

set statement_timeout = '60s';

-- Les contraintes de 0001 et 0011 sont écrites dans la colonne, donc nommées par Postgres
-- (companies_etape_check, mission_progress_mission_id_check). Par prudence, on supprime aussi
-- toute autre contrainte de vérification qui porterait sur ces colonnes.
do $$
declare
  r record;
begin
  for r in
    select con.conrelid::regclass as table_cible, con.conname
    from pg_constraint con
    where con.contype = 'c'
      and (
        (con.conrelid = 'public.companies'::regclass and pg_get_constraintdef(con.oid) ilike '%etape%')
        or (con.conrelid = 'public.mission_progress'::regclass and pg_get_constraintdef(con.oid) ilike '%mission_id%')
      )
  loop
    execute format('alter table %s drop constraint if exists %I', r.table_cible, r.conname);
  end loop;
end;
$$;

-- 1. Étape 0 à 3 ---------------------------------------------------------------------------------
alter table public.companies drop constraint if exists companies_etape_check;
alter table public.companies
  add constraint companies_etape_check check (etape between 0 and 3);

-- 2. Missions 4 et 5 -----------------------------------------------------------------------------
alter table public.mission_progress drop constraint if exists mission_progress_mission_id_check;
alter table public.mission_progress
  add constraint mission_progress_mission_id_check
  check (mission_id in ('mission1', 'mission2', 'mission3', 'mission4', 'mission5'));

-- Cibles de départ (affichage seulement, recalculées par le site) : mission4 n'a pas de cible tant
-- qu'aucune boutique n'est signée (0) ; mission5 attend un local signé (1).
create or replace function public.initialiser_missions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mission_progress (company_id, mission_id, etat, cible)
  values
    (new.id, 'mission1', 'a_faire', 50),
    (new.id, 'mission2', 'a_faire', 6),
    (new.id, 'mission3', 'a_faire', 0),
    (new.id, 'mission4', 'a_faire', 0),
    (new.id, 'mission5', 'a_faire', 1)
  on conflict do nothing;
  return new;
end;
$$;

insert into public.mission_progress (company_id, mission_id, etat, cible)
select c.id, m.mission_id, 'a_faire', m.cible
from public.companies c
cross join (values
  ('mission4'::text, 0::bigint),
  ('mission5'::text, 1::bigint)
) as m(mission_id, cible)
on conflict do nothing;
