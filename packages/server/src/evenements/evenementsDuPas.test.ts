import {
  centimes,
  cumulVide,
  idEntreprise,
  idMatiere,
  idProduit,
  moisJeu,
  type DonneesFlux,
  type EcritureComptable,
  type Entreprise,
  type PointDeVente,
  type ResultatSimulerPas,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { evenementMissionValidee, evenementsDuPas, paiementsDeCloture } from "./evenementsDuPas.js";
import type { DetailCloture } from "./types.js";

const TSHIRT = idProduit("prod_tshirt");
const SAC = idProduit("prod_sac_toile");

function entreprise(surcharge: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_A"),
    nom: "A",
    gamme: "milieu",
    etape: 0,
    proprietaire: { type: "joueur", idProfil: "p" },
    statut: "active",
    tresorerie: centimes(1_000_000),
    stocksMatiere: [],
    stocksFinis: [{ produit: TSHIRT, quantite: 10, valeurTotale: centimes(10_000) }],
    salaries: [],
    ateliers: [],
    marque: { notoriete: 10, desirabilite: 10 },
    prets: [],
    catalogue: [],
    ...surcharge,
  };
}

const FLUX_VIDE: DonneesFlux = {
  livraisonsMatiere: [],
  livraisonsFaconniers: [],
  depensesMarketing: [],
  creancesAEncaisser: [],
};

function resultat(apres: Entreprise, surcharge: Partial<ResultatSimulerPas> = {}): ResultatSimulerPas {
  return { entrepriseApres: apres, cumul: null, ecrituresDuPas: [], cloture: null, ...surcharge };
}

const CTX = { flux: FLUX_VIDE, cumulAvant: null, mois: 3, pasAbsolu: 5000, instantMs: 1_700_000_000_000 };

describe("evenementsDuPas : un pas sans histoire", () => {
  it("ne produit aucun événement quand rien ne change", () => {
    const e = entreprise();
    expect(evenementsDuPas(e, e, resultat(e), CTX)).toEqual([]);
  });
});

describe("evenementsDuPas : livraisons et encaissements", () => {
  it("une livraison de matière et une de production donnent un événement chacune, avec une clé par commande", () => {
    const e = entreprise();
    const flux: DonneesFlux = {
      ...FLUX_VIDE,
      livraisonsMatiere: [
        { id: "cmd1", matiere: idMatiere("mat_jersey_coton"), quantite: 300, prixUnitaire: centimes(350), modePaiement: "credit" },
      ],
      livraisonsFaconniers: [
        { id: "ord1", produit: TSHIRT, quantite: 120, prixFaconParPiece: centimes(500), matiereDuJoueur: null },
      ],
    };
    const evs = evenementsDuPas(e, e, resultat(e), { ...CTX, flux });
    expect(evs.map((x) => [x.type, x.cle])).toEqual([
      ["livraison_matiere", "livraison_matiere_cmd1"],
      ["livraison_production", "livraison_production_ord1"],
    ]);
    expect(evs[0]!.detail).toMatchObject({ matiere: "mat_jersey_coton", quantite: 300, montant: 105_000, aCredit: true });
    expect(evs[1]!.detail).toMatchObject({ produit: "prod_tshirt", quantite: 120 });
    expect(evs[0]).toMatchObject({ moisJeu: 3, pas: 5000, instantMs: 1_700_000_000_000 });
  });

  it("les créances revendeurs encaissées donnent un seul événement par mois, avec le total", () => {
    const e = entreprise();
    const flux: DonneesFlux = {
      ...FLUX_VIDE,
      creancesAEncaisser: [
        { ecritureId: "v1", montant: centimes(36_000) },
        { ecritureId: "v2", montant: centimes(14_000) },
      ],
    };
    const evs = evenementsDuPas(e, e, resultat(e), { ...CTX, flux });
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: "creance_encaissee", cle: "creances_3", detail: { montant: 50_000, nombre: 2 } });
  });
});

