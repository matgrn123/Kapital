# Kapital : travailler à trois sur GitHub et Supabase

24 novembre 2026

## En bref

On ne code pas sur 3 branches fixes, une par personne : chacun ouvre une petite branche par tâche, la fusionne dans `main` en 1 à 3 jours, puis en ouvre une autre. C'est ce rythme court, plus un dossier attribué à chaque rôle, qui évite les conflits.

- **Où est le code ?** Aux deux endroits. Vous travaillez et enregistrez sur votre ordinateur, dans VS Code. Vous envoyez ensuite votre travail sur GitHub, qui est la version de référence partagée.
- **Qui touche à quoi ?** Chaque dossier a un propriétaire. Le fichier `CODEOWNERS` le dit à GitHub, qui demande alors automatiquement sa relecture.
- **Supabase :** une base locale sur chaque ordinateur pour développer, un projet « recette » pour jouer entre vous, un projet « production » pour les joueurs. Une seule personne écrit les migrations.
- **Les fichiers partagés** (types du moteur, paramètres, migrations, `package.json`) suivent des règles à part, décrites en section 3.

**Hypothèses de cette première version.** Je n'ai pas lu le dépôt : les chemins de sous-dossiers proposés sont à ajuster. « Marché » désigne le marché simulé dans le jeu (demande, prix, concurrence, PNJ, données réelles), confirmé le 24 novembre. Les points à confirmer sont regroupés à la fin.

## 1. Le process Git et GitHub, pas à pas

Une tâche suit toujours le même cycle : partir de `main` à jour, créer une branche, enregistrer, envoyer sur GitHub, ouvrir une pull request, faire relire, fusionner. Personne n'écrit directement sur `main`.

### Les mots à connaître

| Mot | Ce que c'est | Où ça se passe |
| --- | --- | --- |
| Enregistrer (Ctrl+S) | Sauver le fichier sur le disque | Votre ordinateur |
| Commit | Une photo datée de vos modifications, avec une phrase qui dit ce qui change | Votre ordinateur |
| Push | Envoyer vos commits sur GitHub | De votre ordinateur vers GitHub |
| Pull | Récupérer ce que les autres ont envoyé | De GitHub vers votre ordinateur |
| Branche | Une copie de travail du code, séparée de `main` | Les deux |
| `main` | La branche de référence, celle qui part en recette | GitHub, protégée |
| Pull request (PR) | La demande de faire entrer votre branche dans `main` | GitHub |
| Conflit | Deux personnes ont modifié les mêmes lignes ; Git demande laquelle garder | Votre ordinateur, dans VS Code |

Tant que vous n'avez pas fait de push, votre travail n'existe que sur votre ordinateur. Faites un push au moins une fois par jour : c'est aussi votre sauvegarde.

### Pourquoi pas une branche fixe par personne

Une branche qui vit des semaines s'éloigne de `main`. Le jour de la fusion, les différences se comptent par centaines et les conflits arrivent tous en même temps. Avec des branches courtes, chacun récupère le travail des autres tous les jours, et un conflit éventuel tient en quelques lignes.

### Le cycle d'une tâche

