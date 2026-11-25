-- AE-5 : bail d'un local (dépôt de garantie, loyer, charges, préavis, fin de bail).
--
-- 1. workshops : bâtiment du catalogue, mode de détention, dépôt de garantie, charges,
--    mois de signature, de congé et de fin. Les ateliers déjà en base gardent leur loyer
--    et n'ont ni dépôt ni charges (valeurs à 0) : rien ne change pour eux.
-- 2. signer_bail : une seule transaction pour le local et l'écriture du dépôt
--    (275 débit, 512 crédit). La route calcule les montants depuis le catalogue et les
--    paramètres ; la fonction revérifie sous verrou qu'il n'y a pas déjà un local.
-- 3. donner_conge : enregistre le congé et le dernier mois du bail (mois de congé + préavis).
-- 4. appliquer_pas_entreprise remplacée (partie de 0025 reprise telle quelle) : quand le lot
--    contient l'écriture de restitution du dépôt, le local est libéré.
--
-- Le préavis, le dépôt et le nombre de machines viennent de packages/content/parametres-v1.json.

set statement_timeout = '60s';

alter table public.workshops
  add column if not exists batiment_id text,
  add column if not exists mode_detention text not null default 'bail'
    check (mode_detention in ('bail', 'achat', 'credit')),
  add column if not exists depot_garantie_centimes bigint not null default 0
    check (depot_garantie_centimes >= 0),
  add column if not exists charges_mensuelles_centimes bigint not null default 0
    check (charges_mensuelles_centimes >= 0),
  add column if not exists mois_signature integer,
  add column if not exists mois_conge integer,
  add column if not exists mois_fin integer;

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
    (company_id, surface_m2, loyer_mensuel_centimes, nombre_machines, batiment_id,
     mode_detention, depot_garantie_centimes, charges_mensuelles_centimes, mois_signature)
  values
    (p_company_id, p_surface_m2, p_loyer_centimes, p_nombre_machines, p_batiment_id,
     'bail', p_depot_centimes, p_charges_centimes, p_mois_jeu)
  returning id into v_workshop_id;

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

  select w.mois_fin into v_deja
  from public.workshops w
  where w.company_id = p_company_id;
  if not found then
    raise exception 'aucun_local' using errcode = 'KP404';
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

