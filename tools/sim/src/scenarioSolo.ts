import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  besoinMatiere,
  centimes,
  coefficientsSalairesDepuisParametres,
  coutEmployeur,
  prixGrossiste,
  quantiteMaxPayable,
} from "@kapital/engine";
import { nombrePostes } from "./atelier.js";
import { FOURNISSEURS, PRODUITS } from "./catalogueBanc.js";
import {
  ajouterProduit,
  avancerMois,
  commanderGrossiste,
  commanderMatiere,
  coutUsine,
  creerEntreprise,
  embaucher,
  fixerProduction,
  poserModules,
  serieDeLancement,
  signerBail,
  type EtatBanc,
  type OptionsAvance,
  type ResultatAction,
} from "./pilote.js";

// AE-8 : scénario solo de 24 mois, de la création aux embauches. Un joueur prudent :
//  - mois 0 : crée sa société, met un t-shirt en vente, reçoit sa série de lancement ;
//  - chaque mois : réassort chez le grossiste (sans entamer une réserve de sécurité) ;
//  - dès l'étape 2 : loue le petit atelier, embauche un artisan par poste, commande le
//    jersey et fixe un objectif de production ; plus tard, pose un poste de plus et embauche.
// Les règles de décision sont des choix de joueur, pas des chiffres du jeu : elles restent
// dans le banc et se lisent dans POLITIQUE.

export const POLITIQUE = {
  produit: "prod_tshirt",
  /** Prix de vente TTC du t-shirt, en centimes (choix du joueur). */
  prixVenteTtc: 3500,
  /** Stock de pièces visé après réassort chez le grossiste. */
  stockVise: 600,
  /** Trésorerie que le joueur garde toujours de côté avant un achat, en centimes. */
  reserveSecurite: 500_000,
  batiment: "petit_atelier",
  /** Fournisseur de jersey une fois l'atelier ouvert (livre en un mois). */
  fournisseurMatiere: "four_fr",
  /** Objectif de production mensuelle par artisan, en pièces (plafonné par la capacité). */
  productionParArtisan: 300,
  /** Mois de la pose d'un poste supplémentaire (si la trésorerie le permet). */
  moisPosteSupplementaire: 14,
} as const;

export type OptionsScenario = {
  readonly mois?: number;
  readonly graine?: number;
  readonly params?: Parametres;
  /** Règle de paiement de la TVA (voir OptionsAvance). */
  readonly tva?: OptionsAvance["tva"];
};

/** Applique une décision si elle est acceptée ; un refus est une décision non prise. */
export function essayer(etat: EtatBanc, r: ResultatAction, journal: string[], libelle: string): EtatBanc {
  if (r.ok) {
    journal.push(`mois ${etat.mois} : ${libelle}`);
    return r.etat;
  }
  journal.push(`mois ${etat.mois} : refus ${libelle} (${r.code})`);
  return etat;
}

function stockFini(etat: EtatBanc): number {
  return etat.entreprise.stocksFinis.reduce((s, l) => s + l.quantite, 0);
}

export function decisionsDuMois(etat: EtatBanc, journal: string[]): EtatBanc {
  const P = POLITIQUE;
  const params = etat.params;
  let e = etat;

  // Étape 2 : l'atelier, puis un artisan par poste libre.
  if (e.entreprise.etape >= 2 && e.entreprise.atelier === null) {
    e = essayer(e, signerBail(e, P.batiment), journal, `bail ${P.batiment}`);
  }
  if (e.entreprise.atelier !== null && e.mois === P.moisPosteSupplementaire) {
    e = essayer(e, poserModules(e, "poste_couture_base", 1), journal, "pose d'un poste de couture");
  }
  if (e.entreprise.atelier !== null) {
    const smic = coefficientsSalairesDepuisParametres(params).smicMensuelBrut;
    let artisans = e.entreprise.salaries.filter((s) => s.poste === "artisan").length;
    while (artisans < nombrePostes(e.modulesPoses)) {
      const r = embaucher(e, "artisan", smic);
      e = essayer(e, r, journal, "embauche d'un artisan au SMIC");
      if (!r.ok) break;
      artisans += 1;
    }
    if (artisans > 0) {
      const objectif = artisans * P.productionParArtisan;
      const actuel = e.entreprise.catalogue.find((p) => p.produit === P.produit)?.productionMensuelleCible;
      if (actuel !== objectif) {
        e = essayer(e, fixerProduction(e, P.produit, objectif), journal, `production ${objectif}/mois`);
      }
      // Jersey : couvrir deux mois d'objectif, en comptant le stock et les commandes en route.
      const fiche = PRODUITS[P.produit]!.fiche;
      const chute = params["taux_chute_matiere_defaut"]?.valeur ?? 0;
      const besoin = besoinMatiere(2 * objectif, fiche, chute);
      const enStock = e.entreprise.stocksMatiere.find((s) => s.matiere === fiche.matiere)?.quantite ?? 0;
      const enRoute = e.commandes
        .filter((c) => !c.livree && c.livraisonMatiere?.matiere === fiche.matiere)
        .reduce((s, c) => s + (c.livraisonMatiere?.quantite ?? 0), 0);
      const manque = Math.ceil(besoin - enStock - enRoute);
      const f = FOURNISSEURS[P.fournisseurMatiere]!.fournisseur;
      const quantite = Math.max(manque, f.minimumCommande);
      if (manque > 0) {
        e = essayer(e, commanderMatiere(e, P.fournisseurMatiere, fiche.matiere, quantite), journal, `jersey ×${quantite}`);
      }
    }
  }

  // Réassort chez le grossiste, sans entamer la réserve (ni la paie du mois qui vient).
  const paie = e.entreprise.salaries.reduce(
    (s, sal) =>
      s + coutEmployeur({ salaireBrutMensuel: centimes(sal.salaireBrutMensuel), ...coefficientsSalairesDepuisParametres(params) }),
    0,
  );
  const disponible = e.entreprise.tresorerie - P.reserveSecurite - paie;
  const prixPiece = prixGrossiste(centimes(coutUsine(params, P.produit)), params);
  // Ce qui manque au stock visé, réduit à ce que la trésorerie disponible paie.
  const q = Math.min(P.stockVise - stockFini(e), quantiteMaxPayable(disponible, prixPiece));
  if (q >= 1) e = essayer(e, commanderGrossiste(e, P.produit, q), journal, `grossiste ×${q}`);
  return e;
}

export type ResultatScenario = {
  readonly etat: EtatBanc;
  readonly journal: readonly string[];
};

/** Joue le scénario solo, mois par mois. Pur : même graine, même résultat. */
export function jouerScenarioSolo(options: OptionsScenario = {}): ResultatScenario {
  const params = options.params ?? chargerParametresV1();
  const duree = options.mois ?? 24;
  const graine = options.graine ?? 1;
  const journal: string[] = [];

  let etat = creerEntreprise({ params, nom: "Banc solo", gamme: "entree" });
  etat = essayer(etat, ajouterProduit(etat, POLITIQUE.produit, POLITIQUE.prixVenteTtc), journal, "t-shirt au catalogue");
  etat = essayer(etat, serieDeLancement(etat, POLITIQUE.produit), journal, "série de lancement");

  for (let m = 0; m < duree; m++) {
    etat = decisionsDuMois(etat, journal);
    etat = avancerMois(etat, graine * 1000 + m, { tva: options.tva });
  }
  return { etat, journal };
}
