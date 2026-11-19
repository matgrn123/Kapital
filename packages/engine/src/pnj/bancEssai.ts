import type { Parametres } from "@kapital/content";
import {
  partsDeMarche,
  segmentDepuisParametres,
  type OffreEntreprise,
  type SegmentAttraction,
} from "../marche/index.js";
import { creerRng, type Rng } from "../moteur/rng.js";
import type { Gamme } from "../types/entreprise.js";
import {
  centimes,
  idEntreprise,
  type Graine,
} from "../types/primitifs.js";
import type { EtatPnj, EtatSegmentBancEssai, PasBancEssai } from "./types.js";

type Config = {
  readonly coutBase: number;
  readonly prixReference: number;
};

const CONFIG_PAR_GAMME: Readonly<Record<Gamme, Config>> = {
  entree: { coutBase: 1200, prixReference: 2500 },
  milieu: { coutBase: 2500, prixReference: 6000 },
  haut: { coutBase: 8000, prixReference: 20000 },
};

const GAMMES_ORDRE: readonly Gamme[] = ["entree", "milieu", "haut"] as const;

function pnjPourGamme(
  nombre: number,
  gamme: Gamme,
  rng: Rng,
  indexDepart: number,
): EtatPnj[] {
  const cfg = CONFIG_PAR_GAMME[gamme];
  const out: EtatPnj[] = [];
  for (let i = 0; i < nombre; i++) {
    const qualite = 40 + Math.floor(rng() * 30);
    const notoriete = 20 + Math.floor(rng() * 30);
    const desirabilite = 20 + Math.floor(rng() * 30);
    const presenceRevendeur = Math.round(rng() * 10) / 10;
    const marge = 1.8 + rng() * 1.2;
    const prix = Math.round(cfg.coutBase * marge);
    out.push({
      id: idEntreprise(`pnj_${gamme}_${indexDepart + i}`),
      gamme,
      qualite,
      notoriete,
      desirabilite,
      presenceRevendeur,
      prix: centimes(prix),
      coutUnitaire: centimes(cfg.coutBase),
    });
  }
  return out;
}

function initialiserPnjInterne(nbPnj: number, rng: Rng): EtatPnj[] {
  const par = Math.floor(nbPnj / 3);
  const reste = nbPnj - 3 * par;
  const nE = par + (reste > 0 ? 1 : 0);
  const nM = par + (reste > 1 ? 1 : 0);
  const nH = par;
  return [
    ...pnjPourGamme(nE, "entree", rng, 0),
    ...pnjPourGamme(nM, "milieu", rng, 0),
    ...pnjPourGamme(nH, "haut", rng, 0),
  ];
}

export function initialiserPnj(nbPnj: number, graine: Graine): readonly EtatPnj[] {
  return initialiserPnjInterne(nbPnj, creerRng(graine));
}

function ajusterPrix(p: EtatPnj, part: number, rng: Rng): EtatPnj {
  const plancher = Math.round(p.coutUnitaire * 1.2);
  let nouveauPrix: number = p.prix;
  if (part < 0.03) {
    const baisse = 0.03 + rng() * 0.04;
    nouveauPrix = Math.max(plancher, Math.round(p.prix * (1 - baisse)));
  } else if (part > 0.15) {
    const hausse = 0.01 + rng() * 0.02;
    nouveauPrix = Math.round(p.prix * (1 + hausse));
  } else {
    const bruit = (rng() - 0.5) * 0.02;
    nouveauPrix = Math.max(plancher, Math.round(p.prix * (1 + bruit)));
  }
  return { ...p, prix: centimes(nouveauPrix) };
}

function pasPourSegment(
  pnjSeg: readonly EtatPnj[],
  segment: SegmentAttraction,
  rng: Rng,
): { pnj: readonly EtatPnj[]; etat: EtatSegmentBancEssai } {
  if (pnjSeg.length === 0) {
    return { pnj: [], etat: { partFrange: 1, partMaxFirme: 0 } };
  }
  const offres: OffreEntreprise[] = pnjSeg.map((p) => ({
    entreprise: p.id,
    qualite: p.qualite,
    notoriete: p.notoriete,
    desirabilite: p.desirabilite,
    presenceRevendeur: p.presenceRevendeur,
    prix: p.prix,
  }));
  const parts = partsDeMarche(segment, offres);
  let partMaxFirme = 0;
  const nouveaux = pnjSeg.map((p) => {
    const part = parts.parts[p.id] ?? 0;
    if (part > partMaxFirme) partMaxFirme = part;
    return ajusterPrix(p, part, rng);
  });
  return {
    pnj: nouveaux,
    etat: { partFrange: parts.partFrange, partMaxFirme },
  };
}

export type ResultatPas = {
  readonly pnj: readonly EtatPnj[];
  readonly parSegment: Readonly<Record<Gamme, EtatSegmentBancEssai>>;
};

export function pasBancEssai(
  pnj: readonly EtatPnj[],
  params: Parametres,
  rng: Rng,
): ResultatPas {
  const segments: Record<Gamme, SegmentAttraction> = {
    entree: segmentDepuisParametres(params, "entree", CONFIG_PAR_GAMME.entree.prixReference),
    milieu: segmentDepuisParametres(params, "milieu", CONFIG_PAR_GAMME.milieu.prixReference),
    haut: segmentDepuisParametres(params, "haut", CONFIG_PAR_GAMME.haut.prixReference),
  };
  const parSegment: Record<Gamme, EtatSegmentBancEssai> = {
    entree: { partFrange: 1, partMaxFirme: 0 },
    milieu: { partFrange: 1, partMaxFirme: 0 },
    haut: { partFrange: 1, partMaxFirme: 0 },
  };
  const nouveaux: EtatPnj[] = [];
  for (const gamme of GAMMES_ORDRE) {
    const pnjSeg = pnj.filter((p) => p.gamme === gamme);
    const r = pasPourSegment(pnjSeg, segments[gamme], rng);
    parSegment[gamme] = r.etat;
    nouveaux.push(...r.pnj);
  }
  return { pnj: nouveaux, parSegment };
}

export function simulerBancEssai(
  nbMois: number,
  nbPnj: number,
  params: Parametres,
  graine: Graine,
): readonly PasBancEssai[] {
  if (nbMois <= 0 || !Number.isInteger(nbMois)) {
    throw new Error("nbMois doit être un entier > 0");
  }
  if (nbPnj <= 0 || !Number.isInteger(nbPnj)) {
    throw new Error("nbPnj doit être un entier > 0");
  }
  const rng = creerRng(graine);
  let pnj: readonly EtatPnj[] = initialiserPnjInterne(nbPnj, rng);
  const historique: PasBancEssai[] = [];
  for (let m = 0; m < nbMois; m++) {
    const r = pasBancEssai(pnj, params, rng);
    pnj = r.pnj;
    historique.push({ mois: m + 1, pnj, parSegment: r.parSegment });
  }
  return historique;
}
