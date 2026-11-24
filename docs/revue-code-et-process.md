# Revue de code et de process — Kapital

24 novembre 2026 · Relecteur : Claude Opus 4.7

---

## Partie A — Code

### 1. Ce qui est cassé, fragile ou contraire à CLAUDE.md

**Bloquant**

- **Doublon de préfixe de migration** (`supabase/migrations/`) : deux fichiers commencent par `0015` — `0015_ledger_balanced_trigger.sql` et `0015_plan_atelier.sql`. Supabase applique les migrations dans l'ordre alphabétique du nom de fichier ; à nom identique, l'ordre n'est pas garanti. Sur un projet frais (`supabase db reset`), l'une peut écraser ou bloquer l'autre. Aucune migration ultérieure n'est fiable tant que ce préfixe est dupliqué.

- **Écriture `placed_modules` impossible** : la migration `0017_rls_write_server_only.sql` supprime les policies d'écriture sur `placed_modules` avec le commentaire « aménagement passera aussi par route serveur plus tard ». Aucune route `/api/actions/` ne la remplace encore. Résultat : il est impossible d'enregistrer un plan d'atelier en base. Les tickets 3D-5 (mode aménagement) et 3D-2 (validation de plan) sont bloqués.

**Important**

- **Bypass d'authentification toujours actif** (`apps/web/lib/supabase/middleware.ts`, lignes 34–37) : si les variables `KAPITAL_DEV_EMAIL` et `KAPITAL_DEV_PASSWORD` sont présentes dans l'environnement Vercel Preview — ce qui est possible depuis la configuration récente — tout visiteur anonyme est automatiquement connecté sur le compte LVMH (admin). Cela signifie que l'URL de Preview d'une PR est accessible à n'importe qui sans compte, avec des droits admin.

- **Horodatages de livraison calculés avec `new Date()`** (`apps/web/app/api/actions/commander-matiere/route.ts:63-64`, `lancer-production/route.ts:41-42`, `demander-pret/route.ts:81`) : l'heure réelle du serveur détermine quand la livraison arrivera. Rejouer les mêmes décisions à des instants différents donne des états différents — ce qui est contraire au critère T13 (déterminisme et audit). Ce n'est pas le moteur qui est concerné, mais la couche serveur qui construit les événements.

- **`Date.now()` comme identifiant d'écriture** (`apps/web/app/api/actions/action-marketing/route.ts:90`) : sous charge simultanée, deux écritures peuvent recevoir le même identifiant. L'écriture échouerait silencieusement si la contrainte d'unicité est présente, ou produirait un doublon si elle ne l'est pas.

**Mineur**

- `tools/sim/` ne contient qu'un `README.md`. Le banc d'essai T14 est en réalité intégré dans les tests Vitest (`packages/engine/src/pnj/pnj.test.ts`), pas dans un outil autonome comme l'indique le cahier des charges section 12. Ce n'est pas un bug, mais ça diffère du plan.

- Aucun fichier `supabase/seed.sql` : les tests Playwright ne peuvent pas partir d'un état de base connu.

---

### 2. Règles prioritaires

| Règle | État | Preuve |
|---|---|---|
| Moteur sans `Math.random()` | ✅ Respecté | `grep` sur `packages/engine/src/` : zéro résultat hors tests |
| Moteur sans `Date.now()` / `new Date()` | ✅ Respecté | Idem ; le RNG est dans `moteur/rng.ts`, déterministe |
| Moteur sans accès réseau/base | ✅ Respecté | Aucun import Supabase dans `packages/engine/` |
| Montants en centimes entiers | ✅ Respecté | Type `Centimes` opaque, `Math.round` systématique dans les calculs |
| Aucun chiffre métier en dur | ✅ Respecté | Attraction, impôts, salaires lisent tous `Parametres` |
| Actif = passif après chaque opération | ✅ Respecté dans le moteur | `enRegistrer()` lève une erreur si déséquilibré ; trigger SQL `0015_ledger_balanced_trigger.sql` double la vérification |

---

### 3. Sécurité

- **Clé `service_role` jamais côté client** : `client.ts` et `server.ts` utilisent exclusivement `NEXT_PUBLIC_SUPABASE_ANON_KEY`. La `service_role` n'apparaît que dans les routes `/api/`, via `process.env.SUPABASE_SERVICE_ROLE_KEY`. ✅
- **Le joueur n'écrit jamais directement en base** : migration `0017_rls_write_server_only.sql` supprime toutes les policies d'écriture côté joueur. Toute action passe par `chargerContexte()` qui vérifie l'authentification avant d'utiliser le client admin. ✅
- **Risque ouvert** : le bypass auth dev (`KAPITAL_DEV_EMAIL`/`KAPITAL_DEV_PASSWORD`) dans le middleware est un vecteur d'accès admin non intentionnel si ces variables sont présentes en Preview. À vérifier et retirer de Vercel avant l'ouverture.

