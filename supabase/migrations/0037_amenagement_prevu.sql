-- 3D-5 : le plan d'aménagement est revalidé et enregistré par le serveur ; il s'applique à la
-- clôture suivante (cahier des charges, section 13).
--
-- 1. placed_modules.statut : 'actif' (le plan en service, lu par le moteur) ou 'prevu' (le plan
--    enregistré par le joueur, appliqué à la fin du mois de jeu). Toutes les lignes existantes
--    restent 'actif'.
-- 2. workshops.plan_prevu_mois (mois de jeu de l'enregistrement ; null = pas de plan prévu, même
--    vide) et workshops.plan_prevu_cout_centimes (modules achetés pour ce plan, déjà payés).
-- 3. sauvegarder_amenagement (remplace 0031, même signature) : écrit le plan en 'prevu'. Les
--    modules achetés sont payés à l'enregistrement (2154 / 512, comme avant). Si un plan prévu
--    existait déjà, sa commande est annulée d'abord : contre-passation 512 / 2154 de son coût.
-- 4. annuler_amenagement_prevu : supprime le plan prévu et contre-passe sa commande.
-- 5. appliquer_pas_entreprise (remplace 0027 ; tout le reste est identique) : quand le lot clôt
--    un mois, le plan prévu remplace le plan actif.
--
-- Le retrait d'un module acheté et pas encore amorti est refusé par la route (lib/amenagement.ts) :
-- sa sortie de l'actif (valeur nette en 675) reste à valider. Rien ne change pour le moteur, qui ne
-- lit que les modules 'actif' (stockageSupabase.chargerEtat).
--
-- Idempotente : add column if not exists, create or replace, drop ... if exists.

set statement_timeout = '60s';

alter table public.placed_modules
  add column if not exists statut text not null default 'actif';

alter table public.placed_modules
  drop constraint if exists placed_modules_statut_check;
alter table public.placed_modules
  add constraint placed_modules_statut_check check (statut in ('actif', 'prevu'));

create index if not exists placed_modules_workshop_statut_idx
  on public.placed_modules (workshop_id, statut);

alter table public.workshops
  add column if not exists plan_prevu_mois integer,
  add column if not exists plan_prevu_cout_centimes bigint not null default 0;

alter table public.workshops
  drop constraint if exists workshops_plan_prevu_cout_check;
alter table public.workshops
  add constraint workshops_plan_prevu_cout_check check (plan_prevu_cout_centimes >= 0);

-- ---------------------------------------------------------------------------
-- Enregistrement du plan prévu (remplace la version de 0031, même signature)
-- ---------------------------------------------------------------------------

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

  update public.workshops
     set plan_prevu_mois = p_mois_jeu,
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
revoke all on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Annulation du plan prévu
-- ---------------------------------------------------------------------------

create or replace function public.annuler_amenagement_prevu(
  p_company_id uuid,
  p_workshop_id uuid,
  p_mois_jeu integer,
  p_ecriture_id text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trouve boolean;
  v_prevu integer;
  v_cout bigint;
begin
  if p_mois_jeu is null or p_mois_jeu < 0 then
    raise exception 'mois_invalide' using errcode = 'KP400';
  end if;

  select true into v_trouve
  from public.companies where id = p_company_id for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  select plan_prevu_mois, plan_prevu_cout_centimes into v_prevu, v_cout
  from public.workshops
  where id = p_workshop_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'atelier_introuvable' using errcode = 'KP404';
  end if;
  if v_prevu is null then
    raise exception 'aucun_plan_prevu' using errcode = 'KP409';
  end if;

  -- Remboursement de la commande (contre-passation de 2154 / 512) : modules jamais posés.
  if v_cout > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Annulation de la commande de modules (plan prévu annulé)', '512', 'debit', v_cout),
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Annulation de la commande de modules (plan prévu annulé)', '2154', 'credit', v_cout);
  end if;

  delete from public.placed_modules where workshop_id = p_workshop_id and statut = 'prevu';

  update public.workshops
     set plan_prevu_mois = null,
         plan_prevu_cout_centimes = 0
   where id = p_workshop_id;

  return v_cout;
end;
$$;
revoke all on function public.annuler_amenagement_prevu(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.annuler_amenagement_prevu(uuid, uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Application atomique d'un pas (remplace la version de 0027 ; tout le reste est identique,
-- sauf l'application du plan prévu à la clôture du mois).
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

  -- 3D-5 : le plan d'aménagement prévu s'applique à la clôture du mois. Le lot contient une
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
revoke all on function public.appliquer_pas_entreprise(uuid, integer, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.appliquer_pas_entreprise(uuid, integer, jsonb, integer)
  to service_role;
