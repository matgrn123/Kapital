# Bâtiments, 3D et groupe

Cet onglet intègre le cahier des charges « Jeu de simulation d'empire entrepreneurial en 3D multijoueur » rédigé avec ChatGPT (novembre 2026). Il apporte deux choses que Kapital n'avait pas encore : une **dimension 3D** (bâtiments, aménagement, salariés visibles) et une **spécification détaillée du groupe** (holdings, filiales, consolidation, LBO). Les points contradictoires sont tranchés ci-dessous ; l'architecture et les décisions déjà prises restent la base.

## 1. Les arbitrages

| Point du cahier ChatGPT | Décision pour Kapital | Raison |
| --- | --- | --- |
| Jeu 50 % 3D, 50 % gestion | **Adopté, avec une règle : toute la 3D a un effet économique.** La 3D est la forme visible de l'entreprise, pas un jeu de décoration à part | Kapital est d'abord pédagogique ; la 3D rend concrètes la capacité, les coûts fixes et l'investissement |
| Pas de ville partagée, monde organisé par joueur | **Adopté.** Le monde partagé est économique (marchés, contrats, rachats), pas géographique | Compatible avec notre monde persistant ; évite des mois de développement inutiles |
| React + Vite, back-end Node séparé | **On garde Next.js et Supabase** ; la 3D (Three.js avec React Three Fiber) est intégrée dans Next.js. Un service de calcul séparé (« worker ») est ajouté seulement si la clôture quotidienne dépasse les limites des fonctions serveur | Next.js fait déjà le travail de Vite et offre le serveur ; changer de stack retarderait tout sans gain |
| Babylon.js pour la 3D | **Adopté** sous une autre forme : Three.js avec React Three Fiber (licence MIT), déjà utilisé par le prototype 3D du dépôt, plutôt que Babylon.js | S'intègre naturellement à React et Next.js, écosystème le plus large, chargement glTF ; le prototype fonctionne déjà, Babylon.js n'apporterait rien qui justifie de le réécrire (décision du 22 novembre 2026) |
| Style semi-réaliste, plus réaliste que Les Sims | **Adopté comme cible, atteint en deux temps** : V1 en style « maquette d'architecte » (volumes propres, matériaux simples), semi-réaliste ensuite | Le semi-réaliste demande un artiste 3D ; la maquette est faisable tout de suite et reste élégante |
| Secteurs : commerce, industrie, logistique, services, technologie, immobilier | **Adopté comme catalogue des paliers suivants.** La V1 reste le textile | Cohérent avec notre décision : un secteur au palier 0, quatre au palier 1 |
| Formes juridiques « inspirées » sans droit réel | **On garde le droit français simplifié** : SAS, SARL, SA, holding (souvent une SAS), société civile immobilière | Kapital forme des étudiants en droit ; le réalisme juridique est un argument |
| Holdings, filiales, consolidation, LBO, procédures collectives | **Adoptés, avec leur spécification détaillée (sections 6 à 8)**, au palier « groupe » (étape 5 du module Entrepreneur) ; le schéma de données les prévoit dès la V1 | C'est le cœur du parcours, et le lien avec les rôles de gérant de fonds et d'avocat |
| MVP centré sur un entrepôt 3D | **Remplacé par un atelier textile en 3D**, relié au moteur de la V1 ; un deuxième local s'achète ou se loue en V1 | Même idée, mais branchée sur le module déjà spécifié |
| Pas de fin au jeu | **Confirmé** : pas de remise à zéro des fortunes | Déjà décidé |
| Ce que le cahier ChatGPT n'a pas | **Conservé de notre côté** : trois métiers (entrepreneur, gérant de fonds, avocat), PNJ, indexation sur le réel, rythme B, missions pédagogiques | Ce sont les traits qui distinguent Kapital |

## 2. Le monde, « Mon Empire » et les profils

- **Pas de carte.** Le joueur voit ses bâtiments dans un écran **« Mon Empire »** : une collection de miniatures 3D juxtaposées (atelier, entrepôt, bureaux, siège…), filtrables par catégorie, société propriétaire, valeur, activité et rentabilité. Un clic ouvre la fiche et la vue 3D du bâtiment.
- **Deux portefeuilles distincts.** Le portefeuille de bâtiments et le portefeuille de sociétés ne se confondent pas : un bâtiment appartient à une société (souvent une société immobilière du groupe) et peut être exploité par une autre, qui lui paie un loyer.
- **Profil public.** Chaque joueur a un profil : nom, groupe, sociétés, bâtiments, grandes opérations, historique. Les autres peuvent le consulter et visiter ses bâtiments.
- **Confidentialité réaliste.** Ce qui est public suit la logique réelle : l'identité des sociétés, leurs bâtiments vus de l'extérieur et leurs comptes annuels (comme au greffe) sont visibles ; les décisions en cours, la trésorerie du jour et les intérieurs privés ne le sont pas. Le joueur peut rendre public davantage, jamais moins que le minimum légal du jeu. Ce que ça change : un gérant de fonds analyse une cible avec les mêmes informations qu'un vrai investisseur.

