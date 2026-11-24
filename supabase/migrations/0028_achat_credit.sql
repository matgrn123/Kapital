-- AE-6 : achat d'un local à crédit (apport, immobilisation 213, prêt immobilier, amortissement 2813).
--
-- 1. workshops : prix d'achat, apport, mois d'achat et durée d'amortissement (mode_detention
--    accepte déjà 'achat' et 'credit' depuis 0027 ; un local acheté n'a plus de loyer, ni de dépôt).
-- 2. acheter_local : une seule transaction pour le prêt immobilier (appel de creer_pret de 0026 :
--    prêt, échéancier, écriture 512 débit / 164 crédit), le local et l'écriture d'achat
--    (213 débit / 512 crédit du prix). La banque ne perd donc que l'apport. La fonction
--    revérifie sous verrou l'apport minimal et qu'il n'y a pas déjà un local.
-- 3. donner_conge remplacée (0027 reprise, plus un refus pour un local possédé : on ne donne
--    pas congé de ses propres murs).
-- 4. Classement : rafraichir_valeurs_entreprises remplacée (0027 reprise) ; 213 est un actif et
--    2813 (amortissement) en vient en déduction.
--
-- L'amortissement mensuel (681 / 2813), l'entretien (614) et les échéances du prêt sont passés
-- par la clôture du moteur et enregistrés par appliquer_pas_entreprise, qui n'a pas à changer.
-- Apport minimal, durées et prix viennent de packages/content (parametres, batiments).

set statement_timeout = '60s';

alter table public.workshops
  add column if not exists prix_achat_centimes bigint not null default 0
    check (prix_achat_centimes >= 0),
  add column if not exists apport_centimes bigint not null default 0
    check (apport_centimes >= 0),
  add column if not exists mois_achat integer,
  add column if not exists duree_amortissement_mois integer;

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
    (company_id, surface_m2, loyer_mensuel_centimes, nombre_machines, batiment_id,
     mode_detention, depot_garantie_centimes, charges_mensuelles_centimes, mois_signature,
     prix_achat_centimes, apport_centimes, mois_achat, duree_amortissement_mois)
  values
    (p_company_id, p_surface_m2, 0, p_nombre_machines, p_batiment_id,
     v_mode, 0, p_charges_centimes, null,
     p_prix_centimes, p_apport_centimes, p_mois_jeu, p_duree_amortissement_mois)
  returning id into v_workshop_id;

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

-- Congé : seulement pour un local loué (version de 0027, plus le refus d'un local possédé).
create or replace function public.donner_conge(
  p_company_id uuid,
  p_mois_conge integer,
  p_preavis_mois integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trouve boolean;
  v_fin integer;
  v_deja integer;
  v_mode text;
begin
  if p_mois_conge is null or p_mois_conge < 0 or p_preavis_mois is null or p_preavis_mois < 0 then
    raise exception 'conge_invalide' using errcode = 'KP400';
  end if;

  select true into v_trouve
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  select w.mois_fin, w.mode_detention into v_deja, v_mode
  from public.workshops w
  where w.company_id = p_company_id;
  if not found then
    raise exception 'aucun_local' using errcode = 'KP404';
  end if;
  if v_mode <> 'bail' then
    raise exception 'local_possede' using errcode = 'KP409';
  end if;
  if v_deja is not null then
    raise exception 'conge_deja_donne: fin au mois %', v_deja using errcode = 'KP409';
  end if;

  v_fin := p_mois_conge + p_preavis_mois;
  update public.workshops
  set mois_conge = p_mois_conge, mois_fin = v_fin
  where company_id = p_company_id;
  return v_fin;
end;
$$;
revoke all on function public.donner_conge(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.donner_conge(uuid, integer, integer) to service_role;

-- Valeur d'entreprise (classement) : le local acheté (213) est un actif, son amortissement (2813) vient en déduction.
-- Fonction de 0027 reprise telle quelle, avec 213 et 2813 ajoutés aux comptes d'actif.
create or replace function public.rafraichir_valeurs_entreprises()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nb_lignes integer;
begin
  with soldes as (
    select
      c.id as company_id,
      coalesce(sum(case
        when l.compte in ('31','35','411','44566','512','275','213','2813')
          then case when l.sens = 'debit' then l.montant_centimes else -l.montant_centimes end
        else 0 end), 0) as actif,
      coalesce(sum(case
        when l.compte in ('164','401','421','431','444','44571')
          then case when l.sens = 'credit' then l.montant_centimes else -l.montant_centimes end
        else 0 end), 0) as passif_externe
    from public.companies c
    left join public.ledger_entries l on l.company_id = c.id
    where c.statut != 'liquidee'
    group by c.id
  )
  insert into public.valeurs_entreprises
    (company_id, valeur_centimes, actif_centimes, passif_externe_centimes, calcule_le)
  select
    s.company_id,
    s.actif - s.passif_externe,
    s.actif,
    s.passif_externe,
    now()
  from soldes s
  on conflict (company_id) do update set
    valeur_centimes = excluded.valeur_centimes,
    actif_centimes = excluded.actif_centimes,
    passif_externe_centimes = excluded.passif_externe_centimes,
    calcule_le = excluded.calcule_le;

  get diagnostics nb_lignes = row_count;
  return nb_lignes;
end;
$$;
grant execute on function public.rafraichir_valeurs_entreprises() to authenticated, service_role;
