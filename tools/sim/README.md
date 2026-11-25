# Banc d'essai de simulation (`@kapital/tool-sim`)

Le banc fait tourner le moteur sans base de données ni navigateur, pour vérifier sur de
longues durées que le jeu tient debout. Tout est pur : même graine, même résultat.

## Scénario solo (AE-8)

Une société jouée seule pendant 24 mois : création, série de lancement, réassort chez le
grossiste, puis, dès l'étape 2, bail du petit atelier, embauches, jersey et production ;
un poste de couture de plus au mois 14.

```bash
npm test -- tools/sim                          # les vérifications
npm run banc-solo -w @kapital/tool-sim -- 24 7 # le tableau mois par mois (durée, graine)
```

Les tests vérifient : l'étape 2 est atteinte (sans retour en arrière), le bilan est
équilibré à chaque clôture, et deux lancements avec la même graine sont identiques.

- `src/pilote.ts` : applique les décisions du joueur à l'entreprise du moteur, avec les
  mêmes briques que les routes du site et les fonctions SQL (`creerSociete`,
  `preparerSerieLancement`, `commanderAuGrossiste`, `passerCommande`, `nouveauBail`,
  `achatModulesAmenagement`, `evaluerEmbauche`…), puis clôt chaque mois avec
  `simulerMoisEntreprise`. Les verrous d'étape utilisent l'étape **réelle** (le banc ignore
  `deblocage_total_developpement`).
- `src/scenarioSolo.ts` : les choix du joueur (`POLITIQUE` : prix, stock visé, réserve…).
  Ce sont des choix de joueur, pas des chiffres du jeu.
- `src/atelier.ts` : le **seul** endroit qui construit l'atelier du moteur, à partir des
  modules posés (prêt pour le passage aux postes posés, ticket 3D-3).
- `src/catalogueBanc.ts` : produits, fournisseurs et grossiste recopiés des graines SQL
  (`supabase/migrations/0003`, `0004`, `0023`).

## Banc de 36 mois jusqu'à la boutique (AE-11)

`jouerScenarioBoutique` (`src/scenarioBoutique.ts`) reprend le joueur du scénario solo et
ajoute une publicité mensuelle dès l'étape 1 (la notoriété est une condition de l'étape 3).
Dès l'étape 3 constatée, il ouvre une boutique s'il garde sa réserve de sécurité après la
signature, embauche un vendeur et y envoie chaque mois la moitié du stock de l'atelier.

```bash
npm run banc-solo -w @kapital/tool-sim -- 36 7 boutique
```

Les tests vérifient : l'étape 3 est atteinte, le pilote refuse la boutique avant l'étape 3,
aucune vente pendant les travaux, aucune anomalie du garde-fou, et les cinq missions se
valident avec la règle du site (`missionsDuBanc`, qui appelle `metriquesDepuisGrandLivre`
et `evaluerMissions` du moteur).

## Garde-fou monétaire (3D-9)

`verifierGardeFouMonetaire` (`src/gardeFou.ts`) contrôle une clôture : aucune richesse
n'apparaît sans contrepartie. Il rend la liste des anomalies (vide si tout va bien) :

- chaque écriture équilibrée, bilan équilibré, aucun mouvement de banque sans contrepartie ;
- variation des capitaux propres = résultat de la période + apports en capital ;
- l'état du moteur égale le grand livre : trésorerie = compte 512 (et sa variation = les
  mouvements du mois), stocks = comptes 31 et 35, prêts = 164, dépôt de garantie = 275.

Le pilote l'appelle après chaque mois ; tout autre banc (36 mois, multijoueur) peut le
réutiliser tel quel.

## Bugs trouvés par le banc (corrigés)

- Arrondi du coût moyen à la vente : le compte 35 suit maintenant au centime la valeur du
  stock du moteur (la vente reçoit le coût total sorti du stock).
- Impôt sur les sociétés : calculé au 12e mois sur le résultat de l'exercice entier.
- TVA du serveur : il paie ce qui reste dû au 44551, plus une TVA sur deux.

Si un nouveau bug est trouvé, le documenter par un test `it.fails` (et, pour une anomalie
du garde-fou, une entrée dans `ANOMALIES_CONNUES` de `scenarioSolo.test.ts`).

## Banc PNJ

La stabilité du marché avec 20 PNJ sur 120 mois (section 12 du cahier des charges) est
vérifiée par `packages/engine/src/pnj/pnj.test.ts` (`npm test -- packages/engine/src/pnj`).