-- Application atomique d'un pas (remplace la version de 0025 ; tout le reste est identique,
-- sauf la libération du local en fin de bail).
create or replace function public.appliquer_pas_entreprise(
  p_company_id uuid,
  p_pas_attendu integer,
  p_etat jsonb,
  p_nb_pas integer default 1
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trouve boolean;
  v_pas integer;
  v_etat jsonb := coalesce(p_etat, '{}'::jsonb);
begin
  if p_nb_pas is null or p_nb_pas < 1 then
    raise exception 'nb_pas_invalide: %', p_nb_pas using errcode = 'KP400';
  end if;

  -- Verrou sur l'entreprise : deux traitements simultanés se mettent en file.
  select true, c.pas_traites into v_trouve, v_pas
  from public.companies c
  where c.id = p_company_id
  for update;

  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  if v_pas is distinct from p_pas_attendu then
    raise exception 'pas_deja_traite: attendu %, trouvé %', p_pas_attendu, v_pas
      using errcode = 'KP409';
  end if;

  -- Écritures comptables (une seule instruction : le trigger d'équilibre vérifie
  -- chaque écriture complète, celui de trésorerie met à jour la banque).
  insert into public.ledger_entries
    (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
  select p_company_id, x.ecriture_id, x.mois_jeu, x.libelle, x.compte, x.sens, x.montant_centimes
  from jsonb_to_recordset(coalesce(v_etat->'ecritures', '[]'::jsonb))
    as x(ecriture_id text, mois_jeu integer, libelle text, compte text, sens text, montant_centimes bigint);

  -- Stocks de matières
  insert into public.material_stock
    (company_id, material_id, quantite, valeur_totale_centimes, mise_a_jour_le)
  select p_company_id, x.material_id, x.quantite, x.valeur_totale_centimes, now()
  from jsonb_to_recordset(coalesce(v_etat->'stocks_matiere', '[]'::jsonb))
    as x(material_id text, quantite numeric, valeur_totale_centimes bigint)
  on conflict (company_id, material_id) do update
    set quantite = excluded.quantite,
        valeur_totale_centimes = excluded.valeur_totale_centimes,
        mise_a_jour_le = now();

  -- Stocks de produits finis
  insert into public.product_stock
    (company_id, product_id, quantite_pieces, valeur_totale_centimes, mise_a_jour_le)
  select p_company_id, x.product_id, x.quantite_pieces, x.valeur_totale_centimes, now()
  from jsonb_to_recordset(coalesce(v_etat->'stocks_finis', '[]'::jsonb))
    as x(product_id text, quantite_pieces integer, valeur_totale_centimes bigint)
  on conflict (company_id, product_id) do update
    set quantite_pieces = excluded.quantite_pieces,
        valeur_totale_centimes = excluded.valeur_totale_centimes,
        mise_a_jour_le = now();

  -- Prêts : capital restant, et prêt soldé quand il n'y a plus rien à rembourser
  update public.loans l
  set capital_restant_centimes = x.capital_restant_centimes,
      statut = case when x.capital_restant_centimes <= 0 then 'solde' else l.statut end
  from jsonb_to_recordset(coalesce(v_etat->'prets', '[]'::jsonb))
    as x(id uuid, capital_restant_centimes bigint)
  where l.id = x.id and l.company_id = p_company_id;

  update public.loan_schedules s
  set statut = 'payee'
  from jsonb_to_recordset(coalesce(v_etat->'echeances_payees', '[]'::jsonb))
    as x(loan_id uuid, numero integer)
  where s.loan_id = x.loan_id
    and s.numero = x.numero
    and exists (
      select 1 from public.loans l where l.id = s.loan_id and l.company_id = p_company_id
    );

  -- Marque
  if jsonb_typeof(v_etat->'marque') = 'object' then
    insert into public.brand_state (company_id, notoriete, desirabilite, mise_a_jour_le)
    values (
      p_company_id,
      (v_etat->'marque'->>'notoriete')::numeric,
      (v_etat->'marque'->>'desirabilite')::numeric,
      now()
    )
    on conflict (company_id) do update
      set notoriete = excluded.notoriete,
          desirabilite = excluded.desirabilite,
          mise_a_jour_le = now();
  end if;

  -- Commandes livrées pendant ce pas
  update public.purchase_orders
  set statut = 'livree'
  where company_id = p_company_id
    and id in (
      select (j)::uuid from jsonb_array_elements_text(coalesce(v_etat->'commandes_matiere_livrees', '[]'::jsonb)) as j
    );

  update public.production_orders
  set statut = 'livree'
  where company_id = p_company_id
    and id in (
      select (j)::uuid from jsonb_array_elements_text(coalesce(v_etat->'ordres_faconnier_livres', '[]'::jsonb)) as j
    );

  -- État du mois en cours : conservé entre deux pas, supprimé à la clôture du mois
  if jsonb_typeof(v_etat->'cumul') = 'object' then
    insert into public.etat_mois_entreprise (company_id, mois, cumul, mis_a_jour_le)
    values (p_company_id, (v_etat->'cumul'->>'mois')::integer, v_etat->'cumul', now())
    on conflict (company_id) do update
      set mois = excluded.mois, cumul = excluded.cumul, mis_a_jour_le = now();
  else
    delete from public.etat_mois_entreprise where company_id = p_company_id;
  end if;

  -- Fin de bail (AE-5) : quand l'écriture de restitution du dépôt est dans le lot, le local est libéré
  -- (la ligne workshops et ses modules posés disparaissent ; les écritures, elles, restent).
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(v_etat->'ecritures', '[]'::jsonb)) as x(ecriture_id text)
    where x.ecriture_id like 'bail_restitution\_%'
  ) then
    delete from public.workshops where company_id = p_company_id;
  end if;

  -- Entreprise : statut, découvert consécutif, étape, compteurs de progression
  -- et compteur de pas (en dernier). L'étape ne redescend jamais (greatest).
  update public.companies
  set statut = coalesce(v_etat->'entreprise'->>'statut', statut),
      mois_decouvert_consecutifs = coalesce(
        (v_etat->'entreprise'->>'mois_decouvert_consecutifs')::integer,
        mois_decouvert_consecutifs
      ),
      etape = greatest(
        etape,
        coalesce((v_etat->'entreprise'->>'etape')::smallint, etape)
      ),
      pieces_vendues_total = coalesce(
        (v_etat->'entreprise'->>'pieces_vendues_total')::bigint,
        pieces_vendues_total
      ),
      chiffre_affaires_cumule_ht_centimes = coalesce(
        (v_etat->'entreprise'->>'chiffre_affaires_cumule_ht_centimes')::bigint,
        chiffre_affaires_cumule_ht_centimes
      ),
      pas_traites = p_pas_attendu + p_nb_pas
  where id = p_company_id;

  return p_pas_attendu + p_nb_pas;
end;
$$;

-- Droits : create or replace conserve ceux de 0025 ; on les réaffirme par prudence.
revoke all on function public.appliquer_pas_entreprise(uuid, integer, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.appliquer_pas_entreprise(uuid, integer, jsonb, integer)
  to service_role;

-- Valeur d'entreprise (classement) : le dépôt de garantie versé (275) est un actif, pas une perte.
-- Fonction de 0012 reprise telle quelle, avec 275 ajouté aux comptes d'actif.
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
        when l.compte in ('31','35','411','44566','512','275')
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
