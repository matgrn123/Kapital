-- 0035 : 3D-8, comptes annuels publics (profil public d'une société).
--
-- Comme au greffe du tribunal de commerce : tout joueur connecté voit l'identité d'une société,
-- l'extérieur de son bâtiment et ses comptes annuels du dernier exercice clos. Jamais ses données
-- privées : trésorerie du jour, écritures, salariés, prix d'achat, stocks, prêts, loyer, mode de
-- détention du local (docs/batiments-3d-groupe.md §2 et §10, cahier des charges §10).
--
-- Une seule vue, en LECTURE SEULE, une ligne par société non liquidée. Liste blanche des colonnes :
--   company_id, nom, gamme, etape            identité (déjà publique via companies_publiques)
--   valeur_centimes                          valeur au classement (déjà publique via classement_publique)
--   batiment_id                              type de bâtiment occupé : l'extérieur, rien de l'intérieur
--   exercice, exercice_mois_debut,
--   exercice_mois_fin                        dernier exercice clos (null tant qu'aucun n'est clos)
--   chiffre_affaires_ht_centimes             comptes 70x de l'exercice (crédit - débit)
--   resultat_centimes                        produits (7x) - charges (6x) de l'exercice
--   total_bilan_centimes                     total de l'actif à la fin de l'exercice
--
-- Exercice : 12 mois de jeu comptés depuis 0 (comme worlds.mois_courant et la clôture du moteur,
-- qui passe l'IS au mois 11, 23…). L'exercice n est clos quand le monde a atteint le mois 12(n+1).
-- Total du bilan : comptes de type « actif » du plan comptable V1 (miroir de PLAN_COMPTABLE_V1 et
-- de l'écran Finances) ; amortissements 2813 / 2815 typés passif en V1, donc actif brut.
--
-- Sécurité : la vue s'exécute avec les droits de son propriétaire (comme classement_publique) :
-- elle lit companies, workshops et ledger_entries malgré leurs règles RLS, mais ne renvoie que les
-- agrégats ci-dessus. security_barrier empêche un filtre de l'appelant de s'exécuter avant ceux
-- de la vue. Lecture réservée aux joueurs connectés (pas anon) ; aucune écriture possible.
-- Aucune table n'est créée ni modifiée.

set statement_timeout = '60s';

create or replace view public.comptes_publics
with (security_barrier = true) as
select
  c.id as company_id,
  c.nom,
  c.gamme,
  c.etape,
  coalesce(v.valeur_centimes, 0) as valeur_centimes,
  wk.batiment_id,
  ex.numero as exercice,
  ex.numero * 12 as exercice_mois_debut,
  ex.numero * 12 + 11 as exercice_mois_fin,
  a.chiffre_affaires_ht_centimes,
  a.resultat_centimes,
  a.total_bilan_centimes
from public.companies c
join public.worlds w on w.id = c.world_id
left join public.valeurs_entreprises v on v.company_id = c.id
left join public.workshops wk on wk.company_id = c.id
cross join lateral (
  select case when w.mois_courant >= 12 then (w.mois_courant / 12) - 1 end as numero
) ex
left join lateral (
  select
    coalesce(sum(case when l.compte like '70%' and l.mois_jeu >= ex.numero * 12
      then case when l.sens = 'credit' then l.montant_centimes else -l.montant_centimes end
      else 0 end), 0)::bigint as chiffre_affaires_ht_centimes,
    coalesce(sum(case when (l.compte like '6%' or l.compte like '7%') and l.mois_jeu >= ex.numero * 12
      then case when l.sens = 'credit' then l.montant_centimes else -l.montant_centimes end
      else 0 end), 0)::bigint as resultat_centimes,
    coalesce(sum(case when l.compte in ('213', '2154', '275', '31', '35', '411', '44566', '512')
      then case when l.sens = 'debit' then l.montant_centimes else -l.montant_centimes end
      else 0 end), 0)::bigint as total_bilan_centimes
  from public.ledger_entries l
  where l.company_id = c.id
    and l.mois_jeu <= ex.numero * 12 + 11
) a on ex.numero is not null
where c.statut <> 'liquidee';

comment on view public.comptes_publics is
  '3D-8 : comptes annuels publics (dernier exercice clos) et extérieur. Liste blanche : voir migration 0035.';

revoke all on public.comptes_publics from public, anon, authenticated;
grant select on public.comptes_publics to authenticated, service_role;
