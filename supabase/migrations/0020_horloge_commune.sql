-- TP-2b : horloge commune et application atomique d'un pas.
--
-- Le temps de jeu se lit sur le calendrier du serveur : un monde naît à un instant
-- réel (worlds.debut_reel) et chaque pas de 10 minutes réelles est traité une
-- seule fois par entreprise (companies.pas_traites). La durée d'un pas et le
-- ratio vivent dans packages/content/parametres-v1.json, pas dans la base.
--
-- Cette migration ne change aucun comportement existant : elle ajoute des
-- colonnes vides et une fonction que seul le serveur peut appeler.

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Date de création du monde sur l'horloge commune
--    NULL = monde encore sur l'ancienne clôture mensuelle. L'orchestrateur
--    (TP-2c) l'initialise à l'activation, pour garder la continuité du mois.
--    Un monde créé à partir de maintenant démarre directement sur la nouvelle horloge.
-- ---------------------------------------------------------------------------

alter table public.worlds
  add column if not exists debut_reel timestamptz;

alter table public.worlds
  alter column debut_reel set default now();

-- ---------------------------------------------------------------------------
-- 2. Nombre de pas déjà traités par entreprise
--    NULL = pas encore démarrée sur l'horloge commune : l'orchestrateur la
--    positionne sur le pas courant, sans rejouer d'historique.
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists pas_traites integer
  check (pas_traites is null or pas_traites >= 0);

-- ---------------------------------------------------------------------------
-- 3. État du mois en cours par entreprise (CumulMois du moteur, en JSON)
--    Serveur uniquement : RLS activée, aucune policy.
-- ---------------------------------------------------------------------------

create table if not exists public.etat_mois_entreprise (
  company_id uuid primary key references public.companies(id) on delete cascade,
  mois integer not null check (mois >= 0),
  cumul jsonb not null,
  mis_a_jour_le timestamptz not null default now()
);

alter table public.etat_mois_entreprise enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Application atomique d'un pas pour une entreprise
--
--    Tout ou rien, dans une seule transaction : écritures comptables, stocks,
--    prêts, marque, statut, commandes livrées, état du mois et compteur de pas.
--    Si le serveur plante ou si deux traitements se croisent, le pas n'est
--    jamais appliqué deux fois : le compteur doit valoir p_pas_attendu.
--
--    p_etat (objet JSON, toutes les clés sont facultatives) :
--      ecritures                : [{ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes}]
--      stocks_matiere           : [{material_id, quantite, valeur_totale_centimes}]
--      stocks_finis             : [{product_id, quantite_pieces, valeur_totale_centimes}]
--      prets                    : [{id, capital_restant_centimes}]
--      echeances_payees         : [{loan_id, numero}]
--      marque                   : {notoriete, desirabilite}
--      entreprise               : {statut, mois_decouvert_consecutifs}
--      commandes_matiere_livrees: [uuid]
--      ordres_faconnier_livres  : [uuid]
--      cumul                    : objet (état du mois en cours, avec sa clé "mois") ou null à la clôture du mois
--
--    Erreurs : KP404 entreprise introuvable ; KP409 pas déjà traité (ou manquant).
-- ---------------------------------------------------------------------------

create or replace function public.appliquer_pas_entreprise(
  p_company_id uuid,
  p_pas_attendu integer,
  p_etat jsonb
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

  -- Entreprise : statut, découvert consécutif et compteur de pas (en dernier)
  update public.companies
  set statut = coalesce(v_etat->'entreprise'->>'statut', statut),
      mois_decouvert_consecutifs = coalesce(
        (v_etat->'entreprise'->>'mois_decouvert_consecutifs')::integer,
        mois_decouvert_consecutifs
      ),
      pas_traites = p_pas_attendu + 1
  where id = p_company_id;

  return p_pas_attendu + 1;
end;
$$;

-- Réservée au serveur (clé de service) : jamais appelable depuis un navigateur.
revoke all on function public.appliquer_pas_entreprise(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.appliquer_pas_entreprise(uuid, integer, jsonb)
  to service_role;
