import type { Parametres } from "@kapital/content";
import type { Gamme } from "../types/entreprise.js";
import { centimes, type Centimes } from "../types/primitifs.js";
import type {
  CoefficientsAttraction,
  OffreEntreprise,
  OffreFrange,
  PartsSegment,
  SegmentAttraction,
} from "./types.js";

function logPositif(x: number): number {
  return Math.log(Math.max(1, x));
}

export function attrait(
  qualite: number,
  notoriete: number,
  desirabilite: number,
  presenceRevendeur: number,
  prix: Centimes,
  prixReference: Centimes,
  c: CoefficientsAttraction,
): number {
  if (prix <= 0 || prixReference <= 0) {
    throw new Error("prix et prixReference doivent être strictement positifs");
  }
  return (
    c.qualite * logPositif(qualite) +
    c.notoriete * logPositif(notoriete) +
    c.desirabilite * logPositif(desirabilite) +
    c.presenceRevendeur * presenceRevendeur -
    c.prix * Math.log(prix / prixReference)
  );
}

export function attraitOffreEntreprise(
  o: OffreEntreprise,
  segment: SegmentAttraction,
): number {
  return attrait(
    o.qualite,
    o.notoriete,
    o.desirabilite,
    o.presenceRevendeur,
    o.prix,
    segment.prixReference,
    segment.coefficients,
  );
}

export function attraitOffreFrange(
  f: OffreFrange,
  segment: SegmentAttraction,
): number {
  return attrait(
    f.qualite,
    f.notoriete,
    f.desirabilite,
    f.presenceRevendeur,
    f.prix,
    segment.prixReference,
    segment.coefficients,
  );
}

export function partsDeMarche(
  segment: SegmentAttraction,
  offres: readonly OffreEntreprise[],
): PartsSegment {
  const attraitFrange = attraitOffreFrange(segment.frange, segment);
  const attraitsFirmes = offres.map((o) => ({
    id: o.entreprise,
    att: attraitOffreEntreprise(o, segment),
  }));
  const expFrange = Math.exp(attraitFrange);
  const expFirmes = attraitsFirmes.map((a) => Math.exp(a.att));
  const total = expFrange + expFirmes.reduce((s, x) => s + x, 0);
  const parts: Record<string, number> = {};
  for (let i = 0; i < attraitsFirmes.length; i++) {
    parts[attraitsFirmes[i]!.id] = expFirmes[i]! / total;
  }
  return {
    parts,
    partFrange: expFrange / total,
  };
}

export function coefficientsPourGamme(
  params: Parametres,
  gamme: Gamme,
): CoefficientsAttraction {
  const prefixe = `attraction_${gamme}_`;
  const cle = (champ: string) => `${prefixe}${champ}`;
  const lire = (champ: string): number => {
    const p = params[cle(champ)];
    if (!p) {
      throw new Error(`Paramètre manquant : ${cle(champ)}`);
    }
    return p.valeur;
  };
  return {
    qualite: lire("qualite"),
    notoriete: lire("notoriete"),
    desirabilite: lire("desirabilite"),
    presenceRevendeur: lire("presence_revendeur"),
    prix: lire("prix"),
  };
}

export function frangeStandard(prixReference: Centimes): OffreFrange {
  return {
    qualite: 50,
    notoriete: 50,
    desirabilite: 50,
    presenceRevendeur: 0.5,
    prix: prixReference,
  };
}

export function segmentDepuisParametres(
  params: Parametres,
  gamme: Gamme,
  prixReferenceCentimes: number,
): SegmentAttraction {
  const prixRef = centimes(prixReferenceCentimes);
  return {
    gamme,
    prixReference: prixRef,
    coefficients: coefficientsPourGamme(params, gamme),
    frange: frangeStandard(prixRef),
  };
}
