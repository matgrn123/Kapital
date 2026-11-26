import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  centimes,
  configTempsDepuis,
  debutDuMoisMs,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  idSalarie,
  indexDuMois,
  moisJeu,
  pasAbsoluDepuisPosition,
  pasDansLeMois,
  type Entreprise,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { avancerMondeJusquA, ErreurMondeAncienCalendrier } from "./orchestrateur.js";
import { StockageMemoire } from "./stockageMemoire.js";
import { postesALaSignature } from "@kapital/engine";
import { chargerModulesV1 } from "@kapital/content";

const MODULES_CATALOGUE = chargerModulesV1();

// ---------------------------------------------------------------------------
// Scénario
// ---------------------------------------------------------------------------
//
// L'horloge du jeu est l'horloge réelle : origine au 1er janvier 1970 (debut_reel = 0) et
// mois calendaires. Le scénario démarre le 1er novembre 2026 à 0 h (heure de Paris) et
// avance en novembre (30 jours), décembre (31), janvier 2027 (31), février (28).
// Pour rester rapides, les tests tournent avec un pas d'une heure (720 pas en novembre).

const MIN = 60_000;
const HEURE = 60 * MIN;

const PARAMS: Parametres = (() => {
  const p = chargerParametresV1();
  // Petit marché : quelques centaines de pièces par mois, comme dans les tests du moteur
  return {
    ...p,
    taille_marche_mois_milieu: { ...p["taille_marche_mois_milieu"]!, valeur: 1500 },
    temps_minutes_reelles_par_pas: { ...p["temps_minutes_reelles_par_pas"]!, valeur: 60 },
  };
})();
const CONFIG = configTempsDepuis(PARAMS);

const M0 = indexDuMois(2026, 11);
/** Nombre de pas du mois M0 + k. */
const N = (k: number): number => pasDansLeMois(CONFIG, M0 + k);
/** Premier pas du mois M0 + k. */
const PAS = (k: number): number => pasAbsoluDepuisPosition(CONFIG, M0 + k, 0);
/** Instant réel : `heures` après le début du mois M0 + k. */
const t = (k: number, heures = 0): number => debutDuMoisMs(M0 + k) + heures * HEURE;

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
        moisDebut: moisJeu(M0),
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

