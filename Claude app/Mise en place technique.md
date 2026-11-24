# Mise en place technique : du premier fichier à la mise en ligne

Kapital est un site web : il se développe dans VS Code avec Claude Code, se partage sur GitHub, stocke ses données dans Supabase et se publie sur Vercel. Aucune plateforme spéciale n'est nécessaire pour le tester : le jeu tourne sur l'ordinateur de chaque développeur, puis sur une adresse de test créée automatiquement à chaque modification.

## Les outils et leur rôle

| Outil | Rôle | Pourquoi celui-là |
| --- | --- | --- |
| VS Code | L'éditeur où l'on voit et modifie les fichiers | Gratuit, standard, Claude Code s'y intègre |
| Claude Code | L'assistant qui écrit et corrige le code | Lit tout le projet et exécute les tests lui-même |
| GitHub | Le coffre commun du code et son historique | Indispensable à plusieurs : chacun travaille sans écraser les autres |
| Supabase | La base de données commune, les comptes joueurs, le temps réel | Une base PostgreSQL gérée, avec authentification et planification intégrées |
| Vercel | L'hébergement du site | Chaque modification proposée reçoit sa propre adresse de test |

## Claude Code : extension VS Code ou terminal

C'est le même moteur dans les deux cas. La différence est l'interface.

- **L'extension VS Code** montre les modifications visuellement, fichier par fichier, avant de les accepter. C'est le meilleur point de départ.
- **Le terminal** est la version la plus complète : quelques commandes et l'automatisation n'existent que là.
- **Les deux se combinent.** VS Code contient un terminal intégré : on y lance la commande `claude` quand une fonction manque dans l'extension. Cela demande d'installer aussi la version terminal.

Recommandation : tout le monde installe VS Code, l'extension et la version terminal. On travaille dans l'extension, et on passe au terminal intégré au besoin.

## L'organisation du projet

Un seul dépôt GitHub contient tout, rangé par rôle.

| Dossier | Contenu | Qui y travaille surtout |
| --- | --- | --- |
| `packages/engine` | Le moteur de simulation : bilans, marché, opérations, résolution d'un tour. Aucun lien avec le site ni la base | Développement |
| `packages/content` | Les données du jeu en fichiers : secteurs, clauses, événements, fiches pédagogiques | Contenu juridique et financier, sans coder |
| `apps/web` | Le site : écrans, tableaux de bord, négociations | Développement, design |
| `supabase/migrations` | La structure de la base, versionnée | Développement |
| `tools/sim` | Le banc d'essai : fait tourner des années de jeu avec des automates, sans interface | Équilibrage |
| `docs` | Le cahier des charges et les décisions | Tous |
| `CLAUDE.md` | Les règles du projet que Claude Code lit à chaque session | Tous |

Le fichier `CLAUDE.md` est la pièce maîtresse du travail à plusieurs. Il est partagé par GitHub, donc le Claude Code de chaque membre suit les mêmes conventions : architecture, commandes de test, règles à ne jamais enfreindre (par exemple « le site ne calcule jamais un résultat, seul le moteur le fait »).

## Les choix techniques

| Brique | Choix | Raison |
| --- | --- | --- |
| Langage | TypeScript partout | Un seul langage pour le moteur, le site et les outils |
| Site | Next.js | Le cadre le mieux intégré à Vercel |
| Base de données | PostgreSQL chez Supabase | Données relationnelles et transactions, adaptées à une comptabilité |
| Comptes joueurs | Authentification Supabase | Fournie, rien à construire |
| Droits d'accès | Règles de sécurité par ligne de Supabase | Un joueur ne lit que ses propres comptes |
| Mises à jour en direct | Temps réel Supabase | Une offre reçue s'affiche sans recharger la page |
| Résolution des tours | Tâche planifiée qui appelle le moteur à heure fixe | La vitesse du temps reste un simple réglage |
| Tests | Vitest pour le moteur, Playwright pour le site | Standards de l'écosystème |

## Les quatre environnements

Un environnement est une copie complète du jeu, avec sa propre base. On en utilise quatre, du plus privé au plus public.

| Environnement | Où | À quoi il sert | Données |
| --- | --- | --- | --- |
| Local | L'ordinateur de chacun | Développer et voir le résultat immédiatement | Monde de test jetable |
| Aperçu | Adresse créée par Vercel pour chaque modification proposée | Faire relire et tester une modification avant de l'accepter | Monde de test jetable |
| Recette | Adresse fixe, réservée à l'équipe et aux testeurs | Jouer de vraies parties entre vous pour équilibrer | Monde persistant, réinitialisable |
| Production | L'adresse publique du jeu | Les joueurs | Le monde réel du jeu, sauvegardé |

C'est la réponse à la question « comment simuler le jeu pendant que je le crée ». Il y a deux façons, complémentaires.

