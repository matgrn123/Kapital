import { describe, expect, it } from "vitest";
import { chargerParametresV1 } from "@kapital/content";
import { centimes, enEquilibre, soldeCompte } from "@kapital/engine";
import { grandLivreDepuis } from "./gardeFou.js";
import { creerEntreprise, donnerConge, signerBail } from "./pilote.js";
import { jouerScenarioMultiLocaux, POLITIQUE_MULTI } from "./scenarioMultiLocaux.js";
import { missionsDuBanc } from "./scenarioBoutique.js";

// 3D-7 : le joueur loue un deuxième local, y embauche, puis lui donne congé. Garde-fou monétaire
// (3D-9) à chaque clôture ; le premier local n'est jamais touché.

const PARAMS = chargerParametresV1();
const DUREE = 30;
const { etat, journal } = jouerScenarioMultiLocaux({ mois: DUREE, graine: 7 });

const signatures = etat.ecritures.filter((e) => e.id.startsWith("bail_signature_"));
const restitutions = etat.ecritures.filter((e) => e.id.startsWith("bail_restitution_"));
const idLocal = (id: string) => id.slice(id.lastIndexOf("_local_") + 1);

describe("3D-7 · banc avec un deuxième local", () => {
  it("joue la durée prévue, sans aucune anomalie du garde-fou monétaire, chaque mois", () => {
    expect(etat.historique).toHaveLength(DUREE);
    for (const b of etat.historique) expect(b.anomalies, `mois ${b.mois}`).toEqual([]);
    expect(enEquilibre(grandLivreDepuis(etat.ecritures))).toBe(true);
  });

  it("loue un deuxième local : deux dépôts de garantie (275 / 512), un par local", () => {
    expect(journal.some((l) => l.endsWith(`deuxième local ${POLITIQUE_MULTI.batiment}`))).toBe(true);
    expect(signatures).toHaveLength(2);
    expect(new Set(signatures.map((s) => idLocal(s.id))).size).toBe(2);
    for (const s of signatures) {
      expect(s.lignes.map((l) => [l.compte, l.sens])).toEqual([
        ["275", "debit"],
        ["512", "credit"],
      ]);
    }
  });

  it("pendant que les deux locaux sont loués : deux loyers 613 par mois, et la capacité suit les deux", () => {
    const moisSecond = signatures[1]!.mois;
    const loyers = etat.ecritures.filter((e) => e.mois === moisSecond && e.id.startsWith("loyer_"));
    expect(loyers).toHaveLength(2);
    expect(new Set(loyers.map((l) => idLocal(l.id)))).toEqual(new Set(signatures.map((s) => idLocal(s.id))));
    const postesAvant = etat.historique[moisSecond - 1]!.postes;
    expect(etat.historique[moisSecond]!.postes).toBe(postesAvant + PARAMS["bail_machines_a_la_signature"]!.valeur);
  });

  it("le congé libère le seul deuxième local : son dépôt revient, le premier reste", () => {
    expect(journal.some((l) => l.endsWith("congé du deuxième local"))).toBe(true);
    expect(restitutions).toHaveLength(1);
    expect(idLocal(restitutions[0]!.id)).toBe(idLocal(signatures[1]!.id));
    expect(etat.entreprise.ateliers.map((a) => a.id)).toEqual([idLocal(signatures[0]!.id)]);
    const gl = grandLivreDepuis(etat.ecritures);
    expect(soldeCompte(gl, "275")).toBe(etat.entreprise.ateliers[0]!.bail!.depotGarantie);
    // Après la fin du bail, un seul loyer par mois.
    const moisFin = restitutions[0]!.mois;
    expect(etat.ecritures.filter((e) => e.mois === moisFin + 1 && e.id.startsWith("loyer_"))).toHaveLength(1);
  });

  it("la mission « Louer ou acheter » lit toujours les préfixes de signature", () => {
    const m5 = missionsDuBanc(etat).find((m) => m.id === "mission5");
    expect(m5?.etat).toBe("validee");
  });

  it("rejouable à l'identique", () => {
    const bis = jouerScenarioMultiLocaux({ mois: DUREE, graine: 7 });
    expect(bis.etat.ecritures).toEqual(etat.ecritures);
  });
});

describe("3D-7 · pilote : congé d'un local précis", () => {
  it("refuse un local inconnu, et un second congé du même local", () => {
    const debut = creerEntreprise({ params: PARAMS, nom: "Congé", gamme: "entree" });
    const etape2 = { ...debut, entreprise: { ...debut.entreprise, etape: 2 as const } };
    expect(donnerConge(etape2, "local_inconnu").ok).toBe(false);
    const avecLocal = signerBail({ ...etape2, entreprise: { ...etape2.entreprise, tresorerie: centimes(10_000_000) } }, "petit_atelier");
    expect(avecLocal.ok).toBe(true);
    if (!avecLocal.ok) return;
    const id = avecLocal.etat.entreprise.ateliers[0]!.id!;
    const conge = donnerConge(avecLocal.etat, id);
    expect(conge.ok).toBe(true);
    if (!conge.ok) return;
    const encore = donnerConge(conge.etat, id);
    expect(encore.ok).toBe(false);
    if (!encore.ok) expect(encore.code).toBe("conge_deja_donne");
  });
});
