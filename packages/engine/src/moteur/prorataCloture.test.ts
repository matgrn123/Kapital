import { chargerBatimentsV1, chargerModulesV1, chargerParametresV1, type TypeBatiment } from "@kapital/content";
import { describe, expect, it } from "vitest";
import {
  enEquilibre,
  enregistrer,
  planComptableV1,
  soldeCompte,
  type EcritureComptable,
} from "../comptabilite/index.js";
import { postesALaSignature } from "../atelier/effetsPlan.js";
import { nouveauPointDeVente, passantsReferenceBoutiques } from "../boutique/boutique.js";
import type { Atelier, Entreprise, Salarie } from "../types/entreprise.js";
import { centimes, idEntreprise, idSalarie, moisJeu } from "../types/primitifs.js";
import { cloturerMois } from "./cloture.js";
import { cumulVide } from "./donneesMois.js";
import { debutDuMoisMs, finDuMoisMs, indexDuMois } from "./temps.js";

// Lot T4 (horloge réelle, décision de Mathieu) : le premier mois d'une embauche ou d'un bail
// signé en cours de mois est payé au prorata des jours civils restants (jour de l'embauche ou
// de la signature compris). Salaire et cotisations, loyer et charges, énergie de l'atelier.

const PARAMS = chargerParametresV1();
const MODULES = chargerModulesV1();
const BATIMENTS = chargerBatimentsV1();
const FIN = { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 };

const NOVEMBRE = indexDuMois(2026, 11);
const DECEMBRE = indexDuMois(2026, 12);
const FEVRIER_2027 = indexDuMois(2027, 2);
/** Samedi 21 novembre 2026, 10 h à Paris (9 h UTC) : 10 jours restants sur 30. */
const LE_21_NOVEMBRE = Date.UTC(2026, 10, 21, 9, 0);

function salarie(o: Partial<Salarie> = {}): Salarie {
  return {
    id: idSalarie("sal_1"),
    poste: "artisan",
    salaireBrutMensuel: centimes(200_000),
    ancienneteMois: 0,
    experienceMois: 0,
    ...o,
  };
}

function atelier(o: Partial<Atelier> = {}): Atelier {
  return {
    surfaceM2: 150,
    loyerMensuel: centimes(250_000),
    // deux postes posés : 2 × 100 kWh × 0,16 € = 32 € d'énergie par mois
    modules: postesALaSignature(2, MODULES),
    bail: { depotGarantie: centimes(250_000), chargesMensuelles: centimes(105_000), moisSignature: NOVEMBRE, moisFin: null },
    ...o,
  };
}

function entreprise(o: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_prorata"),
    nom: "Prorata SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(5_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    ateliers: [],
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [],
    ...o,
  };
}

function cloturer(e: Entreprise, mois: number) {
  return cloturerMois(e, cumulVide(moisJeu(mois), e.tresorerie), FIN, PARAMS, moisJeu(mois));
}

/** Grand livre ouvert avec la banque de l'entreprise, puis les écritures de la clôture. */
function grandLivre(e: Entreprise, ecritures: readonly EcritureComptable[]) {
  let gl = enregistrer(planComptableV1(), {
    id: "ouverture",
    mois: moisJeu(NOVEMBRE),
    libelle: "Ouverture",
    lignes: [
      { compte: "512", sens: "debit", montant: e.tresorerie },
      { compte: "101", sens: "credit", montant: e.tresorerie },
    ],
  });
  const equilibres: boolean[] = [];
  for (const ecriture of ecritures) {
    gl = enregistrer(gl, ecriture);
    equilibres.push(enEquilibre(gl));
  }
  return { gl, equilibres };
}

const montant = (ecritures: readonly EcritureComptable[], id: string, compte: string) =>
  ecritures.find((x) => x.id.startsWith(id))?.lignes.find((l) => l.compte === compte)?.montant;

