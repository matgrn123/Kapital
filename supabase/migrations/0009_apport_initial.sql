-- T21 : à la création d'une entreprise, enregistrer l'apport initial en compta
-- (écriture 512 Banque débit / 101 Capital crédit = trésorerie_centimes)

set statement_timeout = '60s';

create or replace function public.inscrire_apport_initial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tresorerie_centimes > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (new.id, 'apport_initial', 0, 'Apport de capital initial', '512', 'debit', new.tresorerie_centimes),
      (new.id, 'apport_initial', 0, 'Apport de capital initial', '101', 'credit', new.tresorerie_centimes);
  end if;
  return new;
end;
$$;

drop trigger if exists company_apport_initial on public.companies;
create trigger company_apport_initial
after insert on public.companies
for each row execute function public.inscrire_apport_initial();

-- Backfill : entreprises déjà créées sans apport en compta
insert into public.ledger_entries (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
select c.id, 'apport_initial', 0, 'Apport de capital initial (backfill)', '512', 'debit', c.tresorerie_centimes
from public.companies c
where c.tresorerie_centimes > 0
  and not exists (
    select 1 from public.ledger_entries l
    where l.company_id = c.id and l.ecriture_id = 'apport_initial'
  );

insert into public.ledger_entries (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
select c.id, 'apport_initial', 0, 'Apport de capital initial (backfill)', '101', 'credit', c.tresorerie_centimes
from public.companies c
where c.tresorerie_centimes > 0
  and not exists (
    select 1 from public.ledger_entries l
    where l.company_id = c.id and l.ecriture_id = 'apport_initial' and l.compte = '101'
  );