/** Un monde sur l'horloge réelle, au mois M0, avec des entreprises au premier pas de M0. */
function monde(ids: readonly string[] = ["a"], pasTraites: number | null = PAS(0)): StockageMemoire {
  const s = new StockageMemoire({ id: "monde1", moisCourant: M0, debutReelMs: 0 });
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
  it("absente de novembre à mi-janvier : rattrapée, deux paies (novembre, décembre) et une échéance", async () => {
    const s = monde();
    const r = await avancerMondeJusquA(s, PARAMS, t(2, 360));

    expect(r.pasCible).toBe(PAS(0) + N(0) + N(1) + 360);
    expect(r.entreprises[0]!.etat).toBe("avancee");
    expect(s.entreprises.get("a")!.pasTraites).toBe(r.pasCible);
    expect(s.monde.moisCourant).toBe(indexDuMois(2027, 1));

    const ids = idsEcritures(s, "a");
    // Les écritures portent le mois de jeu où elles ont lieu (novembre et décembre clos, janvier en cours).
    for (const mois of [M0, M0 + 1]) {
      expect(ids, `paie du mois ${mois}`).toContain(`salaire_${mois}_a_s1`);
    }
    // Prêt accordé en novembre : première échéance fin décembre (comme loan_schedules).
    expect(ids).not.toContain(`echeance_${M0}_a_p1`);
    expect(ids).toContain(`echeance_${M0 + 1}_a_p1`);
    expect(ids.some((id) => id.startsWith(`salaire_${M0 + 2}_`))).toBe(false);
    // janvier est en cours : son état est conservé pour le pas suivant
    expect(s.entreprises.get("a")!.cumul).toMatchObject({ mois: M0 + 2, pasTraites: 360 });
  });

  it("rattrapage au changement de mois : le dernier pas de novembre clôture, le suivant ouvre décembre", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, t(0, N(0) - 1)); // il reste un pas en novembre
    expect(idsEcritures(s, "a")).not.toContain(`salaire_${M0}_a_s1`);
    expect(s.monde.moisCourant).toBe(M0);

    await avancerMondeJusquA(s, PARAMS, t(1, 1)); // fin de novembre + premier pas de décembre
    expect(idsEcritures(s, "a")).toContain(`salaire_${M0}_a_s1`);
    expect(s.monde.moisCourant).toBe(M0 + 1);
    expect(s.entreprises.get("a")!.cumul).toMatchObject({ mois: M0 + 1, pasTraites: 1 });
  });

  it("mars compte une heure de moins (heure d'été) : 743 pas, puis la clôture", async () => {
    const mars = indexDuMois(2027, 3);
    const s = new StockageMemoire({ id: "monde1", moisCourant: mars, debutReelMs: 0 });
    s.ajouterEntreprise(entreprise("a"), pasAbsoluDepuisPosition(CONFIG, mars, 0));
    const r = await avancerMondeJusquA(s, PARAMS, debutDuMoisMs(mars + 1));
    expect(r.entreprises[0]!.pasApres! - r.entreprises[0]!.pasAvant!).toBe(743);
    expect(idsEcritures(s, "a")).toContain(`salaire_${mars}_a_s1`);
    expect(s.monde.moisCourant).toBe(indexDuMois(2027, 4));
    expect(s.entreprises.get("a")!.cumul).toBeNull();
  });

  it("la trésorerie est le solde de départ plus les mouvements de banque enregistrés", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, t(2, 360));
    let net512 = 0;
    for (const ec of s.ecrituresDe("a")) {
      for (const l of ec.lignes) if (l.compte === "512") net512 += l.sens === "debit" ? l.montant : -l.montant;
    }
    expect(s.entreprises.get("a")!.entreprise.tresorerie).toBe(5_000_000 + net512);
  });

  it("rappelé au même instant, il ne fait rien", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, t(1, 100));
    const avant = bilan(s, "a");
    const appels = s.nbAppliquerPas;
    const r = await avancerMondeJusquA(s, PARAMS, t(1, 100));
    expect(r.entreprises[0]!.etat).toBe("a_jour");
    expect(s.nbAppliquerPas).toBe(appels);
    expect(bilan(s, "a")).toEqual(avant);
  });

  it("avancer en une fois ou par petits morceaux donne exactement le même résultat", async () => {
    const enUneFois = monde();
    await avancerMondeJusquA(enUneFois, PARAMS, t(2, 360));

    const parMorceaux = monde();
    // 97 heures entre deux appels : les lots coupent les mois à des endroits variés
    for (let ms = t(0, 97); ms < t(2, 360); ms += 97 * HEURE) {
      await avancerMondeJusquA(parMorceaux, PARAMS, ms);
    }
    await avancerMondeJusquA(parMorceaux, PARAMS, t(2, 360));

    expect(bilan(parMorceaux, "a")).toEqual(bilan(enUneFois, "a"));
    expect(parMorceaux.monde.moisCourant).toBe(enUneFois.monde.moisCourant);
  });

  it("un lot ne dépasse pas une journée : un mois de rattrapage s'enregistre en une trentaine de fois", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, t(1));
    expect(s.nbAppliquerPas).toBe(30); // novembre : 30 lots d'une journée (24 pas d'une heure)
  });

  it("plusieurs entreprises avancent ensemble, chacune indépendamment", async () => {
    const s = monde(["a", "b", "c"]);
    await avancerMondeJusquA(s, PARAMS, t(1, 50));
    for (const id of ["a", "b", "c"]) {
      expect(s.entreprises.get(id)!.pasTraites).toBe(PAS(1) + 50);
      expect(idsEcritures(s, id)).toContain(`salaire_${M0}_${id}_s1`);
    }
  });
});

