# Chantier V1.1 — Rendre Kapital juste, vivant et clair

Rédigé le 22 novembre 2026 après une revue complète du site en production (kapital-six.vercel.app, compte « LVMH ») et du code (commit 1cc2902). Ce document est la feuille de route prioritaire : il passe avant les tickets 3D.

Objectif : que chaque euro affiché soit juste, que le monde vive vraiment chaque mois, et qu'un étudiant comprenne en 30 secondes ce qui lui arrive et pourquoi.

---

## 1. Ce que la revue a constaté

### 1.1 Bloquant : la clôture mensuelle ne fait que vendre
`packages/server/src/avancerMonde.ts` calcule uniquement les ventes. Jamais traités à la clôture :
- les livraisons de matière (`purchase_orders`) et les productions (`production_orders`) ;
- les salaires et cotisations (aucune écriture 641/645 : 2 artisans embauchés depuis le 21 novembre, rien payé) ;
- le loyer de l'atelier (1 000 € par mois affiché, jamais payé) ;
- les échéances de prêt (échéance n°1 du 22 novembre passée, capital restant toujours 10 000 €) ;
- l'encaissement des ventes aux revendeurs (créance 411 jamais encaissée) ;
- la TVA collectée (4 000 € au passif, jamais déclarée ni payée) ;
- la décroissance mensuelle de la marque ;
- les PNJ : ils ne se réapprovisionnent pas, ne paient rien, valent 0 € au classement et n'apparaissent pas sur la page Marché.

Conséquence : la mission « Tenir six mois » se valide sans aucune charge, et le jeu n'enseigne pas la trésorerie.

La fonction pure `simulerDepuis` (`packages/engine/src/moteur/simulate.ts`) ne fait que la marque et n'est pas utilisée par la clôture : il y a deux moteurs, aucun complet.

### 1.2 Bloquant : deux trésoreries différentes
Le tableau de bord affiche 46 982 € (colonne `companies.tresorerie_centimes`), la page Finances 38 982 € (compte 512). L'écart de 8 000 € vient du prêt (+10 000) et du marketing (−2 000), qui modifient la colonne sans écriture. Il ne doit exister qu'**une** source de vérité : le grand livre.

### 1.3 Bloquant : le joueur peut tricher
- Les règles RLS autorisent le joueur à `update` sa ligne `companies` (donc sa trésorerie) et à `insert` dans `ledger_entries`, `employees`, `purchase_orders`, `production_orders`, `marketing_actions`… depuis le navigateur.
- Les formulaires écrivent directement en base (`supabase.from(...).insert` côté client), sans passer par les validations de `packages/server`.
- Le bouton « + 100 (recette) » crée du stock sans production. La commande minimum fournisseur (300) n'est pas respectée par le formulaire (100 accepté).

### 1.4 Le marché n'est pas réaliste
- Taille des segments : 20 M pièces/mois en entrée de gamme avec une frange de poids 5 : une marque inconnue peut capter des centaines de milliers de ventes ; seule la limite de stock bride les ventes. Le joueur n'apprend rien sur la demande.
- Tous les produits d'une gamme sont dans le même segment (un sac concurrence un t-shirt).
- Le prix de référence est la médiane des prix des joueurs : si tous montent leurs prix ensemble, personne n'est pénalisé.
- La « qualité visée » est un curseur gratuit, sans effet sur le coût ni le temps.
- Coût de revient = estimation théorique (matière médiane + fournitures), pas le coût réel de ce qui a été produit.

### 1.5 Le temps est incohérent
Les échéances, livraisons et dates s'affichent en dates réelles (« 23 nov., 19:44 ») alors que le jeu raisonne en mois de jeu. Le joueur ne sait pas quel mois il est, quand tombe la prochaine clôture, ni ce qui va se passer.

