-- AE-7 : licenciement. Le départ du salarié et l'écriture de l'indemnité légale (641 débit,
-- 512 crédit) sont enregistrés dans une seule transaction. Aucune table n'est modifiée.

set statement_timeout = '60s';

create or replace function public.licencier_salarie(
  p_company_id uuid,
  p_employee_id uuid,
  p_indemnite_centimes bigint,
  p_mois_jeu integer,
  p_ecriture_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tresorerie bigint;
  v_employe uuid;
begin
  if p_indemnite_centimes < 0 then
    raise exception 'indemnite_invalide' using errcode = 'KP400';
  end if;

  -- Verrou sur l'entreprise : la trésorerie lue ne bouge pas pendant la vérification.
  select tresorerie_centimes into v_tresorerie
  from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  -- Un seul licenciement par salarié : si une autre demande est passée avant, rien n'est écrit.
  update public.employees
     set statut = 'licencie'
   where id = p_employee_id and company_id = p_company_id and statut = 'actif'
   returning id into v_employe;
  if v_employe is null then
    raise exception 'salarie_introuvable' using errcode = 'KP404';
  end if;

  if p_indemnite_centimes > 0 then
    if v_tresorerie < p_indemnite_centimes then
      raise exception 'tresorerie_insuffisante: % pour une indemnité de %', v_tresorerie, p_indemnite_centimes
        using errcode = 'KP422';
    end if;
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Indemnité de licenciement', '641', 'debit', p_indemnite_centimes),
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Indemnité de licenciement', '512', 'credit', p_indemnite_centimes);
  end if;
end;
$$;
revoke all on function public.licencier_salarie(uuid, uuid, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.licencier_salarie(uuid, uuid, bigint, integer, text) to service_role;
