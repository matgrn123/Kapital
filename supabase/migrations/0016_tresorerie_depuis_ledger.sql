-- A.3 : la trésorerie n'a plus qu'une seule source de vérité : le grand livre.
--
-- Avant : companies.tresorerie_centimes et les écritures compte 512 pouvaient
-- diverger. Le tableau de bord lisait la colonne, la page Finances lisait les
-- écritures, les deux montraient des valeurs différentes dès qu'une action
-- oubliait d'écrire au ledger (ex. action marketing ou prêt avant A.1).
--
-- Après : un trigger AFTER INSERT STATEMENT sur ledger_entries met à jour
-- companies.tresorerie_centimes à chaque mouvement du compte 512. La colonne
-- devient un cache dérivé du grand livre, mis à jour dans la même transaction.
--
-- Exception : les écritures d'apport_initial sont ignorées par le trigger car
-- la trésorerie est déjà fixée au moment de l'INSERT companies (le trigger
-- apport_initial crée ensuite les écritures dans le même ordre).

set statement_timeout = '120s';

create or replace function public.maj_tresorerie_depuis_ledger()
returns trigger
language plpgsql
as $$
begin
  with soldes as (
    select
      company_id,
      sum(case when sens = 'debit' then montant_centimes else -montant_centimes end) as delta
    from new_table
    where compte = '512'
      and ecriture_id <> 'apport_initial'
    group by company_id
  )
  update public.companies c
  set tresorerie_centimes = c.tresorerie_centimes + s.delta
  from soldes s
  where c.id = s.company_id;

  return null;
end;
$$;

drop trigger if exists maj_tresorerie on public.ledger_entries;
create trigger maj_tresorerie
after insert on public.ledger_entries
referencing new table as new_table
for each statement
execute function public.maj_tresorerie_depuis_ledger();

-- Backfill : recalcule tresorerie_centimes depuis le solde du compte 512.
-- Cela "corrige" les entreprises dont la trésorerie avait divergé du ledger
-- (prêt crédité sans écriture, marketing débité sans écriture).
-- Après cette migration, dashboard et Finances afficheront la même valeur.
update public.companies c
set tresorerie_centimes = coalesce((
  select sum(case when sens = 'debit' then montant_centimes else -montant_centimes end)
  from public.ledger_entries
  where company_id = c.id and compte = '512'
), 0);