### 1.6 Interface
- Identifiants techniques affichés : `prod_sac_toile`, `toile_coton`, `jersey_coton`.
- Tableau de bord : montants signés en convention comptable (« 707 : −5 000 € » pour une vente), cartes de chiffres qui débordent sur écran étroit, tableau d'écritures qui sort de sa carte.
- Missions : avancement brut (« 400 / 50 », « 2000000 / 4000000 » sur le tableau de bord).
- Finances : cumul depuis la création uniquement ; 7135 présenté en « produit négatif » ; bilan sans stocks, créances ni dettes.
- Pas de récit : le joueur ne voit ni ce qui s'est passé ce mois-ci, ni pourquoi.
- Marché : notoriété des concurrents « — », 1 seule offre visible (la sienne).
- Classement « recalculé toutes les 30 minutes », dernier calcul la veille.

---

## 2. Principes non négociables

1. **Une seule vérité : le grand livre.** La trésorerie est le solde du 512. Toute donnée affichée est dérivée des écritures ou d'un état mis à jour dans la même transaction que ses écritures.
2. **Le joueur n'écrit jamais en base.** Chaque action passe par une fonction serveur (route Next.js ou fonction Postgres `security definer`) qui valide, écrit les écritures équilibrées et met à jour l'état **dans une seule transaction**.
3. **Un seul moteur.** Toute la logique d'un mois est dans une fonction pure de `packages/engine` (`simulerMois(etat, decisions, donneesReelles, parametres, graine) → { nouvelEtat, ecritures, evenements, explications }`). Le serveur charge, appelle, persiste. Rien d'autre.
4. **Le temps du jeu, pas le temps réel.** Tout s'affiche et se calcule en mois de jeu (« Mois 8 · août, année 1 »). La date réelle ne sert qu'au compte à rebours de la clôture.
5. **Aucun chiffre en dur.** Tout vient de `parametres-v1.json`, avec source et date.
6. **Chaque chiffre s'explique.** Toute variation importante a une explication en français simple (« Votre trésorerie a baissé de 6 200 € : salaires 3 868 €, loyer 1 000 €, échéance de prêt 191 €, achat de jersey 1 050 € »).

---

## 3. Lots de travail (dans l'ordre)

Chaque lot = une ou plusieurs PR, plan d'abord, tests d'abord. Ne pas passer au lot suivant tant que les critères ne passent pas.

