-- TP-2c : minuterie et diffusion en direct.
--
-- 1. Une minuterie Supabase (pg_cron) appelle notre serveur toutes les minutes
--    (pg_net) : le marché avance même si personne n'est connecté.
-- 2. Les nouvelles écritures comptables sont diffusées en direct (Realtime) :
--    une vente s'affiche sans recharger la page. Chaque joueur ne reçoit que
--    les écritures de sa propre entreprise (les règles RLS de ledger_entries
--    s'appliquent à la diffusion).
--
-- Sûr par défaut : la minuterie ne fait RIEN tant que l'adresse et le secret ne
-- sont pas enregistrés dans le coffre (Vault). Voir tools/supabase/activer-minuterie.ts.
-- Si les droits manquent pour créer une extension ou programmer la tâche, la
-- migration le signale (NOTICE) au lieu d'échouer, et le script d'activation reprend.

set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron non créée (%) : à activer depuis le tableau de bord Supabase', sqlerrm;
end
$$;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net non créée (%) : à activer depuis le tableau de bord Supabase', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Déclencheur : appelle la route d'avance du monde avec le secret du coffre
--    Secrets attendus dans Vault : kapital_avance_url, kapital_cron_secret.
--    Retourne l'identifiant de la requête, ou NULL si rien n'est configuré.
-- ---------------------------------------------------------------------------

create or replace function public.declencher_avance_monde()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_requete bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'kapital_avance_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'kapital_cron_secret';

  if v_url is null or v_secret is null then
    return null; -- minuterie non configurée : on ne fait rien
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_requete;

  return v_requete;
end;
$$;

revoke all on function public.declencher_avance_monde() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Programmation : toutes les minutes (rejouable : même nom = mise à jour)
-- ---------------------------------------------------------------------------

do $$
begin
  perform cron.schedule(
    'kapital-avance-monde',
    '* * * * *',
    'select public.declencher_avance_monde()'
  );
exception when others then
  raise notice 'tâche non programmée (%) : relancer tools/supabase/activer-minuterie.ts', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Diffusion en direct des écritures comptables
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger_entries'
     ) then
    alter publication supabase_realtime add table public.ledger_entries;
  end if;
exception when others then
  raise notice 'diffusion en direct non activée (%) : à activer depuis le tableau de bord (Database > Replication)', sqlerrm;
end
$$;
