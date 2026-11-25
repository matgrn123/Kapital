import { chargerParametresV1, type Parametres } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1 } from "../comptabilite/index.js";
import type { EcritureComptable } from "../comptabilite/types.js";
import type { Entreprise } from "../types/entreprise.js";
import type { MarketInputs } from "../types/marketInputs.js";
import {
  centimes,
  graine,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  idSalarie,
  moisJeu,
  type MoisJeu,
} from "../types/primitifs.js";
import {
  cumulDemarrantAuPas,
  type CumulMois,
  type DonneesFinMois,
  type DonneesFlux,
  type DonneesReellesMois,
  type ResultatClotureEntreprise,
} from "./donneesMois.js";
import { simulerPas } from "./pas.js";
import { simulerMoisEntreprise } from "./simulerMois.js";
import { configTempsDepuis } from "./temps.js";

// ---------------------------------------------------------------------------
// Scénario
// ---------------------------------------------------------------------------

const PARAMS_REELS = chargerParametresV1();
const G = graine(42);
// Les scénarios courants tournent avec un pas de 10 minutes (144 pas par mois) pour
// rester rapides ; un test dédié rejoue le rythme réel (1 minute, 1440 pas par mois).
const NB_PAS = configTempsDepuis(paramsNeutres()).pasParMois; // 144

/**
 * Paramètres « neutres » : marché petit (environ 150 pièces vendues en direct
 * par mois, donc 1 à 3 pièces par pas) et jauges de marque qui ne bougent pas.
 * Dans ces conditions, avancer d'un bloc ou pas à pas doit donner exactement
 * les mêmes comptes.
 */
function paramsNeutres(minutesParPas = 10): Parametres {
  const p: Parametres = { ...PARAMS_REELS };
  const fixer = (cle: string, valeur: number) => {
    p[cle] = { ...PARAMS_REELS[cle]!, valeur };
  };
  fixer("taille_marche_mois_milieu", 1500);
  fixer("decroissance_notoriete_mois", 0);
  fixer("decroissance_desirabilite_mois", 0);
  fixer("temps_minutes_reelles_par_pas", minutesParPas);
  return p;
}

const MARKET: MarketInputs = {
  mois: moisJeu(0),
  smicHoraireBrut: centimes(1231),
  tauxEstrAnnuel: 0.035,
  prixElectriciteParKwh: centimes(16),
  coursCotonParKg: centimes(180),
  inflationMensuelle: 0.002,
};

const PRODUIT = idProduit("prod_tshirt");
const MATIERE = idMatiere("mat_coton");

/**
 * Coût moyen constant à 15 € la pièce : la matière coûte 15 € l'unité et la
 * production consomme 1 unité par pièce. Le coût moyen pondéré ne bouge donc
 * pas pendant le mois, ce qui isole ce que l'on teste (le découpage du temps).
 */
function entrepriseDeTest(surcharge: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise("ent_a"),
    nom: "Atelier A",
    gamme: "milieu",
    etape: 1,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(5_000_000),
    stocksMatiere: [{ matiere: MATIERE, quantite: 1000, valeurTotale: centimes(1_500_000) }],
    stocksFinis: [{ produit: PRODUIT, quantite: 2000, valeurTotale: centimes(3_000_000) }],
    salaries: [1, 2, 3].map((i) => ({
      id: idSalarie(`s${i}`),
      poste: "artisan" as const,
      salaireBrutMensuel: centimes(186702),
      ancienneteMois: 6,
      experienceMois: 6,
    })),
    atelier: { surfaceM2: 150, loyerMensuel: centimes(250_000), nombreMachines: 3 },
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [
      {
        id: idPret("p1"),
        capitalInitial: centimes(1_000_000),
        capitalRestant: centimes(1_000_000),
        tauxAnnuel: 0.04,
        dureeTotaleMois: 24,
        objet: "tresorerie",
        moisDebut: moisJeu(0),
      },
    ],
    catalogue: [
      {
        produit: PRODUIT,
        qualiteVisee: 60,
        prix: { vente_directe: centimes(3000), revendeur: centimes(1800) },
        productionMensuelleCible: 60,
      },
    ],
    ...surcharge,
  };
}

const FLUX_VIDE: DonneesFlux = {
  livraisonsMatiere: [],
  livraisonsFaconniers: [],
  depensesMarketing: [],
  creancesAEncaisser: [],
};
const FIN_VIDE: DonneesFinMois = { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 };