describe("avancerMondeJusquA — sécurité de l'argent", () => {
  it("deux traitements simultanés n'enregistrent jamais deux fois le même pas", async () => {
    const seul = monde();
    await avancerMondeJusquA(seul, PARAMS, t(1, 200));

    const double = monde();
    double.cederLaMain = true; // les deux traitements lisent le même état avant d'écrire
    const [r1, r2] = await Promise.all([
      avancerMondeJusquA(double, PARAMS, t(1, 200)),
      avancerMondeJusquA(double, PARAMS, t(1, 200)),
    ]);

    const etats = [...r1.entreprises, ...r2.entreprises].map((e) => e.etat);
    expect(etats).toContain("deja_traite");
    expect(bilan(double, "a")).toEqual(bilan(seul, "a"));
  });

  it("une panne pendant l'enregistrement ne laisse rien, et la reprise donne le résultat normal", async () => {
    const propre = monde();
    await avancerMondeJusquA(propre, PARAMS, t(1, 200));

    const s = monde();
    s.pannesAEnregistrer = 1;
    const r1 = await avancerMondeJusquA(s, PARAMS, t(1, 200));
    expect(r1.entreprises[0]!.etat).toBe("erreur");
    expect(s.entreprises.get("a")!.pasTraites).toBe(PAS(0));
    expect(s.ecritures).toHaveLength(0);

    const r2 = await avancerMondeJusquA(s, PARAMS, t(1, 200));
    expect(r2.entreprises[0]!.etat).toBe("avancee");
    expect(bilan(s, "a")).toEqual(bilan(propre, "a"));
  });

  it("l'échec d'une entreprise n'empêche pas les autres d'avancer", async () => {
    const s = monde(["a", "b"]);
    s.entreprisesEnPanne.add("b");
    const r = await avancerMondeJusquA(s, PARAMS, t(1, 50));
    const parId = Object.fromEntries(r.entreprises.map((e) => [e.entreprise, e]));
    expect(parId["a"]!.etat).toBe("avancee");
    expect(parId["b"]!.etat).toBe("erreur");
    expect(parId["b"]!.erreur).toMatch(/panne/);
    expect(s.entreprises.get("a")!.pasTraites).toBe(PAS(1) + 50);
    expect(s.entreprises.get("b")!.pasTraites).toBe(PAS(0));
  });

  it("le plafond de pas par appel étale le rattrapage sur plusieurs appels", async () => {
    const s = monde();
    const options = { maxPasParEntreprise: 500 };
    const maintenant = t(2);
    await avancerMondeJusquA(s, PARAMS, maintenant, options);
    expect(s.entreprises.get("a")!.pasTraites).toBe(PAS(0) + 500);
    await avancerMondeJusquA(s, PARAMS, maintenant, options);
    expect(s.entreprises.get("a")!.pasTraites).toBe(PAS(0) + 1000);
    for (let i = 0; i < 4; i++) await avancerMondeJusquA(s, PARAMS, maintenant, options);
    expect(s.entreprises.get("a")!.pasTraites).toBe(PAS(2));
  });

  it("refuse un état du mois incohérent plutôt que de calculer de travers", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, t(0, 10));
    const e = s.entreprises.get("a")!;
    e.cumul = { ...e.cumul!, pasTraites: 3 }; // ne correspond plus au compteur de l'entreprise
    const r = await avancerMondeJusquA(s, PARAMS, t(0, 20));
    expect(r.entreprises[0]!.etat).toBe("erreur");
    expect(r.entreprises[0]!.erreur).toMatch(/incohérent/);
  });
});

describe("avancerMondeJusquA — bascule vers l'horloge réelle (migration 0043)", () => {
  it("un monde encore sur l'ancien compteur de mois n'est pas touché", async () => {
    const s = new StockageMemoire({ id: "monde1", moisCourant: 11, debutReelMs: t(0) - 11 * 24 * HEURE });
    s.ajouterEntreprise(entreprise("a"), 16_000);
    s.ajouterEntreprise(entreprise("nouvelle"), null);
    await expect(avancerMondeJusquA(s, PARAMS, t(0, 5))).rejects.toBeInstanceOf(ErreurMondeAncienCalendrier);
    expect(s.monde).toEqual({ id: "monde1", moisCourant: 11, debutReelMs: t(0) - 11 * 24 * HEURE });
    expect(s.entreprises.get("a")!.pasTraites).toBe(16_000);
    expect(s.entreprises.get("nouvelle")!.pasTraites).toBeNull();
    expect(s.ecritures).toHaveLength(0);
  });

  it("sans origine d'horloge, elle est fixée au 1er janvier 1970 : l'heure du jeu est l'heure réelle", async () => {
    const s = new StockageMemoire({ id: "monde1", moisCourant: M0, debutReelMs: null });
    s.ajouterEntreprise(entreprise("a"), null);
    const r = await avancerMondeJusquA(s, PARAMS, t(0, 30));
    expect(r.horlogeInitialisee).toBe(true);
    expect(s.monde.debutReelMs).toBe(0);
    expect(r.pasCible).toBe(PAS(0) + 30);
    expect(r.entreprises[0]!.etat).toBe("demarree");
    expect(s.ecritures).toHaveLength(0);
  });

  it("après la remise à zéro, toutes les sociétés démarrent au pas courant, sans rejouer d'historique", async () => {
    const s = monde(["a", "b"], null);
    const r = await avancerMondeJusquA(s, PARAMS, t(0, 250));
    expect(r.entreprises.map((e) => e.etat)).toEqual(["demarree", "demarree"]);
    expect(s.entreprises.get("a")!.cumul).toMatchObject({ mois: M0, pasTraites: 250, pasDemarrage: 250 });
    expect(s.ecritures).toHaveLength(0);
  });
});

