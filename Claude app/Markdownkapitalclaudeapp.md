# Kapital — Architecture du jeu et périmètre modulable

Nov 10, 2026 · @mathieu

## Synthèse

Kapital doit simuler des bilans, pas « le marché ». Chaque acteur (société, fonds, cabinet, banque) possède un bilan, et toute opération du jeu est une écriture entre deux bilans. Le marché n'est alors que la somme de ces opérations, ce qui le rend calculable, vérifiable et extensible.

Cinq partis pris découlent de cette idée.

1. **Un moteur à règles au centre, l'IA en périphérie.** Le moteur décide de tout ce qui touche à l'argent et aux droits. L'IA sert à parler, négocier et raconter. C'est ce qui garde le jeu équitable, peu coûteux et testable.
2. **Le monde réel comme une météo, pas comme un miroir.** On importe une dizaine d'indicateurs réels, pas « tous les taux de la planète ». Un indicateur n'entre dans le jeu que s'il change une décision du joueur.
3. **Sociétés et monnaie fictives, droit et finance réels.** Les marques sont inventées, mais une clause de liquidation préférentielle ou un covenant de levier fonctionnent comme dans la pratique.
4. **Un multijoueur par tours et par saisons.** Un tour vaut un trimestre de jeu. Un monde dure quelques semaines réelles puis repart, pour que les nouveaux joueurs ne soient pas écrasés par les anciens.
5. **Un noyau étroit et des modules activables.** Le périmètre s'élargit ou se restreint en ajoutant ou retirant des modules, sans toucher au moteur.

Le principal danger est l'étendue : trois métiers jouables, c'est trois jeux. La parade est un objet commun, **l'opération** (levée, prêt, acquisition, restructuration), que les trois métiers vivent chacun de leur côté de la table.

## Références : ce qui existe et la place libre

Aucun jeu existant ne rend jouables le cabinet d'avocats ou le fonds d'investissement, et aucun ne modélise la table de capitalisation, le pacte d'associés, les covenants ou les procédures collectives. C'est la place de Kapital : le haut de bilan et le conseil.

