# Kapital — instructions pour Claude Code

Kapital est un jeu de gestion d'entreprise multijoueur, éducatif, en français.
Version en cours : V1, module Entrepreneur textile (étapes 0 à 2).

## Documents de référence (à lire avant tout ticket)

- `docs/cahier-des-charges-v1.md` : ce qu'il faut construire, et la liste des tickets (section 13).
- `docs/referentiel-couts.md` : les valeurs de départ du moteur (coûts, temps, salaires).

En cas de contradiction, le cahier des charges l'emporte.

## Méthode de travail

- Un ticket à la fois, dans l'ordre de la section 13 du cahier des charges.
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

## Structure du dépôt

```
apps/web/              Interface Next.js
packages/engine/       Moteur de simulation (fonction pure)
packages/content/      Paramètres, produits, missions
supabase/migrations/   Schéma de la base
tools/sim/             Banc d'essai (simulation longue sans joueurs)
docs/                  Cahier des charges et référentiel
```

## Commandes

- `npm install` : installer
- `npm test` : lancer les tests
- `npm run typecheck` : vérifier les types
