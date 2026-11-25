import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1, soldeCompte, type GrandLivre } from "../comptabilite/index.js";
import { cloturerMois } from "../moteur/cloture.js";
import { cumulVide } from "../moteur/donneesMois.js";
import { reglesPretDepuis } from "../prets/capacite.js";
import type { Entreprise } from "../types/entreprise.js";
import { centimes, idEntreprise, idPret, moisJeu } from "../types/primitifs.js";
import { ecritureSignatureBail, ecrituresMensuellesBail, nouveauBail } from "./bail.js";
import {
  acheterLocal,
  apportMinimal,
  ecritureAmortissementConstruction,
  ecritureEntretienLocal,
  parametresAchatDepuis,
} from "./achat.js";

const PARAMS = chargerParametresV1();
const REGLES = reglesPretDepuis(PARAMS);
const PETIT = chargerBatimentsV1().find((b) => b.id === "petit_atelier")!;
const BATIMENT = {
  id: PETIT.id,
  surfaceM2: PETIT.surface_m2,
  prixAchat: centimes(PETIT.prix_achat_centimes),
  chargesMensuelles: centimes(PETIT.charges_mensuelles_centimes),
};
const ESTR = REGLES.estrDeSecoursAnnuel;
/** Calculs à la main faits sans prime de risque : on la neutralise ici (testée à part). */
const PARAMS_SANS_PRIME = {
  ...PARAMS,
  pret_prime_risque_endettement_max: { ...PARAMS["pret_prime_risque_endettement_max"]!, valeur: 0 },
  pret_prime_risque_par_mois_decouvert: { ...PARAMS["pret_prime_risque_par_mois_decouvert"]!, valeur: 0 },
};

function demande(o: Partial<Parameters<typeof acheterLocal>[0]> = {}): Parameters<typeof acheterLocal>[0] {
  return {
    idEntreprise: "ent_achat",
    mois: moisJeu(0),
    batiment: BATIMENT,
    apport: undefined,
    dureePretMois: undefined,
    tauxEstrAnnuel: ESTR,
    tresorerie: centimes(100_000_000),
    detteEnCours: centimes(0),
    aDejaUnLocal: false,
    params: PARAMS_SANS_PRIME,
    ...o,
  };
}

function ok(r: ReturnType<typeof acheterLocal>) {
  if (!r.ok) throw new Error(`refus inattendu : ${r.code} ${r.message}`);
  return r;
}

describe("paramètres de l'achat", () => {
  it("lit l'apport minimal (20 %), la durée d'amortissement et la durée du prêt dans les paramètres", () => {
    const p = parametresAchatDepuis(PARAMS);
    expect(p.apportMinimalRatio).toBe(0.2);
    expect(p.dureeAmortissementMois).toBe(300);
    expect(p.dureePretMois).toBe(180);
    // la durée du prêt par défaut reste dans les bornes du prêt immobilier
    expect(p.dureePretMois).toBeGreaterThanOrEqual(REGLES.parObjet.immobilier.dureeMinMois);
    expect(p.dureePretMois).toBeLessThanOrEqual(REGLES.parObjet.immobilier.dureeMaxMois);
  });

  it("l'apport minimal du plus petit local (428 570 €) est de 85 714 €", () => {
    expect(BATIMENT.prixAchat).toBe(42_857_000);
    expect(apportMinimal(BATIMENT.prixAchat, parametresAchatDepuis(PARAMS))).toBe(8_571_400);
  });
});

