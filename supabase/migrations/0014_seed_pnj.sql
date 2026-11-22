-- T28a : seeder des entreprises PNJ concurrentes.
--
-- Avant : la base ne contenait aucune entreprise PNJ. Le joueur etait seul
-- dans sa gamme face a la seule "frange" statistique, donc tres peu de
-- ventes, pas de concurrence visible, classement vide.
--
-- Apres : ~20 entreprises PNJ reparties sur les trois gammes, avec catalogue
-- (tshirt, chemise, sac), prix calibres sur la gamme, marque realiste et
-- stock initial de 2000 pieces par produit. Idempotent : ne reinsert pas si
-- les PNJ existent deja.

set statement_timeout = '120s';

do $$
declare
  monde_id uuid;
  pnj record;
  prod record;
  prix_tshirt integer;
  prix_chemise integer;
  prix_sac integer;
  prix_revendeur_tshirt integer;
  prix_revendeur_chemise integer;
  prix_revendeur_sac integer;
begin
  -- Un monde actif requis
  select id into monde_id from public.worlds where etat = 'actif' limit 1;
  if monde_id is null then
    raise notice 'T28a : aucun monde actif, PNJ non seedés.';
    return;
  end if;

  -- Idempotence : stop si deja seede
  if exists (
    select 1 from public.companies
    where owner_profile_id is null and nom like 'PNJ_%'
  ) then
    raise notice 'T28a : PNJ déjà seedés.';
    return;
  end if;

  -- Insertion des entreprises PNJ
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

  -- Pour chaque PNJ : brand_state + catalogue + stock
  for pnj in
    select id, gamme from public.companies
    where owner_profile_id is null and nom like 'PNJ_%'
  loop
    -- Prix calibres par gamme (CDC : entree 20€, milieu 60€, haut 150€)
    -- avec bruit deterministe base sur l'uuid
    if pnj.gamme = 'entree' then
      prix_tshirt := 1500 + (hashtext(pnj.id::text) % 1000); -- 15-25€
      prix_chemise := 2500 + (hashtext(pnj.id::text) % 1500); -- 25-40€
      prix_sac := 800 + (hashtext(pnj.id::text) % 700);        -- 8-15€
    elsif pnj.gamme = 'milieu' then
      prix_tshirt := 4500 + (hashtext(pnj.id::text) % 3000);  -- 45-75€
      prix_chemise := 7000 + (hashtext(pnj.id::text) % 4000); -- 70-110€
      prix_sac := 3000 + (hashtext(pnj.id::text) % 2000);     -- 30-50€
    else
      prix_tshirt := 12000 + (hashtext(pnj.id::text) % 6000);  -- 120-180€
      prix_chemise := 18000 + (hashtext(pnj.id::text) % 10000);-- 180-280€
      prix_sac := 8000 + (hashtext(pnj.id::text) % 5000);      -- 80-130€
    end if;
    prix_revendeur_tshirt := prix_tshirt / 2;
    prix_revendeur_chemise := prix_chemise / 2;
    prix_revendeur_sac := prix_sac / 2;

    -- Marque : notoriete/desirabilite calibrees par gamme
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

    -- Catalogue : les 3 produits de reference
    insert into public.company_products
      (company_id, product_id, qualite_visee, prix_vente_directe_centimes, prix_revendeur_centimes, production_mensuelle_cible)
    values
      (pnj.id, 'prod_tshirt', 60, prix_tshirt, prix_revendeur_tshirt, 500),
      (pnj.id, 'prod_chemise', 60, prix_chemise, prix_revendeur_chemise, 300),
      (pnj.id, 'prod_sac_toile', 60, prix_sac, prix_revendeur_sac, 200)
    on conflict (company_id, product_id) do nothing;

    -- Stock : alimente les PNJ pour qu'ils puissent vendre immediatement
    -- (le trigger company_product_init_stock a cree les lignes a 0)
    update public.product_stock
    set quantite_pieces = 2000, valeur_totale_centimes = 2000 * 1500
    where company_id = pnj.id;
  end loop;

  raise notice 'T28a : % PNJ seedés avec catalogue et stock initial.',
    (select count(*) from public.companies where owner_profile_id is null and nom like 'PNJ_%');
end $$;
