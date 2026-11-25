# Kapital — instructions pour Claude Code

Kapital est un jeu de gestion d'entreprise multijoueur, éducatif, en français.
Version en cours : V1, module Entrepreneur textile (étapes 0 à 2, puis une tranche boutique en fin de V1).

## Documents de référence (à lire avant tout ticket)

- `docs/cahier-des-charges-v1.md` : ce qu'il faut construire, et la liste des tickets (section 13).
- `docs/referentiel-couts.md` : les valeurs de départ du moteur (coûts, temps, salaires).
- `docs/batiments-3d-groupe.md` : bâtiments, 3D, aménagement, groupe (holdings, LBO, procédures collectives), et les arbitrages faits.
- `docs/plan-architecture-entreprise.md` : étapes de croissance du joueur, systèmes du moteur, types partagés, détail des tickets TP et AE.

En cas de contradiction, le cahier des charges l'emporte.

## Méthode de travail

- Un ticket à la fois, dans l'ordre de la section 13 du cahier des charges. Les tickets 3D portent le préfixe 3D (3D-1 à 3D-9), ceux du temps le préfixe TP (TP-1 à TP-3), ceux de l'architecture de l'entreprise le préfixe AE (AE-1 à AE-11).
- Avant de coder : résumer le ticket, proposer un plan court, attendre mon accord. Exception : l'interface, voir « Autonomie sur l'interface ».
- Écrire les tests d'abord (Vitest), puis le code qui les fait passer.
- Un ticket est terminé quand son critère d'acceptation passe et que `npm test` est vert.
- Expliquer simplement ce qui a été fait : je ne suis pas développeur.
- Ne jamais committer de secret (`.env`, clés Supabase). La clé de service Supabase ne va jamais côté client.

## Autonomie sur l'interface (décision du 25 novembre 2026)

Claude a la main sur l'interface et le design du site (`apps/web`, écrans et composants), sans attendre d'accord préalable. La boucle :

1. Jouer : `/runcompany` (compte `robot-testeur`) pour relever ce qui casse, ce qui manque, ce qui est pénible.
2. Corriger par petits lots, chacun sur sa branche, tests compris.
3. Vérifier : le robot rejoue sur la prévisualisation Vercel de la branche.
4. Rendre compte : lien de prévisualisation + avant / après / pourquoi, en trois lignes. Mathieu regarde l'écran et fusionne lui-même.

Sans demander : bugs d'affichage, messages d'erreur, ergonomie et design des écrans, écrans manquants pour ce que le serveur sait déjà faire. Inspiration : les jeux de gestion (Les Sims, SimCity, Capitalism Lab) pour l'ergonomie et la lisibilité, sans copier leur apparence ni leurs éléments.

Toujours avec accord : règles du jeu, chiffres et comptabilité (`packages/engine`, `packages/content`), schéma de la base (`supabase/migrations`), temps et administration, fusion dans `main`, toute fonctionnalité absente du cahier des charges (la proposer, ne pas la coder).

## Règles techniques

- TypeScript strict partout.
- Le moteur (`packages/engine`) est une fonction pure : aucun accès réseau ni base de données, aucun `Math.random()` (utiliser la graine fournie), aucun `Date.now()`.
- Montants en centimes (entiers). Jamais de nombres à virgule pour l'argent.
- Aucun chiffre métier en dur dans le code : tout vient de `packages/content/parametres-v1.json`, chaque paramètre avec valeur, unité, source et date.
- Comptabilité en partie double : après chaque opération, actif = passif.
- Temps : une seule horloge pour tous, sans pause ni accéléré. Le ratio (1 jour réel = 1 mois de jeu) et le pas d'avance du monde (1 minute réelle) sont des paramètres ; salaires et loyers sont payés en fin de mois de jeu.

## Règles de rendu (village et atelier)

- Décision du 25 novembre 2026 : le village et l'atelier sont dessinés en **SVG isométrique**, d'après la maquette `docs/maquette/kapital-maquette-v2.html`, avec un rendu réaliste (textures, lumière par face, ombres douces), sans rotation de caméra. Moteur de rendu commun : `apps/web/components/iso`. Three.js et React Three Fiber ne sont plus utilisés pour ces écrans.
- Tout ce qui est dessiné a un effet économique, mais le dessin ne décide jamais d'un chiffre : il affiche l'état calculé par le moteur et envoie des demandes au serveur.
- La validation d'un plan d'aménagement est une fonction pure de `packages/engine`, utilisée par le navigateur pour l'aperçu et réexécutée par le serveur avant enregistrement.
- Images, textures ou modèles externes : uniquement de sources à licence vérifiée (CC0), chacun inscrit dans `assets/LICENCES.md` ; ne committer que les fichiers utilisés, jamais les packs complets.
- Performance : fluide sur un portable récent ; réutiliser les motifs SVG (`<defs>`) plutôt que dupliquer, pas d'animation hors `prefers-reduced-motion`.

## Structure du dépôt

```
apps/web/              Interface Next.js
packages/engine/       Moteur de simulation (fonction pure)
packages/content/      Paramètres, produits, missions, catalogues de bâtiments et modules
supabase/migrations/   Schéma de la base
tools/sim/             Banc d'essai (simulation longue sans joueurs)
docs/                  Cahier des charges et référentiel
```

## Commandes

- `npm install` : installer
- `npm test` : lancer les tests
- `npm run typecheck` : vérifier les types
