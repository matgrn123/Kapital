# Cahier des charges V1 : module Entrepreneur textile

Ce document dit à Claude Code quoi construire pour la première version jouable de Kapital. Il s'appuie sur deux autres documents : les règles du module Entrepreneur et le référentiel des coûts (`docs/referentiel-couts.md`). En cas de contradiction, ce cahier l'emporte pour la V1.

## 0. Comment s'en servir avec Claude Code

1. Ce cahier est dans `docs/cahier-des-charges-v1.md`, le référentiel des coûts dans `docs/referentiel-couts.md`. Le fichier `CLAUDE.md` à la racine renvoie vers eux.
2. Faire **un ticket à la fois** (section 13), dans l'ordre. Message type à Claude Code : « Lis docs/cahier-des-charges-v1.md. Réalise le ticket T05. Commence par les tests, montre-moi le plan avant de coder. »
3. Un ticket est fini quand ses **critères d'acceptation** passent et que les tests tournent dans GitHub. On déploie alors en environnement de recette pour essayer, puis on passe au suivant.
4. Ne jamais demander « code tout le jeu » : un ticket trop gros produit du code qu'on ne peut pas vérifier.

## 1. Objectif de la V1

Un monde partagé et persistant où des joueurs, inscrits avec un compte, créent chacun une marque de textile, la font tourner et la font grandir des étapes 0 à 2 (de l'idée à la petite marque d'une vingtaine de salariés). Ils sont en concurrence entre eux et avec des entreprises PNJ sur le même marché.

Le joueur doit apprendre trois choses : calculer un coût de revient et une marge, gérer sa trésorerie, comprendre le besoin en fonds de roulement.

**Dans la V1**

- Un seul monde, un seul secteur (textile), le marché français.
- Trois produits : t-shirt, chemise, sac en toile.
- Quatre matières : jersey de coton, popeline, toile de coton, fournitures (lot par produit).
- Production en atelier propre ou chez un façonnier.
- Deux canaux : vente en ligne en propre, revendeurs multimarques.
- Salariés : artisans et un premier poste d'encadrement.
- Marque à deux jauges (notoriété, désirabilité), quatre actions marketing.
- Comptes : compte de résultat, bilan, trésorerie, en partie double.
- Un prêt bancaire.
- Des PNJ et une frange concurrentielle.
- Trois missions guidées.
- Un classement.

**Hors V1** : boutiques en propre, international, maroquinerie cuir, rachat d'entreprises, métiers avocat et fonds, IA conversationnelle, application mobile, paiement.

## 2. Décisions fixées

| Sujet | Décision |
| --- | --- |
| Rythme | **Monde persistant asynchrone**. Ratio : 1 jour réel = 1 mois de jeu. Les flux (ventes, production, charges) avancent au prorata du temps réel. Les événements datés (livraisons, échéances, missions) se déclenchent à leur horodatage. Parts de marché recalculées **toutes les 30 min réelles**. Négociations entre joueurs : deadlines en temps réel, **48 h par défaut**. |
| Monde | Partagé et persistant dès la V1, sans remise à zéro des fortunes |
| Support | Ordinateur (écran de 1 280 px et plus) ; sur mobile, consultation seule |
| Accès | Compte obligatoire (email ou Google) |
| Modèle économique | Gratuit |
| Langue et droit | Français, droit français |
| Stack | TypeScript, Next.js sur Vercel, Supabase (Postgres, Auth, RLS, pg_cron), Vitest, Playwright |
| Développement | Principalement Claude Code, piloté par Mathieu |

## 3. Le parcours du joueur

