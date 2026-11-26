import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  centimes,
  configTempsDepuis,
  debutDuMoisMs,
  heureLocaleParis,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  idSalarie,
  indexDuMois,
  moisJeu,
  pasAbsoluDepuisPosition,
  type Entreprise,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { avancerMondeJusquA } from "../avance/orchestrateur.js";
import { StockageMemoire } from "../avance/stockageMemoire.js";
import { avancerLeTemps, type ContexteAction } from "./avancerLeTemps.js";
import { JournalAuditMemoire } from "./journalMemoire.js";
import { ErreurAdmin } from "./port.js";
import { postesALaSignature } from "@kapital/engine";
import { chargerModulesV1 } from "@kapital/content";

const MODULES_CATALOGUE = chargerModulesV1();

const MIN = 60_000;
const HEURE = 60 * MIN;
const JOUR = 24 * HEURE;
const NOVEMBRE = indexDuMois(2026, 11);
// Jeudi 26 novembre 2026, 10 h 21 à Paris. En production l'origine de l'horloge est 1970 (0).
const MAINTENANT = Date.parse("2026-11-26T09:21:00Z");
const ORIGINE = 0;

const PARAMS: Parametres = (() => {
  const p = chargerParametresV1();
  return {
    ...p,
    taille_marche_mois_milieu: { ...p["taille_marche_mois_milieu"]!, valeur: 1500 },
    // Pas d'une heure : les tests restent rapides.
    temps_minutes_reelles_par_pas: { ...p["temps_minutes_reelles_par_pas"]!, valeur: 60 },
  };
})();

const OK: ContexteAction = {
  modeRecette: true,
  codeAttendu: "code-secret",
  codeSaisi: "code-secret",
  acteur: "profil-admin",
};

function monde(debutReelMs: number | null = ORIGINE): StockageMemoire {
  return new StockageMemoire({ id: "monde1", moisCourant: NOVEMBRE, debutReelMs });
}

async function refus(promesse: Promise<unknown>): Promise<ErreurAdmin> {
  try {
    await promesse;
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurAdmin);
    return e as ErreurAdmin;
  }
  throw new Error("aucun refus : l'action aurait dû être refusée");
}

describe("avancerLeTemps — calcul", () => {
  it("avancer d'une heure ou d'un jour recule l'origine de l'horloge d'autant", async () => {
    const heure = monde();
    const r = await avancerLeTemps(heure, new JournalAuditMemoire(), "heure", OK, MAINTENANT);
    expect(r.decalageMs).toBe(HEURE);
    expect(heure.monde.debutReelMs).toBe(ORIGINE - HEURE);

    const jour = monde();
    await avancerLeTemps(jour, new JournalAuditMemoire(), "jour", OK, MAINTENANT);
    expect(jour.monde.debutReelMs).toBe(ORIGINE - JOUR);
  });

  it("« fin du mois » amène le jeu au 1er du mois suivant à 0 h, heure de Paris", async () => {
    const s = monde();
    const r = await avancerLeTemps(s, new JournalAuditMemoire(), "fin_du_mois", OK, MAINTENANT);
    const heureJeu = MAINTENANT - s.monde.debutReelMs!;
    expect(heureJeu).toBe(debutDuMoisMs(NOVEMBRE + 1));
    expect(heureLocaleParis(heureJeu)).toMatchObject({ annee: 2026, mois: 12, jour: 1, heure: 0, minute: 0 });
    // du jeudi 26 novembre 10 h 21 au 1er décembre 0 h : 4 jours 13 h 39
    expect(r.decalageMs).toBe(4 * JOUR + 13 * HEURE + 39 * MIN);
  });

  it("les avances se cumulent : deux « fin du mois » de suite mènent au 1er janvier", async () => {
    const s = monde();
    const audit = new JournalAuditMemoire();
    await avancerLeTemps(s, audit, "fin_du_mois", OK, MAINTENANT);
    await avancerLeTemps(s, audit, "fin_du_mois", OK, MAINTENANT);
    expect(heureLocaleParis(MAINTENANT - s.monde.debutReelMs!)).toMatchObject({ annee: 2027, mois: 1, jour: 1, heure: 0 });
  });
});