### Lot A — Sécurité et source unique de vérité
- Supprimer les policies `insert`/`update`/`delete` côté joueur sur toutes les tables économiques ; le joueur ne garde que `select` sur ses propres données (et les vues publiques).
- Créer une fonction serveur par action : commander de la matière, lancer une production, embaucher/licencier, fixer prix et production, action marketing, demander un prêt, (plus tard) aménager. Chacune valide (trésorerie, minimum fournisseur, capacité, étape…), écrit des écritures **équilibrées** et met à jour l'état, en transaction.
- Contrainte en base : par `ecriture_id`, somme des débits = somme des crédits (trigger ou contrôle en fin de transaction).
- Supprimer `companies.tresorerie_centimes` comme source (la remplacer par une vue calculée sur le 512, ou un cache mis à jour uniquement par trigger depuis le grand livre).
- Retirer le bouton « + 100 (recette) » de l'interface joueur (le garder dans l'admin seulement, avec écriture comptable).
- Script de migration : recalculer l'état du monde de recette à partir du grand livre. **Une remise à zéro du monde de recette est autorisée avant l'ouverture publique** (la règle « pas de remise à zéro des fortunes » s'applique au monde public).

**Critères** : un test prouve qu'un joueur authentifié ne peut modifier ni sa trésorerie ni ses écritures depuis le client ; tableau de bord, Finances et Banque affichent la même trésorerie ; toutes les écritures sont équilibrées.

### Lot B — Une clôture mensuelle complète, transactionnelle, rejouable
Dans `simulerMois`, dans cet ordre, pour **joueurs et PNJ** :
1. Données réelles du mois (dernière valeur connue si absente).
2. Livraisons de matière arrivées (stock matière, dette fournisseur 401 ou paiement 512 selon conditions).
3. Production : atelier (capacité = min(artisans, machines) × 151,67 h × 60 × rendement ; consommation de matière ; coût réel = matière + main-d'œuvre + quote-part des frais fixes) et façonniers (facture). Stock de produits finis valorisé au **coût moyen pondéré réel**.
4. Marketing : effet des dépenses du mois et décroissance des jauges.
5. Demande et ventes (lot C) ; ventes plafonnées au stock ; **ventes perdues par rupture** enregistrées et affichées.
6. Retours en ligne (19 %, coût de traitement).
7. Encaissements : vente directe immédiate ; revendeurs à 60 jours (411 → 512 deux mois plus tard).
8. Charges : salaires bruts + cotisations patronales (641/645), loyer (613), énergie (606), échéance de prêt (intérêts 661, capital 164), amortissement des machines (681/2815).
9. TVA : déclaration mensuelle (collectée − déductible) et paiement le mois suivant.
10. Découvert : agios ; 3 mois de suite sous la limite autorisée → « en difficulté ».
11. Fin d'exercice tous les 12 mois : impôt sur les sociétés (taux réduit puis normal), clôture des comptes de l'exercice.
12. Indicateurs, événements, explications.

Exigences :
- Table `clotures(monde_id, mois, statut, debut, fin, erreur)`, verrou pour empêcher deux clôtures simultanées, **idempotence** (rejouer un mois ne duplique rien), transaction par entreprise au minimum.
- Si la charge dépasse les limites Vercel, découper par lots d'entreprises.
- Toutes les échéances (livraisons, prêts, encaissements) exprimées en **mois de jeu**.

**Critères** : scénario de référence sur 12 mois dans `tools/sim` (une entreprise joueur qui achète, produit, vend, emprunte, embauche) : bilan équilibré chaque mois, trésorerie = 512, salaires/loyer/échéances/TVA payés, capital restant dû décroît, aucun stock négatif, rejouer un mois donne exactement le même résultat.

### Lot C — Un marché crédible
- Segment = **produit × gamme** (t-shirt entrée, t-shirt milieu, …).
- **Prix de référence ancré sur le marché réel** par produit et gamme (paramètres sourcés), indexé sur l'inflation ; jamais la médiane des prix des joueurs.
- **Demande atteignable limitée par la notoriété** : une marque inconnue ne touche qu'une petite partie du marché. Calibrer pour qu'une nouvelle marque à notoriété 10, au prix du marché, vende de l'ordre de 50 à 300 pièces par mois et par produit ; un PNJ établi plusieurs milliers. Documenter le calibrage dans `docs/referentiel-couts.md`.
- **Saisonnalité** mensuelle (soldes de janvier et juillet, rentrée, fêtes).
- **Qualité** : plus coûteuse en matière et en temps ; elle sert l'attrait, surtout en haut de gamme.
- **Revendeurs** : commandes passées à l'avance (précommandes de saison), paiement à 60 jours, ils peuvent solder les invendus (baisse de désirabilité).
- **PNJ** : ils jouent vraiment avec les mêmes règles (réassort, ajustement des prix au stock et à la marge, paiement des charges, faillite possible) et apparaissent sur la page Marché avec leurs vraies jauges.

**Critères** : banc d'essai 120 mois avec 20 PNJ (stabilité : pas de prix négatif, pas de monopole automatique, frange entre 20 et 95 %) ; une marque nouvelle ne peut pas vendre 10 000 t-shirts dès son premier mois ; baisser son prix fait monter ses ventes, mais dans des bornes réalistes.

### Lot D — Interface et expérience de jeu
**Le tour au centre de l'écran.** Barre supérieure fixe sur toutes les pages : « Mois 8 · août, année 1 », compte à rebours avant la clôture, trésorerie, nombre d'alertes.

**Tableau de bord = « Rapport du mois ».**
- En haut, le récit : ce qui s'est passé et pourquoi (3 à 6 phrases générées à partir des événements).
- Cartes : trésorerie, chiffre d'affaires, marge brute, résultat du mois, stock en jours de vente, besoin en fonds de roulement — chacune avec sa variation et une bulle « définition puis ce que ça veut dire pour vous ».
- Graphiques sur 12 mois : trésorerie, chiffre d'affaires et marge.
- **Prévisionnel de trésorerie à 3 mois** (encaissements attendus, charges certaines, échéances) avec alerte si découvert prévu.
- « À faire ce mois-ci » : checklist contextuelle (stock en rupture, commande à passer, échéance importante).

**Planifier le mois.** Un parcours en 4 étapes, accessible en un clic : acheter la matière → produire → fixer les prix → marketing, avec à chaque étape l'effet estimé sur la trésorerie de fin de mois. Les pages détaillées restent disponibles.

**Produits et prix.** Pour chaque produit : coût de revient détaillé (matière, main-d'œuvre, frais fixes), marge unitaire et taux de marge par canal, point mort, ventes estimées au prix saisi, comparaison avec le prix moyen du marché. Avertissement clair en cas de vente à perte.

**Finances.**
- Filtre mois / trimestre / exercice / depuis la création.
- Compte de résultat en cascade : chiffre d'affaires → coût des ventes → marge brute → charges de personnel et externes → EBE → amortissements → résultat d'exploitation → résultat financier → impôt → résultat net.
- Bilan structuré : immobilisations, stocks, créances, trésorerie / capitaux propres, dettes financières, fournisseurs, dettes fiscales et sociales.
- Tableau des flux de trésorerie (exploitation, investissement, financement).
- Les numéros de compte sont visibles dans un « mode expert » optionnel, pas par défaut.

**Lisibilité.**
- Plus aucun identifiant technique à l'écran : noms français (« Sac en toile », « Toile de coton »).
- Les écritures du tableau de bord deviennent un **journal** : « Vente de 100 sacs en toile · +6 000 € encaissés », entrées en vert, sorties en rouge.
- Missions : avancement formaté (« 20 000 € sur 40 000 € », barre de progression) et conditions réelles (« Tenir six mois » n'a de sens qu'avec les charges du lot B).
- Journal d'événements / notifications : livraison arrivée, échéance prélevée, rupture de stock, passage en découvert, mission validée.
- Mise en page responsive (cartes qui ne débordent plus, tableaux qui défilent proprement), chiffres en police tabulaire, formats compacts (46 982 €), états vides et de chargement soignés, messages d'erreur en français expliquant quoi faire.
- Identité visuelle : garder la sobriété noir et blanc actuelle, ajouter une couleur d'accent, un vert et un rouge sémantiques, des icônes (lucide) et une bibliothèque de graphiques légère (Recharts).

**Création d'entreprise et prise en main.** Expliquer les trois gammes (clientèle, prix, concurrence) avec des exemples ; tutoriel guidé en surimpression pour la mission 1.

**Marché et classement.** Concurrents réels avec leurs jauges ; classement mis à jour à chaque clôture, valeur d'entreprise = capitaux propres (ou méthode documentée), date du dernier calcul exacte.

**Critères** : un testeur qui n'a jamais joué crée son entreprise, joue 3 mois et explique correctement pourquoi sa trésorerie a baissé alors qu'il a vendu ; tests Playwright du parcours complet ; aucune page ne déborde à 1 280 px ni à 1 024 px.

### Lot E — Profondeur pédagogique
- Fiches notions accessibles partout (glossaire : coût de revient, marge, BFR, EBE, amortissement, TVA…), chacune « définition puis ce que ça change ».
- Événements indexés sur le réel (cours du coton, électricité, taux €STR) affichés dans le récit du mois.
- Missions 4 à 6 : « Choisir mes revendeurs », « Embaucher mon premier artisan », « Gérer une collection ratée » (invendus non destructibles, loi AGEC).

### Ensuite seulement — Tickets 3D-1 à 3D-9
La 3D vient une fois l'économie juste (règle : toute la 3D a un effet économique). Le prototype `vue-3d` est conservé en l'état d'ici là.

---

## 4. Méthode

- Lire `CLAUDE.md`, `docs/cahier-des-charges-v1.md`, `docs/referentiel-couts.md`, `docs/batiments-3d-groupe.md` et ce document.
- Pour chaque lot : résumer, proposer le plan (fichiers touchés, migrations, tests), **attendre l'accord de Mathieu**, puis tests d'abord.
- Petites PR, une par sous-lot, avec dans la description : ce qui change pour le joueur, en français simple.
- Ne jamais committer de secret ; ne jamais committer le pack 3D complet.
- Après chaque lot, mettre à jour la recette (`docs/recette-v1.md`).
