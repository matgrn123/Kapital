import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  centimes,
  configTempsDepuis,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  idSalarie,
  moisJeu,
  type Entreprise,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { avancerMondeJusquA } from "./orchestrateur.js";
import { StockageMemoire } from "./stockageMemoire.js";
import { postesALaSignature } from "@kapital/engine";
import { chargerModulesV1 } from "@kapital/content";

const MODULES_CATALOGUE = chargerModulesV1();

// ---------------------------------------------------------------------------
// Scénario
// ---------------------------------------------------------------------------

const MIN = 60_000;
const JOUR = 24 * 60 * MIN;
const DEBUT = Date.UTC(2026, 10, 1, 8, 0, 0);

const PARAMS: Parametres = (() => {
  const p = chargerParametresV1();
  // Petit marché : quelques centaines de pièces par mois, comme dans les tests du moteur
  return { ...p, taille_marche_mois_milieu: { ...p["taille_marche_mois_milieu"]!, valeur: 1500 } };
})();
const N = configTempsDepuis(PARAMS).pasParMois; // 1440 pas par mois de jeu

const PRODUIT = idProduit("prod_tshirt");
const MATIERE = idMatiere("mat_coton");

function entreprise(id: string): Entreprise {
  return {
    id: idEntreprise(id),
    nom: `Atelier ${id}`,
    gamme: "milieu",
    etape: 1,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(5_000_000),
    stocksMatiere: [{ matiere: MATIERE, quantite: 1000, valeurTotale: centimes(1_500_000) }],
    stocksFinis: [{ produit: PRODUIT, quantite: 2000, valeurTotale: centimes(3_000_000) }],
    salaries: [1, 2].map((i) => ({
      id: idSalarie(`${id}_s${i}`),
      poste: "artisan" as const,
      salaireBrutMensuel: centimes(186702),
      ancienneteMois: 6,
      experienceMois: 6,
    })),
    ateliers: [{ surfaceM2: 150, loyerMensuel: centimes(250_000), modules: postesALaSignature(2, MODULES_CATALOGUE) }],
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [
      {
        id: idPret(`${id}_p1`),
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
        fabrication: {
          matiere: MATIERE,
          consommationParPiece: 1,
          fournituresParPiece: centimes(0),
          tempsStandardMinutes: 30,
        },
      },
    ],
  };
}

/** Un monde déjà sur l'horloge commune, créé à DEBUT, avec des entreprises au pas 0. */
function monde(ids: readonly string[] = ["a"], pasTraites: number | null = 0): StockageMemoire {
  const s = new StockageMemoire({ id: "monde1", moisCourant: 0, debutReelMs: DEBUT });
  for (const id of ids) s.ajouterEntreprise(entreprise(id), pasTraites);
  return s;
}

function bilan(s: StockageMemoire, id: string) {
  const e = s.entreprises.get(id)!;
  return { entreprise: e.entreprise, pasTraites: e.pasTraites, cumul: e.cumul, ecritures: s.ecrituresDe(id) };
}

const idsEcritures = (s: StockageMemoire, id: string) => s.ecrituresDe(id).map((e) => e.id);

// ---------------------------------------------------------------------------