| Jeu | Ce qu'il fait | Leçon pour Kapital |
| --- | --- | --- |
| [Sim Companies](https://store.steampowered.com/app/2253720/Sim_Companies) | Jeu de gestion multijoueur par navigateur, économie pilotée par les joueurs | Peu de réglages, seulement des décisions intéressantes |
| [Prosperous Universe](https://prosperousuniverse.com) | Univers persistant par navigateur, interface d'expert, rythme lent | Un jeu de tableaux de bord peut retenir un public exigeant |
| [Virtonomics](https://en.wikipedia.org/wiki/Virtonomics) | Simulation d'entreprise multijoueur au tour par tour, lancée en 2006 | Le tour par tour tient sur la durée pour ce genre |
| [Capitalism Lab](https://capitalismlab.com/subsidiary-dlc/) | Jeu solo : filiales dirigées par des PDG automatisés, introduction en bourse, acquisitions | La référence pour la logique de holding et de groupe |
| [EVE Online](https://www.engadget.com/2010-10-24-eve-evolved-isk-sinks-and-faucets.html) | Économie de joueurs suivie par un économiste salarié depuis 2007 | Il faut mesurer en continu ce qui crée et détruit la monnaie |

Ces jeux traitent surtout la production et le commerce de biens. Kapital peut garder cette couche très simple et mettre sa profondeur là où ils n'en ont pas : qui détient quoi, qui finance qui, et à quelles conditions.

## Architecture en sept couches

Le monde se construit en couches empilées, chacune ne dépendant que de celles du dessous. On peut donc livrer les couches basses d'abord et épaissir les hautes ensuite.

| Couche | Rôle | Contenu |
| --- | --- | --- |
| 0. Monde réel | Alimente la conjoncture | Taux, inflation, change, événements filtrés |
| 1. Conjoncture | Traduit le réel en paramètres de jeu | Coût de l'argent, demande par secteur, appétit pour le risque |
| 2. Marchés de biens | Donne un chiffre d'affaires aux sociétés | Secteurs, demande finale simulée, concurrence par le prix et la qualité |
| 3. Entités | Tient les comptes et les droits | Bilans, tables de capitalisation, contrats, salariés |
| 4. Opérations | Fait circuler capital et contrôle | Levée, prêt, acquisition, LBO, cession, restructuration |
| 5. Acteurs | Prend les décisions | Joueurs et acteurs non joueurs, avec les mêmes actions |
| 6. Récit et pédagogie | Explique ce qui se passe | Journal, fiches de notions, missions, dialogues |

Quatre principes de conception tiennent l'ensemble.

- **Comptabilité en partie double.** Chaque flux a une contrepartie. L'argent ne peut ni apparaître ni disparaître par erreur, et la triche se voit dans les écritures.
- **Le contrat est un objet qui s'exécute.** Une clause est une règle que le moteur évalue à chaque tour. Exemple : un covenant de levier fixé à 4 fois l'excédent brut d'exploitation est testé chaque trimestre. S'il est franchi, le prêteur obtient le droit d'exiger le remboursement, et une négociation de dérogation s'ouvre. Le droit devient ainsi une mécanique de jeu, pas un texte décoratif.
- **Les acteurs non joueurs utilisent les mêmes actions que les joueurs.** Un fonds automatisé passe par le même guichet qu'un fonds humain. Remplacer l'un par l'autre ne change rien au moteur.
- **Tout est historisé.** Le jeu conserve la suite des événements, pas seulement l'état courant. On peut rejouer une partie, auditer un litige et tester l'équilibre.

## Le monde réel dans le jeu

Indexer le jeu sur le réel est faisable et gratuit pour l'essentiel, à condition de choisir les bonnes sources et de filtrer. Deux pièges sont à éviter dès le départ : l'Euribor, dont l'usage commercial est payant, et l'injection brute de l'actualité.

### Quelles données, à quelles conditions

| Donnée | Source | Condition d'usage | Effet dans le jeu |
| --- | --- | --- | --- |
| Taux directeurs, €STR, courbe des taux de la zone euro | [BCE](https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html) | La BCE ne facture pas l'€STR et n'en licencie pas l'usage | Coût de la dette, taux d'actualisation, donc valorisations |
| Euribor | [EMMI](https://www.emmi-benchmarks.eu/faq/subscriptions/) | Tout usage commercial exige une licence payante ; les données différées de 24 h sont réservées à l'usage non commercial | À ne pas utiliser : créer un « taux Kapital 3 mois », égal à l'€STR plus une marge |
| Séries économiques américaines et mondiales | [FRED](https://fred.stlouisfed.org/legal/terms/) | Libre pour l'usage non commercial et éducatif ; les séries de tiers exigent l'accord du propriétaire | Préférer les sources primaires (banques centrales, instituts statistiques) si le jeu devient payant |
| Catastrophes naturelles | [GDACS](https://www.elastic.co/docs/reference/integrations/gdacs) | Interface publique sans clé, portée par l'ONU et la Commission européenne | Chocs d'offre régionaux, sinistres, hausse des primes d'assurance |
| Événements politiques et géopolitiques | [GDELT](https://gdeltcloud.com/compare/dataminr)&#32; | Données tirées de la presse mondiale, mises à jour environ toutes les heures | Très bruité : à résumer et valider avant tout effet en jeu |

Les conditions d'Eurostat et de l'INSEE pour l'inflation, la croissance et le chômage restent à vérifier.

### Trois façons de brancher le réel

- **Branchement direct.** Le jeu lit les données et les applique telles quelles. C'est simple, mais une donnée aberrante ou une panne de source casse l'économie du jeu.
- **Réel filtré (recommandé).** Un relevé quotidien est lissé, puis converti en paramètres de jeu par une table de correspondance. Les événements majeurs passent par une validation humaine avant d'agir.
- **Scénarios historiques rejoués.** Crise de 2008, confinements de 2020, remontée des taux de 2022. Aucune dépendance technique, et un mode idéal pour les cours et le jeu solo.

### Trois difficultés propres au réel

- **Le temps de jeu n'est pas le temps réel.** Si un trimestre de jeu dure un jour réel, une hausse de taux réelle ne peut pas être rejouée à son rythme. La solution est d'importer le niveau du jour, pas la chronologie : chaque tour prend la conjoncture réelle du moment.
- **La décence.** Une catastrophe réelle fait des victimes. Le jeu n'en retient que l'effet économique, formulé sobrement, sans jamais récompenser un pari sur le malheur.
- **La lisibilité.** Un joueur doit comprendre pourquoi sa valorisation baisse. D'où l'idée d'une revue de presse quotidienne : trois titres réels, et pour chacun l'effet en jeu expliqué en deux phrases.

## Simuler le marché : un marché autonome que les joueurs rejoignent

Le marché tourne seul parce qu'il est fait de trois éléments qui n'ont besoin d'aucun joueur : une clientèle simulée, des concurrents automatisés et des prix d'achat indexés sur le réel. Un joueur qui arrive ne crée pas le marché, il y prend une part.

### Quatre marchés, quatre mécanismes

« Le marché » recouvre quatre choses différentes, et chacune se simule autrement.

| Marché | Ce que le joueur y fait | Mécanisme | Ancrage réel |
| --- | --- | --- | --- |
| Clientèle finale | Vend ses produits | Demande calculée par catégorie et par région, puis répartie entre les vendeurs | Consommation des ménages et volumes vendus (Eurostat, INSEE, FAO) |
| Matières et énergie | Achète coton, pétrole, électricité | Prix imposé : le joueur achète au cours du jour plus une marge, sans limite de quantité | Cours mensuels de la Banque mondiale, prix de gros de l'électricité |
| Biens intermédiaires | Achète ou vend à d'autres entreprises (tissu, composants) | Carnet d'ordres, avec un teneur de marché automatisé qui cote toujours autour d'un prix de référence | Indices de prix à la production |
| Crédit et capital | Emprunte, lève des fonds, se fait valoriser | Taux égal au taux sans risque plus une prime selon la note ; valorisation par multiple sectoriel | Taux de la BCE, taux des crédits aux entreprises, défaillances |

La notion clé est celle de **preneur de prix** : un acteur trop petit pour faire bouger le cours mondial. Un atelier textile n'influence pas le prix du coton. Le jeu peut donc lui servir le cours réel sans simuler le marché du coton, ce qui supprime le besoin de contreparties humaines.

### La frange concurrentielle : ce qui rend le marché autonome

Chaque segment de marché contient un concurrent agrégé, la **frange**, qui représente toutes les entreprises réelles que le jeu ne simule pas une à une. Elle a un prix moyen, une qualité moyenne et une capacité de production.

- **Sans aucun joueur**, la frange et quelques sociétés automatisées nommées servent toute la demande. Le marché existe et ses totaux collent aux statistiques.
- **Quand un joueur entre**, il prend des clients à la frange s'il est mieux placé en prix, en qualité ou en image. La frange recule.
- **Quand un joueur fait faillite ou se déconnecte longtemps**, la frange reprend sa part. Aucun client ne reste sans fournisseur.
- **La frange réagit lentement.** Si les marges du segment sont élevées, sa capacité augmente au fil des tours, comme de nouveaux entrants réels. Un joueur ne garde donc pas une rente indéfiniment.

### Trois niveaux d'ancrage au réel

- **Le niveau**, recalé une fois par an. Les statistiques annuelles fixent la taille de chaque marché : tant de kilos, tant d'euros. Elles sortent avec un à deux ans de retard, ce qui suffit pour une taille.
- **Le mouvement**, mis à jour chaque mois. Des indices mensuels (consommation en biens, prix des matières, taux) appliquent un multiplicateur à ces niveaux.
- **Les chocs**, ponctuels. Un événement validé modifie un paramètre pour quelques tours.

Les joueurs peuvent écarter un prix de sa référence réelle, mais une force de rappel l'y ramène : plus l'écart grandit, plus la frange et le teneur de marché interviennent. Le monde du jeu reste ainsi reconnaissable.

Le monde est réduit à l'échelle. Si le jeu représente un millième de l'économie française, toutes les quantités sont divisées par mille, et les prix unitaires restent réels.

## Simuler la clientèle

La clientèle se calcule en deux temps : combien le marché achète au total, puis qui emporte chaque vente. Aucun client individuel n'est simulé.

### Temps 1 : la taille du marché

Pour chaque catégorie de produit et chaque région, la demande du trimestre part d'une statistique réelle.

- **En volume**, quand la donnée existe. La FAO publie la consommation alimentaire en kilos par habitant et par an. Pour la pomme de terre, la moyenne mondiale tourne autour de 33 kg par personne. Une région de jeu d'un million d'habitants à ce niveau achète donc environ 33 000 tonnes par an, soit 8 250 tonnes par trimestre.
- **En valeur**, sinon. Les comptes nationaux donnent la dépense des ménages par fonction, par exemple « articles d'habillement » ou « textiles de maison ». On la convertit en volume avec un prix moyen.
- **Pour l'industrie**, l'enquête européenne PRODCOM donne la production vendue de chaque produit, en valeur et en quantité physique (kilos, mètres carrés, pièces). C'est la réponse à « combien de kilos de tissu sont vendus par an ».

Cette taille n'est pas fixe. Elle monte ou baisse avec le revenu des ménages (la conjoncture) et avec le prix moyen du marché : si tout le monde augmente ses prix, les clients achètent moins. La sensibilité de la demande au prix s'appelle l'élasticité. Elle est faible pour la pomme de terre, forte pour un vêtement de mode.

### Temps 2 : le partage entre vendeurs

Chaque vendeur reçoit un score d'attraction, et sa part de marché est son score divisé par la somme des scores. C'est le modèle d'attraction, classique en marketing et déjà utilisé dans les simulateurs d'entreprise.

```latex
\text{part}_i = \frac{A_i}{\sum_j A_j}
\qquad
A_i = \exp\left(\beta_q \, \text{qualité}_i + \beta_m \, \text{marque}_i + \beta_d \, \text{distribution}_i - \beta_p \, \text{prix}_i\right)
```

Les coefficients disent ce qui compte pour le client. Ils changent selon le segment, et c'est là que se joue la différence entre un produit courant et un produit de luxe.

| Segment | Poids du prix | Poids de la qualité | Poids de la marque | Conséquence pour le joueur |
| --- | --- | --- | --- | --- |
| Entrée de gamme | Très fort | Faible | Faible | Gagner par les coûts et le volume |
| Milieu de gamme | Fort | Moyen | Moyen | Position fragile, attaquée des deux côtés |
| Premium | Moyen | Fort | Fort | Investir dans le produit et la distribution |
| Luxe | Faible, voire inversé | Fort | Très fort | Baisser le prix détruit la marque |

Chaque segment a sa propre taille de marché et sa propre frange. Un joueur choisit donc son terrain, et monter en gamme prend des années de jeu.

### Qualité et attractivité

Il n'existe pas d'indice public de l'attractivité d'une marque. Les classements de valeur de marque sont privés et ne couvrent que les très grands groupes. Le jeu doit donc fabriquer ces deux variables, et utiliser les statistiques pour les calibrer.

- **La qualité est une note que le joueur achète.** Elle dépend des matières choisies, de la qualification des salariés, des machines et des dépenses de conception. Elle augmente le coût unitaire.
- **La marque est un stock, comme un actif au bilan.** Elle monte avec la communication, la constance de la qualité et l'ancienneté. Elle s'érode chaque tour si on ne l'entretient pas, et chute en cas de scandale ou de braderie.
- **Dans le luxe, la rareté nourrit la marque.** Produire trop ou solder fait baisser le stock de marque. C'est ce qui explique la logique d'un groupe de luxe : contrôler sa distribution et ne jamais brader.
- **Le calibrage vient des prix réels.** PRODCOM et les statistiques douanières donnent, pour un même produit, la valeur et la quantité. Leur rapport est un prix moyen au kilo ou à la pièce. L'écart de ce prix entre pays ou entre sous-catégories donne l'ordre de grandeur de ce que la qualité et la marque permettent de facturer.

La valeur de la marque rejoint ensuite le reste du jeu : elle pèse dans la valorisation lors d'une acquisition, et l'avocat la protège par les contrats de licence et de distribution.

## Audit des bases statistiques

L'essentiel du marché se calibre avec des sources publiques réutilisables gratuitement, y compris dans un jeu commercial. Le seul obstacle net concerne les indices boursiers comme le CAC 40.

| Besoin du jeu | Source | Ce qu'elle contient | Réutilisation |
| --- | --- | --- | --- |
| Dépense des ménages par catégorie, par pays | [Eurostat, comptes nationaux](https://db.nomics.world/Eurostat/nama_10_co3_p3) | Consommation finale par fonction, 61 postes, 45 pays, annuelle | [Autorisée](https://ec.europa.eu/eurostat/en/help/copyright-notice), y compris commerciale, en citant la source |
| Volumes vendus par produit industriel | [Eurostat PRODCOM](https://ec.europa.eu/eurostat/web/prodcom/information-data) | Production vendue en valeur et en quantité physique, exportations et importations, annuelle | Même régime |
| Consommation en France, suivi mensuel | [INSEE](https://www.insee.fr/fr/information/2381855) | Consommation des ménages par produit ; dépenses mensuelles en biens, dont habillement-textile | Autorisée y compris à des fins commerciales, sans redevance, en mentionnant source et date |
| Alimentation : production et kilos par habitant | [FAOSTAT](https://data.fao.org/catalog/dataset/2f264bb6-1238-459a-bf8b-0e2d0a16804a) | Bilans alimentaires par pays, 278 produits agricoles, annuel | Licence CC BY 4.0 |
| Cours des matières premières | [Banque mondiale, « Pink Sheet »](https://www.worldbank.org/commodities) | Prix mensuels depuis 1960 : pétrole, gaz, charbon, métaux, produits agricoles | Annoncée CC BY 4.0 par des catalogues tiers, à confirmer sur le site |
| Prix de gros de l'électricité | [ENTSO-E](https://apis.io/providers/entsoe/) | Prix à un jour par zone européenne, production, consommation | Accès gratuit après inscription ; licence à confirmer |
| Coût du crédit et défaillances en France | [Banque de France, Webstat](https://webstat.banque-france.fr/fr/themes/entreprises/defaillances-entreprises/) | Taux des crédits par taille d'entreprise, défaillances par secteur, mensuel | Interface de programmation disponible ; licence à confirmer |
| Taux sans risque | BCE | €STR, taux directeurs, courbe des taux | Libre |
| CAC 40 et indices boursiers | [Euronext](https://live.euronext.com/en/products/indices/data-use) | Niveaux et composition des indices | Usage commercial soumis à un contrat de licence : à écarter |

### Remplacer le CAC 40

Le jeu n'a pas besoin du niveau du CAC 40. Il a besoin de savoir si les investisseurs paient cher ou non les entreprises, c'est-à-dire d'un multiple de valorisation par secteur.

- **Un indice maison.** Le jeu calcule son propre indice à partir des sociétés simulées, publié chaque tour.
- **Un appétit pour le risque dérivé de données libres.** La courbe des taux et les écarts de crédit suffisent à faire monter ou baisser les multiples.
- **Une licence plus tard.** Si le jeu trouve son public, la question se rouvre avec un budget.

### Pistes non encore vérifiées

- Statistiques structurelles d'entreprises d'Eurostat : nombre d'entreprises, chiffre d'affaires et marges par secteur, pour calibrer la frange.
- Enquête européenne sur le budget des ménages : dépenses par niveau de revenu, pour dimensionner les segments de gamme.
- Statistiques douanières (Comext, Comtrade) : prix moyens par produit et par pays d'origine.
- Indices du coût du travail et salaires par secteur.
- Tables de multiples sectoriels publiées par des universitaires.

### Limites à garder en tête

- **Les statistiques décrivent des catégories, pas des produits.** On sait ce que les ménages dépensent en habillement, pas en chemises en lin. Le jeu doit travailler avec quelques dizaines de catégories, pas des milliers.
- **Le retard de publication.** Les volumes annuels ont un à deux ans de retard. Seul le mouvement mensuel est actuel.
- **Le luxe est mal couvert.** Aucune statistique publique n'isole le luxe. Les ordres de grandeur viennent des rapports annuels des groupes cotés, à lire un par un.
- **Les élasticités ne sont pas fournies.** Il faut les tirer d'études publiées ou les régler par simulation jusqu'à obtenir des comportements plausibles.

### Ordre de construction proposé

1. Un seul secteur (le textile), trois segments de gamme, une région, la frange et le modèle d'attraction, avec des tailles saisies à la main depuis Eurostat.
2. Les prix d'achat branchés sur les cours des matières et de l'électricité.
3. Le multiplicateur mensuel de conjoncture.
4. Les biens intermédiaires entre joueurs, avec teneur de marché.
5. D'autres secteurs et régions, par ajout de fichiers de données.

## Acteurs non joueurs : algorithme ou IA

Les deux, mais pas au même endroit : l'algorithme décide, l'IA parle. Faire tourner chaque acteur sur un modèle de langage coûterait trop cher et rendrait l'économie impossible à équilibrer.

| Niveau | Qui | Comment | Coût |
| --- | --- | --- | --- |
| 1. Population | Consommateurs, petites entreprises de fond | Fonctions de demande agrégées, aucun agent individuel | Négligeable |
| 2. Agents à règles | Sociétés, banques, fonds et cabinets automatisés | Profils de stratégie (prudent, agressif, opportuniste) et seuils chiffrés : note de crédit, rendement cible | Faible |
| 3. Agents à modèle de langage | Interlocuteurs d'un joueur humain | Négociation d'une lettre d'intention, courriel d'un client, quelques personnages emblématiques | Élevé, donc rationné |

La recherche confirme ce découpage. Une [étude de 2025 sur les économies de jeux multijoueurs](https://arxiv.org/abs/2506.04699) obtient des agents crédibles en leur faisant choisir parmi des actions structurées, et relève des actions illégales dues aux hallucinations. Une [autre étude](https://arxiv.org/pdf/2402.02053) identifie le coût comme le frein principal à l'usage de ces agents comme personnages de jeu.

Quatre règles en découlent.

- **L'IA propose, le moteur dispose.** Le modèle choisit une action dans une liste fermée, et le moteur la refuse si elle viole une règle.
- **Un prix de réserve calculé par règles.** Un joueur tentera de manipuler le personnage par le texte (« cède-moi la société pour 1 euro »). Le modèle ne connaît que la fourchette autorisée par le moteur et ne peut pas en sortir.
- **Appel sur événement, jamais à chaque tour.** Le modèle n'intervient que lorsqu'un humain interagit, avec un budget quotidien par joueur.
- **Les acteurs automatisés peuvent faire faillite.** Leurs défaillances alimentent le marché des entreprises en difficulté.

Ces acteurs règlent aussi le démarrage à froid. Un entrepreneur a besoin d'une banque, d'un fonds et d'un avocat : s'il n'y a pas d'humain en face, un acteur automatisé tient le rôle. Le jeu est donc jouable seul dès le premier jour, et les humains remplacent les automates à mesure qu'ils arrivent.

## Multijoueur : temps et interactions

Je recommande un monde par tours asynchrones, organisé en saisons. Chaque joueur dépose ses décisions quand il veut, et le moteur résout le tour à heure fixe.

### Le temps

- **Un tour vaut un trimestre de jeu.** C'est le rythme naturel des comptes, des covenants et des échéances de dette.
- **Un tour par jour réel dans le monde public.** Une saison de 12 semaines couvre alors 84 trimestres, soit 21 ans de vie d'entreprise.
- **Des mondes privés accélérés.** Un enseignant ouvre un monde où le tour dure 10 minutes, pour une séance de deux heures.
- **Remise à zéro en fin de saison.** Le joueur conserve son profil, sa réputation et ses trophées, pas sa fortune.

L'alternative est le temps réel continu, comme dans Prosperous Universe. Elle avantage ceux qui restent connectés et complique le serveur.

### Les interactions entre joueurs

- **Négociation structurée.** Offres et contre-offres portent sur des paramètres (valorisation, pourcentage, clauses), que le moteur sait exécuter. Une messagerie libre l'accompagne.
- **Salle de données.** Le vendeur choisit ce qu'il montre, et l'acheteur paie en temps pour creuser. L'asymétrie d'information devient jouable.
- **Coopération.** Associés d'un même cabinet, cofondateurs, prêts syndiqués entre banques, acquisitions à plusieurs fonds.
- **Affrontement.** Offre d'achat hostile, guerre des prix, débauchage de salariés ou de collaborateurs.
- **Litiges.** Un différend entre joueurs peut être tranché par un tribunal arbitral composé d'autres joueurs, rémunérés en réputation.

### Qui a besoin de qui

|  | Entrepreneur | Fonds | Avocat | Banque (automatisée au départ) |
| --- | --- | --- | --- | --- |
| Entrepreneur | Concurrent, cible ou acquéreur | Vend du capital | Achète du conseil | Emprunte |
| Fonds | Investit, contrôle, cède | Co-investisseur ou rival aux enchères | Achète du conseil | Emprunte pour ses acquisitions |
| Avocat | Client | Client | Confrère adverse ou associé | Client |

## Économie du jeu : monnaie, équilibre, abus

Une économie multijoueur dérive si l'on ne mesure pas ce qui crée et ce qui détruit la monnaie. C'est la leçon d'EVE Online, et elle se prévoit dès la conception.

- **Monnaie fictive, sans conversion en argent réel.** Les montants sont libellés en euros de jeu pour rester lisibles. L'absence de retrait écarte les questions de jeux d'argent et de services de paiement, point à faire valider.
- **Entrées de monnaie.** Les achats des consommateurs simulés, le capital de départ et le crédit bancaire. Ce dernier est pédagogique en soi : le prêt crée le dépôt.
- **Sorties de monnaie.** Salaires, loyers, impôts, intérêts versés aux acteurs automatisés, pertes sur défaillances. Les sorties en pourcentage (impôt, commission) restent efficaces quand les fortunes grossissent, contrairement aux coûts fixes.
- **Un tableau de bord d'économiste.** Masse monétaire, inflation interne, concentration des richesses et taux de défaillance, suivis à chaque tour.
- **Des simulations sans joueur.** Avant toute ouverture, le moteur fait tourner des centaines de saisons peuplées uniquement d'automates. Si l'économie explose ou se fige, on le sait avant les joueurs.

### Faire de l'antitriche une leçon de droit

L'abus classique est le compte secondaire qui transfère sa richesse au compte principal par une vente à prix dérisoire. Le droit réel connaît déjà ce problème et y répond.

- Une opération conclue loin de la valeur de marché est signalée automatiquement.
- Si la société appauvrie fait défaut ensuite, l'opération peut être annulée, sur le modèle des nullités de la période suspecte.
- Le dirigeant fautif s'expose à une sanction de réputation, voire à une interdiction de gérer pour la saison.

Le joueur découvre ainsi pourquoi ces règles existent, en essayant de les contourner.

## Les métiers en profondeur et banque d'idées

Chaque métier a sa ressource rare, et c'est elle qui crée les dilemmes : la trésorerie pour l'entrepreneur, le capital des investisseurs pour le fonds, le temps pour l'avocat.

### Entrepreneur

- **Le piège de la croissance.** Vendre plus oblige à financer plus de stocks et de créances clients. Une société rentable peut mourir d'un manque de trésorerie, et c'est la première leçon du jeu.
- **Capital contre contrôle.** Chaque levée dilue. Holding, actions de préférence et pacte d'associés servent à garder la main, comme dans la cascade de holdings de LVMH.
- **Du produit au portefeuille.** En début de partie on règle prix et embauches. En fin de partie on nomme des dirigeants et on alloue du capital entre filiales.
- **Secteurs de départ proposés.** Mode et luxe, logiciel, industrie, distribution. Chacun a un profil différent de marge, de besoin de capital et de sensibilité à la conjoncture.

### Gérant de fonds

- **Lever avant d'investir.** Le gérant convainc des investisseurs institutionnels automatisés, sur la base de son historique. Un premier fonds est petit, et un mauvais rendement ferme la porte au suivant.
- **L'horloge du fonds.** Cinq ans pour investir, cinq ans pour céder. Le gérant est poussé à acheter même quand les prix sont hauts, ce qui reproduit un vrai biais du métier.
- **L'audit d'acquisition comme mini-jeu.** Chaque jour d'audit coûte et révèle une information cachée : litige latent, client dominant, comptes embellis.
- **L'effet de levier.** Plus de dette augmente le rendement et le risque de rupture de covenant. Les taux réels du jour fixent le coût de cette dette.
- **Stratégies en modules.** Capital-risque, LBO, dette privée, retournement d'entreprises en difficulté.

### Avocat d'affaires

- **Le dossier comme mini-jeu de clauses.** Pour chaque opération, l'avocat choisit et négocie des clauses dans un budget d'heures. Ses choix produisent leurs effets plusieurs tours plus tard.
- **La conséquence différée.** Une garantie de passif mal plafonnée fait perdre le client huit trimestres après. La réputation du cabinet en dépend, et c'est ce qui rend le droit tangible.
- **L'économie du cabinet.** Heures facturées, recouvrement, recrutement de collaborateurs, passage à l'association, profit par associé.
- **La déontologie comme contrainte de jeu.** Le conflit d'intérêts interdit de conseiller deux parties adverses. Il force à choisir ses clients.
- **Spécialités en modules.** Sociétés et acquisitions, financement, restructuration, contentieux et arbitrage.

### Idées transverses

- **Carrière en deux temps.** Le joueur débute salarié (analyste, collaborateur) le temps du tutoriel, puis fonde sa structure.
- **Réputation comme seconde monnaie.** Elle ouvre l'accès aux meilleurs dossiers et ne s'achète pas.
- **Simulateur de cascade de sortie.** Avant de signer, chacun voit ce qu'il toucherait selon le prix de cession.
- **Reprise à la barre.** Une société en liquidation est mise aux enchères entre joueurs, avec offres sous pli.
- **Fiches de notions.** Chaque mécanique renvoie à une fiche : la notion, puis ce qu'elle change concrètement.
- **Missions inspirées de cas réels.** Payer une acquisition en titres plutôt qu'en numéraire, résister à une prise de contrôle rampante.
- **Classements multiples.** Fortune, rendement, profit par associé, emplois créés, réputation.
- **Aléas d'entreprise.** Grève, cyberattaque, contrôle fiscal, départ d'un dirigeant clé.
- **Réformes.** Le droit du jeu évolue par versions, et une réforme réelle peut devenir un événement de saison.
- **Métiers futurs.** Banquier d'affaires, banquier prêteur, administrateur judiciaire, directeur financier, commissaire aux comptes.

## Difficultés et risques

Le risque le plus lourd n'est pas technique : c'est de vouloir tout livrer d'un coup. Les autres se traitent par des choix de conception pris tôt.

| Difficulté | Pourquoi c'est dur | Parade |
| --- | --- | --- |
| Étendue du projet | Trois métiers, le réel, l'IA et le multijoueur en même temps | Paliers stricts, un seul métier jouable au premier |
| Équilibre de l'économie | Les joueurs trouvent toujours la stratégie dominante | Simulations sans joueur, tableau de bord, saisons |
| Monde vide au lancement | Un jeu multijoueur sans joueurs n'a pas de contreparties | Acteurs automatisés dans tous les rôles, jeu solo complet |
| Coût de l'IA | Chaque dialogue est facturé | Règles par défaut, IA sur événement, budget par joueur |
| Triche | Comptes multiples, entente, manipulation des personnages | Journal des écritures, contrôle des prix anormaux, prix de réserve |
| Licences de données | Euribor payant, séries de tiers protégées | Sources publiques, taux maison dérivé de l'€STR |
| Actualité sensible | Guerres et catastrophes ne sont pas un décor | Filtre éditorial, effets économiques seulement |
| Complexité contre plaisir | La finance réelle peut noyer le joueur | Peu de décisions par tour, profondeur débloquée progressivement |
| Exactitude juridique | Le droit change, une erreur décrédibilise le jeu | Règles versionnées et datées, mention « ceci n'est pas un conseil » |
| Cadre légal du jeu | Données personnelles, mineurs, monétisation, marques | Sociétés fictives, aucune conversion en argent réel, conditions d'utilisation |
| Temps de jeu et temps réel | Un trimestre par jour déforme l'actualité | Importer le niveau du jour, pas la chronologie |
| Développement en solo | Un moteur économique est difficile à déboguer à la main | Moteur déterministe, tests automatisés, contenu en fichiers de données |

## Périmètre modulable

Le périmètre se règle comme un curseur : un noyau obligatoire, puis des modules qu'on active par paliers. S'arrêter après n'importe quel palier laisse un jeu complet à son échelle.

### Le noyau

Le noyau contient le moteur de tours, les bilans en partie double, un secteur, la société avec sa table de capitalisation, une banque et un fonds automatisés à règles, la levée de fonds, le prêt et la défaillance simple.

### Les paliers

| Palier | Ce qu'on livre | Ce qu'on apprend |
| --- | --- | --- |
| 0. Moteur sans interface | Le noyau, peuplé uniquement d'automates | Si l'économie tient debout |
| 1. Solo entrepreneur | Interface, tutoriel, taux réels de la BCE | Si la boucle de jeu est amusante |
| 2. Fonds jouable | Acquisitions, LBO, covenants, audit d'acquisition | Si deux métiers partagent bien le même monde |
| 3. Avocat jouable | Contrats à clauses, restructuration, procédures collectives | Si le droit fonctionne comme mécanique |
| 4. Multijoueur | Saisons, négociation entre joueurs, classements | Si l'économie résiste à de vrais joueurs |
| 5. IA et monde réel étendu | Personnages dialogués, revue de presse, événements filtrés | Si le coût de l'IA est soutenable |
| 6. Extensions | Mode classe, scénarios historiques, nouveaux métiers | Quels publics paient |

### Les modules optionnels

| Module | Dépend de | Valeur pédagogique | Coût de développement |
| --- | --- | --- | --- |
| Holdings et groupes de sociétés | Palier 1 | Forte | Moyen |
| Secteurs supplémentaires | Palier 1 | Moyenne | Faible (fichiers de données) |
| Dette structurée (senior, mezzanine, unitranche) | Palier 2 | Forte | Moyen |
| Procédures amiables et collectives | Palier 3 | Forte | Élevé |
| Contentieux et arbitrage entre joueurs | Palier 4 | Forte | Élevé |
| Fiscalité simplifiée | Palier 1 | Moyenne | Moyen |
| Introduction en bourse | Palier 2 | Moyenne | Moyen |
| International et change | Palier 5 | Moyenne | Élevé |
| Scénarios historiques | Palier 1 | Forte | Faible |
| Mode classe pour enseignants | Palier 4 | Forte | Moyen |

La version étroite s'arrête au palier 2 : un jeu solo sur l'entreprise et son financement. La version large va au palier 5 avec tous les modules. La bourse et l'international sont les premiers candidats à l'abandon, puisque la finance de marché est hors périmètre.

## Architecture technique

Le choix structurant est de séparer le moteur de simulation de tout le reste. Le moteur est une bibliothèque pure : un état et des décisions en entrée, un nouvel état en sortie, sans réseau ni base de données.

| Brique | Rôle | Choix proposé |
| --- | --- | --- |
| Moteur de simulation | Résout un tour de façon déterministe | Bibliothèque TypeScript autonome, testable seule |
| Banc de simulation | Fait tourner des saisons entières avec des automates | Script en ligne de commande, lancé à chaque modification |
| Serveur | Reçoit les décisions, déclenche les tours, fait autorité | Node.js, tâche planifiée pour la résolution |
| Base de données | Conserve le journal des événements et l'état | PostgreSQL |
| Interface | Tableaux de bord, négociations, fiches | React, dans le navigateur |
| Collecteur de données réelles | Relève quotidien des sources, lissage, conversion | Service séparé, avec valeurs de secours si une source tombe |
| Passerelle IA | Appels au modèle, budget, cache, validation des sorties | Service séparé, désactivable sans casser le jeu |
| Contenu | Secteurs, clauses, événements, fiches | Fichiers de données versionnés, hors du code |

Trois conséquences pratiques pour le travail avec Claude Code.

- **Le client ne calcule rien.** Tout se décide sur le serveur, sinon un joueur modifie ses chiffres dans son navigateur.
- **Le contenu en fichiers de données élargit le périmètre sans code.** Ajouter un secteur ou une clause revient à ajouter une entrée.
- **Le moteur déterministe se teste automatiquement.** Une même graine aléatoire redonne la même partie, ce qui permet de reproduire tout bogue.

## Décisions à prendre

Huit décisions conditionnent le cahier des charges. Ma recommandation figure entre parenthèses.

**Décisions arrêtées le 11 novembre 2026.**

| Sujet | Décision |
| --- | --- |
| Public | Étudiants en droit et en finance, et public informé ou curieux. Le jeu doit rester accessible |
| Droit applicable | Droit français seul en première version |
| Métiers jouables | Les trois dès le début : entrepreneur, gérant de fonds, avocat |
| Secteurs | Un seul au palier 0, quatre au palier 1 |
| Branchement au réel | Réel filtré, aussi réaliste et actuel que possible |

**Propositions en attente de validation.**

| Sujet | Proposition |
| --- | --- |
| Rythme du monde public | Un tour par jour réel, résolu à heure fixe ; un tour vaut un trimestre de jeu. Monde persistant, sans remise à zéro des fortunes (décidé le 11 novembre 2026) ; des classements par période et des mécanismes de rattrapage protègent les nouveaux joueurs. Les négociations entre joueurs restent ouvertes en continu entre deux tours |
| Rythme des autres modes | Solo : le joueur passe les tours à son rythme. Mondes privés : tour de 10 minutes à une heure, réglé par l'organisateur |
| Place de l'IA | Trois usages seulement : interlocuteur de négociation quand il n'y a pas d'humain en face, tuteur qui explique une notion ou une conséquence, rédacteur de la revue de presse. Les règles et l'argent restent au moteur |

**Dimension 3D : adoptée le 22 novembre 2026.** Bâtiments en vue isométrique, aménagement par modules, salariés visibles, écran « Mon Empire » ; toute la 3D a un effet économique. Arbitrages et spécification du groupe (holdings, LBO, procédures collectives) : Bâtiments, 3D et groupe.

**Vitesse du temps : rythme B retenu le 19 novembre 2026 (1 jour réel = 1 mois de jeu).** Un trimestre de jeu par jour réel a été jugé trop rapide le 11 novembre 2026. Les trois options étudiées restent ci-dessous pour mémoire.

| Rythme | Un an réel équivaut à | Un LBO de 5 ans dure | Un fonds de 10 ans dure | Appréciation |
| --- | --- | --- | --- | --- |
| B. Un jour = un mois de jeu | 30 ans de jeu | 2 mois | 4 mois | Équilibre entre temps de négociation et résultats visibles ; recommandé |
| C. Un jour = une semaine de jeu | 7 ans de jeu | 8 mois | 16 mois | Très réaliste, mais lent pour garder les joueurs |
| D. Un jour = un jour (temps réel) | 1 an de jeu | 5 ans | 10 ans | Aucun décalage avec l'actualité, mais opérations longues injouables |

Avec le rythme B, trois cadences s'emboîtent : chaque jour réel clôt un mois (ventes, salaires, trésorerie), tous les 3 jours un trimestre (comptes, vérification des covenants), tous les 12 jours une année (bilan, impôt, dividendes, assemblée).

**Règles retenues pour remplacer la remise à zéro** (validées le 11 novembre 2026) : droit de la concurrence contre les positions dominantes, impôt et coûts de structure croissants avec la taille, ouverture régulière de nouveaux secteurs et régions, classements par période, faillites remettant les actifs sur le marché.

**Encore ouvert.**

- [ ] Modèle économique : gratuit au lancement (décidé le 19 novembre 2026) ; abonnement ou licences pour écoles à réexaminer ensuite

**Conséquence des trois métiers dès le début.** Le premier palier est plus large, donc chaque métier doit y être plus étroit. L'opération commune aux trois est la levée de fonds : l'entrepreneur lève, le fonds investit, l'avocat négocie le pacte. Le premier palier se limite à cette opération et au prêt bancaire ; le LBO, les acquisitions et les procédures collectives viennent ensuite.

## Sources

- [BCE, taux €STR et conditions d'usage](https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html)
- [EMMI, abonnements et licences Euribor](https://www.emmi-benchmarks.eu/faq/subscriptions/)
- [FRED, conditions d'utilisation](https://fred.stlouisfed.org/legal/terms/)
- [GDACS, description de l'interface publique](https://www.elastic.co/docs/reference/integrations/gdacs)
- [GDELT Cloud, fréquence de mise à jour](https://gdeltcloud.com/compare/dataminr)
- [Xu et al., simulation économique de jeux multijoueurs par agents génératifs, 2025](https://arxiv.org/abs/2506.04699)
- [Affordable Generative Agents, 2024](https://arxiv.org/pdf/2402.02053)
- [Engadget, les entrées et sorties de monnaie dans EVE Online](https://www.engadget.com/2010-10-24-eve-evolved-isk-sinks-and-faucets.html)
- [Capitalism Lab, extension Subsidiary](https://capitalismlab.com/subsidiary-dlc/)
- [Sim Companies](https://store.steampowered.com/app/2253720/Sim_Companies)

Ces sources ont été consultées par leurs extraits de recherche, pas lues en entier. Les conditions de licence sont à relire sur les textes complets avant tout engagement.
