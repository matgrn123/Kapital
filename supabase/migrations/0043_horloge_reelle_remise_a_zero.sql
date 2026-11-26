-- Horloge réelle (lot T1, décision de Mathieu du 26 novembre 2026).
--
-- Avant : un mois de jeu durait un jour réel ; worlds.mois_courant comptait les mois
-- depuis la création du monde (0, 1, 2…) et worlds.debut_reel datait cette création.
-- Après : l'horloge du jeu EST l'horloge réelle (heure de Paris). Un mois de jeu est un
-- mois calendaire réel, repéré par son index année × 12 + (mois − 1) (novembre 2026 = 24322).
-- Un pas absolu compte les minutes écoulées depuis le 1er janvier 1970 0 h UTC :
-- worlds.debut_reel vaut donc le 1er janvier 1970 (l'outil d'admin « avancer le temps »
-- continue de reculer cette date dans le monde de recette).
--
-- Les données de l'ancien calendrier ne se convertissent pas (un « mois » y durait un
-- jour) : remise à zéro approuvée par Mathieu. Toutes les sociétés sont effacées (joueurs,
-- robot-testeur et PNJ) ; chaque joueur recrée la sienne. Les PNJ sont recréés à
-- l'identique de la migration 0014 (catalogue, prix, marque, stock initial).
--
-- Conservés : comptes et profils des joueurs (auth.users, profiles), journal d'audit
-- (audit_log), données de marché (market_data), catalogues (products, materials,
-- suppliers, faconniers…), le monde lui-même (worlds).
--
-- Bascule : ce fichier est appliqué par .github/workflows/migrate.yml APRÈS la mise en ligne
-- du nouveau code sur Vercel (marqueur ci-dessous), pour que l'ancien code (mois d'un jour)
-- ne tourne jamais sur le monde remis à zéro. Le nouveau code, lui, n'avance rien tant que
-- mois_courant n'est pas un index calendaire (garde-fou de l'orchestrateur).
-- kapital:apres-deploiement
--
-- Rejouable : la remise à zéro n'est faite qu'une fois (trace dans public.reprises_donnees).

set statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Apport de capital initial : écrit au mois de la création de la société
--    (worlds.mois_courant, index calendaire) et non plus au mois 0, qui serait
--    désormais janvier de l'an 0. Défini avant la recréation des PNJ, qui l'utilisent.
-- ---------------------------------------------------------------------------

create or replace function public.inscrire_apport_initial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mois integer;
begin
  if new.tresorerie_centimes > 0 then
    select w.mois_courant into v_mois from public.worlds w where w.id = new.world_id;
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (new.id, 'apport_initial', coalesce(v_mois, 0), 'Apport de capital initial', '512', 'debit', new.tresorerie_centimes),
      (new.id, 'apport_initial', coalesce(v_mois, 0), 'Apport de capital initial', '101', 'credit', new.tresorerie_centimes);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Origine de l'horloge et mois calendaire par défaut (monde créé plus tard)
-- ---------------------------------------------------------------------------

alter table public.worlds
  alter column debut_reel set default '1970-01-01T00:00:00Z';

alter table public.worlds
  alter column mois_courant set default (
    extract(year from (now() at time zone 'Europe/Paris'))::integer * 12
    + extract(month from (now() at time zone 'Europe/Paris'))::integer - 1
  );

-- ---------------------------------------------------------------------------
-- 3. Remise à zéro et recalage du monde (une seule fois)
-- ---------------------------------------------------------------------------

do $$
declare
  v_joueurs integer;
  v_pnj integer;
  monde_id uuid;
  pnj record;
  prix_tshirt integer;
  prix_chemise integer;
  prix_sac integer;