1. **Inscription** : email ou Google, pseudonyme public, acceptation des conditions et de la politique de confidentialité.
2. **Création de l'entreprise** : nom de la marque, gamme visée (entrée, milieu, haut de gamme), capital de départ fixe (par exemple 20 000 € d'apport). Le joueur entre dans le monde à l'instant courant.
3. **Tutoriel** : la mission 1 le guide pour sa première commande de matière, sa première production et sa première mise en vente.
4. **Chaque connexion** : il consulte ce qui s'est passé depuis sa dernière visite (ventes accumulées, livraisons reçues, échéances payées, offres reçues avec deadline), lit les explications, puis ajuste ses décisions. Il peut se connecter 1 fois ou 10 fois par jour — son entreprise tourne toujours.
5. **Entre deux connexions** : le monde avance en continu. Les flux (ventes, production, charges) coulent au prorata du temps. Les événements programmés (livraison tissu, échéance de prêt, clôture trimestrielle, expiration d'offre) se déclenchent à leur horodatage.
6. **Si le joueur ne se connecte pas plusieurs jours** : ses décisions permanentes continuent (prix, production récurrente, salariés), ses charges courent, ses stocks s'écoulent au rythme du marché. Les seules choses qui lui échappent sont les **négociations à minuterie** qu'il aurait acceptées (offre de rachat à répondre sous 48 h, par exemple).

## 4. Le temps

**Le monde avance en continu, pas par tours.** Les grandeurs qui coulent (ventes, production, charges fixes, décroissance de la marque) progressent au prorata du temps réel écoulé, au ratio **1 jour réel = 1 mois de jeu**. Les joueurs ne sont jamais obligés d'être connectés : quand ils reviennent, leur entreprise a avancé toute seule.

**Les décisions sont de deux sortes.** Permanentes (prix, effectif, production récurrente) : elles restent en place tant que le joueur ne les change pas. Ponctuelles (une commande, une campagne, une embauche) : elles génèrent un **événement daté** qui se réalisera à son échéance (commande France : livraison dans 24 h réelles = 1 mois jeu ; Portugal : 48 h = 2 mois).

**Événements datés.** Chaque action ponctuelle crée un événement dans la file avec un horodatage de réalisation. Au moment prévu, l'événement s'exécute : le stock bouge, l'écriture comptable passe, le joueur reçoit une notification. Catégories d'événements :
- Livraisons de matières (délai fournisseur en mois → en heures réelles au ratio 24:1)
- Fins de production façonnier (même conversion)
- Échéances de prêt (tous les 30 jours → toutes les 24 h)
- Clôtures comptables trimestrielles (90 jours → 3 jours)
- Clôtures annuelles (365 jours → 12 jours)
- Expiration d'offres entre joueurs (48 h par défaut, en temps réel, pas en jeu)
- En V2 : livrables des missions d'avocat, sorties de LBO

**Rafraîchissement du marché.** Les parts de marché et les ventes qui en découlent sont recalculées **toutes les 30 minutes réelles** (≈ 15 heures jeu). Assez fin pour que le marché vive visiblement, assez espacé pour que les joueurs non connectés ne soient pas désavantagés.

**Délais.** Ils se mesurent en mois de jeu dans les règles et se convertissent en temps réel au ratio 24:1 : une commande de tissu arrive 1 à 2 jours réels après ; une production façonnier prend 1 à 2 jours. Les minuteries liées aux négociations entre joueurs restent en **temps réel absolu** (indépendamment du ratio) : une offre est valable 48 h réelles, point.

**Déterminisme et audit.** L'état du monde à n'importe quel instant est reconstructible à partir de la suite des décisions et des événements avec leurs horodatages. Rejouer un intervalle donne exactement le même résultat (critère T13).

## 5. Modèle de données

Tables Supabase, toutes rattachées à un `world_id`. Les montants sont stockés en centimes (entiers), jamais en nombres à virgule.

| Table | Contenu |
| --- | --- |
| `profiles` | Joueur : pseudonyme, rôle (joueur, admin), date d'inscription |
| `worlds` | Monde : mois de jeu courant, heure de clôture, état |
| `companies` | Entreprise : propriétaire (joueur ou PNJ), nom, gamme, étape, statut (active, en difficulté, liquidée) |
| `materials`, `material_prices` | Matières et leur prix par mois (indexé) |
| `suppliers` | Fournisseurs : qualité, délai, fiabilité, minimum de commande, délai de paiement |
| `contractors` | Façonniers : prix par pièce et par produit, minimum, délai, fiabilité |
| `products`, `bom_lines` | Produits de référence et leur nomenclature (matière, quantité, temps standard) |
| `company_products` | Produits d'une entreprise : qualité visée, prix par canal, production mensuelle |
| `workshops` | Atelier : surface, loyer, machines, rendement |
| `employees` | Salariés : poste, salaire brut, ancienneté, expérience |
| `inventory` | Stocks de matières et de produits finis, avec leur valeur |
| `purchase_orders`, `production_orders` | Commandes en cours et leur date d'arrivée |
| `brand_state` | Notoriété et désirabilité par mois |
| `ledger_entries` | Écritures comptables en partie double (débit, crédit, compte, montant, mois) |
| `loans` | Prêts : capital, taux, durée, échéancier |
| `decisions` | Décisions du joueur pour le prochain tour |
| `turn_results` | Résultat de chaque mois par entreprise, avec les explications |
| `market_inputs` | Données réelles du mois (SMIC, prix de l'électricité, cours du coton, €STR, inflation) |
| `events` | Événements du monde et leur effet |
| `missions`, `mission_progress` | Missions et avancement |
| `audit_log` | Toute action d'administrateur |

## 6. Le moteur

Le moteur vit dans `packages/engine`. C'est une **fonction pure** : elle prend l'état du monde à un instant t, la file d'événements, les décisions courantes, les données réelles et une graine aléatoire, et rend le nouvel état à un instant t+Δ. Elle ne lit ni n'écrit la base de données. On peut rejouer n'importe quel intervalle et obtenir exactement le même résultat, ce qui permet de tester et de corriger.

`simulerDepuis(etat, decisions, evenements, marketInputs, instantDebut, instantFin, seed) → { nouvelEtat, resultats, explications }`

### 6.1 Ordre de calcul d'une avance de t à t+Δ

1. Charger les données réelles qui ont changé entre t et t+Δ (SMIC, €STR, cours du coton, inflation) et mettre à jour les prix des matières.
2. **Pour chaque événement daté dans la file dont l'horodatage tombe entre t et t+Δ** (triés par horodatage) :
   - Livraison de matière → stock + dette fournisseur
   - Fin de production façonnier → stock produits finis + dette façonnier
   - Échéance de prêt → amortissement + intérêts
   - Clôture trimestrielle TVA → écriture de déclaration
   - Clôture annuelle → impôt sur les sociétés
   - Expiration d'offre entre joueurs → annulation
3. **Entre deux événements**, les flux continus s'appliquent au prorata du Δ écoulé :
   - Production atelier : capacité mensuelle × (Δ / durée-mois)
   - Ventes : demande du segment × part de marché × (Δ / durée-mois), limitée par le stock
   - Décroissance exponentielle des jauges de marque
   - Charges fixes : loyer, salaires, énergie au prorata
   - Dépenses marketing en cours
4. Les parts de marché sont recalculées quand Δ franchit un multiple de 30 min réelles.
5. Toutes les écritures comptables sont passées (partie double).
6. Contrôle de trésorerie : sous zéro, découvert facturé ; trois mois cumulés sous la limite, entreprise en difficulté.
7. Indicateurs et explications mis à jour.

### 6.2 Formules

**Capacité de l'atelier**, en minutes par mois : nombre d'artisans × 151,67 h × 60 × rendement.

**Rendement**, qui progresse avec l'expérience : rendement = r_min + (r_max − r_min) × (1 − e^(−mois d'expérience / τ)). Départ : r_min = 0,40, r_max = 0,75, τ = 6 mois.