- **Voir le jeu.** En local, une commande lance le site sur l'ordinateur. Chaque fichier modifié se reflète aussitôt dans le navigateur.
- **Éprouver l'économie.** Le banc d'essai fait tourner le moteur seul, sans site : trente ans de jeu en quelques secondes, avec des automates à la place des joueurs. Il sort des indicateurs (inflation, faillites, concentration des richesses). C'est lui qui dit si une règle casse le jeu.

## Le processus de travail à plusieurs

1. Une tâche est décrite dans une fiche GitHub (*issue*) : ce qu'on veut, et comment on saura que c'est fait.
2. Celui qui la prend crée une branche, c'est-à-dire une copie de travail du code.
3. Il développe avec Claude Code, qui écrit le code et les tests, puis lance les tests.
4. Il ouvre une demande de fusion (*pull request*). Les tests automatiques se lancent et Vercel crée l'adresse d'aperçu.
5. Un autre membre relit et essaie l'aperçu. La commande `/code-review` de Claude Code fournit une première relecture.
6. Une fois approuvée, la modification rejoint la branche principale et se déploie automatiquement en recette.
7. La mise en production se fait par une action volontaire, quand la recette est satisfaisante.

Trois règles à poser dès le premier jour.

- **Personne n'écrit directement sur la branche principale.** Tout passe par une demande de fusion relue.
- **Les secrets ne vont jamais dans GitHub.** Mots de passe et clés vivent dans les réglages de Vercel et de Supabase.
- **Toute règle du moteur a un test.** Sans test, une correction ailleurs la cassera sans que personne le voie.

## Les tests

| Niveau | Ce qu'on vérifie | Quand |
| --- | --- | --- |
| Tests du moteur | Chaque règle : un covenant franchi déclenche bien un défaut, un bilan reste équilibré | À chaque modification, automatiquement |
| Banc d'essai | L'économie reste stable sur des décennies simulées | À chaque changement de règle ou de paramètre |
| Tests du site | Les parcours clés : créer une société, lever des fonds, signer un pacte | Avant chaque mise en recette |
| Relecture | Une personne et Claude Code relisent le code | À chaque demande de fusion |
| Parties d'essai | Le jeu est-il compréhensible et amusant | En recette, chaque semaine |
| Sauvegarde | La base de production peut être restaurée | Vérifié avant l'ouverture, puis régulièrement |

## Le déploiement

Publier est simple une fois les comptes reliés : Vercel surveille GitHub et met en ligne tout seul. Le point délicat n'est pas le site mais la base de données, parce que le monde est permanent.

- **La structure de la base évolue par migrations.** Chaque changement est un fichier versionné, appliqué dans l'ordre, d'abord en recette.
- **Une mise à jour ne doit jamais détruire une partie en cours.** C'est la contrepartie de l'absence de remise à zéro.
- **Le moteur est versionné.** Un changement de règle s'applique à partir d'un tour donné, annoncé aux joueurs.

## Comptes, rôles et sécurité

Les grands jeux en temps réel construisent leur propre infrastructure. Kapital ressemble davantage à une application de gestion : des comptes, des contrats et un calcul à heure fixe. Supabase couvre ce besoin, et sa base PostgreSQL standard peut être déplacée ailleurs plus tard.

| Besoin | Comment | Ce que ça garantit |
| --- | --- | --- |
| Inscription, connexion, mot de passe oublié | Authentification Supabase, connexion Google possible | Les mots de passe ne sont jamais stockés par l'équipe |
| Chaque joueur ne voit que ses données | Règles d'accès écrites dans la base, appliquées à chaque lecture | Même un joueur qui modifie son navigateur ne lit pas les comptes d'un autre |
| Joueur, modérateur, administrateur | Un rôle porté par chaque compte, pris en compte par les règles d'accès | Chacun n'accède qu'à ce que son rôle autorise |
| Interface d'administration | Partie séparée du site, vérifiée côté serveur | Suspendre un tricheur, déclencher un événement, suivre l'économie |

Trois règles de sécurité propres à Kapital.

- **Les joueurs n'écrivent jamais directement dans la base.** Ils envoient des décisions, que le serveur vérifie puis applique. Sinon un joueur pourrait s'écrire un million sur son compte.
- **La clé maîtresse de Supabase ne quitte jamais le serveur.** Elle contourne toutes les règles d'accès.
- **Les administrateurs ont une double authentification et chacune de leurs actions est journalisée.** Dans un monde permanent, une erreur d'administration peut ruiner des joueurs : il faut pouvoir retracer qui a fait quoi.

## Comment les changements arrivent dans le jeu

Il existe trois sortes de changements. Aucune ne ressemble à une mise à jour à télécharger, et seule la troisième modifie l'interface.

