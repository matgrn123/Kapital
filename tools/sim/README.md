# Banc d'essai de simulation

Le banc d'essai fait tourner une simulation longue (par défaut 120 mois avec
20 PNJ, sans joueur) pour vérifier la stabilité du marché. Les critères de
stabilité (section 12 du cahier des charges V1) sont automatiquement vérifiés
par les tests Vitest du moteur :

- `packages/engine/src/pnj/pnj.test.ts`

Pour lancer uniquement ces tests :

```bash
npm test -- packages/engine/src/pnj
```

Les tests vérifient :

- pas de prix négatif à aucun mois,
- aucun PNJ n'atteint 95 % de part (pas de monopole automatique),
- la frange garde entre 20 et 95 % du marché dans chaque segment,
- déterminisme : même graine → même historique.

Le détail du modèle PNJ (initialisation, règle d'ajustement de prix, calcul
des parts) est dans `packages/engine/src/pnj/bancEssai.ts`.