## 3. Les bâtiments

### 3.1 Catalogue, relié aux étapes de développement

| Catégorie | Bâtiments | Débloqué à |
| --- | --- | --- |
| Ateliers et industrie | Petit atelier, atelier spécialisé, bâtiment industriel, site de production | Étapes 1 à 4 |
| Entrepôts | Petit entrepôt, entrepôt moyen, centre logistique | Étapes 2 à 4 |
| Commerces | Boutique, grand magasin (corner), boutique amiral | Étapes 3 à 4 |
| Bureaux | Petit local, immeuble de bureaux, grand immeuble, tour de bureaux | Étapes 2 à 5 |
| Prestige | Siège social, immeuble de direction, tour de grande hauteur | Étapes 4 à 5 |

Chaque bâtiment a : un modèle extérieur, une surface, un nombre d'étages, une capacité d'accueil, des zones aménageables, un prix d'achat, un loyer de marché, des charges d'entretien, et un **emplacement fictif** (Paris, banlieue, province) qui fait varier le prix et l'attractivité d'une boutique. Le catalogue est un fichier de contenu, enrichi sans toucher au code. Les prix sont indexés sur les loyers réels du référentiel des coûts.

### 3.2 Louer, acheter ou financer

C'est une décision économique majeure, et une leçon :

| Mode | Effet sur la trésorerie | Effet sur le bilan | Leçon |
| --- | --- | --- | --- |
| Bail | Loyer mensuel, dépôt de garantie | Pas d'actif immobilier | Souplesse, pas d'immobilisation de capital |
| Achat comptant | Grosse sortie immédiate | Immobilisation amortie | Patrimoine, mais trésorerie bloquée |
| Achat à crédit | Apport + mensualités | Actif + dette | Effet de levier |
| Crédit-bail immobilier (palier suivant) | Redevances, option d'achat en fin de contrat | Selon les normes comptables | Financement spécialisé, lien avec le rôle d'avocat |
| Société immobilière du groupe (palier groupe) | Loyers intragroupe | Actif dans la société immobilière | Dissocier l'immobilier de l'exploitation |

### 3.3 Travaux et délais

Aménager coûte de l'argent et du temps : des travaux prennent un mois de jeu (un jour réel) et l'espace concerné ne produit pas pendant ce temps. Le joueur peut préparer son plan à tout moment ; il s'applique à la clôture suivante.

## 4. L'aménagement intérieur : liberté encadrée

- **La structure est fixe.** Façades, murs porteurs, forme et nombre d'étages ne bougent pas (sauf extension prévue par le modèle). Pas d'éditeur libre de murs.
- **On place des modules sur une grille.** Chaque étage est découpé en cases (par exemple 1 m × 1 m). Le joueur pose, déplace, fait pivoter, remplace ou supprime des modules et des équipements dans les zones autorisées.
- **Contrôles automatiques** : surface disponible, collisions, accès et passages (un poste doit être atteignable depuis l'entrée), capacités maximales, compatibilité équipement-pièce.
- **Une seule règle de validation, exécutée deux fois.** La fonction qui vérifie un plan vit dans le moteur (`packages/engine`) : le navigateur l'utilise pour l'aperçu, le serveur la réexécute avant d'enregistrer. Ce que ça change : un joueur ne peut pas tricher en modifiant son navigateur pour gagner des postes de travail.

### 4.1 Modules et effet économique (textile)

| Module ou équipement | Effet dans le moteur | Coût |
| --- | --- | --- |
| Poste de couture (piqueuse plate) | 1 artisan peut y produire ; sans poste, un artisan ne produit pas | Prix des machines du référentiel, amorti |
| Surjeteuse, machine spécialisée | Permet certains produits, réduit leur temps de fabrication | Idem |
| Table de coupe | Plafond de matière coupée par mois ; réduit le taux de chute | Idem |
| Zone de stockage | Capacité de stock de matières et de produits finis | Surface |
| Bureau, open space | Postes pour les fonctions support (marketing, achats, finance) | Mobilier |
| Salle de réunion | Condition pour certaines négociations (fournisseurs, revendeurs, banque) | Mobilier |
| Showroom, accueil | Améliore la conversion des revendeurs qui visitent | Mobilier, finitions |
| Salle de pause | Bonus de motivation plafonné | Mobilier |

**Garde-fou contre la décoration rentable.** Les objets purement décoratifs n'ont pas d'effet productif. Le confort (salle de pause, qualité du mobilier) donne un bonus de motivation plafonné à 5 % : il compte, mais ne remplace jamais une machine ou un salarié.

**Effet sur les formules.** La capacité de l'atelier devient : minimum(nombre d'artisans, nombre de postes équipés) × 151,67 h × 60 × rendement. Le joueur qui embauche sans acheter de machines, ou l'inverse, voit immédiatement la capacité perdue.

