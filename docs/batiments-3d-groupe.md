# Bâtiments, 3D et groupe

Ce document intègre le cahier des charges « Jeu de simulation d'empire entrepreneurial en 3D multijoueur » rédigé avec ChatGPT (novembre 2026). Il apporte deux choses : une **dimension 3D** (bâtiments, aménagement, salariés visibles) et une **spécification détaillée du groupe** (holdings, filiales, consolidation, LBO). Les points contradictoires sont tranchés ci-dessous ; l'architecture et les décisions déjà prises restent la base. Source maîtresse : le Claude Doc Kapital, onglet « Bâtiments, 3D et groupe ».

## 1. Les arbitrages

| Point du cahier ChatGPT | Décision pour Kapital | Raison |
| --- | --- | --- |
| Jeu 50 % 3D, 50 % gestion | **Adopté, avec une règle : toute la 3D a un effet économique.** | Kapital est d'abord pédagogique ; la 3D rend concrètes la capacité, les coûts fixes et l'investissement |
| Pas de ville partagée, monde organisé par joueur | **Adopté.** Le monde partagé est économique (marchés, contrats, rachats), pas géographique | Compatible avec le monde persistant |
| React + Vite, back-end Node séparé | **On garde Next.js et Supabase** ; un service de calcul séparé seulement si la clôture dépasse les limites des fonctions serveur | Changer de stack retarderait tout sans gain |
| Babylon.js pour la 3D | **Remplacé par Three.js avec React Three Fiber** (licence MIT), déjà utilisé par le prototype du dépôt. **Mise à jour du 25 novembre 2026 : le village et l'atelier passent en SVG isométrique d'après la maquette V2 (rendu réaliste, sans rotation) ; voir CLAUDE.md, « Règles de rendu ».** | S'intègre naturellement à React et Next.js ; le prototype fonctionne déjà |
| Style semi-réaliste | **Cible atteinte en deux temps** : V1 en style « maquette d'architecte », semi-réaliste ensuite | Le semi-réaliste demande un artiste 3D |
| Secteurs : commerce, industrie, logistique, services, technologie, immobilier | **Catalogue des paliers suivants.** La V1 reste le textile | Un secteur au palier 0, quatre au palier 1 |
| Formes juridiques « inspirées » | **Droit français simplifié** : SAS, SARL, SA, holding (souvent une SAS), société civile immobilière | Réalisme juridique |
| Holdings, filiales, consolidation, LBO, procédures collectives | **Adoptés** au palier « groupe » ; le schéma de données les prévoit dès la V1 | Lien avec les rôles de gérant de fonds et d'avocat |
| MVP centré sur un entrepôt 3D | **Remplacé par un atelier textile en 3D** relié au moteur ; un deuxième local en V1 | Branché sur le module déjà spécifié |
| Pas de fin au jeu | **Confirmé** : pas de remise à zéro des fortunes | Déjà décidé |
| Absent du cahier ChatGPT | **Conservé** : trois métiers, PNJ, indexation sur le réel, rythme B, missions pédagogiques | Ce qui distingue Kapital |

## 2. Le monde, « Mon Empire » et les profils

- **Pas de carte.** Écran « Mon Empire » : miniatures 3D des bâtiments, filtrables par catégorie, société propriétaire, valeur, activité, rentabilité. Un clic ouvre la fiche et la vue 3D.
- **Deux portefeuilles distincts.** Un bâtiment appartient à une société et peut être exploité par une autre, qui lui paie un loyer.
- **Profil public** : nom, groupe, sociétés, bâtiments, grandes opérations, historique.
- **Confidentialité réaliste** : identité des sociétés, extérieurs et comptes annuels publics (comme au greffe) ; décisions en cours, trésorerie du jour et intérieurs privés non visibles. Le joueur peut publier davantage, jamais moins que le minimum du jeu.

## 3. Les bâtiments

### 3.1 Catalogue, relié aux étapes

| Catégorie | Bâtiments | Débloqué à |
| --- | --- | --- |
| Ateliers et industrie | Petit atelier, atelier spécialisé, bâtiment industriel, site de production | Étapes 1 à 4 |
| Entrepôts | Petit entrepôt, entrepôt moyen, centre logistique | Étapes 2 à 4 |
| Commerces | Boutique, corner de grand magasin, boutique amiral | Étapes 3 à 4 |
| Bureaux | Petit local, immeuble de bureaux, grand immeuble, tour de bureaux | Étapes 2 à 5 |
| Prestige | Siège social, immeuble de direction, tour de grande hauteur | Étapes 4 à 5 |

