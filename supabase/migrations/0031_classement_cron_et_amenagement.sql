-- 0031 : deux corrections.
--
-- 1. Classement : la page annonce un recalcul toutes les 30 minutes, mais la migration 0012
--    ne programmait la tâche que si pg_cron existait DÉJÀ ; pg_cron n'a été créé qu'en 0021.
--    On programme ici la tâche 'rafraichir_classement' (rejouable : même nom = mise à jour).
--
-- 2. Aménagement de l'atelier : enregistrer le plan ET payer les modules ajoutés dans une
--    seule transaction (modules posés remplacés, écriture 2154 / 512 du prix des modules).
--    Le plan est validé par le moteur (validerPlanEtage) dans la route avant l'appel.

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Classement toutes les 30 minutes (même style que 0021)
-- ---------------------------------------------------------------------------

do $$
begin
  perform cron.schedule(
    'rafraichir_classement',
    '*/30 * * * *',
    $cron$select public.rafraichir_valeurs_entreprises();$cron$
  );
exception when others then
  raise notice 'classement non programmé (%) : activer pg_cron puis rejouer cette migration', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Sauvegarde du plan d'aménagement avec achat des modules ajoutés
-- ---------------------------------------------------------------------------

create or replace function public.sauvegarder_amenagement(
  p_company_id uuid,
  p_workshop_id uuid,
  p_modules jsonb,
  p_cout_centimes bigint,
  p_mois_jeu integer,
  p_ecriture_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tresorerie bigint;
begin
  if p_cout_centimes < 0 then
    raise exception 'cout_invalide' using errcode = 'KP400';
  end if;
  if jsonb_typeof(p_modules) <> 'array' then
    raise exception 'modules_invalides' using errcode = 'KP400';
  end if;

  -- Verrou sur l'entreprise : la trésorerie lue ne bouge pas pendant la vérification.
  select tresorerie_centimes into v_tresorerie
  from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'entreprise_introuvable: %', p_company_id using errcode = 'KP404';
  end if;

  perform 1 from public.workshops
   where id = p_workshop_id and company_id = p_company_id
   for update;
  if not found then
    raise exception 'atelier_introuvable' using errcode = 'KP404';
  end if;

  if p_cout_centimes > 0 and v_tresorerie < p_cout_centimes then
    raise exception 'tresorerie_insuffisante: % pour un achat de %', v_tresorerie, p_cout_centimes
      using errcode = 'KP422';
  end if;

  delete from public.placed_modules where workshop_id = p_workshop_id;

  insert into public.placed_modules (workshop_id, module_type_id, x, y, pivote)
  select p_workshop_id,
         m->>'module_type_id',
         (m->>'x')::integer,
         (m->>'y')::integer,
         coalesce((m->>'pivote')::boolean, false)
  from jsonb_array_elements(p_modules) as m;

  -- Achat des modules ajoutés : 2154 (matériel industriel) au débit, 512 (banque) au crédit.
  if p_cout_centimes > 0 then
    insert into public.ledger_entries
      (company_id, ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes)
    values
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Achat de modules d''aménagement', '2154', 'debit', p_cout_centimes),
      (p_company_id, p_ecriture_id, p_mois_jeu, 'Achat de modules d''aménagement', '512', 'credit', p_cout_centimes);
  end if;
end;
$$;
revoke all on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.sauvegarder_amenagement(uuid, uuid, jsonb, bigint, integer, text) to service_role;