## 5. Les salariés visibles

- Chaque salarié recruté apparaît à son poste. Sa fiche (fonction, salaire, compétence, expérience, productivité) s'ouvre d'un clic.
- Le recrutement est limité par les postes disponibles : pas de place, pas d'embauche.
- **V1** : personnages posés à leur poste avec une animation de travail légère. **Ensuite** : déplacements, réunions, pauses.
- Les mouvements des personnages ne sont jamais synchronisés entre joueurs : ils sont recalculés sur chaque écran, seules les données économiques viennent du serveur.

## 6. Direction artistique et caméra

- **Caméra isométrique** : zoom, déplacement, rotation par quarts de tour, sélection d'un étage, masquage des étages supérieurs, murs et plafonds transparents, vue extérieure et intérieure. Pas de caméra libre à 360 degrés.
- **V1, style « maquette d'architecte »** : volumes nets, palette sobre (béton, bois clair, verre), lumière douce, ombres simples. C'est rapide à produire et cohérent avec l'identité d'un jeu de gestion sérieux.
- **Ensuite, semi-réaliste** : matériaux détaillés, éclairage naturel, personnages aux proportions humaines légèrement stylisées. Il faudra un artiste 3D, à budgéter.
- **Ressources** : modèles au format glTF/GLB, créés sous Blender ou issus de bibliothèques libres de droits (licence CC0, à vérifier modèle par modèle et à inscrire dans un registre des licences). Modèles modulaires réutilisables (un même mur, une même fenêtre pour plusieurs bâtiments), jamais de bâtiment codé à la main.
- **Budget de performance** : fluide (60 images par seconde visées) sur un ordinateur portable récent ; objets répétés instanciés, textures compressées, niveaux de détail, chargement à la demande.

## 7. Le groupe : sociétés, holdings, filiales

### 7.1 Créer une société

Le joueur choisit un nom, une forme (SAS, SARL, SA, société civile immobilière), un secteur, un capital et des associés. La forme a des effets simples et réels : capital minimum, organes de direction, règles de décision des associés, transmission des titres.

### 7.2 Holding et filiales

- Une **holding** détient des **participations** (par exemple 100 % de A, 80 % de B, 60 % de C). Elle reçoit des dividendes, finance des acquisitions, centralise des fonctions.
- Chaque **filiale** garde sa trésorerie, ses comptes, ses salariés, ses bâtiments et ses dettes. Le contrôle dépend du pourcentage détenu : au-delà de 50 %, la société mère décide ; en dessous, elle négocie avec les autres associés (joueurs ou PNJ).
- **Flux intragroupe** : dividendes, prêts, prestations, apports en capital, cessions d'actifs, transferts de titres. Chacun passe en comptabilité dans les deux sociétés.

### 7.3 Vue consolidée

Chiffre d'affaires, EBITDA (résultat avant intérêts, impôts et amortissements), résultat, dette nette, trésorerie, valeur des participations et valeur estimée du groupe, **sans double comptage** des flux intragroupe. Ce que ça change : le joueur voit qu'un groupe peut paraître riche filiale par filiale et l'être beaucoup moins une fois les flux internes éliminés.

## 8. Opérations financières

### 8.1 Acquisition

