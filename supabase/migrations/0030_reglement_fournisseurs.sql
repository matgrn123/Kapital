-- 0030 : règlement des fournisseurs et façonniers à l'échéance, matière du joueur chez le façonnier.
--
-- 1. purchase_orders et production_orders : mois_jeu_reglement (null = pas encore payé).
--    Rempli automatiquement quand l'écriture de règlement (401 débit / 512 crédit) est
--    enregistrée par appliquer_pas_entreprise : l'écriture et le suivi tombent dans la
--    même transaction, sans toucher à la fonction Postgres.
-- 2. faconniers.fournit_matiere : vrai pour le grossiste local (il vend des pièces finies) ;
--    faux pour les façonniers, qui travaillent la matière prise dans le stock du joueur.
-- 3. production_orders.fournitures_facturees : les ordres déjà livrés avant cette migration
--    ont été comptés sans fournitures ; leur règlement ne doit pas les ajouter.
-- 4. Les ordres « atelier » en cours ne sont lus par aucun moteur : ils sont annulés
--    (l'atelier produit désormais selon l'objectif mensuel du produit).

set statement_timeout = '60s';

alter table public.purchase_orders
  add column if not exists mois_jeu_reglement integer;

alter table public.production_orders
  add column if not exists mois_jeu_reglement integer,
  add column if not exists fournitures_facturees boolean not null default true;

update public.production_orders
set fournitures_facturees = false
where statut = 'livree';

alter table public.faconniers
  add column if not exists fournit_matiere boolean not null default false;

update public.faconniers set fournit_matiere = true where id = 'gros_local';

update public.production_orders
set statut = 'annulee'
where lieu_type = 'atelier' and statut = 'en_cours';

create index if not exists purchase_orders_a_regler_idx
  on public.purchase_orders(company_id)
  where statut = 'livree' and mois_jeu_reglement is null;

create index if not exists production_orders_a_regler_idx
  on public.production_orders(company_id)
  where statut = 'livree' and mois_jeu_reglement is null;

-- Suivi du paiement : écriture « reglement_matiere_<id> » ou « reglement_faconnier_<id> ».
create or replace function public.suivre_reglement_fournisseur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.compte <> '401' or new.sens <> 'debit' then
    return new;
  end if;
  if new.ecriture_id like 'reglement\_matiere\_%' then
    update public.purchase_orders
    set mois_jeu_reglement = new.mois_jeu
    where company_id = new.company_id
      and id::text = substr(new.ecriture_id, length('reglement_matiere_') + 1);
  elsif new.ecriture_id like 'reglement\_faconnier\_%' then
    update public.production_orders
    set mois_jeu_reglement = new.mois_jeu
    where company_id = new.company_id
      and id::text = substr(new.ecriture_id, length('reglement_faconnier_') + 1);
  end if;
  return new;
end;
$$;

revoke all on function public.suivre_reglement_fournisseur() from public, anon, authenticated;

drop trigger if exists ledger_entries_suivre_reglement on public.ledger_entries;
create trigger ledger_entries_suivre_reglement
  after insert on public.ledger_entries
  for each row execute function public.suivre_reglement_fournisseur();
