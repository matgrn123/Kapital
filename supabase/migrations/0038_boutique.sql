-- 0038 : AE-10, la boutique (point de vente) : bail commercial, un mois de travaux, stock propre,
-- vendeurs. Décision de Mathieu (25 novembre 2026) : la boutique a sa propre table, distincte des
-- ateliers (workshops), sans attendre 3D-7 (plusieurs locaux).
--
-- 1. points_de_vente : une boutique louée (emplacement du catalogue, catégorie boutique) : loyer,
--    charges, dépôt de garantie, travaux d'agencement et leur durée d'amortissement, mois de
--    signature et d'ouverture (signature + durée des travaux). Avant l'ouverture : travaux, aucune
--    vente. statut : 'actif' ou 'ferme' (la fermeture viendra plus tard). Une seule boutique active
--    par société en V1.
-- 2. stock_boutique : stock propre de chaque boutique, par produit (quantité, valeur au coût moyen).
--    La valeur reste au compte 35 de la société : le transfert ne passe aucune écriture.
-- 3. employees.poste : ajout de 'vendeur' (contrainte de 0006).
-- 4. company_products.prix_boutique_centimes : prix TTC en boutique ; null = prix de la vente directe.
-- 5. ouvrir_boutique : la boutique et ses deux écritures dans une seule transaction :
--    dépôt de garantie 275 / 512 et travaux d'agencement 2135 / 512 (à valider par Mathieu).
-- 6. transferer_stock_boutique : pièces du stock de l'atelier (product_stock) vers le stock de la
--    boutique, au coût moyen ; aucune écriture (même compte 35).
-- 7. appliquer_pas_boutique : appelle appliquer_pas_entreprise (inchangée, quelle que soit sa
--    dernière version) puis enregistre les stocks des boutiques rendus par le moteur, dans la même
--    transaction. Le loyer et les charges (613 / 614), l'amortissement des agencements (681 / 28135)
--    et les ventes en boutique (512 / 707 / 44571, 7135 / 35) sont des écritures du moteur : elles
--    passent par la liste d'écritures habituelle.
-- 8. rafraichir_valeurs_entreprises (classement) : 2135 à l'actif, 28135 en déduction.
--
-- Rejouable : if not exists, drop ... if exists, create or replace. N'écrit aucune donnée.
-- Les montants viennent de packages/content (batiments-v1.json, paramètres boutique_* et vendeur_*),
-- calculés par le moteur (packages/engine/src/boutique) dans la route ouvrir-boutique.

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Boutiques
-- ---------------------------------------------------------------------------

create table if not exists public.points_de_vente (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batiment_id text not null,
  surface_m2 integer not null check (surface_m2 > 0),
  loyer_mensuel_centimes bigint not null check (loyer_mensuel_centimes >= 0),
  charges_mensuelles_centimes bigint not null default 0 check (charges_mensuelles_centimes >= 0),
  depot_garantie_centimes bigint not null default 0 check (depot_garantie_centimes >= 0),
  travaux_centimes bigint not null default 0 check (travaux_centimes >= 0),
  duree_amortissement_mois integer not null check (duree_amortissement_mois > 0),
  mois_signature integer not null check (mois_signature >= 0),
  mois_ouverture integer not null,
  statut text not null default 'actif' check (statut in ('actif', 'ferme')),
  cree_le timestamptz not null default now(),
  check (mois_ouverture >= mois_signature)
);
create index if not exists points_de_vente_company_id_idx on public.points_de_vente(company_id);
-- V1 : une seule boutique active par société.
create unique index if not exists points_de_vente_une_active_idx
  on public.points_de_vente(company_id) where statut = 'actif';

alter table public.points_de_vente enable row level security;
drop policy if exists "points_de_vente_select_own" on public.points_de_vente;
create policy "points_de_vente_select_own"
  on public.points_de_vente for select
  using (exists (
    select 1 from public.companies c
    where c.id = points_de_vente.company_id and c.owner_profile_id = auth.uid()
  ));
-- Aucune politique d'écriture : seules les fonctions serveur (service_role) écrivent.
revoke insert, update, delete on public.points_de_vente from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Stock propre de chaque boutique
-- ---------------------------------------------------------------------------

