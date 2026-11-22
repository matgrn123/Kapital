# Kapital — instructions pour Claude Code

Kapital est un jeu de gestion d'entreprise multijoueur, éducatif, en français.
Version en cours : V1, module Entrepreneur textile (étapes 0 à 2).

## Documents de référence (à lire avant tout ticket)

- `docs/cahier-des-charges-v1.md` : ce qu'il faut construire, et la liste des tickets (section 13).
- `docs/referentiel-couts.md` : les valeurs de départ du moteur (coûts, temps, salaires).
- `docs/batiments-3d-groupe.md` : bâtiments, 3D, aménagement, groupe (holdings, LBO, procédures collectives), et les arbitrages faits.

En cas de contradiction, le cahier des charges l'emporte.

## Méthode de travail

- Un ticket à la fois, dans l'ordre de la section 13 du cahier des charges. Les tickets 3D portent le préfixe 3D (3D-1 à 3D-9).
- Avant de coder : résumer le ticket, proposer un plan court, attendre mon accord.
- Écrire les tests d'abord (Vitest), puis le code qui les fait passer.
- Un ticket est terminé quand son critère d'acceptation passe et que `npm test` est vert.
- Expliquer simplement ce qui a été fait : je ne suis pas développeur.
- Ne jamais committer de secret (`.env`, clés Supabase). La clé de service Supabase ne va jamais côté client.

## Règles techniques

- TypeScript strict partout.
- Le moteur (`packages/engine`) est une fonction pure : aucun accès réseau ni base de données, aucun `Math.random()` (utiliser la graine fournie), aucun `Date.now()`.
- Montants en centimes (entiers). Jamais de nombres à virgule pour l'argent.
- Aucun chiffre métier en dur dans le code : tout vient de `packages/content/parametres-v1.json`, chaque paramètre avec valeur, unité, source et date.
- Comptabilité en partie double : après chaque opération, actif = passif.

## Règles 3D

- 3D avec Three.js et React Three Fiber, uniquement côté navigateur. Pas de Babylon.js.
- Toute la 3D a un effet économique, mais la 3D ne décide jamais d'un chiffre : elle affiche l'état calculé par le moteur et envoie des demandes au serveur.
- La validation d'un plan d'aménagement est une fonction pure de `packages/engine`, utilisée par le navigateur pour l'aperçu et réexécutée par le serveur avant enregistrement.
- Modèles glTF/GLB uniquement de sources à licence vérifiée (Quaternius = CC0), chaque modèle inscrit dans `assets/LICENCES.md`.
- Ne committer que les modèles utilisés (dans `apps/web/public/models`), jamais les packs complets téléchargés.
- Performance : fluide sur un portable récent ; instancier les objets répétés, compresser les textures.

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
