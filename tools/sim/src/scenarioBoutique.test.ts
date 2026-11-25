import { describe, expect, it } from "vitest";
import { enEquilibre, soldeCompte } from "@kapital/engine";
import { grandLivreDepuis, verifierGardeFouMonetaire } from "./gardeFou.js";
import { jouerScenarioBoutique } from "./scenarioBoutique.js";

// AE-10 : garde-fou monétaire (3D-9) sur un scénario avec boutique : 24 mois du scénario solo,
// puis 12 mois avec une boutique (un mois de travaux), un vendeur et du stock transféré.

const { etat, journal } = jouerScenarioBoutique({ moisAvant: 24, moisBoutique: 12, graine: 7 });

/** Même tolérance que le scénario solo : arrondi du coût moyen des ventes directes (bug signalé, PR #111). */
const ANOMALIES_CONNUES = new Set(["stock_fini_sans_ecriture"]);

const ventesBoutique = (mois: number) =>
  etat.ecritures.filter((e) => e.mois === mois && e.id.startsWith("vente_") && e.id.endsWith("_boutique"));

describe("AE-10 · scénario avec boutique (36 mois)", () => {
  it("ouvre la boutique, embauche un vendeur et transfère du stock", () => {
    expect(etat.historique).toHaveLength(36);
    expect(journal).toContain("mois 24 : ouverture de la boutique boutique_quartier_createurs");
    expect(journal).toContain("mois 24 : embauche d'un vendeur");
    expect(journal.some((l) => /^mois 24 : boutique ×\d+$/.test(l))).toBe(true);
  });

  it("aucune vente pendant le mois de travaux, puis des ventes plafonnées par le vendeur", () => {
    expect(ventesBoutique(24)).toHaveLength(0);
    for (let m = 25; m < 36; m++) {
      const pieces = ventesBoutique(m).reduce((s, e) => s + Number(/Vente boutique (\d+)/.exec(e.libelle)![1]), 0);
      expect(pieces, `mois ${m}`).toBeGreaterThan(0);
      expect(pieces, `mois ${m}`).toBeLessThanOrEqual(300);
    }
  });

  it("garde-fou monétaire : aucune anomalie nouvelle à aucune clôture", () => {
    for (const b of etat.historique) {
      const nouvelles = b.anomalies.filter((a) => !ANOMALIES_CONNUES.has(a.code));
      expect(nouvelles, `mois ${b.mois}`).toEqual([]);
    }
  });

  it("le garde-fou détecte une boutique dont l'état ne suit pas le grand livre", () => {
    const pdv = etat.entreprise.pointsDeVente![0]!;
    const truquee = {
      ...etat.entreprise,
      pointsDeVente: [{ ...pdv, agencement: { ...pdv.agencement, amortissementsCumules: 0 as never } }],
    };
    const anomalies = verifierGardeFouMonetaire({
      ecrituresAvant: [],
      ecrituresPeriode: etat.ecritures,
      entrepriseAvant: null,
      entrepriseApres: truquee,
    });
    expect(anomalies.map((a) => a.code)).toContain("agencement_sans_ecriture");
  });

  it("bilan équilibré ; dépôt, agencements et amortissements au grand livre", () => {
    const gl = grandLivreDepuis(etat.ecritures);
    expect(enEquilibre(gl)).toBe(true);
    const pdv = etat.entreprise.pointsDeVente![0]!;
    expect(soldeCompte(gl, "2135")).toBe(pdv.agencement.valeurBrute);
    // 11 mois ouverts (25 à 35) × 18 750 centimes.
    expect(soldeCompte(gl, "28135")).toBe(11 * 18_750);
    expect(soldeCompte(gl, "275")).toBe(pdv.depotGarantie + (etat.entreprise.atelier?.bail?.depotGarantie ?? 0));
  });

  it("est rejouable à l'identique", () => {
    const encore = jouerScenarioBoutique({ moisAvant: 24, moisBoutique: 12, graine: 7 });
    expect(JSON.stringify(encore.etat)).toBe(JSON.stringify(etat));
  });
});
