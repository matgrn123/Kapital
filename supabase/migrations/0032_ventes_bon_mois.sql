-- 0032 : une seule convention de mois pour les écritures, et compteur de pièces au fil de l'eau.
--
-- Avant ce correctif, l'avance du monde (orchestrateur) écrivait ses écritures au mois de jeu
-- en cours + 1 (« le mois qu'elles clôturent »), alors que worlds.mois_courant et les routes
-- utilisent le mois en cours. Désormais toute écriture porte le mois de jeu où elle a lieu.
--
-- Cette migration reprend les données déjà écrites par l'avance du monde :
--   1. ledger_entries : décale de -1 le mois des écritures de l'avance du monde ;
--   2. etat_mois_entreprise : décale de -1 le mois de l'état du mois en cours ;
--   3. companies : ajoute aux compteurs d'étape les ventes du mois en cours déjà passées
--      (avant, elles n'étaient comptées qu'à la clôture ; la clôture ne les compte plus).
--
-- Identification sûre des écritures de l'avance du monde : leur identifiant commence par un
-- préfixe que seul le moteur écrit pendant l'avance, suivi du mois (`vente_11_…`), et ce mois
-- est égal à mois_jeu. Aucune route n'écrit ces préfixes (les routes écrivent pret_, bail_signature_,
-- achat_local_, pret_achat_, licenciement_, serie_lancement_, marketing_… : jamais touchées).
-- La date de création (cree_le) n'est pas utilisée : le cockpit admin déplace l'horloge
-- (worlds.debut_reel), elle ne dit donc pas sûrement à quel mois une écriture appartenait.
--
-- Idempotente : la reprise n'est faite qu'une fois (trace dans public.reprises_donnees).
-- À appliquer avance du monde arrêtée (voir la description de la PR).

create table if not exists public.reprises_donnees (
  nom text primary key,
  faite_le timestamptz not null default now(),
  detail jsonb
);
alter table public.reprises_donnees enable row level security;

do $$
declare
  v_ecritures integer;
  v_etats integer;
begin
  if exists (select 1 from public.reprises_donnees where nom = '0032_ventes_bon_mois') then
    raise notice '0032 : reprise déjà faite, rien à faire';
    return;
  end if;

  -- Personne n'écrit pendant la reprise.
  lock table public.ledger_entries, public.etat_mois_entreprise, public.companies in exclusive mode;

  -- 1. Écritures de l'avance du monde : mois - 1
  update public.ledger_entries le
     set mois_jeu = le.mois_jeu - 1
   where le.mois_jeu >= 1
     and le.ecriture_id ~ '^(vente|retour|encaissement|livraison_mat|livraison_fac|production_atelier|tva_paiement|tva_declaration|salaire|salaire_pmt|energie|amort|amort_construction|entretien_local|echeance|agios|is|is_pmt|loyer|charges_locatives|bail_restitution)_[0-9]+_'
     and substring(le.ecriture_id from '^[a-z_]+?_([0-9]+)_')::integer = le.mois_jeu;
  get diagnostics v_ecritures = row_count;

  -- 3. Compteurs d'étape : ventes du mois en cours déjà passées (avant le décalage de l'état)
  update public.companies c
     set pieces_vendues_total = c.pieces_vendues_total + coalesce((
           select sum((v.value)::bigint)
             from jsonb_each_text(coalesce(e.cumul->'serviParLigne', '{}'::jsonb)) v
         ), 0),
         chiffre_affaires_cumule_ht_centimes = c.chiffre_affaires_cumule_ht_centimes
           + greatest(0, coalesce((e.cumul->>'chiffreAffairesHt')::bigint, 0))
    from public.etat_mois_entreprise e
   where e.company_id = c.id;

  -- 2. État du mois en cours : mois - 1 (colonne et clé "mois" du cumul)
  update public.etat_mois_entreprise e
     set mois = e.mois - 1,
         cumul = jsonb_set(e.cumul, '{mois}', to_jsonb(e.mois - 1)),
         mis_a_jour_le = now()
   where e.mois >= 1;
  get diagnostics v_etats = row_count;

  insert into public.reprises_donnees (nom, detail)
  values ('0032_ventes_bon_mois', jsonb_build_object('ecritures', v_ecritures, 'etats_du_mois', v_etats));
  raise notice '0032 : % lignes d''écritures et % états du mois décalés', v_ecritures, v_etats;
end
$$;