describe("avancerMondeJusquA — démarrages", () => {
  it("une entreprise créée en cours de mois démarre au pas courant, sans rattraper le début du mois", async () => {
    const s = monde(["a"]);
    const maintenant = t(1, 300);
    await avancerMondeJusquA(s, PARAMS, maintenant);
    s.ajouterEntreprise(entreprise("nouvelle"), null);

    const r = await avancerMondeJusquA(s, PARAMS, maintenant);
    const nouvelle = r.entreprises.find((e) => e.entreprise === "nouvelle")!;
    expect(nouvelle.etat).toBe("demarree");
    expect(s.entreprises.get("nouvelle")!.pasTraites).toBe(PAS(1) + 300);
    expect(s.entreprises.get("nouvelle")!.cumul).toMatchObject({ mois: M0 + 1, pasTraites: 300, pasDemarrage: 300 });
    expect(s.ecrituresDe("nouvelle")).toHaveLength(0);

    // 3 heures plus tard : quelques ventes au plus, pas la moitié d'un mois d'un coup
    await avancerMondeJusquA(s, PARAMS, maintenant + 3 * HEURE);
    const vendues = s
      .ecrituresDe("nouvelle")
      .filter((e) => e.libelle.startsWith("Vente directe"))
      .map((e) => Number(/ (\d+) /.exec(e.libelle)?.[1] ?? 0))
      .reduce((a, b) => a + b, 0);
    expect(vendues).toBeLessThanOrEqual(3);
    expect(s.entreprises.get("nouvelle")!.pasTraites).toBe(PAS(1) + 303);
  });
});

describe("avancerMondeJusquA — règlement des fournisseurs à l'échéance", () => {
  it("une dette échue est réglée une seule fois, au premier pas du mois, 401 débit / 512 crédit", async () => {
    const s = monde();
    s.dettesParMois.set(`a|${M0 + 1}`, [{ ordreId: "po1", nature: "matiere", montant: centimes(42_000) }]);
    await avancerMondeJusquA(s, PARAMS, t(0, 360));
    expect(idsEcritures(s, "a")).not.toContain("reglement_matiere_po1");
    await avancerMondeJusquA(s, PARAMS, t(1, 2));
    const reglements = s.ecrituresDe("a").filter((e) => e.id === "reglement_matiere_po1");
    expect(reglements).toHaveLength(1);
    expect(reglements[0]!.lignes).toEqual([
      { compte: "401", sens: "debit", montant: 42_000 },
      { compte: "512", sens: "credit", montant: 42_000 },
    ]);
    // Rejouer le mois suivant ne la repaie pas.
    s.dettesParMois.set(`a|${M0 + 2}`, s.dettesParMois.get(`a|${M0 + 1}`)!);
    await avancerMondeJusquA(s, PARAMS, t(2, 2));
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
  const idLivraison = (cmd: string) => `livraison_mat_${M0}_${cmd}`;

  it("une livraison arrive au pas prévu, pas avant, et une seule fois", async () => {
    const s = monde();
    s.ajouterLivraison("a", livraison("cmd1", t(0, 10.5)));

    await avancerMondeJusquA(s, PARAMS, t(0, 10));
    expect(idsEcritures(s, "a")).not.toContain(idLivraison("cmd1"));

    await avancerMondeJusquA(s, PARAMS, t(0, 11));
    expect(idsEcritures(s, "a").filter((id) => id === idLivraison("cmd1"))).toHaveLength(1);
    expect(s.livraisons.get("a")![0]!.statut).toBe("livree");

    await avancerMondeJusquA(s, PARAMS, t(0, 60));
    expect(idsEcritures(s, "a").filter((id) => id === idLivraison("cmd1"))).toHaveLength(1);
  });

  it("une livraison en retard (avant le lot en cours) est traitée dès le premier pas", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, t(0, 30));
    s.ajouterLivraison("a", livraison("retard", t(0, 5))); // prévue il y a 25 heures
    await avancerMondeJusquA(s, PARAMS, t(0, 31));
    expect(idsEcritures(s, "a")).toContain(idLivraison("retard"));
  });

  it("une créance revendeur est encaissée au premier pas du mois concerné", async () => {
    const s = monde();
    s.creancesParMois.set(`a|${M0 + 2}`, [{ ecritureId: "vente_x", montant: centimes(12_345) }]);
    await avancerMondeJusquA(s, PARAMS, t(2, 5));
    const encaissement = s.ecrituresDe("a").find((e) => e.id === `encaissement_${M0 + 2}_vente_x`);
    expect(encaissement).toBeDefined();
    expect(encaissement!.lignes).toEqual([
      { compte: "512", sens: "debit", montant: 12_345 },
      { compte: "411", sens: "credit", montant: 12_345 },
    ]);
  });
});