describe("evenementsDuPas : alertes", () => {
  it("rupture de stock quand un produit passe de positif à zéro, une clé par produit et par mois", () => {
    const avant = entreprise({
      stocksFinis: [
        { produit: TSHIRT, quantite: 2, valeurTotale: centimes(2000) },
        { produit: SAC, quantite: 5, valeurTotale: centimes(5000) },
      ],
    });
    const apres = entreprise({
      stocksFinis: [
        { produit: TSHIRT, quantite: 0, valeurTotale: centimes(0) },
        { produit: SAC, quantite: 4, valeurTotale: centimes(4000) },
      ],
    });
    const evs = evenementsDuPas(avant, apres, resultat(apres), CTX);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: "rupture_stock", cle: "rupture_3_prod_tshirt", detail: { produit: "prod_tshirt", lieu: "atelier" } });
  });

  it("un stock déjà à zéro ne redonne pas de rupture", () => {
    const vide = entreprise({ stocksFinis: [] });
    expect(evenementsDuPas(vide, vide, resultat(vide), CTX)).toEqual([]);
  });

  it("rupture en boutique, distincte de celle de l'atelier", () => {
    const pdv = (q: number): PointDeVente =>
      ({ id: "pdv1", stock: [{ produit: TSHIRT, quantite: q, valeurTotale: centimes(q * 1000) }] }) as unknown as PointDeVente;
    const avant = entreprise({ pointsDeVente: [pdv(3)] });
    const apres = entreprise({ pointsDeVente: [pdv(0)] });
    const evs = evenementsDuPas(avant, apres, resultat(apres), CTX);
    expect(evs.map((x) => x.cle)).toEqual(["rupture_3_pdv1_prod_tshirt"]);
    expect(evs[0]!.detail).toMatchObject({ lieu: "boutique", pointDeVente: "pdv1" });
  });

  it("découvert quand la banque passe sous zéro, une fois par mois", () => {
    const avant = entreprise({ tresorerie: centimes(500) });
    const apres = entreprise({ tresorerie: centimes(-1200) });
    const evs = evenementsDuPas(avant, apres, resultat(apres), CTX);
    expect(evs).toEqual([
      expect.objectContaining({ type: "decouvert", cle: "decouvert_3", detail: { tresorerie: -1200 } }),
    ]);
    // Déjà à découvert : rien de nouveau.
    expect(evenementsDuPas(apres, apres, resultat(apres), CTX)).toEqual([]);
  });

  it("étape franchie, une seule fois par étape", () => {
    const avant = entreprise({ etape: 1 });
    const apres = entreprise({ etape: 2 });
    const evs = evenementsDuPas(avant, apres, resultat(apres), CTX);
    expect(evs).toEqual([
      expect.objectContaining({ type: "etape_franchie", cle: "etape_2", titre: "Étape 2 franchie" }),
    ]);
  });
});