describe("salaire du premier mois au prorata", () => {
  it("embauche le 21 novembre à 2 000 € brut : 10/30 du salaire et des cotisations à la clôture de novembre", () => {
    const e = entreprise({ salaries: [salarie({ embaucheMs: LE_21_NOVEMBRE })] });
    const r = cloturer(e, NOVEMBRE);
    // Salaire : 2 000 € × 10/30 = 666,67 €. Cotisations patronales : taux de 7,868 % (lu sur le
    // salaire mensuel, 1,07 SMIC) × 2 000 € × 10/30 = 52,45 € (au lieu de 157,36 € sur un mois).
    expect(montant(r.ecritures, "salaire_", "641")).toBe(66_667);
    expect(montant(r.ecritures, "salaire_", "645")).toBe(5245);
    expect(montant(r.ecritures, "salaire_pmt_", "512")).toBe(66_667 + 5245);
    const { gl, equilibres } = grandLivre(e, r.ecritures);
    expect(equilibres.every(Boolean)).toBe(true);
    expect(soldeCompte(gl, "421")).toBe(0);
    expect(soldeCompte(gl, "431")).toBe(0);
    expect(r.entrepriseApres.tresorerie).toBe(5_000_000 - 66_667 - 5245);
    expect(r.explications.find((x) => x.cle === "salaires")?.message).toMatch(/666,67/);
    expect(r.explications.find((x) => x.cle === "salaires")?.message).toMatch(/prorata/);
  });

  it("le mois suivant, le salaire est payé en entier", () => {
    const e = entreprise({ salaries: [salarie({ embaucheMs: LE_21_NOVEMBRE })] });
    const r = cloturer(e, DECEMBRE);
    expect(montant(r.ecritures, "salaire_", "641")).toBe(200_000);
    expect(montant(r.ecritures, "salaire_", "645")).toBe(15_736);
    expect(r.explications.find((x) => x.cle === "salaires")?.message).not.toMatch(/prorata/);
  });

  it("embauché le 1er à minuit, ou date d'embauche inconnue : mois entier (comme avant)", () => {
    for (const s of [salarie({ embaucheMs: debutDuMoisMs(NOVEMBRE) }), salarie()]) {
      const r = cloturer(entreprise({ salaries: [s] }), NOVEMBRE);
      expect(montant(r.ecritures, "salaire_", "641")).toBe(200_000);
      expect(montant(r.ecritures, "salaire_", "645")).toBe(15_736);
    }
  });

  it("février 2027 (28 jours), embauche le 15 : 14/28, soit la moitié", () => {
    const e = entreprise({ salaries: [salarie({ embaucheMs: Date.UTC(2027, 1, 15, 8, 0) })] });
    const r = cloturer(e, FEVRIER_2027);
    expect(montant(r.ecritures, "salaire_", "641")).toBe(100_000);
    expect(montant(r.ecritures, "salaire_", "645")).toBe(7868);
  });

  it("embauché après la fin du mois clôturé (clôture rattrapée) : aucune paie pour ce mois", () => {
    const e = entreprise({ salaries: [salarie({ embaucheMs: finDuMoisMs(NOVEMBRE) + 3_600_000 })] });
    const r = cloturer(e, NOVEMBRE);
    expect(r.ecritures.some((x) => x.id.startsWith("salaire_"))).toBe(false);
    expect(r.entrepriseApres.tresorerie).toBe(5_000_000);
  });

  it("deux salariés : l'ancien payé en entier, le nouveau au prorata", () => {
    const e = entreprise({
      salaries: [salarie({ id: idSalarie("ancien") }), salarie({ id: idSalarie("nouveau"), embaucheMs: LE_21_NOVEMBRE })],
    });
    const r = cloturer(e, NOVEMBRE);
    expect(montant(r.ecritures, `salaire_${NOVEMBRE}_ancien`, "641")).toBe(200_000);
    expect(montant(r.ecritures, `salaire_${NOVEMBRE}_nouveau`, "641")).toBe(66_667);
    expect(r.explications.find((x) => x.cle === "salaires")?.message).toMatch(/2 666,67/);
  });
});

