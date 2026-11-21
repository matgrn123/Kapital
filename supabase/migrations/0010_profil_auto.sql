-- Création automatique du profil à l'inscription.
--
-- Avant : le client insérait lui-même dans public.profiles juste après signUp.
-- Quand la confirmation d'email est activée, signUp ne crée pas de session,
-- donc auth.uid() est NULL et la policy profiles_insert_self bloque l'insert.
--
-- Après : un trigger security definer sur auth.users crée le profil
-- automatiquement, en lisant le pseudo depuis raw_user_meta_data.

set statement_timeout = '60s';

create or replace function public.creer_profil_a_inscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pseudo_demande text;
  pseudo_final text;
  suffixe integer := 0;
begin
  pseudo_demande := nullif(trim(new.raw_user_meta_data->>'pseudo'), '');

  -- Fallback : partie avant @ de l'email si pas de pseudo fourni
  if pseudo_demande is null then
    pseudo_demande := split_part(coalesce(new.email, 'joueur'), '@', 1);
  end if;

  -- Garantir l'unicité : si le pseudo existe déjà, on suffixe
  pseudo_final := pseudo_demande;
  while exists (select 1 from public.profiles where pseudo = pseudo_final) loop
    suffixe := suffixe + 1;
    pseudo_final := pseudo_demande || suffixe::text;
  end loop;

  insert into public.profiles (id, pseudo)
  values (new.id, pseudo_final);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil_a_inscription();