---

### 4. Les tests

**Ce qui est testé :** comptabilité (équilibre, plan comptable, refus de déséquilibre), achats, atelier, façonniers, impôts, salaires, marché (attraction, ventes, parts), marketing, ventes, prêts, PNJ (120 mois, stabilité, déterminisme), missions, classement, simulerMois (245 assertions, dont déterminisme à la ligne 760), paramètres (format `valeur+unité+source+date`), catalogues.

**Ce qui n'est pas testé :**
- Les routes `/api/actions/*` : aucun test d'intégration. Un bug dans `embaucher/route.ts` ou `commander-matiere/route.ts` ne sera détecté qu'en production.
- Les tests Playwright sont hors CI (aucun step `playwright` dans `.github/workflows/`). Le seul test existant (`parcours.spec.ts`) vérifie uniquement la redirection vers `/jeu` — il ne teste pas l'inscription, la création d'entreprise ni aucune décision.

**Tests qui ne vérifient pas grand-chose :** `types.example.test.ts` vérifie que les constructeurs de types primitifs compilent — utile pour TypeScript, mais sans valeur fonctionnelle.

---

### 5. État des tickets

| Ticket | État | Preuve |
|---|---|---|
| T01 Dépôt, CI, Vitest | ✅ Fait | `.github/workflows/ci.yml`, `vitest.config` |
| T02 Paramètres + contrôle format | ✅ Fait | `packages/content/src/validate.test.ts`, 48 params avec source+date |
| T03 Types moteur | ✅ Fait | `packages/engine/src/types/` |
| T04 Comptabilité partie double | ✅ Fait | `comptabilite/`, trigger SQL 0015 |
| T05 Achats matière | ✅ Fait | `achats/`, route `commander-matiere` |
| T06 Atelier | ✅ Fait | `atelier/calculs.ts`, scénario t-shirt |
| T07 Façonniers | ✅ Fait | `faconniers/` |
| T08 Marché | ✅ Fait | `marche/attraction.ts`, paramétré |
| T09 Marque et marketing | ✅ Fait | `marketing/jauges.ts` |
| T10 Ventes, canaux, retours | ✅ Fait | `ventes/ventes.ts` |
| T11 Salariés, cotisations | ✅ Fait | `salaires/calculs.ts` |
| T12 Prêt, impôts | ✅ Fait | `prets/`, `impots/` |
| T13 `simulerMois` + déterminisme | ✅ Fait | `moteur/simulerMois.ts`, test ligne 760 |
| T14 PNJ + banc d'essai | ✅ Fait | `pnj/bancEssai.ts`, tests 120 mois |
| T15 Base Supabase, RLS | ✅ Fait | 18 migrations, policies select/insert |
| T16 Fonctions serveur décision | ✅ Fait | `apps/web/app/api/actions/*` |
| T17 Processeur d'événements | ✅ Fait | `evenements/avancer.ts` |
| T18 Données réelles + admin | ✅ Fait | `apps/web/app/(authentifie)/admin/` |
| T19 Inscription, connexion | ✅ Partiel | Middleware et Supabase Auth présents ; inscription réelle non testée (bypass dev actif) |
| T20 Tableau de bord et pages | ✅ Fait | Toutes les pages sous `(authentifie)/` |
| T21 Finances | ✅ Fait | `finances/page.tsx` |
| T22 Missions | ✅ Fait | `missions/evaluer.ts`, 3 missions définies |
| T23 Classement | ✅ Fait | `classement/calculer.ts`, route refresh |
| T24 Recette générale | Non vérifié | Pas vérifiable dans le code |
| T25–T28 | Non définis dans le cahier | Les lots A et B (sécurité, clôture, moteur complet) correspondent à ces numéros mais l'attribution n'est pas documentée |

---

## Partie B — Process

### 6. Mise en place GitHub

- **Branches** : nommage cohérent observé dans le git log (`lot-a4-fermer-rls`, `docs/claude-app-notes`, etc.). ✅
- **Protection de `main`** : active — un push direct est rejeté, une PR + tests verts sont requis. ✅
- **CODEOWNERS** : absent. Sans ce fichier, GitHub n'assigne aucun relecteur automatique. À trois, n'importe qui peut merger une PR touchant la migration ou le moteur sans que l'archi soit notifié.
- **CI** : lint + typecheck + Vitest sur chaque push et PR. ✅ Les tests Playwright ne sont pas dans le workflow CI.
- **Secrets** : `SUPABASE_ACCESS_TOKEN` et `SUPABASE_DB_PASSWORD` sont dans les secrets GitHub (utilisés par le workflow de migration). Non vérifié si `KAPITAL_DEV_EMAIL`/`KAPITAL_DEV_PASSWORD` sont dans les secrets Vercel Preview.