describe("loyer, charges et énergie du premier mois au prorata", () => {
  it("bail signé le 21 novembre : 10/30 du loyer, des charges et de l'énergie", () => {
    const e = entreprise({ ateliers: [atelier({ bail: { ...atelier().bail!, signatureMs: LE_21_NOVEMBRE } })] });
    const r = cloturer(e, NOVEMBRE);
    // 2 500 € × 10/30 = 833,33 € ; 1 050 € × 10/30 = 350 € ; 32 € × 10/30 = 10,67 €
    expect(montant(r.ecritures, "loyer_", "613")).toBe(83_333);
    expect(montant(r.ecritures, "charges_locatives_", "614")).toBe(35_000);
    expect(montant(r.ecritures, "energie_", "606")).toBe(1067);
    const { equilibres } = grandLivre(e, r.ecritures);
    expect(equilibres.every(Boolean)).toBe(true);
    expect(r.entrepriseApres.tresorerie).toBe(5_000_000 - 83_333 - 35_000 - 1067);
    expect(r.explications.find((x) => x.cle === "loyer")?.message).toMatch(/833,33/);
  });

  it("le mois suivant : loyer, charges et énergie entiers", () => {
    const e = entreprise({ ateliers: [atelier({ bail: { ...atelier().bail!, signatureMs: LE_21_NOVEMBRE } })] });
    const r = cloturer(e, DECEMBRE);
    expect(montant(r.ecritures, "loyer_", "613")).toBe(250_000);
    expect(montant(r.ecritures, "charges_locatives_", "614")).toBe(105_000);
    expect(montant(r.ecritures, "energie_", "606")).toBe(3200);
  });

  it("bail sans date de signature (ancien local, banc d'essai) : mois entier", () => {
    const r = cloturer(entreprise({ ateliers: [atelier()] }), NOVEMBRE);
    expect(montant(r.ecritures, "loyer_", "613")).toBe(250_000);
    expect(montant(r.ecritures, "energie_", "606")).toBe(3200);
  });

  it("l'amortissement du matériel n'est pas proratisé (il suit le matériel, pas le bail)", () => {
    const sans = cloturer(entreprise({ ateliers: [atelier()] }), NOVEMBRE);
    const avec = cloturer(
      entreprise({ ateliers: [atelier({ bail: { ...atelier().bail!, signatureMs: LE_21_NOVEMBRE } })] }),
      NOVEMBRE,
    );
    expect(montant(avec.ecritures, "amort_", "681")).toBe(montant(sans.ecritures, "amort_", "681"));
  });

  it("boutique signée le 21 novembre : 10/30 du loyer et des charges", () => {
    const batiment = BATIMENTS.find((b) => b.id === "boutique_quartier_createurs") as TypeBatiment;
    const pdv = nouveauPointDeVente({
      id: "pdv_1",
      batiment,
      mois: moisJeu(NOVEMBRE),
      instantMs: LE_21_NOVEMBRE,
      params: PARAMS,
      passantsReference: passantsReferenceBoutiques(BATIMENTS),
    });
    expect(pdv.signatureMs).toBe(LE_21_NOVEMBRE);
    const e = entreprise({ pointsDeVente: [pdv] });
    const r = cloturer(e, NOVEMBRE);
    // 765 € × 10/30 = 255 € ; 112,50 € × 10/30 = 37,50 €
    expect(montant(r.ecritures, "boutique_loyer_", "613")).toBe(25_500);
    expect(montant(r.ecritures, "boutique_charges_", "614")).toBe(3750);
    expect(grandLivre(e, r.ecritures).equilibres.every(Boolean)).toBe(true);

    const decembre = cloturer(e, DECEMBRE);
    expect(montant(decembre.ecritures, "boutique_loyer_", "613")).toBe(76_500);
    expect(montant(decembre.ecritures, "boutique_charges_", "614")).toBe(11_250);
  });
});