1. **Une fiche (issue) sur GitHub.** Elle porte le numéro du ticket (par exemple 3D-4), ce qu'on veut et le critère d'acceptation. Elle est assignée à une seule personne.
2. **Repartir de `main` à jour.** Dans VS Code, en bas à gauche, cliquez sur le nom de la branche et choisissez `main`. Puis, dans le panneau Contrôle de code source, menu « … », choisissez Pull.
3. **Créer la branche.** Même endroit en bas à gauche, « Créer une branche ». Nom : `rôle/ticket-description`, par exemple `design/3D-4-scene-atelier`, `archi/3D-2-validation-plan`, `marche/T08-reglage-attraction`.
4. **Coder avec Claude Code.** Donnez-lui le ticket. Il résume, propose un plan, attend votre accord, écrit les tests puis le code (c'est la méthode de `CLAUDE.md`). Lancez `npm test` avant de continuer.
5. **Faire des commits souvent.** Panneau Contrôle de code source : relisez la liste des fichiers modifiés, écrivez une phrase (« 3D-4 : caméra isométrique »), cliquez sur Valider. Si un fichier hors de votre dossier apparaît dans la liste, demandez-vous pourquoi avant de valider.
6. **Envoyer sur GitHub.** Bouton Synchroniser ou Publier la branche.
7. **Ouvrir la pull request.** GitHub propose un bouton « Compare & pull request ». Titre = ticket + résumé. Les tests automatiques se lancent, Vercel crée une adresse d'aperçu, et GitHub demande la relecture du propriétaire des dossiers touchés.
8. **Relecture.** Un autre membre lit les changements et essaie l'aperçu. La commande `/code-review` de Claude Code fait une première passe. S'il demande des corrections, vous les faites sur la même branche : la PR se met à jour seule.
9. **Fusionner.** Quand les tests sont verts et la relecture approuvée, bouton « Squash and merge ». Toute la branche devient un seul commit propre dans `main`, qui part en recette.
10. **Nettoyer.** Supprimez la branche (GitHub le propose), revenez sur `main`, faites un Pull. Prochaine tâche.

### La routine quotidienne

- **Le matin :** Pull sur `main`, puis ramenez `main` dans votre branche (dans Claude Code : « mets ma branche à jour avec main »). Un conflit trouvé le matin est petit.
- **Le soir :** commit et push, même si ce n'est pas fini. Une PR peut être ouverte en brouillon (Draft) pour montrer où vous en êtes.
- **Taille :** une PR se relit en moins de 20 minutes. Si elle dépasse, découpez le ticket.

### Si un conflit arrive malgré tout

VS Code ouvre un éditeur de fusion qui montre les deux versions côte à côte. Ne choisissez jamais « garder la mienne » sans lire : c'est ainsi qu'on efface le travail d'un autre. Si le conflit touche le dossier d'un collègue, appelez-le et résolvez-le ensemble, ou demandez à Claude Code d'expliquer les deux versions avant de trancher. Relancez `npm test` après.

### Protéger `main` (une fois, par le propriétaire du dépôt)

Sur GitHub : Settings, puis Rules (ou Branches), nouvelle règle sur `main` :

- [ ] Exiger une pull request avant fusion, avec 1 approbation
- [ ] Exiger la relecture des propriétaires de code (CODEOWNERS)
- [ ] Exiger que les tests automatiques passent
- [ ] Exiger que la branche soit à jour avec `main` avant fusion
- [ ] Interdire le push forcé et la suppression de `main`
- [ ] N'autoriser que « Squash and merge » (Settings, General)

**Attention au plan GitHub (à vérifier).** Sur un dépôt privé, ces règles ne sont appliquées qu'avec un plan payant (GitHub Team, environ 4 dollars par membre et par mois). Avec le plan gratuit, elles s'affichent mais ne bloquent rien : la règle repose alors sur la discipline de chacun.

## 2. S'organiser avec Supabase

Je recommande une base Supabase locale sur chaque ordinateur pour développer, plus deux projets en ligne : recette et production. Chacun peut casser et réinitialiser sa base locale sans gêner les autres, et la structure de la base ne change que par des migrations relues.

### Les bases, environnement par environnement

| Environnement | Base Supabase | Qui y écrit la structure | Mise à jour |
| --- | --- | --- | --- |
| Local | Supabase local sur votre ordinateur (outil `supabase` + Docker) | Personne à la main : `supabase db reset` rejoue toutes les migrations et les données de test | Quand vous voulez |
| Aperçu Vercel (chaque PR) | Le projet recette, en lecture pour l'essai | Personne | Automatique |
| Recette | Projet en ligne « kapital-recette » | Les migrations de `main`, appliquées par l'intégration continue | À chaque fusion dans `main` |
| Production | Projet en ligne « kapital-prod » | Les mêmes migrations, une fois validées en recette | Action volontaire du propriétaire des migrations |

Le plan gratuit de Supabase permet deux projets actifs : c'est exactement recette et production (à revérifier au moment de souscrire). Une PR qui change la structure de la base se teste en local, pas sur l'aperçu.

**Plan B, si Docker est trop lourd sur un ordinateur.** On crée un troisième projet en ligne « kapital-dev » partagé. C'est plus simple à installer, mais une donnée de test modifiée par l'un se voit chez les autres, et il faudra passer au plan payant (environ 25 dollars par mois).

### Un seul propriétaire des migrations

Le responsable de l'architecture du jeu est le seul à créer des fichiers dans `supabase/migrations`.

- **Besoin d'une table ou d'une colonne ?** Ouvrez une issue qui décrit le besoin. Le propriétaire écrit la migration dans une PR à part, fusionnée vite, puis vous repartez de `main`.
- **Une migration par PR**, créée avec `supabase migration new <nom>`. Le nom commence par la date et l'heure, ce qui évite deux fichiers au même numéro.
- **On ne modifie jamais une migration déjà fusionnée.** Pour corriger, on en écrit une nouvelle. La recette et la production ont déjà appliqué l'ancienne.
- **Une migration ne détruit jamais de données de joueurs.** C'est la règle du monde persistant : on ajoute, on copie, puis on retire dans une migration ultérieure.
- **Les données de test** (`supabase/seed.sql`) appartiennent aussi au propriétaire des migrations.

### Les secrets

- **Un fichier `.env.local` par personne, jamais commité.** Vérifiez qu'il figure dans `.gitignore`.
- **Un fichier `.env.example` commité**, avec les noms des variables et des valeurs vides. Il dit à chacun quoi remplir.
- **Les clés se partagent par un gestionnaire de mots de passe** (Bitwarden ou 1Password, coffre d'équipe), jamais par messagerie, e-mail ou capture d'écran.
- **La clé de service (service_role) ne va jamais côté navigateur.** Aucune variable qui commence par `NEXT_PUBLIC_` ne doit la contenir. Elle contourne toutes les règles d'accès.
- **Les clés de production** ne sont connues que du propriétaire des migrations et rangées dans les réglages Vercel (environnement Production). Les autres n'en ont pas besoin.
- **Si une clé a fuité sur GitHub,** la supprimer du fichier ne suffit pas : elle reste dans l'historique. On la régénère aussitôt dans Supabase.

## 3. Cloisonner les fichiers par rôle

Chaque dossier a un seul propriétaire : il y travaille librement, et toute modification faite par un autre passe par sa relecture. Deux personnes ne modifient donc presque jamais les mêmes lignes en même temps, et quand ça arrive, GitHub le signale avant la fusion.

### Qui possède quoi

Les sous-dossiers marqués (à créer) n'existent sans doute pas encore. La première tâche du responsable architecture est de ranger le code existant dans ces cases, en une seule PR, avant que les deux autres ne commencent leurs branches.

| Dossier ou fichier | Propriétaire | Contenu |
| --- | --- | --- |
| `packages/engine/src/types/` | Architecture | Types communs du moteur : monde, entreprise, produit, décision |
| `packages/engine/src/` (compta, atelier, salariés, prêt, impôts, `simulateMonth`, plan d'étage) | Architecture | Le cœur du moteur |
| `packages/engine/src/marche/` (à créer) | Marché | Segments, frange, modèle d'attraction, marque, canaux, PNJ |
| `packages/content/parametres-v1.json` | Architecture, avec règles ci-dessous | Tous les chiffres du moteur |
| `packages/content/marche/` (à créer) | Marché | Produits, segments, sources de données réelles |
| `packages/content/batiments/` (à créer) | Design 3D | Catalogues de bâtiments, modules, équipements (3D-1) |
| `tools/sim/` | Marché | Banc d'essai et équilibrage |
| `supabase/` | Architecture | Migrations, règles d'accès, données de test |
| `apps/web/` fonctions serveur et pages d'administration | Architecture | Décisions, clôture, admin |
| `apps/web/` scène 3D (à terme `packages/scene3d/`) | Design 3D | Atelier isométrique, aménagement, salariés visibles |
| `apps/web/public/models/` et `assets/LICENCES.md` | Design 3D | Modèles GLB et leurs licences |
| `apps/web/` écrans, styles, composants d'interface | Design 3D | Tableaux de bord, « Mon Empire », profil public |
| `CLAUDE.md`, `package.json`, `package-lock.json`, `.github/` | Architecture | Les règles du projet et les outils |
| `docs/` | Tous | Chacun écrit dans le document de son rôle |

### Le fichier CODEOWNERS

Il se place dans `.github/CODEOWNERS`. Remplacez les pseudos par les vrais comptes GitHub. Quand plusieurs lignes correspondent à un fichier, c'est la dernière qui compte : les règles générales vont donc en haut, les exceptions en bas.

```
# Par défaut : l'architecture relit tout
*                                   @pseudo-archi

# Marché
/packages/engine/src/marche/        @pseudo-marche
/packages/content/marche/           @pseudo-marche
/tools/sim/                         @pseudo-marche

# Design 3D
/apps/web/                          @pseudo-design
/apps/web/public/models/            @pseudo-design
/packages/content/batiments/        @pseudo-design
/assets/                            @pseudo-design

# Fichiers partagés : deux relecteurs
/packages/engine/src/types/         @pseudo-archi @pseudo-marche
/packages/content/parametres-v1.json @pseudo-archi @pseudo-marche
/apps/web/app/api/                  @pseudo-archi
/supabase/                          @pseudo-archi
/package.json                       @pseudo-archi
/package-lock.json                  @pseudo-archi
/CLAUDE.md                          @pseudo-archi
/.github/                           @pseudo-archi
```

CODEOWNERS ne bloque une fusion que si la protection de `main` exige la relecture des propriétaires (section 1). Le chemin `apps/web/app/api/` est une hypothèse sur l'emplacement des fonctions serveur.

### Les règles des fichiers partagés

| Fichier | Pourquoi il est sensible | La règle |
| --- | --- | --- |
| Types du moteur | Tout le monde s'en sert ; un changement casse le code des autres | Un changement de type = une petite PR à part, fusionnée le jour même. Les autres ramènent `main` dans leur branche juste après. On ajoute un champ plutôt que d'en renommer un |
| `parametres-v1.json` | Un seul fichier pour tous les chiffres | On ajoute ses paramètres dans le bloc de son domaine, sans reformater le reste du fichier. Chaque nouveau paramètre a valeur, unité, source et date. Option proposée plus bas : le découper |
| Migrations | Appliquées pour de bon en recette et en production | Seul le propriétaire en crée (section 2) |
| `package.json` et `package-lock.json` | Chaque ajout de bibliothèque modifie le fichier verrou | Pas de nouvelle bibliothèque sans accord dans l'issue. En cas de conflit sur `package-lock.json`, ne pas le fusionner à la main : reprendre la version de `main`, puis relancer `npm install` |
| `CLAUDE.md` | Le Claude Code de chacun le lit à chaque session | Changement par PR, annoncé aux deux autres |

**Option proposée : découper les paramètres.** Remplacer `parametres-v1.json` par un dossier `packages/content/parametres/` avec un fichier par domaine (`marche.json`, `atelier.json`, `salaries.json`, `finance.json`, `batiments.json`), réunis par le moteur au chargement. Chacun aurait alors son propre fichier et les conflits sur ce point disparaîtraient. Il faudrait adapter le contrôle de format du ticket T02 : c'est une tâche d'une demi-journée pour le responsable architecture.

### Trois réflexes en plus

- **Avant de valider un commit, regardez la liste des fichiers.** Un fichier hors de votre zone doit avoir une raison, écrite dans la PR.
- **Dites à Claude Code où il a le droit d'écrire.** Par exemple : « Pour ce ticket, ne modifie que `apps/web/` et `packages/content/batiments/`. Si tu as besoin d'autre chose, demande-moi. » On peut ajouter cette règle dans `CLAUDE.md`.
- **Pas de « grand ménage »** (renommer, reformater, déplacer des fichiers) dans une PR de fonctionnalité. Un ménage, c'est une PR à part, annoncée, fusionnée vite.

## 4. Les missions des trois rôles

L'architecture tient le moteur et la base, le marché tient l'économie et ses chiffres, le design tient tout ce que le joueur voit. Chacun relit les PR des deux autres quand elles touchent sa zone.

### Architecture du jeu (moteur et systèmes entrepreneur)

Garant que le jeu calcule juste : chaque euro est écrit en partie double, et rien ne se décide hors du moteur.

- **Le moteur** : types communs, comptabilité, atelier, façonniers, salariés, prêt, impôts, `simulateMonth`. Toute règle a son test.
- **Les systèmes entrepreneur** : formes juridiques, création de société, bâtiments (louer ou acheter), et plus tard holdings et filiales.
- **La base Supabase** : seul auteur des migrations, des règles d'accès (RLS) et des données de test ; mise en production de la base.
- **Les fonctions serveur** : vérification des décisions des joueurs, clôture quotidienne, administration.
- **Les règles du projet** : `CLAUDE.md`, protection de `main`, intégration continue, `package.json`. Arbitre en cas de désaccord technique.
- **Première tâche** : ranger le dépôt selon la section 3, poser CODEOWNERS et protéger `main`.

### Marché

Garant que l'économie du jeu est réaliste, stable et sourcée.

- **La demande et la concurrence** : segments, frange concurrentielle, modèle d'attraction, marque (notoriété et désirabilité), canaux de vente, PNJ.
- **Les chiffres** : chaque paramètre de prix, de coût ou de taux a une valeur, une unité, une source et une date. Le marché tient le référentiel des coûts (l'onglet « Coûts et temps de fabrication », à retrouver).
- **Les données réelles** : €STR, inflation, SMIC, coût du coton, électricité. Choix des sources, contrôle des valeurs aberrantes, licences.
- **L'équilibrage** : banc d'essai sur 120 mois et plus, réglage des coefficients, garde-fous contre l'inflation et les faillites en chaîne.
- **Le contenu économique** : missions, fiches pédagogiques sur le marché, matière de la revue de presse.
- **Ce qu'il ne fait pas** : modifier les types communs ou la base sans passer par l'architecture.

### Design 3D

Garant que le joueur comprend ce qu'il voit et prend plaisir à jouer.

- **La scène 3D** : atelier isométrique en style maquette, étages, caméra, fluidité sur un portable récent.
- **L'aménagement** : poser, déplacer, pivoter, supprimer un module, avec l'aperçu du coût calculé par le moteur.
- **Les modèles** : choix et retouche dans Blender, export GLB compressé, licence inscrite dans `assets/LICENCES.md`.
- **Les catalogues de bâtiments et de modules** : dimensions, apparence, modèle associé. Les prix et effets économiques sont validés par le marché et l'architecture.
- **L'interface** : tableaux de bord, écrans de décision, « Mon Empire », profil public, bulles d'aide.
- **Ce qu'il ne fait pas** : calculer un chiffre dans l'interface. La 3D affiche ce que le moteur a calculé et envoie des demandes au serveur.

### Répartition proposée des tickets 3D

| Ticket | Pilote | En appui |
| --- | --- | --- |
| 3D-1 Catalogues de bâtiments, modules, équipements | Design | Marché (prix), architecture (effets) |
| 3D-2 Validation d'un plan d'étage | Architecture | Design (règles de la grille) |
| 3D-3 Effet de l'aménagement sur capacité et coûts | Architecture | Marché (coûts) |
| 3D-4 Scène Three.js de l'atelier | Design | |
| 3D-5 Mode aménagement | Design | Architecture (enregistrement serveur) |
| 3D-6 Salariés visibles | Design | |
| 3D-7 Deuxième local, location ou achat | Architecture | Marché (loyers et prix immobiliers) |
| 3D-8 « Mon Empire » et profil public | Design | Architecture (ce qui est public ou privé) |
| 3D-9 Garde-fou monétaire | Marché | Architecture |

Ordre conseillé : 3D-1, 3D-2 et 3D-4 en parallèle (une personne chacun, dossiers différents), puis 3D-3 et 3D-5. Le marché pilote 3D-9 parce qu'il tient le banc d'essai, mais il a peu de tickets 3D : il peut avancer en parallèle sur le réglage du marché et le référentiel des coûts.

## 5. Questions ouvertes

- [ ] Qui tient quel rôle, et quels sont vos trois pseudos GitHub (pour CODEOWNERS) ?
- [ ] Le dépôt est-il privé, dans une organisation GitHub, et avec quel plan ? Cela décide si la protection de `main` bloque vraiment.
- [ ] Docker peut-il tourner sur les trois ordinateurs ? Sinon, on part sur le plan B Supabase (projet dev partagé).
- [ ] Combien de projets Supabase existent déjà, et lequel sert de production ?
- [ ] Découpe-t-on `parametres-v1.json` en un fichier par domaine ?
- [ ] Où se trouve l'onglet « Coûts et temps de fabrication » (référentiel des coûts) ?
- [ ] Vercel : l'offre gratuite est réservée à un seul utilisateur non commercial. À trois, il faudra sans doute l'offre Pro (environ 20 dollars par membre et par mois).