describe("avancerMondeJusquA — les entreprises rattrapent le temps écoulé", () => {
  it("une entreprise absente pendant 2 mois et demi est rattrapée, avec deux paies et une échéance", async () => {
    const s = monde();
    const r = await avancerMondeJusquA(s, PARAMS, DEBUT + 2.5 * JOUR);

    expect(r.pasCible).toBe(Math.floor(2.5 * N));
    expect(r.entreprises[0]!.etat).toBe("avancee");
    expect(s.entreprises.get("a")!.pasTraites).toBe(r.pasCible);
    expect(s.monde.moisCourant).toBe(2);

    const ids = idsEcritures(s, "a");
    // Les écritures portent le mois de jeu où elles ont lieu (mois 0 et 1 clos, mois 2 en cours).
    for (const mois of [0, 1]) {
      expect(ids, `paie du mois ${mois}`).toContain(`salaire_${mois}_a_s1`);
    }
    // Prêt accordé au mois 0 : première échéance à la fin du mois 1 (comme loan_schedules).
    expect(ids).not.toContain("echeance_0_a_p1");
    expect(ids).toContain("echeance_1_a_p1");
    expect(ids.some((id) => id.startsWith("salaire_2_"))).toBe(false);
    // le mois 2 est en cours : son état est conservé pour le pas suivant
    expect(s.entreprises.get("a")!.cumul).toMatchObject({ mois: 2, pasTraites: Math.floor(0.5 * N) });
  });

  it("la trésorerie est le solde de départ plus les mouvements de banque enregistrés", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, DEBUT + 2.5 * JOUR);
    let net512 = 0;
    for (const ec of s.ecrituresDe("a")) {
      for (const l of ec.lignes) if (l.compte === "512") net512 += l.sens === "debit" ? l.montant : -l.montant;
    }
    expect(s.entreprises.get("a")!.entreprise.tresorerie).toBe(5_000_000 + net512);
  });

  it("rappelé au même instant, il ne fait rien", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1.2 * JOUR);
    const avant = bilan(s, "a");
    const appels = s.nbAppliquerPas;
    const r = await avancerMondeJusquA(s, PARAMS, DEBUT + 1.2 * JOUR);
    expect(r.entreprises[0]!.etat).toBe("a_jour");
    expect(s.nbAppliquerPas).toBe(appels);
    expect(bilan(s, "a")).toEqual(avant);
  });

  it("avancer en une fois ou par petits morceaux donne exactement le même résultat", async () => {
    const enUneFois = monde();
    await avancerMondeJusquA(enUneFois, PARAMS, DEBUT + 2.5 * JOUR);

    const parMorceaux = monde();
    // 97 minutes entre deux appels : les lots coupent les mois à des endroits variés
    for (let t = 97; t < 2.5 * 1440; t += 97) {
      await avancerMondeJusquA(parMorceaux, PARAMS, DEBUT + t * MIN);
    }
    await avancerMondeJusquA(parMorceaux, PARAMS, DEBUT + 2.5 * JOUR);

    expect(bilan(parMorceaux, "a")).toEqual(bilan(enUneFois, "a"));
    expect(parMorceaux.monde.moisCourant).toBe(enUneFois.monde.moisCourant);
  });

  it("plusieurs entreprises avancent ensemble, chacune indépendamment", async () => {
    const s = monde(["a", "b", "c"]);
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1.1 * JOUR);
    for (const id of ["a", "b", "c"]) {
      expect(s.entreprises.get(id)!.pasTraites).toBe(Math.floor(1.1 * N));
      expect(idsEcritures(s, id)).toContain(`salaire_0_${id}_s1`);
    }
  });
});