describe("evenementsDuPas : clôture du mois", () => {
  const m = moisJeu(3);
  const ecrituresCloture: EcritureComptable[] = [
    {
      id: "salaire_3_s1",
      mois: m,
      libelle: "Paie",
      lignes: [
        { compte: "641", sens: "debit", montant: centimes(186_702) },
        { compte: "645", sens: "debit", montant: centimes(10_000) },
        { compte: "421", sens: "credit", montant: centimes(186_702) },
        { compte: "431", sens: "credit", montant: centimes(10_000) },
      ],
    },
    {
      id: "salaire_pmt_3_s1",
      mois: m,
      libelle: "Paiement",
      lignes: [
        { compte: "421", sens: "debit", montant: centimes(186_702) },
        { compte: "431", sens: "debit", montant: centimes(10_000) },
        { compte: "512", sens: "credit", montant: centimes(196_702) },
      ],
    },
    {
      id: "loyer_3_ent_A",
      mois: m,
      libelle: "Loyer",
      lignes: [
        { compte: "613", sens: "debit", montant: centimes(250_000) },
        { compte: "512", sens: "credit", montant: centimes(250_000) },
      ],
    },
    {
      id: "tva_paiement_3_ent_A",
      mois: m,
      libelle: "TVA",
      lignes: [
        { compte: "44551", sens: "debit", montant: centimes(6_000) },
        { compte: "512", sens: "credit", montant: centimes(6_000) },
      ],
    },
  ];
  const venteDuPas: EcritureComptable = {
    id: "vente_p1439",
    mois: m,
    libelle: "Vente",
    lignes: [
      { compte: "512", sens: "debit", montant: centimes(3_600) },
      { compte: "707", sens: "credit", montant: centimes(3_000) },
      { compte: "44571", sens: "credit", montant: centimes(600) },
    ],
  };

  it("classe les paiements de la clôture par nature", () => {
    expect(paiementsDeCloture(ecrituresCloture)).toEqual({
      paie: 196_702,
      loyers: 250_000,
      echeances: 0,
      tva: 6_000,
      impot: 0,
      agios: 0,
      energie: 0,
      autres: 0,
    });
  });

  it("enregistre la clôture avec les explications du moteur, le résultat et les ventes perdues", () => {
    const avant = entreprise({ etape: 0 });
    const apres = entreprise({ etape: 1, tresorerie: centimes(560_898) });
    const cumulAvant = {
      ...cumulVide(m, centimes(1_000_000)),
      pasTraites: 1439,
      chiffreAffairesHt: 100_000,
      agregats: { tvaCollectee: 20_000, net512: 0, produits: 100_000, charges: 40_000 },
    };
    const r = resultat(apres, {
      ecrituresDuPas: [venteDuPas, ...ecrituresCloture],
      cloture: {
        entrepriseApres: apres,
        ecritures: ecrituresCloture,
        ventesPerdues: [{ produit: TSHIRT, quantiteDemandee: 50, quantiteServie: 30 }],
        explications: [
          { cle: "tresorerie", message: "Trésorerie : 10 000 € → 5 608,98 €" },
          { cle: "ventes_perdues", message: "Stock insuffisant : 20 pièces non livrées" },
        ],
        moisDecouvertConsecutifsApres: 0,
        etapeApres: 1,
      },
    });
    const evs = evenementsDuPas(avant, apres, r, { ...CTX, cumulAvant });
    const cloture = evs.find((x) => x.type === "cloture_mois")!;
    expect(cloture.cle).toBe("cloture_3");
    const d = cloture.detail as unknown as DetailCloture;
    expect(d.tresorerieDebut).toBe(1_000_000);
    expect(d.tresorerieFin).toBe(560_898);
    expect(d.chiffreAffairesHt).toBe(103_000);
    expect(d.produits).toBe(103_000);
    // 40 000 déjà passés + paie 196 702 + loyer 250 000
    expect(d.charges).toBe(486_702);
    expect(d.resultat).toBe(103_000 - 486_702);
    expect(d.totalPaye).toBe(452_702);
    expect(d.piecesNonLivrees).toBe(20);
    expect(d.ventesPerdues).toEqual([{ produit: "prod_tshirt", manquantes: 20 }]);
    expect(d.explications.map((x) => x.cle)).toEqual(["tresorerie", "ventes_perdues"]);
    expect(d.etapeAvant).toBe(0);
    expect(d.etapeApres).toBe(1);
    // L'étape franchie à la clôture est aussi un événement.
    expect(evs.map((x) => x.type)).toContain("etape_franchie");
  });

  it("deux appels identiques donnent les mêmes événements (fonction pure)", () => {
    const avant = entreprise({ tresorerie: centimes(10) });
    const apres = entreprise({ tresorerie: centimes(-10), stocksFinis: [] });
    expect(evenementsDuPas(avant, apres, resultat(apres), CTX)).toEqual(
      evenementsDuPas(avant, apres, resultat(apres), CTX),
    );
  });
});

describe("evenementMissionValidee", () => {
  it("une clé par mission, hors du pas", () => {
    const ev = evenementMissionValidee({ missionId: "mission1", titreMission: "Vendre 50 pièces", moisJeu: 2, instantMs: 1 });
    expect(ev).toMatchObject({ type: "mission_validee", cle: "mission_mission1", pas: null, moisJeu: 2 });
  });
});
