// Écran Magasin (AE-11) : calculs d'affichage, sans aucun chiffre écrit ici. Les montants
// viennent du catalogue des bâtiments et des paramètres, les règles du moteur (@kapital/engine).

import type { Parametres, TypeBatiment } from "@kapital/content";
import {
  apercuOuvertureBoutique,
  centimes,
  ecrituresOuvertureBoutique,
  estEmplacementBoutique,
  margeUnitaireBoutique,
  moisJeu,
  nouveauPointDeVente,
  passantsReferenceBoutiques,
  type ApercuOuvertureBoutique,
  type EcritureComptable as EcritureMoteur,
} from "@kapital/engine";
import type { EcritureAffichee } from "../../../lib/apercu-lot4";

/** Une écriture du moteur, au format de l'affichage (débit / crédit par ligne). */
export function ecritureAffichee(e: EcritureMoteur): EcritureAffichee {
  return {
    libelle: e.libelle,
    lignes: e.lignes.map((l) =>
      l.sens === "debit" ? { compte: l.compte, debit: l.montant } : { compte: l.compte, credit: l.montant },
    ),
  };
}

export type OffreEmplacement = {
  readonly apercu: ApercuOuvertureBoutique;
  /** Écritures de la signature (dépôt 275 / 512, travaux 2135 / 512), calculées par le moteur. */
  readonly ecritures: readonly EcritureAffichee[];
  /** Pièces à vendre par mois pour couvrir les charges fixes avec un vendeur ; null si la marge est inconnue ou nulle. */
  readonly piecesPointMort: number | null;
};

/** Pièces par mois pour couvrir des charges fixes, à la pièce supérieure ; null sans marge positive. */
export function piecesPourCouvrir(chargesFixes: number, margeParPiece: number | null): number | null {
  if (margeParPiece === null || margeParPiece <= 0) return null;
  return Math.ceil(chargesFixes / margeParPiece);
}

/** Les emplacements boutique du catalogue, avec l'aperçu complet de l'ouverture (moteur). */
export function offresEmplacements(args: {
  readonly catalogue: readonly TypeBatiment[];
  readonly params: Parametres;
  readonly mois: number;
  /** Instant de la signature si elle avait lieu maintenant (ms) : fixe l'heure d'ouverture affichée. */
  readonly instantMs?: number;
  readonly tresorerie: number;
  readonly margeParPiece: number | null;
}): OffreEmplacement[] {
  const emplacements = args.catalogue.filter(estEmplacementBoutique);
  if (emplacements.length === 0) return [];
  const reference = passantsReferenceBoutiques(args.catalogue);
  return emplacements.map((b) => {
    const apercu = apercuOuvertureBoutique({
      batiment: b,
      params: args.params,
      mois: moisJeu(args.mois),
      ...(args.instantMs === undefined ? {} : { instantMs: args.instantMs }),
      tresorerie: centimes(args.tresorerie),
    });
    const pdv = nouveauPointDeVente({
      id: "apercu",
      batiment: b,
      mois: moisJeu(args.mois),
      ...(args.instantMs === undefined ? {} : { instantMs: args.instantMs }),
      params: args.params,
      passantsReference: reference,
    });
    return {
      apercu,
      ecritures: ecrituresOuvertureBoutique(pdv).map(ecritureAffichee),
      piecesPointMort: piecesPourCouvrir(apercu.chargesFixesMensuellesAvecUnVendeur, args.margeParPiece),
    };
  });
}

export type ProduitPourMarge = {
  readonly prixBoutiqueTtc: number;
  /** Pièces et valeur au coût moyen, dans le stock qui sert de référence. */
  readonly pieces: number;
  readonly valeur: number;
};

/**
 * Marge moyenne par pièce en boutique, pondérée par les pièces : prix HT − coût moyen du stock
 * (même règle que margeMoyenneBoutique du moteur). Null sans stock.
 */
export function margeMoyenneParPiece(produits: readonly ProduitPourMarge[], tauxTva: number): number | null {
  let marge = 0;
  let pieces = 0;
  for (const p of produits) {
    if (p.pieces <= 0) continue;
    const cout = centimes(Math.round(p.valeur / p.pieces));
    marge += margeUnitaireBoutique(centimes(p.prixBoutiqueTtc), cout, tauxTva) * p.pieces;
    pieces += p.pieces;
  }
  return pieces === 0 ? null : Math.floor(marge / pieces);
}

type LigneLivre = {
  readonly ecriture_id: string;
  readonly mois_jeu: number;
  readonly compte: string;
  readonly sens: "debit" | "credit";
  readonly montant_centimes: number;
  readonly libelle: string;
};

const PREFIXE_LIBELLE_VENTE_BOUTIQUE = "Vente boutique ";

/** Ventes en boutique d'un mois, lues au grand livre : pièces (libellé) et chiffre d'affaires HT (707). */
export function ventesBoutiqueDuMois(lignes: readonly LigneLivre[], mois: number): { pieces: number; chiffreAffairesHt: number } {
  let pieces = 0;
  let ca = 0;
  const vues = new Set<string>();
  for (const l of lignes) {
    if (l.mois_jeu !== mois || !l.libelle.startsWith(PREFIXE_LIBELLE_VENTE_BOUTIQUE)) continue;
    if (l.compte === "707") ca += l.sens === "credit" ? l.montant_centimes : -l.montant_centimes;
    if (!vues.has(l.ecriture_id)) {
      vues.add(l.ecriture_id);
      const n = /^(\d+)/.exec(l.libelle.slice(PREFIXE_LIBELLE_VENTE_BOUTIQUE.length))?.[1];
      pieces += n ? Number(n) : 0;
    }
  }
  return { pieces, chiffreAffairesHt: ca };
}

/** Prix boutique saisi : un entier de centimes > 0, ou null pour revenir au prix de la vente directe. */
export function lirePrixBoutique(
  v: unknown,
): { readonly ok: true; readonly valeur: number | null } | { readonly ok: false; readonly message: string } {
  if (v === null) return { ok: true, valeur: null };
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return { ok: true, valeur: v };
  return { ok: false, message: "Le prix en boutique doit être un montant positif, au centime près (ou vide pour reprendre le prix en ligne)." };
}
