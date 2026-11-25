-- 0040 : 3D-7, plusieurs locaux (ateliers) par société.
--
-- 1. workshops.company_id n'est plus unique (contrainte posée en 0005) : une société peut louer ou
--    acheter plusieurs locaux. Un index simple garde les lectures par société rapides.
-- 2. signer_bail et acheter_local (versions de 0036, mêmes signatures) : plus de refus
--    local_deja_loue / local_deja_detenu ; chaque appel crée un nouveau local, avec ses 2 postes
--    poste_couture_base posés comme en 0036. Leurs écritures portent déjà l'id du local
--    (bail_signature_<local>, achat_local_<local>) : la mission 5 « Louer ou acheter » (0039,
--    apps/web/lib/missions.ts, moteur missions/metriques.ts) lit ces préfixes, inchangés.
-- 3. donner_conge prend le local visé (p_workshop_id), qui doit appartenir à la société ;
--    l'ancienne version (sans local) est supprimée.
-- 4. appliquer_pas_entreprise (dernière version : 0037 ; 0038 et 0039 ne la redéfinissent pas) :
--    la fin de bail libère le seul local dont l'id termine l'écriture de restitution
--    (bail_restitution_<mois>_<société>_<local>). Le plan prévu est promu local par local (comme
--    en 0037). Tout le reste est identique.
-- 5. comptes_publics (vue de 0038, mêmes colonnes, même liste blanche) : l'extérieur est celui du
--    plus ancien local, pour garder une ligne par société.
--
-- sauvegarder_amenagement et annuler_amenagement_prevu (0037) ciblent déjà un p_workshop_id qui
-- doit appartenir à la société (« where id = p_workshop_id and company_id = p_company_id ») :
-- inchangées.
--
-- Aucun chiffre nouveau. Rejouable : drop ... if exists, create ... if not exists, create or replace.
-- N'écrit ni ne supprime aucune donnée à l'application.

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Plusieurs locaux par société
-- ---------------------------------------------------------------------------

alter table public.workshops drop constraint if exists workshops_company_id_key;
create index if not exists workshops_company_id_idx on public.workshops (company_id);

-- ---------------------------------------------------------------------------
-- 2. Bail et achat : un nouveau local à chaque fois
-- ---------------------------------------------------------------------------

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

  -- Verrou sur l'entreprise : deux signatures simultanées se mettent en file (chacune son local).
  select true into v_trouve
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  -- 3D-7 : plus de refus « local_deja_loue » : chaque bail crée un nouveau local.

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

  -- 3D-7 : plus de refus « local_deja_detenu » : chaque achat crée un nouveau local.

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

-- ---------------------------------------------------------------------------
-- 3. Congé d'un local précis
-- ---------------------------------------------------------------------------

drop function if exists public.donner_conge(uuid, integer, integer);

