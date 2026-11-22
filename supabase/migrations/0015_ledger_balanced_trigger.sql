-- A.2 : trigger de vérification de l'équilibre des écritures comptables.
--
-- Après chaque insertion dans ledger_entries, on vérifie que pour chaque
-- ecriture_id touché par l'instruction, la somme des débits égale la somme
-- des crédits sur toute la table. C'est une deuxième ligne de défense au cas
-- où une route serveur oublierait d'appeler ecrireEcritures (helper A.1 qui
-- vérifie l'équilibre côté application).
--
-- Le trigger est AFTER INSERT STATEMENT et regarde la table entière pour les
-- ecriture_id concernés. Si plus tard on autorise plusieurs inserts pour le
-- même ecriture_id, le trigger acceptera tant que l'équilibre final est
-- respecté.

set statement_timeout = '60s';

create or replace function public.verifier_ecritures_equilibrees()
returns trigger
language plpgsql
as $$
declare
  ecr text;
  total_debit bigint;
  total_credit bigint;
begin
  for ecr in
    select distinct new_table.ecriture_id from new_table
  loop
    select
      coalesce(sum(case when sens = 'debit' then montant_centimes else 0 end), 0),
      coalesce(sum(case when sens = 'credit' then montant_centimes else 0 end), 0)
    into total_debit, total_credit
    from public.ledger_entries
    where ecriture_id = ecr;

    if total_debit <> total_credit then
      raise exception 'Écriture % déséquilibrée : débit % centimes, crédit % centimes.',
        ecr, total_debit, total_credit;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists verifier_equilibre_ledger on public.ledger_entries;
create trigger verifier_equilibre_ledger
after insert on public.ledger_entries
referencing new table as new_table
for each statement
execute function public.verifier_ecritures_equilibrees();
