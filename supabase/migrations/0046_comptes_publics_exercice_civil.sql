-- 0046 : comptes publics sur l'exercice civil (lot T5 de l'horloge réelle, décision de Mathieu du
-- 26 novembre 2026).
--
-- Depuis 0043, worlds.mois_courant et ledger_entries.mois_jeu sont des index calendaires :
-- index = année × 12 + (mois civil − 1) (novembre 2026 = 24322). L'exercice comptable est l'année
-- civile : il se clôt le 31 décembre, et le premier exercice d'une société est raccourci (créée en
-- novembre 2026 → premier exercice de novembre à décembre 2026).
--
-- Avant (vue de 0040) : « dernier exercice clos » = (mois_courant / 12) − 1, soit l'année civile
-- précédente (2025 en novembre 2026), mais la vue renvoyait cet exercice pour TOUTES les sociétés,
-- même celles qui n'existaient pas encore : des comptes 2025 remplis de zéros pour une société née
-- en novembre 2026. La fiche publique affichait en plus « Exercice <numéro + 1> », hérité de
-- l'ancien compteur (corrigé côté site).
--
-- Après :
--   exercice              année civile du dernier exercice clos = floor(mois_courant / 12) − 1,
--                         NULL si la société n'existait pas à la fin de cet exercice ;
--   exercice_mois_debut   premier mois de l'exercice : janvier de cette année, ou le mois de
--                         création de la société si elle est née pendant l'exercice (exercice
--                         raccourci) ;
--   exercice_mois_fin     décembre de cette année (année × 12 + 11).
-- « La société existait à la fin de l'exercice » : sa première écriture (l'apport de capital,
-- écrit au mois de création, voir inscrire_apport_initial en 0043) est datée de décembre de cette
-- année au plus tard. Une société sans aucune écriture n'a pas de comptes à publier (NULL).
-- On ne lit pas companies.cree_le : c'est un instant réel, que l'outil d'administration « avancer
-- le temps » décale par rapport à l'horloge du jeu ; mois_jeu, lui, est déjà en temps de jeu.
--
-- Mêmes colonnes, même ordre, même liste blanche que 0035 / 0038 / 0040 (2135 compris) ; une ligne
-- par société (l'extérieur du plus ancien local, comme en 0040). Aucune table créée ni modifiée,
-- aucune donnée écrite. Rejouable (create or replace).

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
  -- greatest() ignore les NULL : sans exercice clos, pas de mois de début non plus.
  case when ex.numero is not null then greatest(ex.numero * 12, cr.premier_mois) end as exercice_mois_debut,
  ex.numero * 12 + 11 as exercice_mois_fin,
  a.chiffre_affaires_ht_centimes,
  a.resultat_centimes,
  a.total_bilan_centimes
from public.companies c
join public.worlds w on w.id = c.world_id
left join public.valeurs_entreprises v on v.company_id = c.id
-- 3D-7 : plusieurs locaux par société ; l'extérieur montré est celui du plus ancien (une ligne par société).
left join lateral (
  select w2.batiment_id
  from public.workshops w2
  where w2.company_id = c.id
  order by w2.cree_le, w2.id
  limit 1
) wk on true
-- Mois de création de la société : celui de sa première écriture (l'apport de capital initial).
left join lateral (
  select min(l0.mois_jeu) as premier_mois
  from public.ledger_entries l0
  where l0.company_id = c.id
) cr on true
-- Dernier exercice clos = l'année civile précédente (division entière : mois_courant >= 0),
-- seulement si la société existait à sa fin (31 décembre).
cross join lateral (
  select case
    when cr.premier_mois is not null
      and cr.premier_mois <= ((w.mois_courant / 12) - 1) * 12 + 11
    then (w.mois_courant / 12) - 1
  end as numero
) ex
left join lateral (
  select
    coalesce(sum(case when l.compte like '70%' and l.mois_jeu >= ex.numero * 12
      then case when l.sens = 'credit' then l.montant_centimes else -l.montant_centimes end
      else 0 end), 0)::bigint as chiffre_affaires_ht_centimes,
    coalesce(sum(case when (l.compte like '6%' or l.compte like '7%') and l.mois_jeu >= ex.numero * 12
      then case when l.sens = 'credit' then l.montant_centimes else -l.montant_centimes end
      else 0 end), 0)::bigint as resultat_centimes,
    coalesce(sum(case when l.compte in ('213', '2135', '2154', '275', '31', '35', '411', '44566', '512')
      then case when l.sens = 'debit' then l.montant_centimes else -l.montant_centimes end
      else 0 end), 0)::bigint as total_bilan_centimes
  from public.ledger_entries l
  where l.company_id = c.id
    and l.mois_jeu <= ex.numero * 12 + 11
) a on ex.numero is not null
where c.statut <> 'liquidee';

comment on view public.comptes_publics is
  '3D-8 : comptes annuels publics (dernier exercice clos, année civile, NULL si la société n''existait pas à sa fin ; 0046) et extérieur. Liste blanche : voir migration 0035 (2135 ajouté en 0038 ; 3D-7, 0040 : un seul local par ligne).';

revoke all on public.comptes_publics from public, anon, authenticated;
grant select on public.comptes_publics to authenticated, service_role;