Chaque bâtiment : modèle extérieur, surface, étages, capacité, zones aménageables, prix d'achat, loyer de marché, charges d'entretien, emplacement fictif (Paris, banlieue, province). Catalogue = fichier de contenu ; prix indexés sur `docs/referentiel-couts.md`.

### 3.2 Louer, acheter ou financer

| Mode | Trésorerie | Bilan | Leçon |
| --- | --- | --- | --- |
| Bail | Loyer mensuel, dépôt de garantie | Pas d'actif immobilier | Souplesse |
| Achat comptant | Grosse sortie immédiate | Immobilisation amortie | Trésorerie bloquée |
| Achat à crédit | Apport + mensualités | Actif + dette | Effet de levier |
| Crédit-bail immobilier (palier suivant) | Redevances, option d'achat | Selon normes comptables | Financement spécialisé |
| Société immobilière du groupe (palier groupe) | Loyers intragroupe | Actif dans la société immobilière | Dissocier immobilier et exploitation |

### 3.3 Travaux et délais

Des travaux prennent un mois de jeu (un jour réel) ; l'espace concerné ne produit pas pendant ce temps. Le plan préparé s'applique à la clôture suivante.

## 4. Aménagement intérieur : liberté encadrée

- Structure fixe (façades, murs porteurs, étages). Pas d'éditeur libre de murs.
- Modules posés sur une grille (cases de 1 m × 1 m) : poser, déplacer, pivoter, remplacer, supprimer.
- Contrôles : surface, collisions, accès et passages (chaque poste atteignable depuis l'entrée), capacités, compatibilité équipement-pièce.
- **Une seule règle de validation, exécutée deux fois** : fonction pure dans `packages/engine`, utilisée par le navigateur (aperçu) et réexécutée par le serveur (enregistrement).

### 4.1 Modules et effet économique (textile)

| Module ou équipement | Effet dans le moteur | Coût |
| --- | --- | --- |
| Poste de couture (piqueuse plate) | 1 artisan peut y produire ; sans poste, pas de production | Prix machines du référentiel, amorti |
| Surjeteuse, machine spécialisée | Permet certains produits, réduit leur temps | Idem |
| Table de coupe | Plafond de matière coupée par mois ; réduit le taux de chute | Idem |
| Zone de stockage | Capacité de stock matières et produits finis | Surface |
| Bureau, open space | Postes pour fonctions support | Mobilier |
| Salle de réunion | Condition pour certaines négociations | Mobilier |
| Showroom, accueil | Meilleure conversion des revendeurs | Mobilier, finitions |
| Salle de pause | Bonus de motivation plafonné | Mobilier |

**Garde-fou** : le décoratif n'a pas d'effet productif ; le confort donne au plus 5 % de motivation.

**Formule** : capacité = minimum(nombre d'artisans, nombre de postes équipés) × 151,67 h × 60 × rendement.

## 5. Salariés visibles

- Chaque salarié recruté apparaît à son poste ; fiche au clic.
- Pas de poste libre, pas d'embauche.
- V1 : personnages posés avec animation légère. Ensuite : déplacements, réunions.
- Les mouvements ne sont jamais synchronisés entre joueurs ; seules les données économiques viennent du serveur.

## 6. Direction artistique et caméra

- Caméra isométrique : zoom, déplacement, rotation par quarts de tour, sélection d'étage, masquage des étages supérieurs, murs et plafonds transparents, vue extérieure et intérieure. Pas de caméra libre à 360 degrés.
- V1 : style « maquette d'architecte » (volumes nets, palette sobre, lumière douce).
- Ensuite : semi-réaliste (artiste 3D à budgéter).
- Modèles glTF/GLB, Blender ou bibliothèques CC0 (Quaternius) ; registre `assets/LICENCES.md` ; modèles modulaires ; jamais de bâtiment codé à la main.
- Performance : 60 images par seconde visées sur portable récent ; instanciation, textures compressées, niveaux de détail, chargement à la demande.

## 7. Le groupe

### 7.1 Créer une société
Nom, forme (SAS, SARL, SA, SCI), secteur, capital, associés. Effets réels simplifiés : capital minimum, organes, règles de décision, transmission des titres.

### 7.2 Holding et filiales
- Holding : détient des participations (100 % de A, 80 % de B, 60 % de C), reçoit des dividendes, finance des acquisitions.
- Filiale : sa trésorerie, ses comptes, ses salariés, ses bâtiments, ses dettes. Au-delà de 50 %, la mère décide ; en dessous, elle négocie.
- Flux intragroupe : dividendes, prêts, prestations, apports, cessions d'actifs, transferts de titres, passés en comptabilité dans les deux sociétés.

### 7.3 Vue consolidée
Chiffre d'affaires, EBITDA, résultat, dette nette, trésorerie, valeur des participations, valeur du groupe, **sans double comptage** des flux intragroupe.

## 8. Opérations financières

- **Acquisition** : évaluation (multiple d'EBITDA, valeur patrimoniale, flux actualisés simplifiés), offre, contre-offre, financement, transfert des titres, intégration. Négociation sécurisée par le serveur.
- **LBO** : holding de reprise, fonds propres + dette, rachat de la cible, dividendes qui remboursent la dette. Exemple : prix 10 M€ = 3 M€ de fonds propres + 7 M€ de dette. Mêmes règles pour le métier de gérant de fonds.
- **Ensuite** : augmentation et réduction de capital, émission de dette, refinancement, cessions, fusion, scission, introduction en bourse, rachat d'actions.
- **Garde-fous** : aucune création de valeur sans contrepartie (test automatique après chaque clôture) ; cessions intragroupe à un prix de marché encadré.

## 9. Difficultés et procédures collectives (droit français simplifié)

| Situation | Mécanisme |
| --- | --- |
| Difficultés naissantes | Mandat ad hoc ou conciliation |
| Difficultés sérieuses, pas de cessation des paiements | Sauvegarde |
| Cessation des paiements | Redressement judiciaire : continuation ou cession |
| Redressement impossible | Liquidation ; le joueur repart avec le capital de départ |

Règles à vérifier sur Légifrance au moment de les coder.

## 10. Multijoueur

- Interactions économiques : marchés communs, contrats, participations, coentreprises, offres de rachat.
- Le serveur est la seule source de vérité ; chaque opération est vérifiée, horodatée, enregistrée.
- Visite d'un bâtiment d'un autre joueur : extérieur et espaces publics, jamais ses chiffres privés.

## 11. Architecture technique retenue

| Couche | Choix |
| --- | --- |
| Interface | Next.js (React, TypeScript) |
| 3D | Three.js avec React Three Fiber, navigateur uniquement ; à terme isolée dans `packages/scene3d` |
| Modèles 3D | glTF/GLB, Blender, registre `assets/LICENCES.md` |
| Moteur économique | `packages/engine`, fonction pure |
| Catalogues | `packages/content` |
| Serveur et données | Supabase et fonctions serveur Next.js |
| Clôture | Fonction serveur ; service dédié si la charge l'exige |

La 3D ne décide jamais d'un chiffre. Nouvelles tables : `building_types`, `buildings`, `floors`, `layouts`, `module_types`, `placed_modules`, `equipment_types`, `shareholdings` (dès la V1), `contracts`, `acquisitions`, `financial_statements`.

## 12. Feuille de route

| Palier | Contenu |
| --- | --- |
| V1 | Module Entrepreneur textile, moteur, monde partagé, PNJ, missions ; atelier 3D aménageable, « Mon Empire », deuxième local |
| V2 | Étapes 3 et 4 : boutiques, entrepôts, bureaux, international ; semi-réaliste ; personnages animés |
| V3 | Groupe : holding, filiales, consolidation, SCI, acquisitions entre joueurs, LBO ; métier de gérant de fonds |
| V4 | Procédures collectives ; métier d'avocat ; contrats entre joueurs |
| Ensuite | Nouveaux secteurs, introduction en bourse, événements |

## 13. Risques

- Coût de la 3D : style maquette, bibliothèques libres, 3D après le moteur.
- 3D qui prend le pas sur l'économie : règle de la section 1.
- Triche par le navigateur : validation côté serveur.
- Performances : budget, mode « 3D simplifiée ».
- Licences des modèles : registre, sources vérifiées.