**Coût minute de l'atelier** : (salaires chargés + loyer + amortissement des machines + énergie) ÷ minutes produites. Il est affiché au joueur ; un atelier à moitié vide voit son coût minute doubler.

**Coût de revient d'un produit** : matière × (1 + taux de chute) + fournitures + temps × coût minute (ou prix du façonnier).

**Part de marché** (modèle d'attraction). Pour chaque segment et chaque entreprise i :

attrait_i = a × ln(qualité_i) + b × ln(notoriété_i) + c × ln(désirabilité_i) + d × présence en revendeurs_i − e × ln(prix_i / prix de référence du segment)

part_i = exp(attrait_i) ÷ (exp(attrait de la frange) + somme des exp(attrait_j))

Les coefficients diffèrent selon le segment : dans l'entrée de gamme le prix pèse lourd ; dans le haut de gamme la désirabilité compte plus et une baisse de prix pèse moins.

**Taille des segments** : dépense textile des ménages français répartie en trois gammes, avec une saisonnalité mensuelle (pics de soldes et de fêtes). Source et calibrage : Insee et Eurostat, à documenter au ticket T08.

**Marque** : chaque jauge vaut entre 0 et 100.

- notoriété du mois suivant = notoriété × (1 − 0,05) + k_n × ln(1 + dépense publicitaire)
- désirabilité du mois suivant = désirabilité × (1 − 0,02) + k_d × ln(1 + dépenses d'image) + effet qualité − effet des soldes

**Retours** : 19 % des ventes en ligne de vêtements par défaut, 15 à 20 € de coût de traitement par article.

**Prêt** : taux = €STR réel du mois + marge selon le risque de l'entreprise. Remboursement mensuel constant.

**Impôts et cotisations** : TVA collectée et déductible, déclarée par trimestre ; impôt sur les sociétés annuel ; cotisations patronales selon le salaire (allègement près du SMIC, environ 40 % au-delà de 1,6 SMIC). Les taux sont des paramètres, jamais écrits en dur.

### 6.3 Paramètres

Tous les nombres du moteur sont dans un fichier `packages/content/parametres-v1.json`, avec pour chacun : valeur, unité, source, date. Valeurs de départ : `docs/referentiel-couts.md`. Le moteur ne contient aucun chiffre en dur.

## 7. Les PNJ et la frange concurrentielle

- **La frange** est un concurrent agrégé par segment, qui représente tout le marché que les joueurs ne prennent pas. Son prix suit l'inflation et ses parts reculent quand les joueurs gagnent du terrain. Ce que ça change : le marché reste réaliste même avec 3 joueurs ou 3 000.
- **5 à 10 entreprises PNJ** jouent avec les mêmes actions que les joueurs, selon des règles simples : viser une marge cible, ajuster la production au taux d'écoulement, baisser les prix si le stock dépasse 3 mois de ventes. Elles peuvent faire faillite.
- **Garde-fou** : un PNJ ne triche jamais (pas de stock gratuit, pas d'information cachée).

## 8. Les données réelles en V1

| Donnée | Source | Mise à jour en V1 |
| --- | --- | --- |
| €STR | Banque centrale européenne (libre) | Automatique, une fois par jour |
| SMIC, taux de cotisations | Urssaf | Saisie par l'administrateur |
| Prix de l'électricité professionnelle | Tarif réglementé | Saisie par l'administrateur |
| Cours du coton | Banque mondiale (Pink Sheet, licence à confirmer) | Saisie mensuelle, automatique plus tard |
| Inflation | Insee (libre) | Automatique, une fois par mois |

Une page d'administration affiche chaque valeur, sa source et sa date. Toute modification est inscrite dans le journal d'audit. Une donnée manquante reprend la dernière valeur connue : la clôture ne doit jamais bloquer.

## 9. L'interface

Pages de la V1 : connexion ; création d'entreprise ; tableau de bord ; produits et prix ; achats ; atelier et façonniers ; salariés ; marketing ; finances (trois documents) ; banque ; missions ; classement ; profil.

- **Tableau de bord** : trésorerie, chiffre d'affaires, marge brute, résultat, alertes, explication du mois, compte à rebours jusqu'à la prochaine clôture.
- **Bulle d'aide** sur chaque indicateur : la définition, puis ce qu'il dit de la situation.
- **Simulation avant validation** : quand le joueur change un prix ou une production, il voit le coût de revient et la marge estimés avant d'enregistrer.
- **Mises à jour sans interruption** : une nouvelle version déployée ne déconnecte personne et ne modifie pas les décisions en attente.

## 10. Comptes et sécurité

- Authentification Supabase : email avec lien magique ou mot de passe, et Google.
- **Le joueur n'écrit jamais directement en base.** Toute décision passe par une fonction serveur qui vérifie qu'elle est permise (trésorerie, étape, limites).
- Règles d'accès (RLS) : un joueur lit les données publiques du monde et uniquement les données privées de sa propre entreprise.
- La clé de service Supabase reste sur le serveur. Les administrateurs ont la double authentification, et leurs actions vont au journal d'audit.
- Une entreprise par joueur et par monde en V1. Limitation du nombre de requêtes pour éviter les robots.
- RGPD : politique de confidentialité, suppression du compte sur demande, aucune donnée collectée au-delà de l'email et du pseudonyme.

## 11. Missions de la V1

| Mission | Objectif | Notion |
| --- | --- | --- |
| 1. Vendre ma première pièce sans perdre d'argent | Vendre 50 pièces avec une marge brute positive | Coût de revient, marge brute |
| 2. Tenir six mois | Ne jamais passer sous zéro de trésorerie pendant 6 mois | Trésorerie, frais fixes |
| 3. Survivre à la croissance | Doubler le chiffre d'affaires sans découvert | Besoin en fonds de roulement |

Chaque mission se termine par une fiche courte : la notion, puis ce qu'elle a changé dans la partie du joueur.

## 12. Tests

- **Tests unitaires** (Vitest) pour chaque formule, avec des valeurs calculées à la main.
- **Scénarios de référence** : l'exemple du t-shirt du référentiel doit redonner environ 20 € en atelier français et 8 à 11 € chez un façonnier portugais.
- **Banc d'essai** (`tools/sim`) : faire tourner 120 mois avec 20 PNJ sans joueur, et vérifier que le marché reste stable (pas de prix négatif, pas de monopole automatique, la frange garde entre 20 et 95 % du marché).
- **Déterminisme** : même état et même graine donnent exactement le même résultat.
- **Comptabilité** : à tout instant, l'actif égale le passif pour chaque entreprise, à l'euro près.
- **Tests de bout en bout** (Playwright) : inscription, création d'entreprise, première commande, livraison, lecture du résultat.

## 13. Les tickets, dans l'ordre

| Ticket | Contenu | Critère d'acceptation |
| --- | --- | --- |
| T01 | Créer le dépôt (monorepo), `CLAUDE.md`, Vitest, intégration continue GitHub | Un test vide passe sur GitHub |
| T02 | Fichier de paramètres V1 et son contrôle de format | Un paramètre sans source fait échouer les tests |
| T03 | Types du moteur : monde, entreprise, produit, décision | Compilation sans erreur |
| T04 | Comptabilité en partie double | Toute opération garde actif = passif |
| T05 | Achats de matière, fournisseurs, délais | Une commande arrive au bon mois et au bon prix |
| T06 | Atelier : capacité, rendement, coût minute | Le scénario t-shirt France donne ≈ 20 € |
| T07 | Façonniers | Le scénario t-shirt Portugal donne 8 à 11 € |
| T08 | Marché : segments, frange, modèle d'attraction | Baisser son prix fait monter sa part, dans des bornes réalistes |
| T09 | Marque et marketing | Une promotion fait monter la notoriété et baisser la désirabilité |
| T10 | Ventes, canaux, retours | La marge en revendeurs est inférieure à la vente directe |
| T11 | Salariés, salaires, cotisations | Le coût d'un salarié au SMIC ≈ 1 933 € par mois |
| T12 | Prêt bancaire et impôts | Échéancier exact ; TVA et impôt passent en comptabilité |
| T13 | `simulerDepuis(etat, ..., instantDebut, instantFin, seed)` et explications | Test de déterminisme sur un intervalle |
| T14 | PNJ et banc d'essai sur l'équivalent 120 mois | Critères de stabilité de la section 12 |
| T15 | Base Supabase : tables, RLS, migrations | Un joueur ne peut pas lire l'entreprise d'un autre |
| T16 | Fonctions serveur de décision | Une décision impossible est refusée avec un message clair |
| T17 | Processeur d'événements et avance continue du temps | Deux connexions séparées voient la même évolution ; les événements fire à leur horodatage |
| T18 | Données réelles et page d'administration | €STR importé ; une donnée manquante ne bloque pas l'avance du temps |
| T19 | Inscription, connexion, création d'entreprise | Test de bout en bout du parcours |
| T20 | Tableau de bord et pages de décision | Un joueur peut piloter sa marque sans aide |
| T21 | Finances et bulles d'aide | Les trois documents s'affichent et concordent |
| T22 | Missions et tutoriel | Les trois missions se valident |
| T23 | Classement | Classement par valeur d'entreprise, recalculé toutes les 30 min |
| T24 | Recette générale avec 5 à 10 testeurs pendant 2 semaines | Pas de bug bloquant, retours notés |

Les tickets T01 à T14 ne touchent ni la base ni l'interface : le cœur du jeu est testé avant d'être affiché.

## 14. Points encore ouverts

- **Joueur absent longtemps** : son entreprise continue de payer ses charges. Faut-il un mode « mise en sommeil » (activité suspendue, charges réduites) ?
- **Faillite** : en V1, une entreprise liquidée laisse le joueur recommencer avec le capital de départ, son historique restant visible au classement.
- **Nom de domaine, conditions d'utilisation, politique de confidentialité** : à rédiger avant l'ouverture publique.
- **Coefficients du modèle d'attraction et taille des segments** : réglés au banc d'essai (T08 et T14).
- **Durées des négociations entre joueurs** : 48 h par défaut acté. Les cas spéciaux (LBO, levée de fonds) seront tranchés plus tard, probablement 7 j.
- **Ratio temps** : 1 jour réel = 1 mois de jeu acté. Possibilité d'un « événement saison » accéléré (1 h = 1 mois le temps d'un weekend) à étudier plus tard.