describe("acheterLocal : décision", () => {
  it("le taux du prêt immobilier inclut la prime de risque (endettement, découvert)", () => {
    const sans = ok(acheterLocal(demande({ params: PARAMS })));
    const p = PARAMS;
    const ratio = sans.montantPret / 100_000_000;
    const primeEndettement = p["pret_prime_risque_endettement_max"]!.valeur *
      Math.min(ratio / p["pret_prime_risque_ratio_endettement_prime_pleine"]!.valeur, 1);
    expect(sans.tauxAnnuel).toBeCloseTo(ESTR + p["pret_marge_estr_immobilier"]!.valeur + primeEndettement, 10);
    const decouvert = ok(acheterLocal(demande({ params: PARAMS, moisDecouvertConsecutifs: 1 })));
    expect(decouvert.tauxAnnuel - sans.tauxAnnuel).toBeCloseTo(p["pret_prime_risque_par_mois_decouvert"]!.valeur, 10);
  });

  it("accepte avec l'apport minimal : prêt immobilier de 80 %, taux = €STR + marge immobilier", () => {
    const r = ok(acheterLocal(demande()));
    expect(r.apport).toBe(8_571_400);
    expect(r.montantPret).toBe(34_285_600);
    expect(r.dureePretMois).toBe(180);
    expect(r.tauxAnnuel).toBeCloseTo(0.0265 + 0.015, 10);
    expect(r.echeancier).toHaveLength(180);
    expect(r.achat).toEqual({
      prixAchat: 42_857_000,
      apport: 8_571_400,
      chargesMensuelles: 105_000,
      moisAchat: 0,
      dureeAmortissementMois: 300,
    });
  });

  it("passe les écritures : 213 au prix, banque pour le prêt puis pour le prix, 164 pour le prêt ; équilibré", () => {
    const r = ok(acheterLocal(demande()));
    let gl: GrandLivre = planComptableV1();
    for (const e of r.ecritures) gl = enregistrer(gl, e);
    expect(soldeCompte(gl, "213")).toBe(42_857_000);
    expect(soldeCompte(gl, "164")).toBe(34_285_600);
    // la banque ne perd que l'apport
    expect(soldeCompte(gl, "512")).toBe(-8_571_400);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("un apport plus élevé réduit le prêt", () => {
    const r = ok(acheterLocal(demande({ apport: centimes(10_000_000) })));
    expect(r.montantPret).toBe(32_857_000);
  });

  it("refuse un apport sous le minimum, avec le manque chiffré", () => {
    const r = acheterLocal(demande({ apport: centimes(5_000_000) }));
    expect(r).toMatchObject({ ok: false, code: "apport_insuffisant", manque: 3_571_400 });
    expect(!r.ok && r.message).toMatch(/85\s?714,00 €/);
  });

  it("refuse si la trésorerie ne couvre pas l'apport, avec le manque chiffré", () => {
    const r = acheterLocal(demande({ tresorerie: centimes(8_000_000), detteEnCours: centimes(0) }));
    expect(r).toMatchObject({ ok: false, code: "tresorerie_insuffisante", manque: 571_400 });
  });

  it("refuse si l'entreprise a déjà un local", () => {
    expect(acheterLocal(demande({ aDejaUnLocal: true }))).toMatchObject({ ok: false, code: "local_deja_detenu" });
  });

  it("respecte la capacité d'emprunt : dette totale au plus 10 fois la trésorerie (refus chiffré du moteur)", () => {
    // trésorerie 9 000 000 : plafond de dette 90 000 000 ; dette en cours 60 000 000 + prêt 34 285 600 = 94 285 600
    const r = acheterLocal(demande({ tresorerie: centimes(9_000_000), detteEnCours: centimes(60_000_000) }));
    expect(r).toMatchObject({ ok: false, code: "endettement_excessif", manque: 4_285_600 });
  });

  it("respecte le plafond d'un prêt immobilier (500 000 €) : le bâtiment industriel exige plus d'apport", () => {
    const gros = chargerBatimentsV1().find((b) => b.id === "batiment_industriel")!;
    const b = { id: gros.id, surfaceM2: gros.surface_m2, prixAchat: centimes(gros.prix_achat_centimes), chargesMensuelles: centimes(gros.charges_mensuelles_centimes) };
    const refus = acheterLocal(demande({ batiment: b, tresorerie: centimes(500_000_000) }));
    // 80 % de 82 286 000 = 65 828 800 > 50 000 000
    expect(refus).toMatchObject({ ok: false, code: "plafond_pret_depasse", manque: 15_828_800 });
    const accepte = ok(acheterLocal(demande({ batiment: b, tresorerie: centimes(500_000_000), apport: centimes(32_286_000) })));
    expect(accepte.montantPret).toBe(50_000_000);
  });

  it("refuse une durée de prêt hors des bornes de l'immobilier", () => {
    expect(acheterLocal(demande({ dureePretMois: 24 }))).toMatchObject({ ok: false, code: "duree_hors_bornes" });
  });
});

describe("amortissement et entretien", () => {
  const achat = ok(acheterLocal(demande())).achat;

  it("pas d'amortissement le mois de l'achat, puis prix / 300 chaque mois (arrondi cumulé exact)", () => {
    expect(ecritureAmortissementConstruction("e", moisJeu(0), achat)).toBeNull();
    const m1 = ecritureAmortissementConstruction("e", moisJeu(1), achat)!;
    // 42 857 000 / 300 = 142 856,67 -> 142 857
    expect(m1.lignes).toEqual([
      { compte: "681", sens: "debit", montant: 142_857 },
      { compte: "2813", sens: "credit", montant: 142_857 },
    ]);
  });

  it("la somme des 300 mensualités est exactement le prix, et rien après", () => {
    let total = 0;
    for (let m = 1; m <= 300; m++) {
      const e = ecritureAmortissementConstruction("e", moisJeu(m), achat);
      total += e?.lignes[0]?.montant ?? 0;
    }
    expect(total).toBe(42_857_000);
    expect(ecritureAmortissementConstruction("e", moisJeu(301), achat)).toBeNull();
  });

  it("l'entretien est passé en 614 au montant du catalogue ; rien si le montant est nul", () => {
    expect(ecritureEntretienLocal("e", moisJeu(3), achat)?.lignes).toEqual([
      { compte: "614", sens: "debit", montant: 105_000 },
      { compte: "512", sens: "credit", montant: 105_000 },
    ]);
    expect(ecritureEntretienLocal("e", moisJeu(3), { ...achat, chargesMensuelles: centimes(0) })).toBeNull();
  });
});

describe("louer ou acheter le même local pendant 24 mois (calcul à la main)", () => {
  /*
   * Local : petit atelier, 150 m2. Catalogue : prix 428 570,00 €, loyer 2 500,00 €/mois,
   * charges 1 050,00 €/mois. Signature au mois 0, puis 24 clôtures (mois 1 à 24).
   * Aucune vente, aucun salarié : seul le local joue. Montants en centimes.
   *
   * LOUER
   *   dépôt de garantie (1 mois de loyer)          250 000   (reste un actif, 275)
   *   loyers      24 x 250 000                    6 000 000  (613)
   *   charges     24 x 105 000                    2 520 000  (614)
   *   charges de l'exercice (résultat)            8 520 000
   *   sortie de banque : 250 000 + 6 000 000 + 2 520 000 = 8 770 000
   *
   * ACHETER (apport 20 %, prêt immobilier 80 % sur 180 mois)
   *   apport      20 % x 42 857 000                8 571 400
   *   prêt        42 857 000 - 8 571 400          34 285 600
   *   taux annuel €STR de secours 2,65 % + marge immobilier 1,5 % = 4,15 %
   *   taux mensuel i = 0,0415 / 12 = 0,00345833...
   *   mensualité  M = 34 285 600 x i / (1 - (1 + i)^-180) = 256 191 (arrondie au centime)
   *   intérêt du mois k = arrondi(capital restant x i), capital remboursé = M - intérêt
   *     (tableau déroulé mois par mois, à part du moteur) :
   *     intérêts des 24 premiers mois               2 710 954  (661)
   *     capital remboursé en 24 mois                3 437 630  (164)
   *     capital restant dû après 24 mois           30 847 970  (34 285 600 - 3 437 630)
   *     décaissé pour le prêt : 24 x 256 191        6 148 584  (= 2 710 954 + 3 437 630)
   *   amortissement de la construction : 42 857 000 / 300 mois = 142 856,67 par mois
   *     24 mois : arrondi(42 857 000 x 24 / 300)    3 428 560  (681 / 2813)
   *     valeur nette du local après 24 mois        39 428 440  (42 857 000 - 3 428 560)
   *   charges d'entretien 24 x 105 000              2 520 000  (614, plus de loyer)
   *   charges de l'exercice : 2 520 000 + 3 428 560 + 2 710 954 = 8 659 514
   *   sortie de banque : 8 571 400 + 2 520 000 + 6 148 584 = 17 239 984
   *
   * ÉCARTS (acheter - louer)
   *   résultat : 8 659 514 - 8 520 000 = 139 514 de charges en plus (l'achat coûte
   *     139 514 centimes de plus en résultat sur 24 mois, soit 1 395,14 €)
   *   banque : 17 239 984 - 8 770 000 = 8 469 984 de plus décaissés
   *   patrimoine (actif - dettes) : la variation est égale au résultat dans les deux cas
   *     (louer : -8 520 000 ; acheter : -8 659 514), donc le même écart de 139 514.
   *     Acheter : banque -17 239 984 + local 39 428 440 - dette 30 847 970 = -8 659 514.
   *     Louer : banque -8 770 000 + dépôt 250 000 = -8 520 000.
   */
  const MOIS = 24;
  const tresoDepart = centimes(100_000_000);

  function base(o: Partial<Entreprise>): Entreprise {
    return {
      id: idEntreprise("ent_achat"),
      nom: "Murs SAS",
      gamme: "milieu",
      etape: 2,
      proprietaire: { type: "pnj" },
      statut: "active",
      tresorerie: tresoDepart,
      stocksMatiere: [],
      stocksFinis: [],
      salaries: [],
      atelier: null,
      marque: { notoriete: 50, desirabilite: 50 },
      prets: [],
      catalogue: [],
      ...o,
    };
  }

  function derouler(depart: Entreprise, glDepart: GrandLivre): { gl: GrandLivre; fin: Entreprise } {
    let gl = glDepart;
    let e = depart;
    for (let m = 1; m <= MOIS; m++) {
      const r = cloturerMois(
        e,
        cumulVide(moisJeu(m), e.tresorerie),
        { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 },
        PARAMS,
        moisJeu(m),
      );
      for (const ec of r.ecritures) gl = enregistrer(gl, ec);
      e = r.entrepriseApres;
    }
    return { gl, fin: e };
  }

  function louer() {
    const bail = nouveauBail({
      loyerMensuel: centimes(PETIT.loyer_mensuel_centimes),
      chargesMensuelles: centimes(PETIT.charges_mensuelles_centimes),
      moisSignature: moisJeu(0),
      params: PARAMS,
    });
    const signature = ecritureSignatureBail("ent_achat", moisJeu(0), bail);
    const gl = enregistrer(planComptableV1(), signature);
    const e = base({
      tresorerie: centimes(tresoDepart - bail.depotGarantie),
      atelier: { surfaceM2: PETIT.surface_m2, loyerMensuel: centimes(PETIT.loyer_mensuel_centimes), nombreMachines: 0, bail },
    });
    return derouler(e, gl);
  }

  function acheter() {
    const r = ok(acheterLocal(demande()));
    let gl = planComptableV1();
    for (const ec of r.ecritures) gl = enregistrer(gl, ec);
    const e = base({
      tresorerie: centimes(tresoDepart - r.apport),
      atelier: { surfaceM2: PETIT.surface_m2, loyerMensuel: centimes(0), nombreMachines: 0, achat: r.achat },
      prets: [
        {
          id: idPret("pret_achat"),
          objet: "immobilier",
          capitalInitial: r.montantPret,
          capitalRestant: r.montantPret,
          tauxAnnuel: r.tauxAnnuel,
          dureeTotaleMois: r.dureePretMois,
          moisDebut: moisJeu(0),
        },
      ],
    });
    return derouler(e, gl);
  }

  it("louer : loyers, charges, dépôt gardé, banque et résultat comme à la main", () => {
    const { gl, fin } = louer();
    expect(soldeCompte(gl, "613")).toBe(6_000_000);
    expect(soldeCompte(gl, "614")).toBe(2_520_000);
    expect(soldeCompte(gl, "275")).toBe(250_000);
    expect(soldeCompte(gl, "512")).toBe(-8_770_000);
    expect(soldeCompte(gl, "213")).toBe(0);
    expect(enEquilibre(gl)).toBe(true);
    expect(fin.tresorerie).toBe(tresoDepart - 8_770_000);
  });

  it("acheter : 213, amortissement, intérêts, capital restant, banque comme à la main", () => {
    const { gl, fin } = acheter();
    expect(soldeCompte(gl, "613")).toBe(0);
    expect(soldeCompte(gl, "614")).toBe(2_520_000);
    expect(soldeCompte(gl, "681")).toBe(3_428_560);
    expect(soldeCompte(gl, "2813")).toBe(3_428_560);
    expect(soldeCompte(gl, "213")).toBe(42_857_000);
    expect(soldeCompte(gl, "661")).toBe(2_710_954);
    expect(soldeCompte(gl, "164")).toBe(30_847_970);
    expect(soldeCompte(gl, "512")).toBe(-17_239_984);
    expect(enEquilibre(gl)).toBe(true);
    expect(fin.tresorerie).toBe(tresoDepart - 17_239_984);
    expect(fin.prets[0]?.capitalRestant).toBe(30_847_970);
  });

  it("écarts acheter - louer : +139 514 de charges, +8 469 984 de banque, même écart de patrimoine", () => {
    const l = louer().gl;
    const a = acheter().gl;
    const chargesLouer = soldeCompte(l, "613") + soldeCompte(l, "614") + soldeCompte(l, "661") + soldeCompte(l, "681");
    const chargesAcheter = soldeCompte(a, "613") + soldeCompte(a, "614") + soldeCompte(a, "661") + soldeCompte(a, "681");
    expect(chargesLouer).toBe(8_520_000);
    expect(chargesAcheter).toBe(8_659_514);
    expect(chargesAcheter - chargesLouer).toBe(139_514);
    expect(soldeCompte(l, "512") - soldeCompte(a, "512")).toBe(8_469_984);

    const patrimoine = (gl: GrandLivre) =>
      soldeCompte(gl, "512") + soldeCompte(gl, "275") + soldeCompte(gl, "213") - soldeCompte(gl, "2813") - soldeCompte(gl, "164");
    expect(patrimoine(l)).toBe(-8_520_000);
    expect(patrimoine(a)).toBe(-8_659_514);
  });

  it("le loyer n'est plus payé une fois propriétaire (aucune écriture 613)", () => {
    const e = ecrituresMensuellesBail("ent_achat", moisJeu(1), centimes(0), centimes(0));
    expect(e).toHaveLength(0);
  });
});
