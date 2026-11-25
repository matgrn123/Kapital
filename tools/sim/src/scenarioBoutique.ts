import { chargerBatimentsV1, chargerParametresV1, type Parametres } from "@kapital/content";
import {
  apercuOuvertureBoutique,
  centimes,
  etapeRequisePour,
  evaluerMissions,
  metriquesDepuisGrandLivre,
  moisJeu,
  type ActionMarketing,
  type ProgressionMission,
} from "@kapital/engine";
import { decisionsDuMois, essayer, POLITIQUE, type ResultatScenario } from "./scenarioSolo.js";
import {
  ajouterProduit,
  avancerMois,
  creerEntreprise,
  embaucher,
  fairePublicite,
  ouvrirBoutique,
  serieDeLancement,
  transfererStockBoutique,
  type EtatBanc,
} from "./pilote.js";

// AE-11 : banc prolongé à 36 mois, jusqu'à l'étape 3 et la boutique. Le joueur du scénario solo
// (grossiste, puis atelier et artisans dès l'étape 2) fait aussi de la publicité chaque mois dès
// l'étape 1 (la notoriété est une condition de l'étape 3). Dès l'étape 3 constatée, il ouvre une
// boutique s'il garde sa réserve de sécurité après la signature, embauche un vendeur et y envoie
// chaque mois une part du stock de l'atelier. Sert au garde-fou monétaire (3D-9) et aux missions.

export const POLITIQUE_BOUTIQUE = {
  /** L'emplacement le moins cher du catalogue (choix du joueur). */
  batiment: "boutique_quartier_createurs",
  /** Part du stock de l'atelier envoyée en boutique chaque mois (choix du joueur). */
  partDuStockEnBoutique: 0.5,
  vendeurs: 1,
  /** Publicité chaque mois dès l'étape 1, en centimes (choix du joueur). */
  publiciteMensuelle: 100_000,
  actionPublicite: "publicite" as ActionMarketing,
} as const;

export type OptionsScenarioBoutique = {
  readonly mois?: number;
  readonly graine?: number;
  readonly params?: Parametres;
};

function decisionsMarque(etat: EtatBanc, journal: string[]): EtatBanc {
  const P = POLITIQUE_BOUTIQUE;
  if (etat.entreprise.etape < etapeRequisePour("action_marketing")) return etat;
  // Sans entamer la réserve de sécurité du joueur.
  if (etat.entreprise.tresorerie - P.publiciteMensuelle < POLITIQUE.reserveSecurite) return etat;
  return essayer(etat, fairePublicite(etat, P.actionPublicite, P.publiciteMensuelle), journal, "publicité");
}

function decisionsBoutique(etat: EtatBanc, journal: string[]): EtatBanc {
  const P = POLITIQUE_BOUTIQUE;
  let e = etat;
  if ((e.entreprise.pointsDeVente ?? []).length === 0) {
    if (e.entreprise.etape < etapeRequisePour("ouverture_boutique")) return e;
    // Ouvrir sans découvert : la réserve de sécurité reste en banque après la signature.
    const batiment = chargerBatimentsV1().find((b) => b.id === P.batiment)!;
    const apercu = apercuOuvertureBoutique({
      batiment,
      params: e.params,
      mois: moisJeu(e.mois),
      tresorerie: centimes(e.entreprise.tresorerie),
    });
    if (e.entreprise.tresorerie - apercu.totalALaSignature < POLITIQUE.reserveSecurite) return e;
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

/** Scénario de 36 mois (par défaut) jusqu'à la boutique. Pur : même graine, même résultat. */
export function jouerScenarioBoutique(options: OptionsScenarioBoutique = {}): ResultatScenario {
  const params = options.params ?? chargerParametresV1();
  const graine = options.graine ?? 1;
  const duree = options.mois ?? 36;
  const journal: string[] = [];

  let etat = creerEntreprise({ params, nom: "Banc boutique", gamme: "entree" });
  etat = essayer(etat, ajouterProduit(etat, POLITIQUE.produit, POLITIQUE.prixVenteTtc), journal, "t-shirt au catalogue");
  etat = essayer(etat, serieDeLancement(etat, POLITIQUE.produit), journal, "série de lancement");

  for (let m = 0; m < duree; m++) {
    etat = decisionsDuMois(etat, journal);
    etat = decisionsMarque(etat, journal);
    etat = decisionsBoutique(etat, journal);
    etat = avancerMois(etat, graine * 1000 + m);
  }
  return { etat, journal };
}

/**
 * Missions du banc, avec la règle du site (metriquesDepuisGrandLivre puis evaluerMissions) :
 * grand livre du banc, société créée au mois 0, mois courant = le mois qui suit la dernière
 * clôture, boutiques lues dans l'état du moteur.
 */
export function missionsDuBanc(etat: EtatBanc): readonly ProgressionMission[] {
  const lignes = etat.ecritures.flatMap((e) =>
    e.lignes.map((l) => ({
      ecriture_id: e.id,
      mois_jeu: e.mois,
      libelle: e.libelle,
      compte: l.compte,
      sens: l.sens,
      montant_centimes: l.montant,
    })),
  );
  return evaluerMissions(
    metriquesDepuisGrandLivre(lignes, 0, etat.mois, {
      boutiques: (etat.entreprise.pointsDeVente ?? []).map((p) => ({
        mois_signature: p.moisSignature,
        mois_ouverture: p.moisOuverture,
      })),
      localEnregistre: etat.entreprise.ateliers.length > 0,
    }),
  );
}