describe("avancerMondeJusquA — sécurité de l'argent", () => {
  it("deux traitements simultanés n'enregistrent jamais deux fois le même pas", async () => {
    const seul = monde();
    await avancerMondeJusquA(seul, PARAMS, DEBUT + 1.3 * JOUR);

    const double = monde();
    double.cederLaMain = true; // les deux traitements lisent le même état avant d'écrire
    const [r1, r2] = await Promise.all([
      avancerMondeJusquA(double, PARAMS, DEBUT + 1.3 * JOUR),
      avancerMondeJusquA(double, PARAMS, DEBUT + 1.3 * JOUR),
    ]);

    const etats = [...r1.entreprises, ...r2.entreprises].map((e) => e.etat);
    expect(etats).toContain("deja_traite");
    expect(bilan(double, "a")).toEqual(bilan(seul, "a"));
  });

  it("une panne pendant l'enregistrement ne laisse rien, et la reprise donne le résultat normal", async () => {
    const propre = monde();
    await avancerMondeJusquA(propre, PARAMS, DEBUT + 1.3 * JOUR);

    const s = monde();
    s.pannesAEnregistrer = 1;
    const r1 = await avancerMondeJusquA(s, PARAMS, DEBUT + 1.3 * JOUR);
    expect(r1.entreprises[0]!.etat).toBe("erreur");
    expect(s.entreprises.get("a")!.pasTraites).toBe(0);
    expect(s.ecritures).toHaveLength(0);

    const r2 = await avancerMondeJusquA(s, PARAMS, DEBUT + 1.3 * JOUR);
    expect(r2.entreprises[0]!.etat).toBe("avancee");
    expect(bilan(s, "a")).toEqual(bilan(propre, "a"));
  });

  it("l'échec d'une entreprise n'empêche pas les autres d'avancer", async () => {
    const s = monde(["a", "b"]);
    s.entreprisesEnPanne.add("b");
    const r = await avancerMondeJusquA(s, PARAMS, DEBUT + 1.1 * JOUR);
    const parId = Object.fromEntries(r.entreprises.map((e) => [e.entreprise, e]));
    expect(parId["a"]!.etat).toBe("avancee");
    expect(parId["b"]!.etat).toBe("erreur");
    expect(parId["b"]!.erreur).toMatch(/panne/);
    expect(s.entreprises.get("a")!.pasTraites).toBe(Math.floor(1.1 * N));
    expect(s.entreprises.get("b")!.pasTraites).toBe(0);
  });

  it("le plafond de pas par appel étale le rattrapage sur plusieurs appels", async () => {
    const s = monde();
    const options = { maxPasParEntreprise: 500 };
    const maintenant = DEBUT + 2 * JOUR;
    await avancerMondeJusquA(s, PARAMS, maintenant, options);
    expect(s.entreprises.get("a")!.pasTraites).toBe(500);
    await avancerMondeJusquA(s, PARAMS, maintenant, options);
    expect(s.entreprises.get("a")!.pasTraites).toBe(1000);
    for (let i = 0; i < 4; i++) await avancerMondeJusquA(s, PARAMS, maintenant, options);
    expect(s.entreprises.get("a")!.pasTraites).toBe(2 * N);
  });

  it("refuse un état du mois incohérent plutôt que de calculer de travers", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, DEBUT + 10 * MIN);
    const e = s.entreprises.get("a")!;
    e.cumul = { ...e.cumul!, pasTraites: 3 }; // ne correspond plus au compteur de l'entreprise
    const r = await avancerMondeJusquA(s, PARAMS, DEBUT + 20 * MIN);
    expect(r.entreprises[0]!.etat).toBe("erreur");
    expect(r.entreprises[0]!.erreur).toMatch(/incohérent/);
  });
});

describe("avancerMondeJusquA — démarrages", () => {
  it("un ancien monde est calé sur l'horloge commune sans rejouer son historique", async () => {
    const s = new StockageMemoire({ id: "monde1", moisCourant: 5, debutReelMs: null });
    s.ajouterEntreprise(entreprise("a"), null);
    const maintenant = DEBUT + 40 * JOUR;

    const r = await avancerMondeJusquA(s, PARAMS, maintenant);
    expect(r.horlogeInitialisee).toBe(true);
    expect(s.monde.debutReelMs).toBe(maintenant - 5 * JOUR);
    expect(r.pasCible).toBe(5 * N);
    expect(r.entreprises[0]!.etat).toBe("demarree");
    expect(s.entreprises.get("a")!.pasTraites).toBe(5 * N);
    expect(s.ecritures).toHaveLength(0);
    expect(s.monde.moisCourant).toBe(5); // le mois courant est conservé

    // minutes suivantes : le temps repart du début du mois 5, sans rafale
    await avancerMondeJusquA(s, PARAMS, maintenant + 3 * MIN);
    expect(s.entreprises.get("a")!.pasTraites).toBe(5 * N + 3);
    expect(s.entreprises.get("a")!.cumul).toMatchObject({ mois: 5, pasTraites: 3, pasDemarrage: 0 });
  });

  it("une entreprise créée en cours de mois démarre au pas courant, sans rattraper le début du mois", async () => {
    const s = monde(["a"]);
    const maintenant = DEBUT + 1 * JOUR + 700 * MIN;
    await avancerMondeJusquA(s, PARAMS, maintenant);
    s.ajouterEntreprise(entreprise("nouvelle"), null);

    const r = await avancerMondeJusquA(s, PARAMS, maintenant);
    const nouvelle = r.entreprises.find((e) => e.entreprise === "nouvelle")!;
    expect(nouvelle.etat).toBe("demarree");
    expect(s.entreprises.get("nouvelle")!.pasTraites).toBe(N + 700);
    expect(s.entreprises.get("nouvelle")!.cumul).toMatchObject({ mois: 1, pasTraites: 700, pasDemarrage: 700 });
    expect(s.ecrituresDe("nouvelle")).toHaveLength(0);

    // 30 minutes plus tard : quelques ventes au plus, pas la moitié d'un mois d'un coup
    await avancerMondeJusquA(s, PARAMS, maintenant + 30 * MIN);
    const vendues = s
      .ecrituresDe("nouvelle")
      .filter((e) => e.libelle.startsWith("Vente directe"))
      .map((e) => Number(/ (\d+) /.exec(e.libelle)?.[1] ?? 0))
      .reduce((a, b) => a + b, 0);
    expect(vendues).toBeLessThanOrEqual(3);
    expect(s.entreprises.get("nouvelle")!.pasTraites).toBe(N + 730);
  });
});