type Trace = {
  readonly entreprisesParPas: readonly Entreprise[];
  readonly cumulsParPas: readonly (CumulMois | null)[];
  readonly ecrituresParPas: readonly (readonly EcritureComptable[])[];
  /** Toutes les écritures du mois, flux de chaque pas puis clôture. */
  readonly ecrituresDuMois: readonly EcritureComptable[];
  readonly cloture: ResultatClotureEntreprise;
};

type OptionsMois = {
  readonly params?: Parametres;
  readonly mois?: MoisJeu;
  readonly fluxDuPas?: (index: number) => DonneesFlux;
  readonly fin?: DonneesFinMois;
  /** Simule le serveur : tout l'état passe par du JSON entre deux pas. */
  readonly viaJson?: boolean;
};

/** Joue un mois complet, pas par pas, comme le fera le serveur (TP-2). */
function jouerUnMois(depart: Entreprise, o: OptionsMois = {}): Trace {
  const params = o.params ?? paramsNeutres();
  const nbPas = configTempsDepuis(params).pasParMois;
  const mois = o.mois ?? moisJeu(1);
  let ent = depart;
  let cumul: CumulMois | null = null;
  const entreprisesParPas: Entreprise[] = [];
  const cumulsParPas: (CumulMois | null)[] = [];
  const ecrituresParPas: (readonly EcritureComptable[])[] = [];
  let cloture: ResultatClotureEntreprise | null = null;

  for (let i = 0; i < nbPas; i++) {
    const dernier = i === nbPas - 1;
    const r = simulerPas(
      ent,
      cumul,
      o.fluxDuPas?.(i) ?? FLUX_VIDE,
      dernier ? (o.fin ?? FIN_VIDE) : null,
      MARKET,
      params,
      G,
      mois,
      i,
    );
    ent = r.entrepriseApres;
    cumul = r.cumul;
    if (o.viaJson) {
      ent = JSON.parse(JSON.stringify(ent)) as Entreprise;
      cumul = cumul === null ? null : (JSON.parse(JSON.stringify(cumul)) as CumulMois);
    }
    entreprisesParPas.push(ent);
    cumulsParPas.push(cumul);
    ecrituresParPas.push(r.ecrituresDuPas);
    if (r.cloture) cloture = r.cloture;
  }
  if (!cloture) throw new Error("le dernier pas aurait dû clôturer le mois");
  return { entreprisesParPas, cumulsParPas, ecrituresParPas, ecrituresDuMois: ecrituresParPas.flat(), cloture };
}

function soldesParCompte(ecritures: readonly EcritureComptable[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const e of ecritures) {
    for (const l of e.lignes) {
      s[l.compte] = (s[l.compte] ?? 0) + (l.sens === "debit" ? l.montant : -l.montant);
    }
  }
  return s;
}

function piecesDansLibelles(ecritures: readonly EcritureComptable[], prefixe: string): number[] {
  return ecritures
    .filter((e) => e.libelle.startsWith(prefixe))
    .map((e) => Number(/ (\d+) /.exec(e.libelle)?.[1] ?? 0));
}

// ---------------------------------------------------------------------------
// Critère d'acceptation : un mois en bloc = un mois pas à pas
// ---------------------------------------------------------------------------

