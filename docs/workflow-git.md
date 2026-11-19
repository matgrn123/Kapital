# Workflow Git pour Kapital

On est trois à travailler sur le projet avec Claude Code. Ce document décrit comment on s'y prend pour éviter de se marcher dessus et pour que chaque ajout soit vérifié avant d'arriver sur `main`.

## Principe en une phrase

**Une branche par ticket, une Pull Request par ticket, on merge sur `main` seulement quand la CI est verte et qu'au moins une autre personne a relu.**

## Avant de commencer un ticket

Toujours repartir d'un `main` à jour :

```bash
git checkout main
git pull
```

Puis créer une branche nommée d'après le ticket :

```bash
git checkout -b t02-parametres
```

**Règle de nommage** : `t<numéro>-<mots-clés-courts>`. Exemples : `t02-parametres`, `t04-compta-partie-double`, `t08-marche`.

## Pendant que vous codez

- Faites des commits courts et fréquents, en français, à l'impératif. Exemple : `ajoute la vérification des sources`, pas `ajouté la vérification`.
- Lancez `npm test` et `npm run typecheck` avant chaque commit.
- Ne committez **jamais** de fichier `.env` ou de clé secrète.

## Quand le ticket est terminé

1. Pousser la branche :

   ```bash
   git push -u origin t02-parametres
   ```

2. Ouvrir une Pull Request sur GitHub vers `main`.
3. Attendre que la CI passe au vert (badge vert sur la PR, environ 20 secondes).
4. Demander à un des deux autres de relire. Un commentaire « ok pour moi » suffit.
5. Cliquer sur **Merge pull request** sur GitHub, puis supprimer la branche (bouton proposé juste après).
6. En local :

   ```bash
   git checkout main
   git pull
   git branch -d t02-parametres
   ```

## Le piège principal à trois : les conflits

Un conflit arrive quand deux personnes modifient le même fichier en parallèle. Deux règles pour les éviter :

- **Se répartir les tickets pour ne pas toucher les mêmes fichiers.** Le cahier des charges aide : T02 touche `packages/content/parametres-v1.json`, T04 touche la comptabilité, T05 les achats, etc. Avant de prendre un ticket, dire aux autres lequel vous prenez (dans votre canal de discussion habituel).
- **Celui qui merge en deuxième met sa branche à jour avant de pousser.** Si quelqu'un a mergé sur `main` pendant que vous travailliez :

  ```bash
  git checkout main
  git pull
  git checkout t02-parametres
  git merge main
  ```

  S'il y a un conflit, Git vous le signale sur un fichier précis. Résolvez-le dans ce fichier (ou demandez à Claude Code de le faire), puis `git add` le fichier, `git commit`, et `git push`.

## Ce qui est interdit

- `git push --force` sur `main`.
- `git merge` directement sur `main` sans Pull Request.
- Merger sa propre PR sans qu'un autre ait au moins jeté un œil.
- Désactiver la CI ou passer outre un test rouge pour merger plus vite.

## Résumé visuel

```
main ────●────────●──────────●──────●───────► 
          \        \          \      \
           T02──────┘          \      \
                   T03──────────┘      \
                                T04─────┘
```

Chaque trait partant de `main` est une branche. Chaque retour à `main` est un merge via Pull Request, après validation de la CI et revue par un autre.