describe("avancerMondeJusquA — règlement des fournisseurs à l'échéance", () => {
  it("une dette échue est réglée une seule fois, au premier pas du mois, 401 débit / 512 crédit", async () => {
    const s = monde();
    s.dettesParMois.set("a|1", [{ ordreId: "po1", nature: "matiere", montant: centimes(42_000) }]);
    await avancerMondeJusquA(s, PARAMS, DEBUT + 0.5 * JOUR);
    expect(idsEcritures(s, "a")).not.toContain("reglement_matiere_po1");
    await avancerMondeJusquA(s, PARAMS, DEBUT + JOUR + 2 * MIN);
    const reglements = s.ecrituresDe("a").filter((e) => e.id === "reglement_matiere_po1");
    expect(reglements).toHaveLength(1);
    expect(reglements[0]!.lignes).toEqual([
      { compte: "401", sens: "debit", montant: 42_000 },
      { compte: "512", sens: "credit", montant: 42_000 },
    ]);
    // Rejouer le mois suivant ne la repaie pas.
    s.dettesParMois.set("a|2", s.dettesParMois.get("a|1")!);
    await avancerMondeJusquA(s, PARAMS, DEBUT + 2 * JOUR + 2 * MIN);
    expect(s.ecrituresDe("a").filter((e) => e.id === "reglement_matiere_po1")).toHaveLength(1);
  });
});

describe("avancerMondeJusquA — événements datés", () => {
  const livraison = (id: string, instantMs: number) => ({
    type: "matiere" as const,
    statut: "en_cours" as const,
    id,
    matiere: MATIERE,
    quantite: 500,
    prixUnitaire: centimes(1500),
    modePaiement: "credit" as const,
    instantMs,
  });

  it("une livraison arrive à la minute prévue, pas avant, et une seule fois", async () => {
    const s = monde();
    s.ajouterLivraison("a", livraison("cmd1", DEBUT + 10.5 * MIN));

    await avancerMondeJusquA(s, PARAMS, DEBUT + 10 * MIN);
    expect(idsEcritures(s, "a")).not.toContain("livraison_mat_0_cmd1");

    await avancerMondeJusquA(s, PARAMS, DEBUT + 11 * MIN);
    expect(idsEcritures(s, "a").filter((id) => id === "livraison_mat_0_cmd1")).toHaveLength(1);
    expect(s.livraisons.get("a")![0]!.statut).toBe("livree");

    await avancerMondeJusquA(s, PARAMS, DEBUT + 60 * MIN);
    expect(idsEcritures(s, "a").filter((id) => id === "livraison_mat_0_cmd1")).toHaveLength(1);
  });

  it("une livraison en retard (avant le lot en cours) est traitée dès le premier pas", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, DEBUT + 30 * MIN);
    s.ajouterLivraison("a", livraison("retard", DEBUT + 5 * MIN)); // prévue il y a 25 minutes
    await avancerMondeJusquA(s, PARAMS, DEBUT + 31 * MIN);
    expect(idsEcritures(s, "a")).toContain("livraison_mat_0_retard");
  });

  it("une créance revendeur est encaissée au premier pas du mois concerné", async () => {
    const s = monde();
    s.creancesParMois.set("a|2", [{ ecritureId: "vente_x", montant: centimes(12_345) }]);
    await avancerMondeJusquA(s, PARAMS, DEBUT + 2 * JOUR + 5 * MIN);
    const encaissement = s.ecrituresDe("a").find((e) => e.id === "encaissement_2_vente_x");
    expect(encaissement).toBeDefined();
    expect(encaissement!.lignes).toEqual([
      { compte: "512", sens: "debit", montant: 12_345 },
      { compte: "411", sens: "credit", montant: 12_345 },
    ]);
  });
});

