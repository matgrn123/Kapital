-- AE-4 : capacité d'emprunt. Objet du prêt et création atomique d'un prêt.
--
-- 1. loans.objet : à quoi sert le prêt (trésorerie, équipement, immobilier). Les prêts
--    déjà en base sont des prêts de trésorerie (seul objet qui existait).
-- 2. creer_pret : une seule transaction pour le prêt, son échéancier (avec mois_jeu)
--    et l'écriture comptable de mise à disposition (512 débit, 164 crédit). Avant,
--    la route faisait trois écritures séparées : une panne au milieu laissait un prêt
--    sans échéancier ou sans argent en banque.
--
-- Les plafonds, durées et taux viennent de packages/content/parametres-v1.json : le serveur
-- les applique avant l'appel et passe ici le plafond d'endettement calculé ; la fonction le
-- revérifie sous verrou pour que deux demandes simultanées ne dépassent pas le plafond.

set statement_timeout = '60s';

alter table public.loans
  add column if not exists objet text not null default 'tresorerie';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'loans_objet_check' and conrelid = 'public.loans'::regclass
  ) then
    alter table public.loans
      add constraint loans_objet_check check (objet in ('tresorerie', 'equipement', 'immobilier'));
  end if;
end;
$$;

create or replace function public.creer_pret(
  p_company_id uuid,
  p_objet text,
  p_capital_centimes bigint,
  p_taux_annuel numeric,
  p_duree_mois integer,
  p_mois_jeu integer,
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
  v_dette bigint;
  v_loan_id uuid;
  v_nb integer;
  v_somme_amortissements bigint;
begin
  if p_objet is null or p_objet not in ('tresorerie', 'equipement', 'immobilier') then
    raise exception 'objet_invalide: %', p_objet using errcode = 'KP400';
  end if;
  if p_capital_centimes is null or p_capital_centimes <= 0 then
    raise exception 'capital_invalide: %', p_capital_centimes using errcode = 'KP400';
  end if;
  if p_taux_annuel is null or p_taux_annuel < 0 then
    raise exception 'taux_invalide: %', p_taux_annuel using errcode = 'KP400';
  end if;
  if p_duree_mois is null or p_duree_mois < 1 then
    raise exception 'duree_invalide: %', p_duree_mois using errcode = 'KP400';
  end if;
  if p_mois_jeu is null or p_mois_jeu < 0 then
    raise exception 'mois_jeu_invalide: %', p_mois_jeu using errcode = 'KP400';
  end if;

  -- Échéancier cohérent : une ligne par mois, qui rembourse exactement le capital.
  select count(*), coalesce(sum(x.amortissement_centimes), 0)
    into v_nb, v_somme_amortissements
  from jsonb_to_recordset(coalesce(p_echeancier, '[]'::jsonb))
    as x(numero integer, amortissement_centimes bigint);
  if v_nb <> p_duree_mois or v_somme_amortissements <> p_capital_centimes then
    raise exception 'echeancier_incoherent: % lignes pour % mois, amortissements % pour un capital de %',
      v_nb, p_duree_mois, v_somme_amortissements, p_capital_centimes using errcode = 'KP400';
  end if;

  -- Verrou sur l'entreprise : deux demandes simultanées se mettent en file.
  select true into v_trouve
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  select coalesce(sum(l.capital_restant_centimes), 0) into v_dette
  from public.loans l
  where l.company_id = p_company_id and l.statut = 'actif';

  if v_dette + p_capital_centimes > p_plafond_endettement_centimes then
    raise exception 'endettement_excessif: dette % + prêt % au-dessus du plafond %',
      v_dette, p_capital_centimes, p_plafond_endettement_centimes using errcode = 'KP422';
  end if;

  insert into public.loans
    (company_id, capital_initial_centimes, capital_restant_centimes, taux_annuel,
     duree_mois, instant_debut, mois_jeu_debut, objet)
  values
    (p_company_id, p_capital_centimes, p_capital_centimes, p_taux_annuel,
     p_duree_mois, p_instant_debut, p_mois_jeu, p_objet)
  returning id into v_loan_id;

  insert into public.loan_schedules
    (loan_id, numero, mensualite_centimes, interets_centimes, amortissement_centimes,
     capital_restant_apres_centimes, instant_prevu, mois_jeu)
  select v_loan_id, x.numero, x.mensualite_centimes, x.interets_centimes, x.amortissement_centimes,
         x.capital_restant_apres_centimes, x.instant_prevu, p_mois_jeu + x.numero
  from jsonb_to_recordset(p_echeancier)
    as x(numero integer, mensualite_centimes bigint, interets_centimes bigint,
         amortissement_centimes bigint, capital_restant_apres_centimes bigint,
         instant_prevu timestamptz);

  -- Mise à disposition : 512 (banque) au débit, 164 (emprunts) au crédit. Le capital
  -- ne passe jamais par le résultat ; les intérêts (661) viennent avec chaque échéance.
  insert into public.ledger_entries
    (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
  values
    (p_company_id, 'pret_' || v_loan_id::text, p_mois_jeu, 'Mise à disposition du prêt', '512', 'debit', p_capital_centimes),
    (p_company_id, 'pret_' || v_loan_id::text, p_mois_jeu, 'Mise à disposition du prêt', '164', 'credit', p_capital_centimes);

  return v_loan_id;
end;
$$;

-- Réservée au serveur (clé de service) : jamais appelable depuis un navigateur.
revoke all on function public.creer_pret(uuid, text, bigint, numeric, integer, integer, timestamptz, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.creer_pret(uuid, text, bigint, numeric, integer, integer, timestamptz, bigint, jsonb)
  to service_role;
