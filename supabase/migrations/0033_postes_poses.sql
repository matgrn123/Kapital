-- 3D-3 : l'aménagement fait la capacité.
--
-- Le moteur ne lit plus workshops.nombre_machines (colonne gardée, plus écrite ni lue) : il
-- compte les postes réellement posés dans placed_modules (capacité = min(artisans, postes)).
--
-- 1. signer_bail (version de 0027) et acheter_local (version de 0028) posent, dans la même
--    transaction, p_nombre_machines postes 'poste_couture_base' (paramètre
--    bail_machines_a_la_signature = 2, décision du 25 novembre 2026). Signatures inchangées :
--    les routes louer-atelier et acheter-local n'ont rien à changer. Ces postes font partie du
--    local (fournis par le bailleur, ou compris dans le prix d'achat) : aucune écriture.
-- 2. Reprise : chaque atelier existant sans aucun module posé reçoit ces 2 postes, aux mêmes
--    cases. Rejouer la migration ne pose rien de plus (seulement les ateliers sans module).
--
-- Cases : rangée du haut, x = 2, 5, 8…, y = 1 (compté à partir de 1, comme validerPlanEtage) ;
-- packages/engine/src/atelier/effetsPlan.test.ts prouve qu'elles passent la validation du plan
-- (pas de chevauchement, entrée et passage libres) sur la grille par défaut 10 × 5, entrée (0, 3).

set statement_timeout = '60s';

create or replace function public.signer_bail(
  p_company_id uuid,
  p_batiment_id text,
  p_surface_m2 integer,
  p_loyer_centimes bigint,
  p_charges_centimes bigint,
  p_depot_centimes bigint,
  p_nombre_machines integer,
  p_mois_jeu integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trouve boolean;
  v_workshop_id uuid;
begin
  if p_batiment_id is null or length(p_batiment_id) = 0 then
    raise exception 'batiment_invalide' using errcode = 'KP400';
  end if;
  if p_surface_m2 is null or p_surface_m2 <= 0
     or p_loyer_centimes is null or p_loyer_centimes < 0
     or p_charges_centimes is null or p_charges_centimes < 0
     or p_depot_centimes is null or p_depot_centimes < 0
     or p_nombre_machines is null or p_nombre_machines < 0
     or p_mois_jeu is null or p_mois_jeu < 0 then
    raise exception 'bail_invalide' using errcode = 'KP400';
  end if;

  -- Verrou sur l'entreprise : deux signatures simultanées se mettent en file.
  select true into v_trouve
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  if exists (select 1 from public.workshops w where w.company_id = p_company_id) then
    raise exception 'local_deja_loue' using errcode = 'KP409';
  end if;

  insert into public.workshops
    (company_id, surface_m2, loyer_mensuel_centimes, batiment_id,
     mode_detention, depot_garantie_centimes, charges_mensuelles_centimes, mois_signature)
  values
    (p_company_id, p_surface_m2, p_loyer_centimes, p_batiment_id,
     'bail', p_depot_centimes, p_charges_centimes, p_mois_jeu)
  returning id into v_workshop_id;

  -- 3D-3 : les postes fournis avec le local sont posés dans le plan (rangée du haut,
  -- x = 2, 5, 8…, y = 1 ; même formule que positionsPostesALaSignature du moteur, validée par
  -- validerPlanEtage sur la grille 10 × 5). Un poste qui ne tiendrait pas dans la largeur
  -- de la grille n'est pas posé. Pas d'écriture comptable : ils font partie du local.
  insert into public.placed_modules (workshop_id, module_type_id, x, y, pivote)
  select v_workshop_id, 'poste_couture_base', 2 + 3 * (i - 1), 1, false
  from generate_series(1, p_nombre_machines) as i,
       public.workshops w
  where w.id = v_workshop_id
    and 3 * i <= w.largeur_grille
    and w.hauteur_grille >= 2;

  -- Dépôt de garantie : 275 (actif) au débit, 512 (banque) au crédit. Pas de passage par le résultat.
  if p_depot_centimes > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, 'bail_signature_' || v_workshop_id::text, p_mois_jeu,
       'Dépôt de garantie versé (signature du bail)', '275', 'debit', p_depot_centimes),
      (p_company_id, 'bail_signature_' || v_workshop_id::text, p_mois_jeu,
       'Dépôt de garantie versé (signature du bail)', '512', 'credit', p_depot_centimes);
  end if;

  return v_workshop_id;
end;
$$;
revoke all on function public.signer_bail(uuid, text, integer, bigint, bigint, bigint, integer, integer)
  from public, anon, authenticated;
grant execute on function public.signer_bail(uuid, text, integer, bigint, bigint, bigint, integer, integer)
  to service_role;

create or replace function public.acheter_local(
  p_company_id uuid,
  p_batiment_id text,
  p_surface_m2 integer,
  p_prix_centimes bigint,
  p_apport_centimes bigint,
  p_apport_minimal_centimes bigint,
  p_charges_centimes bigint,
  p_nombre_machines integer,
  p_duree_amortissement_mois integer,
  p_mois_jeu integer,
  p_taux_annuel numeric,
  p_duree_pret_mois integer,
  p_instant_debut timestamptz,
  p_plafond_endettement_centimes bigint,
  p_echeancier jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trouve boolean;
  v_workshop_id uuid;
  v_pret bigint;
  v_mode text;
begin
  if p_batiment_id is null or length(p_batiment_id) = 0 then
    raise exception 'batiment_invalide' using errcode = 'KP400';
  end if;
  if p_surface_m2 is null or p_surface_m2 <= 0
     or p_prix_centimes is null or p_prix_centimes <= 0
     or p_apport_centimes is null or p_apport_centimes <= 0 or p_apport_centimes > p_prix_centimes
     or p_apport_minimal_centimes is null or p_apport_minimal_centimes < 0
     or p_charges_centimes is null or p_charges_centimes < 0
     or p_nombre_machines is null or p_nombre_machines < 0
     or p_duree_amortissement_mois is null or p_duree_amortissement_mois < 1
     or p_mois_jeu is null or p_mois_jeu < 0 then
    raise exception 'achat_invalide' using errcode = 'KP400';
  end if;
  if p_apport_centimes < p_apport_minimal_centimes then
    raise exception 'apport_insuffisant: % pour un minimum de %', p_apport_centimes, p_apport_minimal_centimes
      using errcode = 'KP422';
  end if;

  -- Verrou sur l'entreprise : deux achats ou un achat et une location se mettent en file.
  select true into v_trouve
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  if exists (select 1 from public.workshops w where w.company_id = p_company_id) then
    raise exception 'local_deja_detenu' using errcode = 'KP409';
  end if;

  v_pret := p_prix_centimes - p_apport_centimes;
  v_mode := case when v_pret > 0 then 'credit' else 'achat' end;

  -- Prêt immobilier d'abord (512 débit / 164 crédit) : creer_pret revérifie le plafond d'endettement
  -- et la cohérence de l'échéancier, et lève KP422 / KP400 en cas d'écart (tout est alors annulé).
  if v_pret > 0 then
    perform public.creer_pret(
      p_company_id, 'immobilier', v_pret, p_taux_annuel, p_duree_pret_mois, p_mois_jeu,
      p_instant_debut, p_plafond_endettement_centimes, p_echeancier
    );
  end if;

  insert into public.workshops
    (company_id, surface_m2, loyer_mensuel_centimes, batiment_id,
     mode_detention, depot_garantie_centimes, charges_mensuelles_centimes, mois_signature,
     prix_achat_centimes, apport_centimes, mois_achat, duree_amortissement_mois)
  values
    (p_company_id, p_surface_m2, 0, p_batiment_id,
     v_mode, 0, p_charges_centimes, null,
     p_prix_centimes, p_apport_centimes, p_mois_jeu, p_duree_amortissement_mois)
  returning id into v_workshop_id;

  -- 3D-3 : les postes fournis avec le local sont posés dans le plan (rangée du haut,
  -- x = 2, 5, 8…, y = 1 ; même formule que positionsPostesALaSignature du moteur, validée par
  -- validerPlanEtage sur la grille 10 × 5). Un poste qui ne tiendrait pas dans la largeur
  -- de la grille n'est pas posé. Pas d'écriture comptable : ils font partie du local.
  insert into public.placed_modules (workshop_id, module_type_id, x, y, pivote)
  select v_workshop_id, 'poste_couture_base', 2 + 3 * (i - 1), 1, false
  from generate_series(1, p_nombre_machines) as i,
       public.workshops w
  where w.id = v_workshop_id
    and 3 * i <= w.largeur_grille
    and w.hauteur_grille >= 2;

  -- Achat : 213 (construction, actif) au débit, 512 (banque) au crédit, pour le prix entier.
  -- Avec la mise à disposition du prêt, la banque ne perd que l'apport.
  insert into public.ledger_entries
    (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
  values
    (p_company_id, 'achat_local_' || v_workshop_id::text, p_mois_jeu,
     'Achat du local (' || p_batiment_id || ')', '213', 'debit', p_prix_centimes),
    (p_company_id, 'achat_local_' || v_workshop_id::text, p_mois_jeu,
     'Achat du local (' || p_batiment_id || ')', '512', 'credit', p_prix_centimes);

  return v_workshop_id;
end;
$$;
revoke all on function public.acheter_local(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer, numeric, integer, timestamptz, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.acheter_local(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer, numeric, integer, timestamptz, bigint, jsonb)
  to service_role;

-- Reprise des ateliers existants : 2 postes (bail_machines_a_la_signature) pour ceux qui n'ont
-- aucun module posé. Les boutiques (batiment_id 'boutique_…') ne reçoivent pas de machine.
insert into public.placed_modules (workshop_id, module_type_id, x, y, pivote)
select w.id, 'poste_couture_base', 2 + 3 * (i - 1), 1, false
from public.workshops w
cross join generate_series(1, 2) as i
where not exists (select 1 from public.placed_modules pm where pm.workshop_id = w.id)
  and coalesce(w.batiment_id, '') not like 'boutique%'
  and 3 * i <= w.largeur_grille
  and w.hauteur_grille >= 2;
