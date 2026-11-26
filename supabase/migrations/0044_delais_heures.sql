-- T2 (horloge réelle) : les délais de livraison deviennent des heures réelles.
--
-- Décision de Mathieu du 26 novembre 2026 : l'horloge du jeu est l'horloge réelle.
-- Une commande passée à 10 h 21 chez un fournisseur à 2 h de délai arrive vers 12 h 21.
--   Fournisseurs de matière : France 2 h, Portugal 4 h, Turquie 6 h.
--   Façonniers : Portugal 6 h, Turquie 8 h.
--   Grossiste local : 30 minutes, fixées par le paramètre grossiste_delai_minutes
--   (parametres-v1.json) ; sa ligne garde 0 ici, la colonne n'est pas lue pour lui.
--
-- Seule la livraison change : le paiement reste à 30-60 jours, calé sur les mois
-- (delai_paiement_mois, compté depuis le mois de livraison).
--
-- delai_mois n'est pas supprimée : le code déjà déployé la lit encore entre l'application
-- de cette migration et le déploiement suivant. Elle n'est plus lue après ce lot.
-- Rejouable, sans perte de données.

set statement_timeout = '60s';

-- Fournisseurs de matière --------------------------------------------------------

alter table public.suppliers
  add column if not exists delai_heures integer;

update public.suppliers set delai_heures = 2 where id = 'four_fr';
update public.suppliers set delai_heures = 4 where id = 'four_pt';
update public.suppliers set delai_heures = 6 where id = 'four_tr';
-- Garde-fou : aucune autre ligne au 26/11/2026 ; une ligne inconnue reçoit un jour.
update public.suppliers set delai_heures = coalesce(delai_heures, 24) where delai_heures is null;

alter table public.suppliers
  alter column delai_heures set not null;
alter table public.suppliers
  drop constraint if exists suppliers_delai_heures_positif;
alter table public.suppliers
  add constraint suppliers_delai_heures_positif check (delai_heures >= 0);

comment on column public.suppliers.delai_heures is
  'Délai de livraison en heures réelles (horloge réelle, décision du 26/11/2026). Remplace delai_mois.';
comment on column public.suppliers.delai_mois is
  'Obsolète depuis la migration 0044 (délais en heures) : plus lue, gardée pour le code déjà déployé.';

-- Façonniers ----------------------------------------------------------------------

alter table public.faconniers
  add column if not exists delai_heures integer;

update public.faconniers set delai_heures = 6 where id = 'fac_pt';
update public.faconniers set delai_heures = 8 where id = 'fac_tr';
update public.faconniers set delai_heures = 0 where id = 'gros_local';
-- Garde-fou : aucune autre ligne au 26/11/2026 ; une ligne inconnue reçoit un jour.
update public.faconniers set delai_heures = coalesce(delai_heures, 24) where delai_heures is null;

alter table public.faconniers
  alter column delai_heures set not null;
alter table public.faconniers
  drop constraint if exists faconniers_delai_heures_positif;
alter table public.faconniers
  add constraint faconniers_delai_heures_positif check (delai_heures >= 0);

comment on column public.faconniers.delai_heures is
  'Délai de fabrication et livraison en heures réelles (décision du 26/11/2026). Grossiste local : 0 ici, son délai vient du paramètre grossiste_delai_minutes.';
comment on column public.faconniers.delai_mois is
  'Obsolète depuis la migration 0044 (délais en heures) : plus lue, gardée pour le code déjà déployé.';
