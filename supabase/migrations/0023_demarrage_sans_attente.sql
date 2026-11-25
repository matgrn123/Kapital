-- TP-3 : démarrage sans attente.
--
-- 1. Le grossiste local : un « façonnier » sans matière, qui livre des produits finis
--    le jour même. Son prix et son délai ne sont pas ici : ils viennent des paramètres
--    (parametres-v1.json) et sont fixés par le serveur à chaque commande.
-- 2. appliquer_serie_lancement : la série de lancement d'un produit, en une transaction.
--    Stock de produits finis + écriture 35/512. Jamais comptée deux fois.

set statement_timeout = '60s';

insert into public.faconniers (id, nom, pays, delai_mois, fiabilite, minimum_commande, delai_paiement_mois)
values ('gros_local', 'Grossiste local', 'France', 0, 1, 1, 1)
on conflict (id) do nothing;

create or replace function public.appliquer_serie_lancement(
  p_company_id uuid,
  p_product_id text,
  p_quantite integer,
  p_cout_unitaire_centimes bigint,
  p_mois_jeu integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ecriture text := 'serie_lancement_' || p_product_id;
  v_total bigint;
  v_tresorerie bigint;
  v_trouve boolean;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'quantite_invalide: %', p_quantite using errcode = 'KP400';
  end if;
  if p_cout_unitaire_centimes is null or p_cout_unitaire_centimes <= 0 then
    raise exception 'cout_invalide: %', p_cout_unitaire_centimes using errcode = 'KP400';
  end if;

  -- Verrou sur l'entreprise : deux demandes simultanées se mettent en file.
  select true, c.tresorerie_centimes into v_trouve, v_tresorerie
  from public.companies c
  where c.id = p_company_id
  for update;
  if v_trouve is not true then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  -- Déjà faite pour ce produit : on ne la compte pas deux fois.
  if exists (
    select 1 from public.ledger_entries
    where company_id = p_company_id and ecriture_id = v_ecriture
  ) then
    return false;
  end if;

  v_total := p_quantite::bigint * p_cout_unitaire_centimes;
  if v_total > v_tresorerie then
    raise exception 'tresorerie_insuffisante: % demandés, % disponibles', v_total, v_tresorerie
      using errcode = 'KP402';
  end if;

  insert into public.ledger_entries
    (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
  values
    (p_company_id, v_ecriture, p_mois_jeu, 'Série de lancement : ' || p_quantite || ' ' || p_product_id, '35', 'debit', v_total),
    (p_company_id, v_ecriture, p_mois_jeu, 'Série de lancement : ' || p_quantite || ' ' || p_product_id, '512', 'credit', v_total);

  insert into public.product_stock (company_id, product_id, quantite_pieces, valeur_totale_centimes, mise_a_jour_le)
  values (p_company_id, p_product_id, p_quantite, v_total, now())
  on conflict (company_id, product_id) do update
    set quantite_pieces = public.product_stock.quantite_pieces + excluded.quantite_pieces,
        valeur_totale_centimes = public.product_stock.valeur_totale_centimes + excluded.valeur_totale_centimes,
        mise_a_jour_le = now();

  return true;
end;
$$;

-- Réservée au serveur (clé de service) : jamais appelable depuis un navigateur.
revoke all on function public.appliquer_serie_lancement(uuid, text, integer, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.appliquer_serie_lancement(uuid, text, integer, bigint, integer)
  to service_role;
