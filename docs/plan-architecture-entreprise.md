# Plan d'architecture de l'entreprise — V1 solo

Rôle : architecture de l'entreprise. Chaque ticket de la section 6 se donne tel quel à Claude Code, un à la fois.

## 0. Écart avec le cahier et hypothèses

**Écart.** L'objectif demande un magasin physique. Le cahier (§1) classe les « boutiques en propre » hors V1, et `batiments-3d-groupe.md` les place à l'étape 3, en V2.

**Proposition.** Une « tranche boutique » en fin de V1, après le deuxième local (3D-7), réduite à une boutique simple en France. Validée le 24 novembre 2026 et inscrite au cahier (§1 et §13) : tickets AE-9 à AE-11.

**Hypothèses tranchées.**

- Solo = un joueur seul face aux PNJ, dans le monde partagé.
- Je pars du moteur présent dans le dépôt (lots A et B du chantier V1.1 faits).
- Mes tickets (TP puis AE) passent après le lot C « marché ».
- Une seule forme juridique : SAS, capital de 20 000 €.
- L'étape, constatée en fin de mois, débloque des entrées du catalogue.
- Nouveau poste : vendeur. Nouveau canal : boutique.

**Décision sur le temps (validée par Mathieu le 24 novembre 2026).** Une seule horloge pour tous, sans pause ni accéléré. Ratio du cahier conservé : 1 jour réel = 1 mois de jeu (1 minute réelle = 30 minutes de jeu). C'est un réglage du monde, à doubler seulement si les testeurs s'ennuient.

- Le monde avance en continu, par pas de 1 minute réelle (cahier amendé) : les ventes apparaissent presque une par une, en direct à l'écran. Ventes, production et marché bougent à chaque pas ; salaires, loyers, échéances et TVA tombent en fin de mois.
- Réalisé : le moteur avance par pas (TP-1) ; l'horloge est commune, côté serveur (TP-2).
- Aucune attente au démarrage : la société naît avec une série de lancement prête à vendre ; ensuite, un grossiste local livre le jour même, plus cher que l'usine (TP-3).
- Joueur absent : ses décisions permanentes continuent.

## 1 et 2. Décisions, notion et piège par étape

| Étape | Décisions du joueur | Notion apprise | Piège typique |
| --- | --- | --- | --- |
| 0. L'idée | Créer la société, choisir la gamme, acheter le jersey, faire produire chez un façonnier, fixer le prix, vendre en ligne | Coût de revient et marge | Oublier les retours (19 %), l'expédition et la publicité : vendre à perte |
| 1. Le lancement | Faire de la publicité, réassortir, régler la taille des commandes | Trésorerie : un bénéfice n'est pas de l'argent en banque | Commander trop : l'argent dort en stock ; oublier la TVA à reverser |
| 2. L'atelier | Emprunter, louer un local, acheter des machines, embaucher, vendre aux revendeurs | Frais fixes, point mort, besoin en fonds de roulement | Atelier à moitié vide : coût minute doublé ; revendeurs payant à 60 jours |
| 3. La boutique | Ouvrir un magasin, recruter des vendeurs, répartir le stock, louer ou acheter les murs, ouvrir un second point de vente | Levier : la dette amplifie les gains comme les pertes | Emprunter pour couvrir des pertes ; loyer et vendeurs fixes face à des ventes saisonnières |

## 3. Emprunt, locaux, embauches : trésorerie et capacité

| Décision | Trésorerie | Capacité de production | Ce que le joueur doit comprendre |
| --- | --- | --- | --- |
| Emprunt | Entrée immédiate, puis mensualité constante | Aucun effet direct | Les intérêts sont une charge ; le capital remboursé sort de la caisse, pas du résultat |
| Bail | Dépôt de garantie, puis loyer et charges (petit atelier : 2 500 € + 1 050 € par mois) | La surface plafonne les postes et le stock | Souplesse, mais frais fixes immédiats |
| Achat à crédit | Apport, puis mensualités ; plus de loyer | Identique au bail | Actif amorti, apport bloqué (petit atelier : 428 570 €) |
| Achat de machines | Sortie immédiate | Un poste de plus par piqueuse | Immobilisation amortie, pas une charge du mois |
| Embauche d'un artisan | ≈ 1 933 € par mois au SMIC, à chaque fin de mois | minimum(artisans, postes) × 151,67 h × rendement : ≈ 145 t-shirts par mois au début, ≈ 273 avec l'expérience | Sans poste, il ne produit rien ; sans commandes, il coûte autant |
| Embauche d'un vendeur | Même coût | Aucune ; il plafonne les ventes de la boutique | Point mort d'un point de vente |

## 4. Systèmes du moteur et dépendances

Tous sont des fonctions pures, appelées par l'avance du temps.

