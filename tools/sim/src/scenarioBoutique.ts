import { chargerParametresV1, type Parametres } from "@kapital/content";
import { decisionsDuMois, essayer, jouerScenarioSolo, POLITIQUE, type ResultatScenario } from "./scenarioSolo.js";
import { avancerMois, embaucher, ouvrirBoutique, transfererStockBoutique, type EtatBanc } from "./pilote.js";

// AE-10 : scénario avec boutique. Le joueur du scénario solo (24 mois, étape 2) ouvre une
// boutique, embauche un vendeur et y envoie chaque mois une part du stock de l'atelier.
// Sert au garde-fou monétaire (3D-9) : dépôt, travaux, loyer, amortissement et ventes en
// boutique ne doivent faire apparaître aucune richesse sans contrepartie.

export const POLITIQUE_BOUTIQUE = {
  /** L'emplacement le moins cher du catalogue (choix du joueur). */
  batiment: "boutique_quartier_createurs",
  /** Part du stock de l'atelier envoyée en boutique chaque mois (choix du joueur). */
  partDuStockEnBoutique: 0.5,
  vendeurs: 1,
} as const;

export type OptionsScenarioBoutique = {
  /** Mois du scénario solo joués avant d'ouvrir la boutique. */
  readonly moisAvant?: number;
  /** Mois joués avec la boutique (travaux compris). */
  readonly moisBoutique?: number;
  readonly graine?: number;
  readonly params?: Parametres;
};

function decisionsBoutique(etat: EtatBanc, journal: string[]): EtatBanc {
  const P = POLITIQUE_BOUTIQUE;
  let e = etat;
  if ((e.entreprise.pointsDeVente ?? []).length === 0) {
    e = essayer(e, ouvrirBoutique(e, P.batiment), journal, `ouverture de la boutique ${P.batiment}`);
  }
  const pdv = (e.entreprise.pointsDeVente ?? [])[0];
  if (!pdv) return e;
  const vendeurs = e.entreprise.salaries.filter((s) => s.poste === "vendeur").length;
  if (vendeurs < P.vendeurs) {
    const salaire = e.params["vendeur_salaire_brut_mensuel_centimes"]!.valeur;
    e = essayer(e, embaucher(e, "vendeur", salaire), journal, "embauche d'un vendeur");
  }
  const enStock = e.entreprise.stocksFinis.find((s) => s.produit === POLITIQUE.produit)?.quantite ?? 0;
  const q = Math.floor(enStock * P.partDuStockEnBoutique);
  if (q > 0) e = essayer(e, transfererStockBoutique(e, pdv.id, POLITIQUE.produit, q), journal, `boutique ×${q}`);
  return e;
}

/** Scénario solo puis boutique. Pur : même graine, même résultat. */
export function jouerScenarioBoutique(options: OptionsScenarioBoutique = {}): ResultatScenario {
  const params = options.params ?? chargerParametresV1();
  const graine = options.graine ?? 1;
  const avant = options.moisAvant ?? 24;
  const duree = options.moisBoutique ?? 12;
  const solo = jouerScenarioSolo({ mois: avant, graine, params });
  const journal = [...solo.journal];
  let etat = solo.etat;
  for (let m = 0; m < duree; m++) {
    etat = decisionsDuMois(etat, journal);
    etat = decisionsBoutique(etat, journal);
    etat = avancerMois(etat, graine * 1000 + avant + m);
  }
  return { etat, journal };
}
