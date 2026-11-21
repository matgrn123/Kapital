-- T22 : suivi des trois missions du tutoriel par entreprise.
--
-- Les définitions des missions vivent en code (packages/engine/src/missions).
-- Cette table ne stocke que l'état et l'horodatage de validation, pour qu'une
-- mission une fois validée reste validée même si les conditions redeviennent
-- fausses plus tard (le joueur a appris la notion).

set statement_timeout = '60s';

create table if not exists public.mission_progress (
  company_id uuid not null references public.companies(id) on delete cascade,
  mission_id text not null check (mission_id in ('mission1', 'mission2', 'mission3')),
  etat text not null default 'a_faire' check (etat in ('a_faire', 'en_cours', 'validee')),
  actuel bigint not null default 0,
  cible bigint not null default 0,
  validee_le timestamptz,
  mise_a_jour_le timestamptz not null default now(),
  primary key (company_id, mission_id)
);

create index if not exists mission_progress_company_id_idx
  on public.mission_progress(company_id);

alter table public.mission_progress enable row level security;

drop policy if exists "mission_progress_select_own" on public.mission_progress;
create policy "mission_progress_select_own"
  on public.mission_progress for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = mission_progress.company_id
        and c.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "mission_progress_upsert_own" on public.mission_progress;
create policy "mission_progress_upsert_own"
  on public.mission_progress for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = mission_progress.company_id
        and c.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "mission_progress_update_own" on public.mission_progress;
create policy "mission_progress_update_own"
  on public.mission_progress for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = mission_progress.company_id
        and c.owner_profile_id = auth.uid()
    )
  );

-- Initialisation : chaque entreprise démarre avec 3 missions à faire
create or replace function public.initialiser_missions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mission_progress (company_id, mission_id, etat, cible)
  values
    (new.id, 'mission1', 'a_faire', 50),
    (new.id, 'mission2', 'a_faire', 6),
    (new.id, 'mission3', 'a_faire', 0)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists company_initialiser_missions on public.companies;
create trigger company_initialiser_missions
  after insert on public.companies
  for each row execute function public.initialiser_missions();

-- Backfill : entreprises existantes sans lignes de missions
insert into public.mission_progress (company_id, mission_id, etat, cible)
select c.id, m.mission_id, 'a_faire', m.cible
from public.companies c
cross join (values
  ('mission1'::text, 50::bigint),
  ('mission2'::text, 6::bigint),
  ('mission3'::text, 0::bigint)
) as m(mission_id, cible)
on conflict do nothing;
