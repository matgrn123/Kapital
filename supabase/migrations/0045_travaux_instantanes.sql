-- 0045 : travaux et aménagement en heures réelles (lot T3 du plan « horloge réelle »,
-- décisions de Mathieu du 26 novembre 2026).
--
-- Avant : la boutique ouvrait « le mois suivant » (un mois de travaux) et un plan
-- d'aménagement d'atelier attendait la clôture du mois pour entrer en service.
-- Après : l'horloge du jeu est l'horloge réelle, un mois dure un vrai mois. Les travaux de la
-- boutique durent 24 h réelles (paramètre boutique_travaux_duree_heures) et un plan
-- d'aménagement s'applique 2 h réelles après sa sauvegarde (paramètre amenagement_delai_heures).
-- Les instants sont calculés par les routes (ouvrir-boutique, sauvegarder-amenagement) à partir
-- de ces paramètres ; la base ne contient aucune durée.
--
-- 1. points_de_vente.ouverture_le : instant réel de la fin des travaux. Le moteur ne vend rien
--    en boutique avant (stockageSupabase.chargerEtat le lit). mois_ouverture reste : c'est le
--    mois qui contient cet instant (début de l'amortissement des agencements, missions).
-- 2. workshops.plan_prevu_le : instant réel où le plan prévu entre en service. N'a de sens que
--    si plan_prevu_mois est renseigné (un plan prévu existe).
-- 3. ouvrir_boutique : nouvelle version à 11 arguments (p_ouverture_le). La version à
--    10 arguments (0038) reste, et appelle la nouvelle sans instant : le code d'avant 0045
--    continue de marcher (la boutique s'ouvre alors au mois, comme avant).
-- 4. sauvegarder_amenagement : nouvelle version à 7 arguments (p_prevu_le). La version à
--    6 arguments (0037) reste, et appelle la nouvelle sans instant (plan appliqué à la clôture
--    du mois, comme avant). L'écriture d'achat des modules (2154 / 512) et la contre-passation
--    d'un plan prévu remplacé (512 / 2154) sont inchangées : chaque écriture reste équilibrée.
-- 5. appliquer_pas_entreprise (remplace la version de 0040, tout le reste identique) : un plan
--    prévu dont plan_prevu_le est atteint à la fin du lot (charge utile instant_fin_lot, ou
--    now() sans elle) remplace le plan en service ; un plan prévu sans heure s'applique à la
--    clôture du mois, comme avant.
--
-- Aucune écriture comptable nouvelle, aucun montant. Le préavis de bail ramené à 1 mois
-- (bail_preavis_mois) ne demande rien en base : donner_conge reçoit le préavis de la route.
--
-- Rejouable : add column if not exists, create or replace. N'écrit aucune donnée.

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. et 2. Instants de fin des travaux et de mise en place du plan
-- ---------------------------------------------------------------------------

alter table public.points_de_vente add column if not exists ouverture_le timestamptz;
comment on column public.points_de_vente.ouverture_le is
  'T3 (0045) : instant réel de la fin des travaux (signature + boutique_travaux_duree_heures). Null : boutique d''avant 0045, ouverte au mois mois_ouverture.';

alter table public.workshops add column if not exists plan_prevu_le timestamptz;
comment on column public.workshops.plan_prevu_le is
  'T3 (0045) : instant réel où le plan prévu entre en service (sauvegarde + amenagement_delai_heures). Lu seulement si plan_prevu_mois est renseigné ; null : à la clôture du mois.';

-- ---------------------------------------------------------------------------
-- 3. Ouverture d'une boutique, avec l'instant de la fin des travaux
-- ---------------------------------------------------------------------------

create or replace function public.ouvrir_boutique(
  p_company_id uuid,
  p_batiment_id text,
  p_surface_m2 integer,
  p_loyer_centimes bigint,
  p_charges_centimes bigint,
  p_depot_centimes bigint,
  p_travaux_centimes bigint,
  p_duree_amortissement_mois integer,
  p_mois_signature integer,
  p_mois_ouverture integer,
  p_ouverture_le timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tresorerie bigint;
  v_id uuid;
begin
  if p_batiment_id is null or p_batiment_id not like 'boutique%' then
    raise exception 'batiment_invalide' using errcode = 'KP400';
  end if;
  if p_surface_m2 is null or p_surface_m2 <= 0
     or p_loyer_centimes is null or p_loyer_centimes < 0
     or p_charges_centimes is null or p_charges_centimes < 0
     or p_depot_centimes is null or p_depot_centimes < 0
     or p_travaux_centimes is null or p_travaux_centimes < 0
     or p_duree_amortissement_mois is null or p_duree_amortissement_mois <= 0
     or p_mois_signature is null or p_mois_signature < 0
     or p_mois_ouverture is null or p_mois_ouverture < p_mois_signature then
    raise exception 'boutique_invalide' using errcode = 'KP400';
  end if;

  -- Verrou sur la société : deux ouvertures simultanées se mettent en file.
  select c.tresorerie_centimes into v_tresorerie
  from public.companies c
  where c.id = p_company_id
  for update;
  if not found then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  if exists (
    select 1 from public.points_de_vente p
    where p.company_id = p_company_id and p.statut = 'actif'
  ) then
    raise exception 'boutique_deja_ouverte' using errcode = 'KP409';
  end if;

  -- Revérifié sous verrou : la route l'a déjà contrôlé avec le moteur.
  if v_tresorerie < p_depot_centimes + p_travaux_centimes then
    raise exception 'tresorerie_insuffisante: il manque %', p_depot_centimes + p_travaux_centimes - v_tresorerie
      using errcode = 'KP402';
  end if;

  insert into public.points_de_vente
    (company_id, batiment_id, surface_m2, loyer_mensuel_centimes, charges_mensuelles_centimes,
     depot_garantie_centimes, travaux_centimes, duree_amortissement_mois, mois_signature, mois_ouverture,
     ouverture_le)
  values
    (p_company_id, p_batiment_id, p_surface_m2, p_loyer_centimes, p_charges_centimes,
     p_depot_centimes, p_travaux_centimes, p_duree_amortissement_mois, p_mois_signature, p_mois_ouverture,
     p_ouverture_le)
  returning id into v_id;

  -- Dépôt de garantie : 275 (créance sur le bailleur) au débit, 512 au crédit. Identifiant = moteur
  -- (PREFIXE_DEPOT_BOUTIQUE). Inchangé depuis 0038.
  if p_depot_centimes > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, 'boutique_depot_' || v_id::text, p_mois_signature,
       'Dépôt de garantie versé (bail commercial de la boutique)', '275', 'debit', p_depot_centimes),
      (p_company_id, 'boutique_depot_' || v_id::text, p_mois_signature,
       'Dépôt de garantie versé (bail commercial de la boutique)', '512', 'credit', p_depot_centimes);
  end if;

  -- Travaux d'agencement : immobilisation 2135 au débit, 512 au crédit (PREFIXE_TRAVAUX_BOUTIQUE).
  -- Amortis par le moteur à la clôture (681 / 28135) à partir du mois d'ouverture. Inchangé depuis 0038.
  if p_travaux_centimes > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, 'boutique_travaux_' || v_id::text, p_mois_signature,
       'Travaux d''agencement de la boutique', '2135', 'debit', p_travaux_centimes),
      (p_company_id, 'boutique_travaux_' || v_id::text, p_mois_signature,
       'Travaux d''agencement de la boutique', '512', 'credit', p_travaux_centimes);
  end if;

  return v_id;
end;
$$;
revoke all on function public.ouvrir_boutique(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ouvrir_boutique(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer, timestamptz)
  to service_role;

-- Version de 0038 (10 arguments) : le code d'avant 0045 l'appelle encore pendant la bascule.
create or replace function public.ouvrir_boutique(
  p_company_id uuid,
  p_batiment_id text,
  p_surface_m2 integer,
  p_loyer_centimes bigint,
  p_charges_centimes bigint,
  p_depot_centimes bigint,
  p_travaux_centimes bigint,
  p_duree_amortissement_mois integer,
  p_mois_signature integer,
  p_mois_ouverture integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ouvrir_boutique(
    p_company_id, p_batiment_id, p_surface_m2, p_loyer_centimes, p_charges_centimes,
    p_depot_centimes, p_travaux_centimes, p_duree_amortissement_mois, p_mois_signature,
    p_mois_ouverture, null::timestamptz
  );
end;
$$;
revoke all on function public.ouvrir_boutique(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ouvrir_boutique(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Enregistrement du plan prévu, avec l'heure de sa mise en place
-- ---------------------------------------------------------------------------

create or replace function public.sauvegarder_amenagement(
  p_company_id uuid,
  p_workshop_id uuid,
  p_modules jsonb,
  p_cout_centimes bigint,
  p_mois_jeu integer,
  p_ecriture_id text,
  p_prevu_le timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tresorerie bigint;
  v_cout_precedent bigint;
begin
  if p_cout_centimes is null or p_cout_centimes < 0 then
    raise exception 'cout_invalide' using errcode = 'KP400';
  end if;
  if jsonb_typeof(p_modules) <> 'array' then
    raise exception 'modules_invalides' using errcode = 'KP400';
  end if;
  if p_mois_jeu is null or p_mois_jeu < 0 then
    raise exception 'mois_invalide' using errcode = 'KP400';
  end if;

  -- Verrou sur l'entreprise : la trésorerie lue ne bouge pas pendant la vérification.
  select tresorerie_centimes into v_tresorerie
  from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  select plan_prevu_cout_centimes into v_cout_precedent
  from public.workshops
  where id = p_workshop_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'atelier_introuvable' using errcode = 'KP404';
  end if;

  -- La commande du plan prévu précédent est remboursée : elle compte dans la trésorerie disponible.
  if p_cout_centimes > 0 and v_tresorerie + v_cout_precedent < p_cout_centimes then
    raise exception 'tresorerie_insuffisante: % pour un achat de %', v_tresorerie + v_cout_precedent, p_cout_centimes
      using errcode = 'KP422';
  end if;

  -- Annulation de la commande précédente (contre-passation de 2154 / 512) : modules jamais posés.
  if v_cout_precedent > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, p_ecriture_id || '_annulation', p_mois_jeu, 'Annulation de la commande de modules (plan prévu remplacé)', '512', 'debit', v_cout_precedent),
      (p_company_id, p_ecriture_id || '_annulation', p_mois_jeu, 'Annulation de la commande de modules (plan prévu remplacé)', '2154', 'credit', v_cout_precedent);
  end if;

  -- Le plan en service (statut 'actif') ne change pas : seul le plan prévu est remplacé.
  delete from public.placed_modules where workshop_id = p_workshop_id and statut = 'prevu';

  insert into public.placed_modules (workshop_id, module_type_id, x, y, pivote, statut)
  select p_workshop_id,
         m->>'module_type_id',
         (m->>'x')::integer,
         (m->>'y')::integer,
         coalesce((m->>'pivote')::boolean, false),
         'prevu'
  from jsonb_array_elements(p_modules) as m;

  -- T3 : le plan prévu entre en service à p_prevu_le (appliquer_pas_entreprise) ; null = à la
  -- clôture du mois, comme avant.
  update public.workshops
     set plan_prevu_mois = p_mois_jeu,
         plan_prevu_le = p_prevu_le,
         plan_prevu_cout_centimes = p_cout_centimes
   where id = p_workshop_id;

  -- Achat des modules ajoutés : 2154 (matériel industriel) au débit, 512 (banque) au crédit.
  if p_cout_centimes > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Achat de modules d''aménagement', '2154', 'debit', p_cout_centimes),
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Achat de modules d''aménagement', '512', 'credit', p_cout_centimes);
  end if;
end;
$$;
revoke all on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text, timestamptz)
  to service_role;

-- Version de 0037 (6 arguments) : le code d'avant 0045 l'appelle encore pendant la bascule.
create or replace function public.sauvegarder_amenagement(
  p_company_id uuid,
  p_workshop_id uuid,
  p_modules jsonb,
  p_cout_centimes bigint,
  p_mois_jeu integer,
  p_ecriture_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sauvegarder_amenagement(
    p_company_id, p_workshop_id, p_modules, p_cout_centimes, p_mois_jeu, p_ecriture_id, null::timestamptz
  );
end;
$$;
revoke all on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Application atomique d'un pas (remplace la version de 0040 ; tout le reste est identique,
--    sauf la mise en place du plan prévu à son heure)
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
  -- T3 : le lot clôt un mois quand la charge utile porte mois_decouvert_consecutifs
  -- (stockageSupabase.chargeUtileDepuisLot ne le renseigne que si le lot a clos un mois).
  v_cloture boolean := (coalesce(p_etat, '{}'::jsonb)->'entreprise') ? 'mois_decouvert_consecutifs';
  -- T3 : instant réel de la fin du lot (orchestrateur) ; à défaut (code d'avant 0045), now().
  v_fin_lot timestamptz := coalesce(nullif(coalesce(p_etat, '{}'::jsonb)->>'instant_fin_lot', '')::timestamptz, now());
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

  -- T3 (remplace 3D-5) : le plan d'aménagement prévu s'applique à l'heure prévue, local par
  -- local : workshops.plan_prevu_le (sauvegarde + amenagement_delai_heures, 2 h) atteint à la fin
  -- du lot. Un plan prévu sans heure (enregistré avant 0045) s'applique, comme avant, à la
  -- clôture du mois. Le plan en service est remplacé par le plan prévu, qui devient actif.
  -- Fait AVANT la fin de bail : un local libéré emporte ses modules.
  delete from public.placed_modules pm
   using public.workshops w
   where pm.workshop_id = w.id
     and w.company_id = p_company_id
     and w.plan_prevu_mois is not null
     and ((w.plan_prevu_le is not null and w.plan_prevu_le <= v_fin_lot)
          or (w.plan_prevu_le is null and v_cloture))
     and pm.statut = 'actif';

  update public.placed_modules pm
     set statut = 'actif'
    from public.workshops w
   where pm.workshop_id = w.id
     and w.company_id = p_company_id
     and w.plan_prevu_mois is not null
     and ((w.plan_prevu_le is not null and w.plan_prevu_le <= v_fin_lot)
          or (w.plan_prevu_le is null and v_cloture))
     and pm.statut = 'prevu';

  update public.workshops w
     set plan_prevu_mois = null,
         plan_prevu_le = null,
         plan_prevu_cout_centimes = 0
   where w.company_id = p_company_id
     and w.plan_prevu_mois is not null
     and ((w.plan_prevu_le is not null and w.plan_prevu_le <= v_fin_lot)
          or (w.plan_prevu_le is null and v_cloture));

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
