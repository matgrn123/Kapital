import { chargerBatimentsV1, chargerParametresV1, type Parametres } from "@kapital/content";
import {
  centimes,
  coefficientsSalairesDepuisParametres,
  moisJeu,
  nouveauBail,
  postesEquipesAteliers,
} from "@kapital/engine";
import { decisionsDuMois, essayer, POLITIQUE, type ResultatScenario } from "./scenarioSolo.js";
import {
  ajouterProduit,
  avancerMois,
  creerEntreprise,
  donnerConge,
  embaucher,
  serieDeLancement,
  signerBail,
  type EtatBanc,
} from "./pilote.js";

// 3D-7 : plusieurs locaux par société. Le joueur du scénario solo loue, une fois installé, un
// deuxième local (même bâtiment), embauche un artisan par poste libre de ce local, puis donne
// congé au deuxième local seulement. Le garde-fou monétaire (3D-9) contrôle chaque clôture.
// Les règles de décision sont des choix de joueur, pas des chiffres du jeu.

export const POLITIQUE_MULTI = {
  batiment: "petit_atelier",
  /** Premier mois où le joueur envisage un deuxième local (choix du joueur). */
  moisDeuxiemeLocal: 8,
  /** Le congé est donné ce nombre de mois après la signature du deuxième local (choix du joueur). */
  moisAvantConge: 6,
} as const;

export type OptionsScenarioMulti = {
  readonly mois?: number;
  readonly graine?: number;
  readonly params?: Parametres;
};

function decisionsLocaux(etat: EtatBanc, journal: string[]): EtatBanc {
  const P = POLITIQUE_MULTI;
  let e = etat;
  const ateliers = e.entreprise.ateliers;

  // Deuxième local : si la réserve de sécurité reste en banque après le dépôt de garantie.
  if (ateliers.length === 1 && e.mois >= P.moisDeuxiemeLocal && !journal.some((l) => l.includes("deuxième local"))) {
    const batiment = chargerBatimentsV1().find((b) => b.id === P.batiment)!;
    const depot = nouveauBail({
      loyerMensuel: centimes(batiment.loyer_mensuel_centimes),
      chargesMensuelles: centimes(batiment.charges_mensuelles_centimes),
      moisSignature: moisJeu(e.mois),
      params: e.params,
    }).depotGarantie;
    if (e.entreprise.tresorerie - depot >= POLITIQUE.reserveSecurite) {
      e = essayer(e, signerBail(e, P.batiment), journal, `deuxième local ${P.batiment}`);
    }
  }

  // Un artisan par poste libre, sur tous les locaux.
  const smic = coefficientsSalairesDepuisParametres(e.params).smicMensuelBrut;
  let artisans = e.entreprise.salaries.filter((s) => s.poste === "artisan").length;
  while (artisans < postesEquipesAteliers(e.entreprise.ateliers)) {
    const r = embaucher(e, "artisan", smic);
    e = essayer(e, r, journal, "embauche d'un artisan (deuxième local)");
    if (!r.ok) break;
    artisans += 1;
  }

  // Congé du deuxième local, et de lui seul.
  const second = e.entreprise.ateliers[1];
  if (second?.bail && second.bail.moisFin === null && e.mois >= second.bail.moisSignature + P.moisAvantConge) {
    e = essayer(e, donnerConge(e, second.id!), journal, "congé du deuxième local");
  }
  return e;
}

/** Scénario de 30 mois (par défaut) avec un deuxième local. Pur : même graine, même résultat. */
export function jouerScenarioMultiLocaux(options: OptionsScenarioMulti = {}): ResultatScenario {
  const params = options.params ?? chargerParametresV1();
  const graine = options.graine ?? 1;
  const duree = options.mois ?? 30;
  const journal: string[] = [];

  let etat = creerEntreprise({ params, nom: "Banc multi-locaux", gamme: "entree" });
  etat = essayer(etat, ajouterProduit(etat, POLITIQUE.produit, POLITIQUE.prixVenteTtc), journal, "t-shirt au catalogue");
  etat = essayer(etat, serieDeLancement(etat, POLITIQUE.produit), journal, "série de lancement");

  for (let m = 0; m < duree; m++) {
    etat = decisionsLocaux(etat, journal);
    etat = decisionsDuMois(etat, journal);
    etat = avancerMois(etat, graine * 1000 + m);
  }
  return { etat, journal };
}
