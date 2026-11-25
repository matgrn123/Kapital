// Affichage de la barre du haut. Aucune règle de jeu ici : la date est une
// lecture de l'horloge commune, les ventes une division pour l'affichage.

const JOURS_AFFICHES_PAR_MOIS = 30;

/** Jour du mois de jeu (1 à 30) d'après la position dans le mois. */
function jourDuMois(indexDansMois: number, pasParMois: number): number {
  const jour = Math.floor((indexDansMois / pasParMois) * JOURS_AFFICHES_PAR_MOIS) + 1;
  return Math.min(JOURS_AFFICHES_PAR_MOIS, Math.max(1, jour));
}

export function dateDeJeu(mois: number, indexDansMois: number, pasParMois: number): string {
  if (!(pasParMois > 0)) return `mois ${mois}`;
  return `mois ${mois}, jour ${jourDuMois(indexDansMois, pasParMois)}`;
}

/** Chiffre d'affaires HT moyen par jour de jeu écoulé, en centimes entiers. */
export function ventesParJour(caMoisHt: number, indexDansMois: number, pasParMois: number): number {
  if (!(pasParMois > 0) || caMoisHt <= 0) return 0;
  return Math.round(caMoisHt / jourDuMois(indexDansMois, pasParMois));
}