describe("avancerLeTemps — verrous", () => {
  it("refuse hors du mode recette, sans rien modifier", async () => {
    const s = monde();
    const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), "jour", { ...OK, modeRecette: false }, MAINTENANT));
    expect(e.statut).toBe(403);
    expect(s.monde.debutReelMs).toBe(ORIGINE);
  });

  it("refuse tant qu'aucun code admin n'est configuré", async () => {
    for (const codeAttendu of [undefined, ""]) {
      const s = monde();
      const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), "jour", { ...OK, codeAttendu }, MAINTENANT));
      expect(e.statut).toBe(403);
      expect(e.message).toMatch(/non configuré/);
      expect(s.monde.debutReelMs).toBe(ORIGINE);
    }
  });

  it("refuse un mauvais code ou un code absent, et garde une trace du refus", async () => {
    for (const codeSaisi of ["faux", "", undefined, "code-secret "]) {
      const s = monde();
      const audit = new JournalAuditMemoire();
      const e = await refus(avancerLeTemps(s, audit, "jour", { ...OK, codeSaisi }, MAINTENANT));
      expect(e.statut).toBe(403);
      expect(s.monde.debutReelMs).toBe(ORIGINE);
      expect(audit.entrees.map((x) => x.action)).toEqual(["admin.avancer_temps.refuse"]);
    }
  });

  it("refuse une durée qui n'est pas dans la liste (dont les anciennes « semaine » et « mois »)", async () => {
    for (const duree of ["an", "semaine", "mois", "10", "", "__proto__", "constructor"]) {
      const s = monde();
      const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), duree, OK, MAINTENANT));
      expect(e.statut).toBe(400);
      expect(s.monde.debutReelMs).toBe(ORIGINE);
    }
  });

  it("refuse tant que l'horloge commune n'est pas initialisée", async () => {
    const s = monde(null);
    const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), "jour", OK, MAINTENANT));
    expect(e.statut).toBe(409);
    expect(e.message).toMatch(/Mettre le monde à jour/);
  });

  it("refuse un monde encore sur l'ancien calendrier (avant la migration 0043)", async () => {
    const s = new StockageMemoire({ id: "monde1", moisCourant: 11, debutReelMs: MAINTENANT - 11 * JOUR });
    const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), "jour", OK, MAINTENANT));
    expect(e.statut).toBe(409);
    expect(e.message).toMatch(/0043/);
    expect(s.monde.debutReelMs).toBe(MAINTENANT - 11 * JOUR);
  });
});

describe("avancerLeTemps — journal d'audit", () => {
  it("garde une trace de chaque avance réussie : qui, quoi, de combien", async () => {
    const audit = new JournalAuditMemoire();
    await avancerLeTemps(monde(), audit, "jour", OK, MAINTENANT);
    expect(audit.entrees).toHaveLength(1);
    expect(audit.entrees[0]).toMatchObject({
      profileId: "profil-admin",
      action: "admin.avancer_temps",
      cible: "monde1",
      details: { duree: "jour", decalageMs: JOUR, debutReelApresMs: expect.any(Number) },
    });
    // jamais le code, ni saisi ni attendu
    expect(JSON.stringify(audit.entrees)).not.toContain("code-secret");
  });
});

describe("avancerLeTemps — effet sur les entreprises", () => {
  const e: Entreprise = {
    id: idEntreprise("a"),
    nom: "A",
    gamme: "milieu",
    etape: 1,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(5_000_000),
    stocksMatiere: [{ matiere: idMatiere("mat_coton"), quantite: 1000, valeurTotale: centimes(1_500_000) }],
    stocksFinis: [{ produit: idProduit("prod_tshirt"), quantite: 2000, valeurTotale: centimes(3_000_000) }],
    salaries: [{ id: idSalarie("s1"), poste: "artisan", salaireBrutMensuel: centimes(186702), ancienneteMois: 6, experienceMois: 6 }],
    ateliers: [{ surfaceM2: 150, loyerMensuel: centimes(250_000), modules: postesALaSignature(2, MODULES_CATALOGUE) }],
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [{ id: idPret("p1"), capitalInitial: centimes(1_000_000), capitalRestant: centimes(1_000_000), tauxAnnuel: 0.04, dureeTotaleMois: 24, objet: "tresorerie", moisDebut: moisJeu(NOVEMBRE - 1) }],
    catalogue: [{ produit: idProduit("prod_tshirt"), qualiteVisee: 60, prix: { vente_directe: centimes(3000), revendeur: centimes(1800) }, productionMensuelleCible: 60, fabrication: { matiere: idMatiere("mat_coton"), consommationParPiece: 1, fournituresParPiece: centimes(0), tempsStandardMinutes: 30 } }],
  };

  it("après « fin du mois », la mise à jour fait rattraper la fin de novembre et clôture le mois", async () => {
    const config = configTempsDepuis(PARAMS);
    const s = monde();
    s.ajouterEntreprise(e, pasAbsoluDepuisPosition(config, NOVEMBRE, 0));
    await avancerMondeJusquA(s, PARAMS, MAINTENANT);
    expect(s.monde.moisCourant).toBe(NOVEMBRE);
    expect(s.ecrituresDe("a").map((x) => x.id)).not.toContain(`salaire_${NOVEMBRE}_s1`);

    await avancerLeTemps(s, new JournalAuditMemoire(), "fin_du_mois", OK, MAINTENANT);
    await avancerMondeJusquA(s, PARAMS, MAINTENANT);

    expect(s.entreprises.get("a")!.pasTraites).toBe(pasAbsoluDepuisPosition(config, NOVEMBRE + 1, 0));
    expect(s.ecrituresDe("a").map((x) => x.id)).toContain(`salaire_${NOVEMBRE}_s1`);
    expect(s.monde.moisCourant).toBe(NOVEMBRE + 1);
  });
});