describe("avancerMondeJusquA — constat d'étape à la clôture (AE-2)", () => {
  it("l'étape et les compteurs sont enregistrés à la clôture du mois, et ne redescendent pas", async () => {
    const s = new StockageMemoire({ id: "monde1", moisCourant: 0, debutReelMs: DEBUT });
    s.ajouterEntreprise({ ...entreprise("e"), etape: 0 }, 0);

    await avancerMondeJusquA(s, PARAMS, DEBUT + 0.5 * JOUR);
    // mois pas encore clos : l'étape n'est pas constatée, mais les compteurs suivent déjà les ventes
    const milieu = s.entreprises.get("e")!.entreprise;
    expect(milieu.etape).toBe(0);
    const ventesEnregistrees = s
      .ecrituresDe("e")
      // ventes moins retours en ligne : le CA cumulé suit le solde du compte 707
      .filter((x) => x.id.startsWith("vente_") || x.id.startsWith("retour_"))
      .flatMap((x) => x.lignes)
      .filter((l) => l.compte.startsWith("70"))
      .reduce((t, l) => t + (l.sens === "credit" ? l.montant : -l.montant), 0);
    expect(milieu.cumulsEtape!.piecesVendues).toBeGreaterThan(0);
    expect(milieu.cumulsEtape!.chiffreAffairesHt).toBe(ventesEnregistrees);

    await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR);
    const apres = s.entreprises.get("e")!.entreprise;
    expect(apres.cumulsEtape!.piecesVendues).toBeGreaterThanOrEqual(50);
    expect(apres.cumulsEtape!.chiffreAffairesHt).toBeGreaterThan(0);
    expect(apres.etape).toBeGreaterThanOrEqual(1);

    const etapeMois1 = apres.etape;
    await avancerMondeJusquA(s, PARAMS, DEBUT + 2 * JOUR);
    const mois2 = s.entreprises.get("e")!.entreprise;
    expect(mois2.etape).toBeGreaterThanOrEqual(etapeMois1);
    expect(mois2.cumulsEtape!.piecesVendues).toBeGreaterThan(apres.cumulsEtape!.piecesVendues);
  });
});

describe("avancerMondeJusquA — une seule convention de mois", () => {
  it("une vente au pas N du mois M est écrite au mois M, celui de worlds.mois_courant", async () => {
    const s = monde();
    // mois 3, pas 600 : le monde est au mois 3
    await avancerMondeJusquA(s, PARAMS, DEBUT + 3 * JOUR + 600 * MIN);
    expect(s.monde.moisCourant).toBe(3);
    const avant = new Set(idsEcritures(s, "a"));
    await avancerMondeJusquA(s, PARAMS, DEBUT + 3 * JOUR + 720 * MIN);
    const nouvelles = s.ecrituresDe("a").filter((e) => !avant.has(e.id));
    const ventes = nouvelles.filter((e) => e.id.startsWith("vente_"));
    expect(ventes.length).toBeGreaterThan(0);
    for (const v of ventes) {
      expect(v.mois).toBe(3);
      expect(v.id.startsWith("vente_3_")).toBe(true);
    }
    // toutes les écritures passées pendant le mois 3 portent le mois 3
    expect(nouvelles.every((e) => e.mois === 3)).toBe(true);
  });

  it("les écritures de clôture portent le mois qui se termine", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR);
    const paie = s.ecrituresDe("a").find((e) => e.id === "salaire_0_a_s1");
    expect(paie?.mois).toBe(0);
    expect(s.monde.moisCourant).toBe(1);
  });
});

