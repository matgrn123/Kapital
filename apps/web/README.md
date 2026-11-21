# @kapital/web

Interface web Next.js de Kapital. T19 : inscription, connexion, création d'entreprise.

## Variables d'environnement

Créer un fichier `.env.local` à la racine de **ce dossier** (apps/web) :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Les valeurs se trouvent dans `/.env.local` (racine du monorepo) sous
`SUPABASE_URL` et `SUPABASE_ANON_KEY`. Elles doivent être préfixées
`NEXT_PUBLIC_` pour être lues côté navigateur.

## Lancer l'app

```bash
cd apps/web
npm run dev
```

Ouvrir http://localhost:3000.

## Lancer le test de bout en bout (T19)

```bash
cd apps/web
npm run e2e:install   # première fois seulement
npm run e2e
```

Le test crée un utilisateur de test, s'inscrit, crée une entreprise, vérifie
l'arrivée sur le tableau de bord. L'utilisateur reste en base — il est
supprimable via le dashboard Supabase si besoin.