| Type | Exemple | Qui le déclenche | Quand il prend effet | Ce que voit le joueur |
| --- | --- | --- | --- | --- |
| Données réelles | Hausse des taux de la BCE, cours du pétrole, séisme | Automatique | Au prochain calcul de tour | Les chiffres changent, un article explique pourquoi ; l'interface ne bouge pas |
| Réglages d'administration | Corriger un paramètre d'équilibre, lancer un événement | Un administrateur | Au prochain calcul de tour | Seulement l'effet, avec une annonce si c'est important |
| Évolutions du jeu | Nouvel écran, nouvelle règle, correction d'erreur | L'équipe, par une demande de fusion | À la mise en ligne, ou au tour annoncé pour une règle | La nouvelle version au prochain chargement de la page |

### Les données réelles : automatiques, mais contrôlées

&#91;embedded content: données réelles · du relevé à l'écran\]

Le réel entre dans le jeu comme une donnée, pas comme du code. L'interface lit simplement des valeurs : quand le taux passe de 2,4 % à 2,6 %, c'est le chiffre affiché qui change, pas l'écran.

1. **Le collecteur va chercher les données.** Supabase ne les récupère pas tout seul : une fonction planifiée interroge chaque jour les sources officielles et range les valeurs brutes dans une table, avec leur date et leur source.
2. **Le contrôle filtre.** Une valeur aberrante, ou un écart trop brusque, est mise de côté. Si une source tombe en panne, la dernière valeur valide reste en vigueur. Le jeu ne s'arrête jamais à cause d'une source externe.
3. **Les événements majeurs passent par un humain.** Pour une catastrophe ou une crise politique, le système propose un effet (par exemple une hausse du coût du coton dans une région pendant six mois). Un administrateur le valide, l'ajuste ou le refuse dans l'interface d'administration.
4. **Les paramètres du jeu sont mis à jour.** Ils sont datés : on sait toujours quelle valeur s'appliquait à quel tour.
5. **Le calcul du tour les applique.** Rien ne change en cours de journée : tous les joueurs subissent le même changement au même moment.
6. **Le joueur voit le résultat**, et la revue de presse lui explique le lien entre l'actualité et ses chiffres.

### Les évolutions du jeu : sans coupure

- **Pas de téléchargement.** Kapital est un site : Vercel met la nouvelle version en ligne en quelques minutes, sans interrompre le jeu. Un joueur connecté bascule au prochain chargement de page ; un bandeau peut l'y inviter.
- **Jamais pendant le calcul d'un tour.** Les mises en ligne sont bloquées pendant cette fenêtre.
- **Les changements de règles sont annoncés et datés.** Une nouvelle règle s'applique à partir d'un tour précis, annoncé quelques jours avant, et figure dans un journal des modifications. Un joueur ne doit jamais découvrir après coup que les règles ont changé sous ses pieds.
- **Les changements de structure de la base sont testés en recette.** Ils doivent fonctionner avec le monde en cours, sans perdre une seule donnée. C'est l'exigence la plus stricte, et la conséquence directe du monde permanent.

## Les coûts

- **Pour démarrer : rien.** Les offres gratuites de GitHub, Supabase et Vercel suffisent à un prototype.
- **Vercel devient payant dès que l'équipe partage le projet ou que le jeu est commercial.** L'offre gratuite est réservée à un usage personnel non commercial et à un seul utilisateur. L'offre Pro coûte environ 20 dollars par membre et par mois.
- **Supabase** passe à environ 25 dollars par mois quand on dépasse l'offre gratuite.
- **Claude Code** suppose un abonnement Claude par développeur.
- **L'IA en jeu** se paie à l'usage et se plafonne par joueur.

## Les dix premières actions

1. Créer une organisation GitHub et un dépôt privé `kapital`, y inviter l'équipe.
2. Installer VS Code, Node.js, Git et Claude Code (extension et terminal) sur chaque poste.
3. Mettre le cahier des charges dans `docs`.
4. Demander à Claude Code de créer la structure du dépôt et le fichier `CLAUDE.md`.
5. Faire écrire le moteur du palier 0 avec ses tests : bilans, un secteur, la frange, la levée de fonds, le prêt.
6. Faire écrire le banc d'essai et vérifier que l'économie tient sur trente ans simulés.
7. Créer le projet Supabase et la première migration.
8. Créer le site minimal et le relier à Vercel.
9. Mettre en place les tests automatiques sur chaque demande de fusion.
10. Ouvrir l'environnement de recette et jouer la première partie entre vous.

## Sources

- [Claude Code, utilisation dans VS Code](https://code.claude.com/docs/en/vs-code)
- [Claude Code, plateformes et intégrations](https://code.claude.com/docs/en/platforms)
- [Claude Code, fichiers CLAUDE.md](https://code.claude.com/docs/en/memory)
- [Claude Code, relecture de code](https://code.claude.com/docs/en/code-review)
- [Supabase, fonctionnalités](https://supabase.com/docs/features)
- [Supabase, branches de base de données](https://supabase.com/docs/guides/deployment/branching)
- [Vercel, offre Hobby](https://vercel.com/docs/plans/hobby-plan)

Les tarifs et limites des offres changent souvent : à revérifier sur les sites officiels au moment de souscrire.