create or replace function public.donner_conge(
  p_company_id uuid,
  p_workshop_id uuid,
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
  if p_workshop_id is null
     or p_mois_conge is null or p_mois_conge < 0 or p_preavis_mois is null or p_preavis_mois < 0 then
    raise exception 'conge_invalide' using errcode = 'KP400';
  end if;

  select true into v_trouve
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  -- Le local doit appartenir à la société ; les autres locaux ne sont pas touchés.
  select w.mois_fin, w.mode_detention into v_deja, v_mode
  from public.workshops w
  where w.id = p_workshop_id and w.company_id = p_company_id
  for update;
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
  where id = p_workshop_id and company_id = p_company_id;
  return v_fin;
end;
$$;
revoke all on function public.donner_conge(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.donner_conge(uuid, uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Application atomique d'un pas (remplace la version de 0037)
-- ---------------------------------------------------------------------------

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

  -- 3D-5 : le plan d'aménagement prévu s'applique à la clôture du mois, local par local (3D-7 : chaque
  -- local dont plan_prevu_mois est renseigné voit son plan prévu remplacer son plan en service). Le lot contient une
  -- clôture quand la charge utile porte mois_decouvert_consecutifs (stockageSupabase.chargeUtileDepuisLot
  -- ne le renseigne que si le lot a clos un mois). Le plan en service est remplacé par le plan prévu,
  -- qui devient actif. Fait AVANT la fin de bail : un local libéré emporte ses modules.
  if (v_etat->'entreprise') ? 'mois_decouvert_consecutifs' then
    delete from public.placed_modules pm
     using public.workshops w
     where pm.workshop_id = w.id
       and w.company_id = p_company_id
       and w.plan_prevu_mois is not null
       and pm.statut = 'actif';

    update public.placed_modules pm
       set statut = 'actif'
      from public.workshops w
     where pm.workshop_id = w.id
       and w.company_id = p_company_id
       and w.plan_prevu_mois is not null
       and pm.statut = 'prevu';

    update public.workshops
       set plan_prevu_mois = null,
           plan_prevu_cout_centimes = 0
     where company_id = p_company_id
       and plan_prevu_mois is not null;
  end if;

  -- Fin de bail (AE-5), local par local (3D-7) : l'écriture de restitution du dépôt porte l'id du
  -- local libéré à la fin (« bail_restitution_<mois>_<société>_<local> », moteur ecritureRestitutionDepot).
  -- Seul ce local disparaît (avec ses modules posés) ; les autres locaux et les écritures restent.
  delete from public.workshops w
   where w.company_id = p_company_id
     and exists (
       select 1
       from jsonb_to_recordset(coalesce(v_etat->'ecritures', '[]'::jsonb)) as x(ecriture_id text)
       where x.ecriture_id like 'bail_restitution\_%'
         and right(x.ecriture_id, length(w.id::text) + 1) = '_' || w.id::text
     );

  -- Compatibilité : une restitution à l'ancien format (« bail_restitution_<mois>_<société> », sans
  -- local) libère les locaux loués dont le bail est fini à ce mois-là, comme avant 3D-7.
  delete from public.workshops w
   where w.company_id = p_company_id
     and w.mode_detention = 'bail'
     and exists (
       select 1
       from jsonb_to_recordset(coalesce(v_etat->'ecritures', '[]'::jsonb)) as x(ecriture_id text, mois_jeu integer)
       where x.ecriture_id = 'bail_restitution_' || x.mois_jeu::text || '_' || p_company_id::text
         and w.mois_fin is not null
         and w.mois_fin <= x.mois_jeu
     );

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
revoke all on function public.appliquer_pas_entreprise(uuid, integer, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.appliquer_pas_entreprise(uuid, integer, jsonb, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Comptes publics : une ligne par société, quel que soit le nombre de locaux
-- ---------------------------------------------------------------------------

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
-- 3D-7 : plusieurs locaux par société ; l'extérieur montré est celui du plus ancien (une ligne par société).
left join lateral (
  select w2.batiment_id
  from public.workshops w2
  where w2.company_id = c.id
  order by w2.cree_le, w2.id
  limit 1
) wk on true
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
    coalesce(sum(case when l.compte in ('213', '2135', '2154', '275', '31', '35', '411', '44566', '512')
      then case when l.sens = 'debit' then l.montant_centimes else -l.montant_centimes end
      else 0 end), 0)::bigint as total_bilan_centimes
  from public.ledger_entries l
  where l.company_id = c.id
    and l.mois_jeu <= ex.numero * 12 + 11
) a on ex.numero is not null
where c.statut <> 'liquidee';

comment on view public.comptes_publics is
  '3D-8 : comptes annuels publics (dernier exercice clos) et extérieur. Liste blanche : voir migration 0035 (2135 ajouté en 0038 ; 3D-7, 0040 : un seul local par ligne).';

revoke all on public.comptes_publics from public, anon, authenticated;
grant select on public.comptes_publics to authenticated, service_role;