describe("avancerMondeJusquA — constat d'étape à la clôture (AE-2)", () => {
  it("l'étape et les compteurs sont enregistrés à la clôture du mois, et ne redescendent pas", async () => {
    const s = new StockageMemoire({ id: "monde1", moisCourant: M0, debutReelMs: 0 });
    s.ajouterEntreprise({ ...entreprise("e"), etape: 0 }, PAS(0));

    await avancerMondeJusquA(s, PARAMS, t(0, 360));
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

    await avancerMondeJusquA(s, PARAMS, t(1));
    const apres = s.entreprises.get("e")!.entreprise;
    expect(apres.cumulsEtape!.piecesVendues).toBeGreaterThanOrEqual(50);
    expect(apres.cumulsEtape!.chiffreAffairesHt).toBeGreaterThan(0);
    expect(apres.etape).toBeGreaterThanOrEqual(1);

    const etapeMois1 = apres.etape;
    await avancerMondeJusquA(s, PARAMS, t(2));
    const mois2 = s.entreprises.get("e")!.entreprise;
    expect(mois2.etape).toBeGreaterThanOrEqual(etapeMois1);
    expect(mois2.cumulsEtape!.piecesVendues).toBeGreaterThan(apres.cumulsEtape!.piecesVendues);
  });
});

describe("avancerMondeJusquA — une seule convention de mois", () => {
  it("une vente pendant février 2027 est écrite au mois de février, celui de worlds.mois_courant", async () => {
    const s = monde();
    const fevrier = M0 + 3;
    await avancerMondeJusquA(s, PARAMS, t(3, 300));
    expect(s.monde.moisCourant).toBe(fevrier);
    const avant = new Set(idsEcritures(s, "a"));
    await avancerMondeJusquA(s, PARAMS, t(3, 360));
    const nouvelles = s.ecrituresDe("a").filter((e) => !avant.has(e.id));
    const ventes = nouvelles.filter((e) => e.id.startsWith("vente_"));
    expect(ventes.length).toBeGreaterThan(0);
    for (const v of ventes) {
      expect(v.mois).toBe(fevrier);
      expect(v.id.startsWith(`vente_${fevrier}_`)).toBe(true);
    }
    // toutes les écritures passées pendant février portent le mois de février
    expect(nouvelles.every((e) => e.mois === fevrier)).toBe(true);
  });

  it("les écritures de clôture portent le mois qui se termine", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, t(1));
    const paie = s.ecrituresDe("a").find((e) => e.id === `salaire_${M0}_a_s1`);
    expect(paie?.mois).toBe(M0);
    expect(s.monde.moisCourant).toBe(M0 + 1);
  });
});

