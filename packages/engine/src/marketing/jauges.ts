import type { Parametres } from "@kapital/content";
import type {
  CoefficientsMarketing,
  DepenseMarketing,
  EffetMarketing,
  EtatJauges,
} from "./types.js";

function borner(x: number): number {
  return Math.max(0, Math.min(100, x));
}

function montantEnEuros(montantCentimes: number): number {
  return montantCentimes / 100;
}

export function effetAction(
  depense: DepenseMarketing,
  c: CoefficientsMarketing,
): EffetMarketing {
  const m = Math.log(1 + Math.max(0, montantEnEuros(depense.montant)));
  switch (depense.action) {
    case "publicite":
      return {
        deltaNotoriete: c.kNotorietePublicite * m,
        deltaDesirabilite: 0,
      };
    case "image_marque":
      return {
        deltaNotoriete: 0,
        deltaDesirabilite: c.kDesirabiliteImage * m,
      };
    case "promotion":
      return {
        deltaNotoriete: c.kNotorietePromotion * m,
        deltaDesirabilite: -c.kDesirabilitePromotionNegatif * m,
      };
    case "relations_presse":
      return {
        deltaNotoriete: c.kNotorieteRp * m,
        deltaDesirabilite: c.kDesirabiliteRp * m,
      };
  }
}

export function moisDeMarque(
  etatPrecedent: EtatJauges,
  depenses: readonly DepenseMarketing[],
  c: CoefficientsMarketing,
): EtatJauges {
  let noto = etatPrecedent.notoriete * (1 - c.decroissanceNotoriete);
  let desi = etatPrecedent.desirabilite * (1 - c.decroissanceDesirabilite);
  for (const d of depenses) {
    const e = effetAction(d, c);
    noto += e.deltaNotoriete;
    desi += e.deltaDesirabilite;
  }
  return {
    notoriete: borner(noto),
    desirabilite: borner(desi),
  };
}

export function coefficientsMarketingDepuisParametres(
  params: Parametres,
): CoefficientsMarketing {
  const lire = (cle: string): number => {
    const p = params[cle];
    if (!p) throw new Error(`Paramètre manquant : ${cle}`);
    return p.valeur;
  };
  return {
    kNotorietePublicite: lire("marketing_k_notoriete_publicite"),
    kDesirabiliteImage: lire("marketing_k_desirabilite_image"),
    kNotorietePromotion: lire("marketing_k_notoriete_promotion"),
    kDesirabilitePromotionNegatif: lire(
      "marketing_k_desirabilite_promotion_negatif",
    ),
    kNotorieteRp: lire("marketing_k_notoriete_rp"),
    kDesirabiliteRp: lire("marketing_k_desirabilite_rp"),
    decroissanceNotoriete: lire("decroissance_notoriete_mois"),
    decroissanceDesirabilite: lire("decroissance_desirabilite_mois"),
  };
}
