-- AE-1 : création de la société, en une transaction.
--
-- Le joueur n'écrit jamais lui-même dans companies : le serveur appelle cette fonction
-- avec le capital tiré des paramètres. L'apport (512 Banque / 101 Capital) est inscrit
-- par le déclencheur existant de la migration 0009. Étape 0, aucun atelier, une seule
-- société par joueur. pas_traites reste NULL : l'orchestrateur la place sur le pas
-- courant, sans rejouer d'historique.

set statement_timeout = '60s';

create or replace function public.creer_societe(
  p_owner uuid,
  p_nom text,
  p_gamme text,
  p_capital_centimes bigint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monde uuid;
  v_id uuid;
begin
  if p_nom is null or length(trim(p_nom)) = 0 or length(p_nom) > 60 then
    raise exception 'nom_invalide' using errcode = 'KP400';
  end if;
  if p_gamme is null or p_gamme not in ('entree', 'milieu', 'haut') then
    raise exception 'gamme_invalide: %', p_gamme using errcode = 'KP400';
  end if;
  if p_capital_centimes is null or p_capital_centimes <= 0 then
    raise exception 'capital_invalide: %', p_capital_centimes using errcode = 'KP400';
  end if;

  -- Verrou sur le profil : deux créations simultanées se mettent en file.
  perform 1 from public.profiles where id = p_owner for update;
  if not found then
    raise exception 'profil_introuvable: %', p_owner using errcode = 'KP404';
  end if;

  if exists (select 1 from public.companies where owner_profile_id = p_owner) then
    raise exception 'societe_existante' using errcode = 'KP409';
  end if;

  select id into v_monde from public.worlds where etat = 'actif' order by cree_le limit 1;
  if v_monde is null then
    raise exception 'monde_introuvable' using errcode = 'KP404';
  end if;

  insert into public.companies (world_id, owner_profile_id, nom, gamme, etape, statut, tresorerie_centimes)
  values (v_monde, p_owner, trim(regexp_replace(p_nom, '\s+', ' ', 'g')), p_gamme, 0, 'active', p_capital_centimes)
  returning id into v_id;

  return v_id;
end;
$$;

-- Réservée au serveur (clé de service) : jamais appelable depuis un navigateur.
revoke all on function public.creer_societe(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.creer_societe(uuid, text, text, bigint) to service_role;
