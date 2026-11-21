-- T23 : classement des entreprises par valeur d'entreprise.
--
-- Valeur d'entreprise = somme des actifs - somme des passifs externes
-- (on exclut le capital 101 : la valeur nette est précisément ce qui
-- reviendrait aux propriétaires).
--
-- Actifs : 31 (stocks matières), 35 (stocks produits finis), 411 (clients),
--          44566 (TVA déductible), 512 (banque)
-- Passifs externes : 164 (emprunts), 401 (fournisseurs), 421 (personnel dû),
--          431 (URSSAF), 444 (IS dû), 44571 (TVA collectée)
--
-- Le recalcul tourne via pg_cron toutes les 30 min (voir bas de fichier).
-- La logique est miroir de packages/engine/src/classement/calculer.ts.

set statement_timeout = '60s';

create table if not exists public.valeurs_entreprises (
  company_id uuid primary key references public.companies(id) on delete cascade,
  valeur_centimes bigint not null default 0,
  actif_centimes bigint not null default 0,
  passif_externe_centimes bigint not null default 0,
  calcule_le timestamptz not null default now()
);

alter table public.valeurs_entreprises enable row level security;

drop policy if exists "valeurs_entreprises_select_all" on public.valeurs_entreprises;
create policy "valeurs_entreprises_select_all"
  on public.valeurs_entreprises for select
  using (true);

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
        when l.compte in ('31','35','411','44566','512')
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

-- Vue publique pour la page classement (joint pseudo propriétaire)
create or replace view public.classement_publique as
  select
    c.id as company_id,
    c.nom,
    c.gamme,
    c.statut,
    coalesce(p.pseudo, 'PNJ') as pseudo,
    coalesce(v.valeur_centimes, 0) as valeur_centimes,
    v.calcule_le
  from public.companies c
  left join public.profiles p on p.id = c.owner_profile_id
  left join public.valeurs_entreprises v on v.company_id = c.id
  where c.statut != 'liquidee';

grant select on public.classement_publique to anon, authenticated;

-- Premier calcul immédiat
select public.rafraichir_valeurs_entreprises();

-- Planification toutes les 30 min via pg_cron.
-- Nécessite que l'extension pg_cron soit activée dans le projet Supabase
-- (dashboard > Database > Extensions). Le bloc est tolérant : si pg_cron
-- n'est pas disponible, la migration passe quand même (la route API
-- /api/admin/classement/refresh fait office de fallback).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('rafraichir_classement')
      from cron.job where jobname = 'rafraichir_classement';
    perform cron.schedule(
      'rafraichir_classement',
      '*/30 * * * *',
      $cron$select public.rafraichir_valeurs_entreprises();$cron$
    );
  end if;
end $$;