Évaluation de la cible (multiple d'EBITDA, valeur patrimoniale, actualisation simplifiée des flux), offre, contre-offre, financement, transfert des titres, intégration au groupe. Entre joueurs, la négociation suit des étapes sécurisées par le serveur ; un avocat joueur peut être mandaté pour la documentation.

### 8.2 LBO

Le joueur crée une holding de reprise, y apporte des fonds propres, l'endette, rachète la cible ; les dividendes de la cible remboursent la dette. Exemple : prix 10 M€, financé par 3 M€ de fonds propres et 7 M€ de dette. Le jeu fait sentir l'effet de levier et son revers : si la cible ralentit, la holding ne peut plus payer ses échéances. Le LBO est aussi l'opération type du **gérant de fonds** : les mêmes règles servent aux deux métiers.

### 8.3 Autres opérations, ajoutées par paliers

Augmentation et réduction de capital, émission de dette, refinancement, cession d'actifs ou de participations, fusion, scission, introduction en bourse, rachat d'actions.

### 8.4 Garde-fous

- Aucune opération ne crée de valeur sans contrepartie : la somme des trésoreries du monde ne bouge que par l'activité réelle, les banques PNJ et les données indexées. Un test automatique le vérifie après chaque clôture.
- Les cessions intragroupe sont valorisées à un prix de marché encadré, pour empêcher de gonfler artificiellement une filiale avant de la vendre.

## 9. Difficultés et procédures collectives

Une entreprise peut être rentable et manquer de trésorerie : c'est le cœur du jeu. Quand elle s'enfonce, le joueur passe par les mécanismes français, simplifiés :

| Situation | Mécanisme dans le jeu |
| --- | --- |
| Difficultés naissantes | Mandat ad hoc ou conciliation : négociation confidentielle avec les créanciers |
| Difficultés sérieuses, pas encore de cessation des paiements | Sauvegarde : gel des dettes, plan d'apurement |
| Cessation des paiements | Redressement judiciaire : plan de continuation ou cession |
| Redressement impossible | Liquidation : vente des actifs, le joueur repart avec le capital de départ |

Ces procédures sont l'activité naturelle du **joueur avocat** (restructuring) et l'occasion pour les fonds de racheter des actifs en difficulté. Leurs règles seront vérifiées sur Légifrance au moment de les coder.

## 10. Multijoueur

- Les joueurs se rencontrent par l'économie : marchés communs, contrats (fourniture, prestation, distribution), prises de participation, coentreprises, offres de rachat.
- Le serveur est la seule source de vérité pour les soldes, dettes, contrats, participations et opérations. Chaque opération est vérifiée, horodatée et enregistrée.
- Visiter le bâtiment d'un autre joueur montre son extérieur et ses espaces publics (showroom, accueil), jamais ses chiffres privés.

## 11. Architecture technique retenue

| Couche | Choix |
| --- | --- |
| Interface | Next.js (React, TypeScript) |
| 3D | Three.js avec React Three Fiber, chargé uniquement dans le navigateur, à terme isolé dans `packages/scene3d` |
| Modèles 3D | glTF/GLB, Blender, registre des licences dans `assets/LICENCES.md` |
| Moteur économique | `packages/engine`, fonction pure, testée sans la 3D ni la base |
| Catalogues (bâtiments, modules, équipements, paramètres) | `packages/content`, fichiers de données |
| Serveur et données | Supabase (Postgres, Auth, RLS, cron) et fonctions serveur Next.js |
| Calcul de clôture | Fonction serveur ; service de calcul dédié si la charge l'exige |

La 3D ne décide jamais d'un chiffre : elle affiche l'état calculé par le moteur et envoie des demandes au serveur.

**Nouvelles tables prévues** : `building_types`, `buildings` (propriétaire, exploitant, mode de détention), `floors`, `layouts` (plan de chaque étage sur la grille), `module_types`, `placed_modules`, `equipment_types`, `shareholdings` (qui détient quel pourcentage de quelle société), `contracts`, `acquisitions`, `financial_statements` (comptes arrêtés par période). `shareholdings` existe dès la V1, même sans holding jouable, pour ne pas devoir refaire la base plus tard.

**Documents dans le dépôt** : le cahier ChatGPT demandait six fichiers (CLAUDE.md, conception du jeu, architecture, schéma de base, feuille de route, système économique). Ils seront générés à partir de ce doc, qui reste la source : `docs/game-design.md`, `docs/architecture.md`, `docs/schema-base.md`, `docs/roadmap.md`, `docs/economie.md`.

## 12. Feuille de route fusionnée

| Palier | Contenu |
| --- | --- |
| V1 | Module Entrepreneur textile (étapes 0 à 2), moteur, monde partagé, PNJ, missions ; **atelier en 3D aménageable, « Mon Empire », deuxième local** |
| V2 | Étapes 3 et 4 : boutiques, entrepôts, bureaux, international, montée en gamme ; style semi-réaliste ; personnages animés |
| V3 | Groupe : holding, filiales, consolidation, société immobilière, acquisitions entre joueurs, LBO ; métier de gérant de fonds |
| V4 | Difficultés et procédures collectives ; métier d'avocat ; contrats entre joueurs |
| Ensuite | Nouveaux secteurs (commerce, logistique, services, technologie, immobilier), introduction en bourse, événements |

## 13. Risques

- **Le coût de la 3D.** Modèles et animations demandent beaucoup de travail ; parade : style maquette en V1, bibliothèques libres, 3D développée après le moteur.
- **La 3D qui prend le pas sur l'économie.** Parade : règle de la section 1, toute la 3D a un effet économique, et le moteur est fini et testé avant la 3D.
- **La triche par le navigateur.** Parade : validation des plans et des opérations côté serveur.
- **Les performances sur des ordinateurs modestes.** Parade : budget de performance, mode « 3D simplifiée ».
- **Les licences des modèles.** Parade : registre des licences, uniquement des sources vérifiées.
