import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { enEquilibre, etapeRequisePour, soldeCompte } from "@kapital/engine";
import { grandLivreDepuis, verifierGardeFouMonetaire } from "./gardeFou.js";
import { creerEntreprise, ouvrirBoutique } from "./pilote.js";
import { jouerScenarioBoutique, missionsDuBanc, POLITIQUE_BOUTIQUE } from "./scenarioBoutique.js";

// AE-11 : banc prolongé à 36 mois. Le joueur du scénario solo fait de la publicité dès l'étape 1,
// atteint l'étape 3, ouvre une boutique (24 h de travaux, lot T3), embauche un vendeur et y envoie
// du stock. Garde-fou monétaire (3D-9) à chaque clôture, missions évaluées avec la règle du site.

const { etat, journal } = jouerScenarioBoutique({ mois: 36, graine: 7 });

/** Aucune anomalie tolérée : l'arrondi du coût moyen des ventes est corrigé (PR #111). */
const ANOMALIES_CONNUES = new Set<string>();

const ventesBoutique = (mois: number) =>
  etat.ecritures.filter((e) => e.mois === mois && e.id.startsWith("vente_") && e.id.endsWith("_boutique"));

const moisEtape3 = etat.historique.find((b) => b.etape >= 3)?.mois ?? -1;
const pdv = etat.entreprise.pointsDeVente?.[0];
const PARAMS = chargerParametresV1();

describe("AE-11 · banc de 36 mois jusqu'à la boutique", () => {
  it("joue 36 mois et atteint l'étape 3, sans jamais redescendre", () => {
    expect(etat.historique).toHaveLength(36);
    expect(moisEtape3).toBeGreaterThanOrEqual(0);
    expect(etat.entreprise.etape).toBe(3);
    for (let i = 1; i < etat.historique.length; i++) {
      expect(etat.historique[i]!.etape).toBeGreaterThanOrEqual(etat.historique[i - 1]!.etape);
    }
  });

  it("ouvre la boutique au mois qui suit le constat de l'étape 3, embauche un vendeur et transfère du stock", () => {
    const moisOuverture = moisEtape3 + 1;
    expect(pdv?.moisSignature).toBe(moisOuverture);
    expect(journal).toContain(`mois ${moisOuverture} : ouverture de la boutique ${POLITIQUE_BOUTIQUE.batiment}`);
    expect(journal).toContain(`mois ${moisOuverture} : embauche d'un vendeur`);
    expect(journal.some((l) => new RegExp(`^mois ${moisOuverture} : boutique ×\\d+$`).test(l))).toBe(true);
  });

  it("le pilote refuse d'ouvrir une boutique avant l'étape 3 (étape réelle)", () => {
    const debut = creerEntreprise({ params: PARAMS, nom: "Trop tôt", gamme: "entree" });
    const r = ouvrirBoutique(debut, POLITIQUE_BOUTIQUE.batiment);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("etape_insuffisante");
    expect(etapeRequisePour("ouverture_boutique")).toBe(3);
  });

  it("24 h de travaux : elle ouvre le mois de la signature, puis des ventes plafonnées par le vendeur", () => {
    expect(pdv).toBeDefined();
    // T3 : la signature a lieu au début du mois (banc d'essai), l'ouverture 24 h plus tard.
    expect(pdv!.moisOuverture).toBe(pdv!.moisSignature);
    expect(pdv!.ouvertureMs).toBeDefined();
    const plafond = PARAMS["vendeur_ventes_max_pieces_par_mois"]!.valeur;
    for (let m = pdv!.moisOuverture; m < 36; m++) {
      const pieces = ventesBoutique(m).reduce((s, e) => s + Number(/Vente boutique (\d+)/.exec(e.libelle)![1]), 0);
      expect(pieces, `mois ${m}`).toBeGreaterThan(0);
      expect(pieces, `mois ${m}`).toBeLessThanOrEqual(plafond);
    }
  });

  it("garde-fou monétaire : aucune anomalie à aucune clôture", () => {
    for (const b of etat.historique) {
      const nouvelles = b.anomalies.filter((a) => !ANOMALIES_CONNUES.has(a.code));
      expect(nouvelles, `mois ${b.mois}`).toEqual([]);
    }
  });

  it("le garde-fou détecte une boutique dont l'état ne suit pas le grand livre", () => {
    const truquee = {
      ...etat.entreprise,
      pointsDeVente: [{ ...pdv!, agencement: { ...pdv!.agencement, amortissementsCumules: 0 as never } }],
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
    expect(soldeCompte(gl, "2135")).toBe(pdv!.agencement.valeurBrute);
    const moisOuverts = 36 - pdv!.moisOuverture;
    const amortissementMensuel = Math.round(pdv!.agencement.valeurBrute / pdv!.agencement.dureeAmortissementMois);
    expect(soldeCompte(gl, "28135")).toBe(moisOuverts * amortissementMensuel);
    expect(soldeCompte(gl, "275")).toBe(pdv!.depotGarantie + etat.entreprise.ateliers.reduce((s, a) => s + (a.bail?.depotGarantie ?? 0), 0));
  });

  it("les cinq missions se valident, dont « Ouvrir ma boutique sans découvert » et « Louer ou acheter »", () => {
    const missions = missionsDuBanc(etat);
    expect(missions.map((m) => [m.id, m.etat])).toEqual([
      ["mission1", "validee"],
      ["mission2", "validee"],
      ["mission3", "validee"],
      ["mission4", "validee"],
      ["mission5", "validee"],
    ]);
  });

  it("est rejouable à l'identique", () => {
    const encore = jouerScenarioBoutique({ mois: 36, graine: 7 });
    expect(JSON.stringify(encore.etat)).toBe(JSON.stringify(etat));
  });
});