| Système | État | Dépend de |
| --- | --- | --- |
| Temps (pas, fin de mois, horloge commune) | À refondre | — |
| Comptabilité (grand livre) | Existe | — |
| Société et étapes | À créer | Comptabilité, indicateurs |
| Financement (capacité d'emprunt, prêts affectés) | À étendre | Comptabilité, indicateurs, €STR |
| Locaux (bail, achat) | À créer | Comptabilité, financement, catalogue des bâtiments |
| Équipement et aménagement | Existe en partie | Locaux |
| Personnel | À étendre | Locaux (postes), comptabilité |
| Production | Existe | Personnel, équipement, achats |
| Ventes par canal | Existe ; boutique à ajouter | Marché (demande), production (stock), locaux, personnel |
| Indicateurs | À créer | Tous les précédents |
| Explications et refus | À étendre | Indicateurs |

À chaque pas : locaux et personnel fixent la capacité → production → ventes. Chaque fin de mois : charges et échéances → indicateurs → étape.

## 5. Types partagés et attentes

Règles communes : montants en centimes entiers, dates et durées en temps de jeu.

**Avec le marché**

- Canal : vente directe, revendeur, boutique.
- Offre de l'entreprise (je fournis) : produit, gamme, qualité, prix et stock par canal, notoriété, désirabilité, points de vente (emplacement, surface, vendeurs).
- Ventes du mois (le marché fournit) : quantités vendues et perdues par produit et par canal, délai d'encaissement.

*J'attends du marché* : une demande calculée à chaque pas, saisonnalité comprise ; les premiers clients d'une marque qui se lance ; la demande d'une boutique selon son emplacement, et son effet sur la notoriété et les ventes en ligne ; les prix de référence par produit et gamme ; un calibrage où une marque nouvelle vend 50 à 300 pièces par mois.

**Avec le design**

- Étape et déblocages : ce qui est verrouillé, et la condition pour l'ouvrir.
- Indicateur : valeur, variation, notion liée.
- Aperçu avant validation : effet d'une décision sur la trésorerie de fin de mois et la capacité.
- Explication et refus : une clé stable, des montants, un message par défaut.

*J'attends du design* : l'horloge commune (date et heure de jeu, prochaine échéance) et le fil d'activité en direct ; les textes des notions et des pièges (section 1) ; la phrase associée à chaque clé de refus ; l'écran comparatif « louer ou acheter » ; la liste définitive des indicateurs affichés ; le modèle 3D de boutique, sous licence CC0.

## 6. Tickets, dans l'ordre

Moteur, serveur et contenu seulement ; l'interface revient au design.

| Ticket | Contenu | Critère d'acceptation |
| --- | --- | --- |
| TP-1 | Avance par pas : flux à chaque pas, charges et échéances en fin de mois | Avancer d'un mois en une fois ou pas à pas donne le même état ; bilan équilibré à chaque pas |
| TP-2 | Horloge commune côté serveur : minuterie Supabase chaque minute, rattrapage des pas manquants, un pas appliqué en une transaction, diffusion en direct | Deux joueurs voient la même date et le même marché ; l'entreprise d'un absent avance ; un pas n'est jamais compté deux fois ; le navigateur ne peut pas imposer une date |
| TP-3 | Démarrage sans attente : série de lancement à la création, grossiste local en stock | Un nouveau joueur met en vente en moins de dix minutes ; le grossiste coûte plus cher que l'usine |
| AE-1 | Création de la société : apport, capital, étape 0, sans atelier | Après création : 20 000 € en banque = 20 000 € de capital |
| AE-2 | Étapes : seuils en paramètres sourcés, constat à la clôture, déblocages | Une action verrouillée est refusée, avec la condition manquante |
| AE-3 | Indicateurs : marge par canal, point mort, besoin en fonds de roulement, prévisionnel à 3 mois, endettement | Valeurs égales au calcul à la main ; doubler les ventes aux revendeurs augmente le besoin en fonds de roulement |
| AE-4 | Capacité d'emprunt : plafonds en paramètres, objet du prêt (trésorerie, équipement, immobilier), refus chiffré | Demande hors plafond refusée ; intérêts en charge, capital hors résultat |
| AE-5 | Bail : dépôt de garantie, loyer, charges, préavis (part moteur de 3D-7) | Écritures exactes ; dépôt restitué en fin de bail ; actif = passif |
| AE-6 | Achat à crédit : apport, immobilisation, prêt immobilier, amortissement | Louer et acheter le même local sur 24 mois donnent les écarts calculés à la main |
| AE-7 | Embauche et licenciement : poste requis, rendement du débutant, coût de départ | Embaucher sans poste libre n'augmente pas la production |
| AE-8 | Scénario solo de 24 mois au banc d'essai, de la création aux embauches | Étape 2 atteinte ; bilan équilibré chaque mois ; résultat rejouable à l'identique |
| AE-9 | Boutique, contenu : bâtiment au catalogue, poste vendeur, canal boutique, paramètres sourcés | Chaque entrée a prix, source et licence |
| AE-10 | Boutique, exploitation : bail commercial, un mois de travaux, stock transféré, ventes plafonnées par stock et vendeurs | Sans vendeur ou sans stock, aucune vente ; point mort calculé |
| AE-11 | Missions « Ouvrir ma boutique sans découvert » et « Louer ou acheter » ; banc prolongé à 36 mois | Les missions se valident ; étape 3 atteinte |

## 7. Questions tranchées (24 novembre 2026)

1. **Achat des murs** : crédit possible dès l'étape 2, avec 20 % d'apport (ticket AE-6).
2. **Passage d'étape** : constat automatique à la clôture du mois, jamais de retour en arrière (ticket AE-2).
   - Étape 1 : 50 pièces vendues au total, tous canaux (paramètre `seuil_etape_1_pieces_vendues`).
   - Étape 2 : 30 000 € de chiffre d'affaires cumulé hors taxes (paramètre `seuil_etape_2_chiffre_affaires_ht_cumule_centimes`) et trésorerie positive à la clôture.
   - Les deux seuils sont des valeurs de départ, à calibrer au banc d'essai (AE-8).
   - Déblocages : publicité à l'étape 1 ; emprunt, location d'un local, production à l'atelier, embauche et prix revendeur à l'étape 2. Le prix en ligne, les achats et le façonnier restent libres dès l'étape 0.
   - Une action verrouillée est refusée avec la clé `etape_insuffisante`, l'étape requise et la condition manquante chiffrée (pièces ou euros qui manquent).
3. **Forme juridique** : SAS seule.
4. **Série de lancement** : payée sur le capital.