### 7. Supabase

- **Migrations** : 18 migrations numérotées, idempotentes (IF NOT EXISTS, DROP POLICY IF EXISTS). Défaut : doublon de préfixe sur `0015` (voir section 1).
- **Environnements** : un seul projet actif (`Kapital`, prod). Les variables Vercel pour Preview pointent maintenant sur le même projet — les previews de PR écrivent donc dans la même base que la production. Risque direct si un collègue teste une décision destructrice.
- **Données de test** : pas de `seed.sql`. Les PNJ sont insérés par `0014_seed_pnj.sql` (migration), ce qui mélange données de référence et données de jeu dans les migrations.

### 8. Risques de conflit à trois

- **`parametres-v1.json`** : fichier unique plat avec 48 clés de trois domaines différents (salaires, marché, finance). Si deux personnes ajoutent un paramètre dans la même session, le merge produira un conflit JSON difficile à résoudre.
- **Migrations** : le doublon `0015` montre qu'une migration peut déjà être créée en parallèle. Sans règle stricte (archi seul), deux migrations peuvent arriver le même jour avec un préfixe identique.
- **`package.json` / `package-lock.json`** : non vérifié si plusieurs packages seraient ajoutés simultanément. Risque standard.
- **Routes API et types communs** : `api-helpers.ts` et `packages/engine/src/types/` sont partagés entre les trois rôles. Un changement de type sans PR dédiée peut casser silencieusement le code d'un collègue.

### 9. Ce qui manque pour démarrer à trois

1. **CODEOWNERS** à créer (`.github/CODEOWNERS`) — bloque l'attribution automatique des relecteurs.
2. **Retirer le bypass auth** de Vercel Preview ou le conditionner à un flag explicite — les previews ne doivent pas être accessibles sans compte.
3. **Renommer l'une des migrations `0015`** avant que quelqu'un lance `supabase db reset` sur un poste vierge.
4. **Décider si Preview partage la base de prod** ou utilise un projet séparé — aujourd'hui les deux pointent sur `Kapital`.
5. **Découper `parametres-v1.json`** en fichiers par domaine (voir proposition du document `kapital-travailler-a-trois.md`) avant que le rôle Marché commence ses paramètres.

---

## 10. Les dix corrections à faire en premier

1. Renommer `0015_plan_atelier.sql` en `0016_plan_atelier.sql` et renuméroter les suivantes pour supprimer le doublon de préfixe.
2. Vérifier et retirer `KAPITAL_DEV_EMAIL`/`KAPITAL_DEV_PASSWORD` des variables Vercel Preview pour fermer l'accès admin non authentifié.
3. Créer `.github/CODEOWNERS` avec les pseudos des trois rôles avant d'ouvrir les premières branches parallèles.
4. Créer une route `/api/actions/enregistrer-plan/` pour `placed_modules` afin que les tickets 3D-2 et 3D-5 aient un chemin d'écriture.
5. Remplacer `Date.now()` dans `action-marketing/route.ts:90` par un UUID ou un identifiant composé (company\_id + mois + type) pour éviter les collisions.
6. Ajouter les tests Playwright au workflow CI (ou documenter explicitement pourquoi ils n'y sont pas).
7. Décider de l'environnement Preview (projet dédié ou prod) et en informer les trois membres avant les premières PRs.
8. Créer `supabase/seed.sql` avec un monde et une entreprise PNJ minimaux pour que les tests de bout en bout partent d'un état connu.
9. Découper `parametres-v1.json` en fichiers par domaine avant que le rôle Marché ajoute ses premiers paramètres.
10. Documenter dans CLAUDE.md que les horodatages de livraison (`new Date()` dans les routes actions) sont intentionnellement en temps réel serveur, ou les remplacer par un calcul depuis `mois_courant` pour préserver le déterminisme de bout en bout.

---

## 11. Questions ouvertes

1. Les variables `KAPITAL_DEV_EMAIL`/`KAPITAL_DEV_PASSWORD` sont-elles actuellement dans les secrets Vercel Preview ?
2. T25–T28 désignent-ils les lots A et B, ou une autre numérotation ? Le cahier s'arrête à T24.
3. La duplication du projet Supabase (Preview = Prod) est-elle délibérée, ou faut-il un projet séparé dès maintenant ?
4. Le `seed.sql` pour les PNJ doit-il rester dans les migrations (état permanent) ou passer dans un script de reset séparé ?
5. L'absence de tests d'intégration sur les routes `/api/actions/*` est-elle acceptée pour l'instant, ou faut-il les ajouter avant d'ouvrir le travail à trois ?