begin
  if exists (select 1 from public.reprises_donnees where nom = '0043_horloge_reelle_remise_a_zero') then
    raise notice '0043 : remise à zéro déjà faite, rien à faire';
    return;
  end if;

  -- Personne n'écrit pendant la remise à zéro.
  lock table public.worlds, public.companies, public.ledger_entries, public.etat_mois_entreprise
    in exclusive mode;

  select count(*) filter (where owner_profile_id is not null), count(*) filter (where owner_profile_id is null)
    into v_joueurs, v_pnj
  from public.companies;

  -- Toutes les sociétés. Les tables qui en dépendent suivent par ON DELETE CASCADE :
  -- ledger_entries, company_products, product_stock, material_stock, purchase_orders,
  -- production_orders, workshops (et placed_modules), employees, brand_state,
  -- marketing_actions, loans (et loan_schedules), mission_progress, valeurs_entreprises,
  -- etat_mois_entreprise, points_de_vente (et stock_boutique), evenements.
  -- Aucun déclencheur ne s'exécute à la suppression : le contrôle d'équilibre des
  -- écritures (0015) et la mise à jour de la trésorerie ne jouent qu'à l'insertion.
  delete from public.companies;

  -- Historique du monde, compté en mois de l'ancien calendrier.
  delete from public.journal_avance;
  delete from public.clotures;

  -- Recalage : origine au 1er janvier 1970, mois courant = mois calendaire à Paris.
  update public.worlds
  set debut_reel = '1970-01-01T00:00:00Z',
      mois_courant = extract(year from (now() at time zone 'Europe/Paris'))::integer * 12
                     + extract(month from (now() at time zone 'Europe/Paris'))::integer - 1;

  -- Recréation des PNJ, à l'identique de la migration 0014 (sans pas traité : l'orchestrateur
  -- les démarre au pas courant, sans rejouer d'historique).
  select id into monde_id from public.worlds where etat = 'actif' order by cree_le limit 1;
  if monde_id is null then
    raise notice '0043 : aucun monde actif, PNJ non recréés.';
  else
    insert into public.companies (world_id, owner_profile_id, nom, gamme, statut, tresorerie_centimes) values
      (monde_id, null, 'PNJ_Basique Express', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_Mode Soldes', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_Fringues Discount', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_Casual Pro', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_Textile Tendance', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_SimpleStyle', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_Bazaar Mode', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_Essentiel Textile', 'entree', 'active', 50000000),
      (monde_id, null, 'PNJ_Atelier du Marais', 'milieu', 'active', 80000000),
      (monde_id, null, 'PNJ_Maison Clairfont', 'milieu', 'active', 80000000),
      (monde_id, null, 'PNJ_Bordeaux Couture', 'milieu', 'active', 80000000),
      (monde_id, null, 'PNJ_Studio Lille', 'milieu', 'active', 80000000),
      (monde_id, null, 'PNJ_Rue Lafayette', 'milieu', 'active', 80000000),
      (monde_id, null, 'PNJ_Blanc et Noir', 'milieu', 'active', 80000000),
      (monde_id, null, 'PNJ_Confection Rhône', 'milieu', 'active', 80000000),
      (monde_id, null, 'PNJ_Maison Vendôme', 'haut', 'active', 150000000),
      (monde_id, null, 'PNJ_Luxe Saint-Honoré', 'haut', 'active', 150000000),
      (monde_id, null, 'PNJ_Ateliers Faubourg', 'haut', 'active', 150000000),
      (monde_id, null, 'PNJ_Signature Royale', 'haut', 'active', 150000000),
      (monde_id, null, 'PNJ_Noble Couture', 'haut', 'active', 150000000);

    for pnj in
      select id, gamme from public.companies
      where owner_profile_id is null and nom like 'PNJ_%'
    loop
      -- Prix calibrés par gamme (CDC : entrée 20 €, milieu 60 €, haut 150 €), bruit déterministe sur l'uuid
      if pnj.gamme = 'entree' then
        prix_tshirt := 1500 + (hashtext(pnj.id::text) % 1000);
        prix_chemise := 2500 + (hashtext(pnj.id::text) % 1500);
        prix_sac := 800 + (hashtext(pnj.id::text) % 700);
      elsif pnj.gamme = 'milieu' then
        prix_tshirt := 4500 + (hashtext(pnj.id::text) % 3000);
        prix_chemise := 7000 + (hashtext(pnj.id::text) % 4000);
        prix_sac := 3000 + (hashtext(pnj.id::text) % 2000);
      else
        prix_tshirt := 12000 + (hashtext(pnj.id::text) % 6000);
        prix_chemise := 18000 + (hashtext(pnj.id::text) % 10000);
        prix_sac := 8000 + (hashtext(pnj.id::text) % 5000);
      end if;

      -- Marque : notoriété / désirabilité calibrées par gamme
      if pnj.gamme = 'entree' then
        insert into public.brand_state (company_id, notoriete, desirabilite)
        values (pnj.id, 30 + (abs(hashtext(pnj.id::text)) % 30), 25 + (abs(hashtext(pnj.id::text || 'd')) % 25))
        on conflict do nothing;
      elsif pnj.gamme = 'milieu' then
        insert into public.brand_state (company_id, notoriete, desirabilite)
        values (pnj.id, 45 + (abs(hashtext(pnj.id::text)) % 30), 50 + (abs(hashtext(pnj.id::text || 'd')) % 25))
        on conflict do nothing;
      else
        insert into public.brand_state (company_id, notoriete, desirabilite)
        values (pnj.id, 60 + (abs(hashtext(pnj.id::text)) % 25), 70 + (abs(hashtext(pnj.id::text || 'd')) % 25))
        on conflict do nothing;
      end if;

      -- Catalogue : les 3 produits de référence
      insert into public.company_products
        (company_id, product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible)
      values
        (pnj.id, 'prod_tshirt', 60, prix_tshirt, prix_tshirt / 2, 500),
        (pnj.id, 'prod_chemise', 60, prix_chemise, prix_chemise / 2, 300),
        (pnj.id, 'prod_sac_toile', 60, prix_sac, prix_sac / 2, 200)
      on conflict (company_id, product_id) do nothing;

      -- Stock initial (le déclencheur company_product_init_stock a créé les lignes à 0)
      update public.product_stock
      set quantite_pieces = 2000, valeur_totale_centimes = 2000 * 1500
      where company_id = pnj.id;
    end loop;
  end if;

  insert into public.reprises_donnees (nom, detail)
  values (
    '0043_horloge_reelle_remise_a_zero',
    jsonb_build_object(
      'societes_joueurs_effacees', v_joueurs,
      'pnj_effaces', v_pnj,
      'pnj_recrees', (select count(*) from public.companies where owner_profile_id is null and nom like 'PNJ_%'),
      'mois_courant', (select max(mois_courant) from public.worlds)
    )
  );
  raise notice '0043 : % société(s) de joueurs et % PNJ effacés, PNJ recréés, monde recalé sur l''horloge réelle',
    v_joueurs, v_pnj;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Un mois est désormais un index calendaire : janvier 1970 (23640) au plus tôt.
--    Garde-fou durable : un ancien code (mois comptés depuis 0) ne peut plus écrire
--    un mois de l'ancien calendrier dans le monde ni dans l'état du mois d'une société.
-- ---------------------------------------------------------------------------

alter table public.worlds drop constraint if exists worlds_mois_courant_check;
alter table public.worlds
  add constraint worlds_mois_courant_check check (mois_courant >= 23640);

alter table public.etat_mois_entreprise drop constraint if exists etat_mois_entreprise_mois_check;
alter table public.etat_mois_entreprise
  add constraint etat_mois_entreprise_mois_check check (mois >= 23640);