describe("avancerMondeJusquA — dépense passée par une route en cours de mois", () => {
  // Une publicité payée par le site (623 / 512) baisse la trésorerie en base entre deux lots.
  // La clôture doit la voir : agios, compteur de mois à découvert, trésorerie de fin de mois.
  it("une publicité de 100 000 € payée à mi-mois met la clôture à découvert : agios et compteur", async () => {
    const s = monde();
    await avancerMondeJusquA(s, PARAMS, DEBUT + 0.5 * JOUR);
    s.passerEcritureDeRoute("a", {
      id: "marketing_test_a",
      mois: moisJeu(0),
      libelle: "Publicité",
      lignes: [
        { compte: "623", sens: "debit", montant: centimes(10_000_000) },
        { compte: "512", sens: "credit", montant: centimes(10_000_000) },
      ],
    });
    await avancerMondeJusquA(s, PARAMS, DEBUT + 1 * JOUR);

    const e = s.entreprises.get("a")!;
    expect(e.pasTraites).toBe(N);
    let net512 = 0;
    for (const ec of s.ecrituresDe("a")) {
      for (const l of ec.lignes) if (l.compte === "512") net512 += l.sens === "debit" ? l.montant : -l.montant;
    }
    // Trésorerie = départ + tout le compte 512, publicité comprise ; elle finit sous zéro.
    expect(e.entreprise.tresorerie).toBe(5_000_000 + net512);
    expect(e.entreprise.tresorerie).toBeLessThan(0);
    expect(idsEcritures(s, "a")).toContain("agios_0_a");
    expect(e.moisDecouvertConsecutifs).toBe(1);
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
    s.ajouterLivraison("a", livraison("cmd1", t(0, 10.5)));
    await avancerMondeJusquA(s, PARAMS, t(1, 5));

    const evs = s.evenementsDe("a");
    const liv = evs.find((e) => e.cle === "livraison_matiere_cmd1");
    expect(liv).toMatchObject({ type: "livraison_matiere", moisJeu: M0, pas: PAS(0) + 10 });
    const cloture = evs.find((e) => e.cle === `cloture_${M0}`);
    expect(cloture?.type).toBe("cloture_mois");
    const detail = cloture!.detail as { explications: { cle: string }[]; paiements: { paie: number; loyers: number } };
    expect(detail.explications.map((x) => x.cle)).toContain("tresorerie");
    expect(detail.paiements.paie).toBeGreaterThan(0);
    expect(detail.paiements.loyers).toBe(250_000);
  });

  it("rejouer le même pas ne duplique aucun événement", async () => {
    const s = monde();
    s.ajouterLivraison("a", livraison("cmd1", t(0, 10.5)));
    await avancerMondeJusquA(s, PARAMS, t(1, 5));
    const avant = cles(s, "a");

    // Même instant : rien n'est retraité.
    await avancerMondeJusquA(s, PARAMS, t(1, 5));
    expect(cles(s, "a")).toEqual(avant);

    // Deux traitements simultanés du même pas : un seul passe, les clés restent uniques.
    const double = monde();
    double.ajouterLivraison("a", livraison("cmd1", t(0, 10.5)));
    double.cederLaMain = true;
    await Promise.all([
      avancerMondeJusquA(double, PARAMS, t(1, 5)),
      avancerMondeJusquA(double, PARAMS, t(1, 5)),
    ]);
    expect(cles(double, "a")).toEqual(avant);

    // Réenregistrer les mêmes événements (reprise après panne) : la clé unique les ignore.
    await s.enregistrerEvenements("a", s.evenementsDe("a"));
    expect(cles(s, "a")).toEqual(avant);
    expect(new Set(avant).size).toBe(avant.length);
  });

  it("avancer en une fois ou par morceaux donne le même journal", async () => {
    const enUneFois = monde();
    await avancerMondeJusquA(enUneFois, PARAMS, t(2, 360));
    const parMorceaux = monde();
    for (let ms = t(0, 97); ms < t(2, 360); ms += 97 * HEURE) await avancerMondeJusquA(parMorceaux, PARAMS, ms);
    await avancerMondeJusquA(parMorceaux, PARAMS, t(2, 360));
    expect(parMorceaux.evenementsDe("a")).toEqual(enUneFois.evenementsDe("a"));
  });

  it("une panne du journal n'annule pas le pas déjà enregistré", async () => {
    const s = monde();
    s.pannesJournal = 1;
    const r = await avancerMondeJusquA(s, PARAMS, t(1, 5));
    expect(r.entreprises[0]!.etat).toBe("avancee");
    expect(s.entreprises.get("a")!.pasTraites).toBe(PAS(1) + 5);
  });

  it("chaque société n'a que ses propres événements", async () => {
    const s = monde(["a", "b"]);
    s.ajouterLivraison("a", livraison("cmd1", t(0, 10.5)));
    await avancerMondeJusquA(s, PARAMS, t(1, 5));
    expect(cles(s, "a")).toContain("livraison_matiere_cmd1");
    expect(cles(s, "b")).not.toContain("livraison_matiere_cmd1");
    expect(cles(s, "b")).toContain(`cloture_${M0}`);
  });
});
