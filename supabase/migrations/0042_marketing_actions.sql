-- Nouvelles publicités : influenceurs (petit, moyen, gros compte), réseaux sociaux, affichage dans
-- le métro, agence de publicité.
--
-- 1. marketing_actions.type : la contrainte de 0007 (quatre types) accepte les dix actions du moteur
--    (ActionMarketing, packages/engine/src/types/decision.ts).
-- 2. marketing_actions.alea : l'aléa tiré pour un influenceur (1 + amplitude × (2u − 1), graine
--    société + mois + rang de l'action dans le mois), gardé pour l'historique. Vide pour les
--    actions sans aléa et pour les actions passées.
--
-- Aucune fonction SQL reprise. Rejouable : contrainte supprimée puis recréée, colonne ajoutée si
-- absente.

set statement_timeout = '60s';

-- La contrainte de 0007 est écrite dans la colonne, donc nommée par Postgres
-- (marketing_actions_type_check). Par prudence, on supprime aussi toute autre contrainte de
-- vérification qui porterait sur cette colonne.
do $$
declare
  r record;
begin
  for r in
    select con.conrelid::regclass as table_cible, con.conname
    from pg_constraint con
    where con.contype = 'c'
      and con.conrelid = 'public.marketing_actions'::regclass
      and pg_get_constraintdef(con.oid) ilike '%type%'
  loop
    execute format('alter table %s drop constraint if exists %I', r.table_cible, r.conname);
  end loop;
end;
$$;

-- 1. Les dix actions ------------------------------------------------------------------------------
alter table public.marketing_actions drop constraint if exists marketing_actions_type_check;
alter table public.marketing_actions
  add constraint marketing_actions_type_check
  check (type in ('publicite', 'image_marque', 'promotion', 'relations_presse', 'reseaux_sociaux', 'influenceur_nano', 'influenceur_micro', 'influenceur_macro', 'affichage_metro', 'agence_publicite'));

-- 2. L'aléa d'un influenceur -----------------------------------------------------------------------
alter table public.marketing_actions add column if not exists alea numeric;
