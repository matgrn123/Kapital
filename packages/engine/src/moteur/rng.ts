import type { Graine } from "../types/primitifs.js";

export type Rng = () => number;

export function creerRng(graine: Graine): Rng {
  let etat = graine === 0 ? 1 : graine;
  return () => {
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    return etat / 0x7fffffff;
  };
}

/**
 * Graine déterministe tirée d'une suite de morceaux (identifiant de société, mois, rang…) :
 * empreinte FNV-1a sur 32 bits, ramenée aux entiers positifs de creerRng. Les mêmes morceaux
 * donnent toujours la même graine ; changer un seul morceau en donne une tout autre.
 */
export function graineDepuis(...morceaux: readonly (string | number)[]): Graine {
  const texte = morceaux.map(String).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) & 0x7fffffff) as Graine;
}
