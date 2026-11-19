import type { Graine } from "../types/primitifs.js";

export type Rng = () => number;

export function creerRng(graine: Graine): Rng {
  let etat = graine === 0 ? 1 : graine;
  return () => {
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    return etat / 0x7fffffff;
  };
}