describe("simulerPas — un mois en bloc donne le même état que 144 pas", () => {
  it.each([1, 12])("mois %i : mêmes comptes, mêmes stocks, même état final", (m) => {
    const mois = moisJeu(m);
    const bloc = simulerMoisEntreprise(
      entrepriseDeTest(),
      { ...FLUX_VIDE, ...FIN_VIDE } as DonneesReellesMois,
      MARKET,
      paramsNeutres(),
      G,
      mois,
    );
    const pas = jouerUnMois(entrepriseDeTest(), { mois });

    expect(pas.cloture.entrepriseApres).toEqual(bloc.entrepriseApres);
    expect(soldesParCompte(pas.ecrituresDuMois)).toEqual(soldesParCompte(bloc.ecritures));
    expect(pas.cloture.ventesPerdues).toEqual(bloc.ventesPerdues);
    expect(pas.cloture.explications).toEqual(bloc.explications);
    expect(pas.cloture.moisDecouvertConsecutifsApres).toBe(bloc.moisDecouvertConsecutifsApres);
    expect(pas.entreprisesParPas.at(-1)).toEqual(bloc.entrepriseApres);
  });

  it("vend le même nombre de pièces même si chaque pas en vend moins de deux", () => {
    const bloc = simulerMoisEntreprise(
      entrepriseDeTest(),
      { ...FLUX_VIDE, ...FIN_VIDE } as DonneesReellesMois,
      MARKET,
      paramsNeutres(),
      G,
      moisJeu(1),
    );
    const pas = jouerUnMois(entrepriseDeTest());

    const totalBloc = piecesDansLibelles(bloc.ecritures, "Vente directe").reduce((a, b) => a + b, 0);
    const parPas = pas.ecrituresParPas.flatMap((e) => piecesDansLibelles(e, "Vente directe"));
    expect(totalBloc).toBeGreaterThan(100);
    expect(parPas.reduce((a, b) => a + b, 0)).toBe(totalBloc);
    expect(Math.max(...parPas)).toBeLessThanOrEqual(3);
    // les ventes sont étalées sur le mois, pas concentrées sur un pas
    expect(parPas.length).toBeGreaterThan(50);
  });

  it("au rythme réel (1 minute, 1440 pas par mois) : même résultat qu'en bloc", () => {
    const params = paramsNeutres(1);
    expect(configTempsDepuis(params).pasParMois).toBe(1440);
    const bloc = simulerMoisEntreprise(
      entrepriseDeTest(),
      { ...FLUX_VIDE, ...FIN_VIDE } as DonneesReellesMois,
      MARKET,
      params,
      G,
      moisJeu(1),
    );
    const pas = jouerUnMois(entrepriseDeTest(), { params });
    expect(pas.ecrituresParPas).toHaveLength(1440);
    expect(pas.cloture.entrepriseApres).toEqual(bloc.entrepriseApres);
    expect(soldesParCompte(pas.ecrituresDuMois)).toEqual(soldesParCompte(bloc.ecritures));
    // les ventes sont étalées : presque une par minute de jeu, pas de gros paquets
    const parPas = pas.ecrituresParPas.flatMap((e) => piecesDansLibelles(e, "Vente directe"));
    expect(Math.max(...parPas)).toBeLessThanOrEqual(2);
  });

  it("la marque s'érode de façon continue : même résultat qu'en bloc", () => {
    const params = PARAMS_REELS; // vraies décroissances
    const gros: Parametres = {
      ...params,
      taille_marche_mois_milieu: { ...params["taille_marche_mois_milieu"]!, valeur: 1500 },
    };
    const ent = entrepriseDeTest({ stocksFinis: [], catalogue: [] });
    const bloc = simulerMoisEntreprise(
      ent,
      { ...FLUX_VIDE, ...FIN_VIDE } as DonneesReellesMois,
      MARKET,
      gros,
      G,
      moisJeu(1),
    );
    const pas = jouerUnMois(ent, { params: gros });
    expect(pas.cloture.entrepriseApres.marque.notoriete).toBeCloseTo(
      bloc.entrepriseApres.marque.notoriete,
      9,
    );
    expect(pas.cloture.entrepriseApres.marque.desirabilite).toBeCloseTo(
      bloc.entrepriseApres.marque.desirabilite,
      9,
    );
    expect(pas.cloture.entrepriseApres.marque.notoriete).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Entreprise créée en cours de mois
// ---------------------------------------------------------------------------

describe("simulerPas — une entreprise qui démarre en cours de mois", () => {
  const params = paramsNeutres();
  const mois = moisJeu(1);

  function jouerDepuis(debut: number) {
    let ent = entrepriseDeTest();
    let cumul: CumulMois | null = cumulDemarrantAuPas(mois, ent.tresorerie, debut);
    const ecritures: EcritureComptable[][] = [];
    for (let i = debut; i < NB_PAS; i++) {
      const dernier = i === NB_PAS - 1;
      const r = simulerPas(ent, cumul, FLUX_VIDE, dernier ? FIN_VIDE : null, MARKET, params, G, mois, i);
      ent = r.entrepriseApres;
      cumul = r.cumul;
      ecritures.push([...r.ecrituresDuPas]);
    }
    return ecritures;
  }

  const piecesProduites = (ecr: readonly (readonly EcritureComptable[])[]) =>
    ecr.flat().filter((e) => e.libelle.startsWith("Production atelier"))
      .map((e) => Number(/×(\d+)/.exec(e.libelle)?.[1] ?? 0))
      .reduce((a, b) => a + b, 0);

  it("ne produit que la part du mois qui reste, sans rattrapage du début de mois", () => {
    const pleinMois = jouerDepuis(0);
    const demiMois = jouerDepuis(NB_PAS / 2);
    expect(piecesProduites(pleinMois)).toBe(60);
    expect(piecesProduites(demiMois)).toBe(30);
  });

  it("ne vend que la part du mois qui reste, sans rafale au premier pas", () => {
    const vendues = (ecr: readonly (readonly EcritureComptable[])[]) =>
      ecr.flatMap((e) => piecesDansLibelles(e, "Vente directe"));
    const plein = vendues(jouerDepuis(0)).reduce((a, b) => a + b, 0);
    const demi = vendues(jouerDepuis(NB_PAS / 2));
    expect(demi.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(Math.floor(plein / 2) - 1);
    expect(demi.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(Math.ceil(plein / 2) + 1);
    expect(Math.max(...demi)).toBeLessThanOrEqual(3);
  });

  it("refuse un état de démarrage dont le compteur ne correspond pas au pas", () => {
    const cumul = cumulDemarrantAuPas(mois, entrepriseDeTest().tresorerie, 10);
    expect(() =>
      simulerPas(entrepriseDeTest(), cumul, FLUX_VIDE, null, MARKET, params, G, mois, 11),
    ).toThrow(/déjà/);
  });
});

// ---------------------------------------------------------------------------
// Bilan équilibré à chaque pas
// ---------------------------------------------------------------------------

describe("simulerPas — comptabilité", () => {
  it("le grand livre est équilibré après chaque pas, y compris le dernier", () => {
    const pas = jouerUnMois(entrepriseDeTest());
    const toutes: EcritureComptable[] = [];
    for (const ecritures of pas.ecrituresParPas) {
      toutes.push(...ecritures);
      let gl = planComptableV1();
      for (const e of toutes) gl = enregistrer(gl, e);
      expect(enEquilibre(gl)).toBe(true);
    }
    expect(toutes.length).toBe(pas.ecrituresDuMois.length);
  });

  it("la trésorerie affichée suit les écritures de banque (512) à chaque pas", () => {
    const depart = entrepriseDeTest();
    const pas = jouerUnMois(depart);
    let cumul512 = 0;
    pas.ecrituresParPas.forEach((ecritures, i) => {
      cumul512 += soldesParCompte(ecritures)["512"] ?? 0;
      expect(pas.entreprisesParPas[i]!.tresorerie).toBe(depart.tresorerie + cumul512);
    });
  });

  it("aucun stock n'est négatif à aucun pas", () => {
    const pas = jouerUnMois(
      entrepriseDeTest({
        stocksFinis: [{ produit: PRODUIT, quantite: 10, valeurTotale: centimes(15_000) }],
      }),
    );
    for (const e of pas.entreprisesParPas) {
      for (const s of e.stocksFinis) expect(s.quantite).toBeGreaterThanOrEqual(0);
      for (const s of e.stocksMatiere) expect(s.quantite).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Flux à chaque pas, échéances en fin de mois
// ---------------------------------------------------------------------------

describe("simulerPas — flux à chaque pas, échéances en fin de mois", () => {
  const ECHEANCES = [
    "salaire_",
    "salaire_pmt_",
    "loyer_",
    "energie_",
    "amort_",
    "echeance_",
    "tva_declaration_",
  ];
  const estEcheance = (id: string) => ECHEANCES.some((p) => id.startsWith(p));

  it("salaires, loyer, énergie, amortissement, prêt et TVA ne tombent qu'au dernier pas", () => {
    const pas = jouerUnMois(entrepriseDeTest());
    for (let i = 0; i < NB_PAS - 1; i++) {
      const ids = pas.ecrituresParPas[i]!.map((e) => e.id);
      expect(ids.filter(estEcheance), `pas ${i}`).toEqual([]);
    }
    const idsFin = pas.ecrituresParPas[NB_PAS - 1]!.map((e) => e.id);
    for (const prefixe of ECHEANCES) {
      expect(
        idsFin.some((id) => id.startsWith(prefixe)),
        prefixe,
      ).toBe(true);
    }
  });

  it("l'ancienneté des salariés n'augmente qu'à la fin du mois", () => {
    const pas = jouerUnMois(entrepriseDeTest());
    expect(pas.entreprisesParPas[0]!.salaries[0]!.experienceMois).toBe(6);
    expect(pas.entreprisesParPas[NB_PAS - 2]!.salaries[0]!.experienceMois).toBe(6);
    expect(pas.entreprisesParPas[NB_PAS - 1]!.salaries[0]!.experienceMois).toBe(7);
  });

  it("le compteur de pièces vendues et le CA cumulé augmentent à chaque vente, sans double comptage à la clôture", () => {
    const depart = entrepriseDeTest({ cumulsEtape: { piecesVendues: 5, chiffreAffairesHt: centimes(1000) } });
    const pas = jouerUnMois(depart);
    const servi = (c: CumulMois | null) => Object.values(c?.serviParLigne ?? {}).reduce((s, q) => s + q, 0);
    const milieu = Math.floor(NB_PAS / 2);
    const cumulMilieu = pas.cumulsParPas[milieu]!;
    // En cours de mois : le compteur suit déjà les ventes enregistrées
    expect(servi(cumulMilieu)).toBeGreaterThan(0);
    expect(pas.entreprisesParPas[milieu]!.cumulsEtape).toEqual({
      piecesVendues: 5 + servi(cumulMilieu),
      chiffreAffairesHt: centimes(1000 + cumulMilieu.chiffreAffairesHt),
    });
    // À la clôture : exactement le total du mois, une seule fois
    const avantDernier = pas.cumulsParPas[NB_PAS - 2]!;
    const fin = pas.entreprisesParPas[NB_PAS - 1]!.cumulsEtape!;
    expect(fin.piecesVendues).toBeGreaterThanOrEqual(5 + servi(avantDernier));
    expect(fin.piecesVendues).toBeLessThan(5 + 2 * servi(avantDernier));
    const bloc = simulerMoisEntreprise(depart, { ...FLUX_VIDE, ...FIN_VIDE } as DonneesReellesMois, MARKET, paramsNeutres(), G, moisJeu(1));
    expect(fin).toEqual(bloc.entrepriseApres.cumulsEtape);
  });

  it("la production et les ventes avancent pendant le mois", () => {
    const pas = jouerUnMois(entrepriseDeTest());
    const stockFini = (e: Entreprise) => e.stocksFinis.find((s) => s.produit === PRODUIT)!.quantite;
    const milieu = pas.entreprisesParPas[Math.floor(NB_PAS / 2)]!;
    const debut = entrepriseDeTest();
    expect(pas.entreprisesParPas[0]!.stocksMatiere[0]!.quantite).toBeLessThanOrEqual(1000);
    expect(milieu.stocksMatiere[0]!.quantite).toBeLessThan(debut.stocksMatiere[0]!.quantite);
    expect(milieu.stocksMatiere[0]!.quantite).toBeGreaterThan(
      pas.entreprisesParPas[NB_PAS - 1]!.stocksMatiere[0]!.quantite,
    );
    expect(stockFini(milieu)).not.toBe(stockFini(debut));
  });

  it("un événement daté (livraison de matière) se produit au pas prévu, pas avant", () => {
    const livraison = {
      id: "lm_pas70",
      matiere: MATIERE,
      quantite: 500,
      prixUnitaire: centimes(1500),
      modePaiement: "credit" as const,
    };
    const pas = jouerUnMois(entrepriseDeTest(), {
      fluxDuPas: (i) => (i === 70 ? { ...FLUX_VIDE, livraisonsMatiere: [livraison] } : FLUX_VIDE),
    });
    const idLivraison = "livraison_mat_1_lm_pas70";
    pas.ecrituresParPas.forEach((ecritures, i) => {
      const present = ecritures.some((e) => e.id === idLivraison);
      expect(present, `pas ${i}`).toBe(i === 70);
    });
    const qte = (i: number) => pas.entreprisesParPas[i]!.stocksMatiere[0]!.quantite;
    expect(qte(70)).toBeGreaterThan(qte(69));
  });

  it("une dépense marketing est comptée une seule fois, au pas où elle a lieu", () => {
    const pas = jouerUnMois(entrepriseDeTest(), {
      fluxDuPas: (i) =>
        i === 3
          ? {
              ...FLUX_VIDE,
              depensesMarketing: [{ id: "pub1", action: "publicite", montant: centimes(100_000) }],
            }
          : FLUX_VIDE,
    });
    const compte623 = pas.ecrituresParPas.map((e) => soldesParCompte(e)["623"] ?? 0);
    expect(compte623[3]).toBe(100_000);
    expect(compte623.reduce((a, b) => a + b, 0)).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// Reprise, déterminisme, garde-fous
// ---------------------------------------------------------------------------

describe("simulerPas — reprise et garde-fous", () => {
  it("l'état du mois reste petit : il ne recopie pas les écritures déjà enregistrées", () => {
    const pas = jouerUnMois(entrepriseDeTest());
    const tailles = pas.cumulsParPas.filter((c): c is CumulMois => c !== null).map((c) => JSON.stringify(c).length);
    expect(Math.max(...tailles)).toBeLessThan(2_000);
    // et il ne grossit pas au fil du mois
    expect(tailles.at(-1)!).toBeLessThan(tailles[0]! * 2);
  });

  it("l'état qui passe par du JSON entre deux pas (comme en base) donne le même résultat", () => {
    const direct = jouerUnMois(entrepriseDeTest());
    const viaJson = jouerUnMois(entrepriseDeTest(), { viaJson: true });
    expect(viaJson.cloture).toEqual(direct.cloture);
    expect(viaJson.ecrituresParPas).toEqual(direct.ecrituresParPas);
  });

  it("même état et même graine donnent exactement le même résultat", () => {
    expect(jouerUnMois(entrepriseDeTest())).toEqual(jouerUnMois(entrepriseDeTest()));
  });

  it("une rupture de stock en début de mois fait perdre des ventes, et elles sont comptées", () => {
    const pas = jouerUnMois(
      entrepriseDeTest({
        stocksFinis: [{ produit: PRODUIT, quantite: 10, valeurTotale: centimes(15_000) }],
      }),
    );
    expect(pas.cloture.ventesPerdues.length).toBeGreaterThan(0);
    const perdue = pas.cloture.ventesPerdues[0]!;
    expect(perdue.quantiteServie).toBeLessThan(perdue.quantiteDemandee);
  });

  it("refuse de reprendre au milieu d'un mois sans l'état cumulé", () => {
    expect(() =>
      simulerPas(entrepriseDeTest(), null, FLUX_VIDE, null, MARKET, paramsNeutres(), G, moisJeu(1), 5),
    ).toThrow(/cumul/);
  });

  it("refuse un état cumulé qui appartient à un autre mois", () => {
    const r = simulerPas(
      entrepriseDeTest(),
      null,
      FLUX_VIDE,
      null,
      MARKET,
      paramsNeutres(),
      G,
      moisJeu(1),
      0,
    );
    expect(() =>
      simulerPas(r.entrepriseApres, r.cumul, FLUX_VIDE, null, MARKET, paramsNeutres(), G, moisJeu(2), 1),
    ).toThrow(/mois/);
  });

  it("refuse de rejouer un pas déjà traité, ou d'en sauter un", () => {
    const params = paramsNeutres();
    const p0 = simulerPas(entrepriseDeTest(), null, FLUX_VIDE, null, MARKET, params, G, moisJeu(1), 0);
    const p1 = simulerPas(p0.entrepriseApres, p0.cumul, FLUX_VIDE, null, MARKET, params, G, moisJeu(1), 1);
    // rejouer le pas 1 avec l'état déjà avancé
    expect(() =>
      simulerPas(p1.entrepriseApres, p1.cumul, FLUX_VIDE, null, MARKET, params, G, moisJeu(1), 1),
    ).toThrow(/déjà/);
    // sauter le pas 2
    expect(() =>
      simulerPas(p1.entrepriseApres, p1.cumul, FLUX_VIDE, null, MARKET, params, G, moisJeu(1), 3),
    ).toThrow(/pas/);
  });

  it("refuse de clôturer le mois sans les données de fin de mois", () => {
    expect(() =>
      simulerPas(
        entrepriseDeTest(),
        null,
        FLUX_VIDE,
        null,
        MARKET,
        paramsNeutres(),
        G,
        moisJeu(1),
        NB_PAS - 1,
      ),
    ).toThrow();
  });

  it("refuse un index de pas hors du mois", () => {
    expect(() =>
      simulerPas(entrepriseDeTest(), null, FLUX_VIDE, null, MARKET, paramsNeutres(), G, moisJeu(1), NB_PAS),
    ).toThrow(/pas/);
  });

  it("la trésorerie finale est le solde de départ plus tous les mouvements de banque du mois", () => {
    const depart = entrepriseDeTest();
    const pas = jouerUnMois(depart);
    expect(pas.cloture.entrepriseApres.tresorerie).toBe(
      depart.tresorerie + (soldesParCompte(pas.ecrituresDuMois)["512"] ?? 0),
    );
  });
});