describe("avancerMondeJusquA — journal d'événements (migration 0041)", () => {
  const livraison = (id: string, instantMs: number) => ({
    type: "matiere" as const,
    statut: "en_cours" as const,
    id,
    matiere: MATIERE,
    quantite: 500,
    prixUnitaire: centimes(1500),
    modePaiement: "credit" as const,
    instantMs,
  });
  const cles = (s: StockageMemoire, id: string) => s.evenementsDe(id).map((e) => e.cle);

  it("enregistre la livraison et la clôture du mois, avec les explications du moteur", async () => {
    const s = monde();
    s.ajouterLivraison("a", livraison("cmd1", DEBUT + 10.5 * MIN));
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR + 5 * MIN);

    const evs = s.evenementsDe("a");
    const liv = evs.find((e) => e.cle === "livraison_matiere_cmd1");
    expect(liv).toMatchObject({ type: "livraison_matiere", moisJeu: 0, pas: 10 });
    const cloture = evs.find((e) => e.cle === "cloture_0");
    expect(cloture?.type).toBe("cloture_mois");
    const detail = cloture!.detail as { explications: { cle: string }[]; paiements: { paie: number; loyers: number } };
    expect(detail.explications.map((x) => x.cle)).toContain("tresorerie");
    expect(detail.paiements.paie).toBeGreaterThan(0);
    expect(detail.paiements.loyers).toBe(250_000);
  });

  it("rejouer le même pas ne duplique aucun événement", async () => {
    const s = monde();
    s.ajouterLivraison("a", livraison("cmd1", DEBUT + 10.5 * MIN));
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR + 5 * MIN);
    const avant = cles(s, "a");

    // Même instant : rien n'est retraité.
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR + 5 * MIN);
    expect(cles(s, "a")).toEqual(avant);

    // Deux traitements simultanés du même pas : un seul passe, les clés restent uniques.
    const double = monde();
    double.ajouterLivraison("a", livraison("cmd1", DEBUT + 10.5 * MIN));
    double.cederLaMain = true;
    await Promise.all([
      avancerMondeJusquA(double, PARAMS, DEBUT + 1 * JOUR + 5 * MIN),
      avancerMondeJusquA(double, PARAMS, DEBUT + 1 * JOUR + 5 * MIN),
    ]);
    expect(cles(double, "a")).toEqual(avant);

    // Réenregistrer les mêmes événements (reprise après panne) : la clé unique les ignore.
    await s.enregistrerEvenements("a", s.evenementsDe("a"));
    expect(cles(s, "a")).toEqual(avant);
    expect(new Set(avant).size).toBe(avant.length);
  });

  it("avancer en une fois ou par morceaux donne le même journal", async () => {
    const enUneFois = monde();
    await avancerMondeJusquA(enUneFois, PARAMS, DEBUT + 2.5 * JOUR);
    const parMorceaux = monde();
    for (let t = 97; t < 2.5 * 1440; t += 97) await avancerMondeJusquA(parMorceaux, PARAMS, DEBUT + t * MIN);
    await avancerMondeJusquA(parMorceaux, PARAMS, DEBUT + 2.5 * JOUR);
    expect(parMorceaux.evenementsDe("a")).toEqual(enUneFois.evenementsDe("a"));
  });

  it("une panne du journal n'annule pas le pas déjà enregistré", async () => {
    const s = monde();
    s.pannesJournal = 1;
    const r = await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR + 5 * MIN);
    expect(r.entreprises[0]!.etat).toBe("avancee");
    expect(s.entreprises.get("a")!.pasTraites).toBe(N + 5);
  });

  it("chaque société n'a que ses propres événements", async () => {
    const s = monde(["a", "b"]);
    s.ajouterLivraison("a", livraison("cmd1", DEBUT + 10.5 * MIN));
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR + 5 * MIN);
    expect(cles(s, "a")).toContain("livraison_matiere_cmd1");
    expect(cles(s, "b")).not.toContain("livraison_matiere_cmd1");
    expect(cles(s, "b")).toContain("cloture_0");
  });
});
