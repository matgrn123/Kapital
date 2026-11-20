# Outils Supabase

Deux scripts Node pour administrer la base Supabase du projet.

## Pré-requis

Variables dans `/.env.local` (fichier déjà ignoré par Git) :

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_DB_PASSWORD=<mot_de_passe_postgres>
```

Le mot de passe se trouve dans **Dashboard → Project Settings → Database**.

## Appliquer les migrations

Exécute tous les fichiers `.sql` de `supabase/migrations/` dans l'ordre
alphabétique. Idempotent (rejeu possible).

```bash
cd tools/supabase
node --env-file=../../.env.local --experimental-strip-types migrate.ts
```

## Tester l'isolement RLS (critère T15)

Crée deux utilisateurs temporaires, chacun crée son entreprise, puis vérifie :

1. L'utilisateur A ne voit **pas** l'entreprise de B dans `companies`.
2. L'utilisateur A voit sa propre entreprise.
3. Les deux entreprises sont visibles via la vue publique `companies_publiques`,
   limitée à `nom`, `gamme`, `etape` (pas de trésorerie).

```bash
cd tools/supabase
node --env-file=../../.env.local --experimental-strip-types rls-test.ts
```

Les utilisateurs et le monde créés sont supprimés en fin de test.

## Pourquoi pas la CI ?

Ces scripts se connectent à une vraie base Supabase. La CI GitHub Actions
n'a pas (encore) de projet Supabase dédié ni les secrets associés. À réactiver
dans un ticket futur dédié à la CI étendue.