create table if not exists public.stock_boutique (
  point_de_vente_id uuid not null references public.points_de_vente(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id text not null references public.products(id),
  quantite_pieces integer not null default 0 check (quantite_pieces >= 0),
  valeur_totale_centimes bigint not null default 0 check (valeur_totale_centimes >= 0),
  mise_a_jour_le timestamptz not null default now(),
  primary key (point_de_vente_id, product_id)
);
create index if not exists stock_boutique_company_id_idx on public.stock_boutique(company_id);

alter table public.stock_boutique enable row level security;
drop policy if exists "stock_boutique_select_own" on public.stock_boutique;
create policy "stock_boutique_select_own"
  on public.stock_boutique for select
  using (exists (
    select 1 from public.companies c
    where c.id = stock_boutique.company_id and c.owner_profile_id = auth.uid()
  ));
revoke insert, update, delete on public.stock_boutique from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Poste vendeur
-- ---------------------------------------------------------------------------

alter table public.employees drop constraint if exists employees_poste_check;
alter table public.employees
  add constraint employees_poste_check check (poste in ('artisan', 'encadrement', 'vendeur'));

-- ---------------------------------------------------------------------------
-- 4. Prix en boutique
-- ---------------------------------------------------------------------------

alter table public.company_products
  add column if not exists prix_boutique_centimes bigint check (prix_boutique_centimes >= 0);

-- ---------------------------------------------------------------------------
-- 5. Ouverture d'une boutique
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
  p_mois_ouverture integer
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
     depot_garantie_centimes, travaux_centimes, duree_amortissement_mois, mois_signature, mois_ouverture)
  values
    (p_company_id, p_batiment_id, p_surface_m2, p_loyer_centimes, p_charges_centimes,
     p_depot_centimes, p_travaux_centimes, p_duree_amortissement_mois, p_mois_signature, p_mois_ouverture)
  returning id into v_id;

  -- Dépôt de garantie : 275 (créance sur le bailleur) au débit, 512 au crédit. Identifiant = moteur
  -- (PREFIXE_DEPOT_BOUTIQUE).
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
  -- Amortis par le moteur à la clôture (681 / 28135) à partir du mois d'ouverture.
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
revoke all on function public.ouvrir_boutique(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ouvrir_boutique(uuid, text, integer, bigint, bigint, bigint, bigint, integer, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Transfert du stock de l'atelier vers la boutique
-- ---------------------------------------------------------------------------

create or replace function public.transferer_stock_boutique(
  p_company_id uuid,
  p_point_de_vente_id uuid,
  p_product_id text,
  p_quantite integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trouve boolean;
  v_quantite integer;
  v_valeur bigint;
  v_sortie bigint;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'quantite_invalide' using errcode = 'KP400';
  end if;

  -- Même verrou que appliquer_pas_entreprise : le transfert ne croise jamais un pas du moteur.
  select true into v_trouve
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  if not exists (
    select 1 from public.points_de_vente p
    where p.id = p_point_de_vente_id and p.company_id = p_company_id and p.statut = 'actif'
  ) then
    raise exception 'boutique_introuvable' using errcode = 'KP404';
  end if;

  select s.quantite_pieces, s.valeur_totale_centimes into v_quantite, v_valeur
  from public.product_stock s
  where s.company_id = p_company_id and s.product_id = p_product_id
  for update;
  if not found or v_quantite < p_quantite then
    raise exception 'stock_insuffisant: % disponibles', coalesce(v_quantite, 0) using errcode = 'KP409';
  end if;

  -- Coût moyen : valeur × quantité sortie / quantité, arrondi au centime ; tout le stock = toute
  -- la valeur. Même formule que le moteur (valeurSortieCmp).
  if p_quantite = v_quantite then
    v_sortie := v_valeur;
  else
    v_sortie := round(v_valeur::numeric * p_quantite / v_quantite)::bigint;
  end if;

  update public.product_stock
  set quantite_pieces = quantite_pieces - p_quantite,
      valeur_totale_centimes = valeur_totale_centimes - v_sortie,
      mise_a_jour_le = now()
  where company_id = p_company_id and product_id = p_product_id;

  insert into public.stock_boutique
    (point_de_vente_id, company_id, product_id, quantite_pieces, valeur_totale_centimes, mise_a_jour_le)
  values (p_point_de_vente_id, p_company_id, p_product_id, p_quantite, v_sortie, now())
  on conflict (point_de_vente_id, product_id) do update
    set quantite_pieces = stock_boutique.quantite_pieces + excluded.quantite_pieces,
        valeur_totale_centimes = stock_boutique.valeur_totale_centimes + excluded.valeur_totale_centimes,
        mise_a_jour_le = now();

  return jsonb_build_object('quantite', p_quantite, 'valeur_centimes', v_sortie);
end;
$$;
revoke all on function public.transferer_stock_boutique(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.transferer_stock_boutique(uuid, uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Pas du moteur avec les stocks des boutiques
-- ---------------------------------------------------------------------------

create or replace function public.appliquer_pas_boutique(
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
  v_pas integer;
begin
  -- Écritures (ventes boutique, loyer, charges, amortissement compris), stocks, marque, compteur
  -- de pas : la fonction habituelle, qui prend le verrou sur la société et refuse un pas rejoué.
  v_pas := public.appliquer_pas_entreprise(p_company_id, p_pas_attendu, p_etat, p_nb_pas);

  -- Stocks des boutiques de la société, tels que rendus par le moteur.
  insert into public.stock_boutique
    (point_de_vente_id, company_id, product_id, quantite_pieces, valeur_totale_centimes, mise_a_jour_le)
  select x.point_de_vente_id, p_company_id, x.product_id, x.quantite_pieces, x.valeur_totale_centimes, now()
  from jsonb_to_recordset(coalesce(p_etat->'stocks_boutique', '[]'::jsonb))
    as x(point_de_vente_id uuid, product_id text, quantite_pieces integer, valeur_totale_centimes bigint)
  where exists (
    select 1 from public.points_de_vente p
    where p.id = x.point_de_vente_id and p.company_id = p_company_id
  )
  on conflict (point_de_vente_id, product_id) do update
    set quantite_pieces = excluded.quantite_pieces,
        valeur_totale_centimes = excluded.valeur_totale_centimes,
        mise_a_jour_le = now();

  return v_pas;
end;
$$;
revoke all on function public.appliquer_pas_boutique(uuid, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.appliquer_pas_boutique(uuid, integer, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Classement : les agencements sont un actif (fonction de 0028 reprise, 2135 et 28135 ajoutés)
-- ---------------------------------------------------------------------------

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
        when l.compte in ('31','35','411','44566','512','275','213','2813','2135','28135')
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

-- ---------------------------------------------------------------------------
-- 9. Comptes publics (3D-8) : le total du bilan suit le plan comptable du moteur, 2135 compris.
--    Vue de 0035 reprise telle quelle (mêmes colonnes, même liste blanche), seul 2135 est ajouté.
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
left join public.workshops wk on wk.company_id = c.id
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
  '3D-8 : comptes annuels publics (dernier exercice clos) et extérieur. Liste blanche : voir migration 0035 (2135 ajouté en 0038).';

revoke all on public.comptes_publics from public, anon, authenticated;
grant select on public.comptes_publics to authenticated, service_role;
