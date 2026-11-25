// Calculs d'affichage des composants (aucun calcul métier : les montants
// viennent toujours du moteur ou du serveur). Montants en centimes.

/** Part remplie d'une jauge, en pourcentage, toujours entre 0 et 100. */
export function pourcentageJauge(valeur: number, maximum: number): number {
  if (!(maximum > 0)) return 0;
  return Math.max(0, Math.min(100, (valeur / maximum) * 100));
}

export type Echelle = {
  readonly max: number;
  readonly pas: number;
  readonly graduations: readonly number[];
};

const ECHELLE_MINIMALE = 1_000_00;

/** Échelle verticale du graphique en barres, avec des graduations rondes. */
export function echelleGraphique(valeurs: readonly number[]): Echelle {
  const plusHaut = Math.max(ECHELLE_MINIMALE, ...valeurs.filter((v) => v > 0));
  const pas = plusHaut > 8_000_00 ? 2_000_00 : plusHaut > 4_000_00 ? 1_000_00 : 500_00;
  const max = Math.ceil(plusHaut / pas) * pas;
  const graduations: number[] = [];
  for (let v = 0; v <= max; v += pas) graduations.push(v);
  return { max, pas, graduations };
}

export type LigneEcriture = {
  readonly compte: string;
  readonly debit?: number;
  readonly credit?: number;
};

/** Totaux d'une écriture affichée : en partie double, débit = crédit. */
export function equilibreEcriture(lignes: readonly LigneEcriture[]): {
  debit: number;
  credit: number;
  equilibree: boolean;
} {
  const debit = lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credit = lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
  return { debit, credit, equilibree: debit === credit };
}
