import { chargerModulesV1 } from "@kapital/content";
import { centimes, postesEquipesAteliers } from "@kapital/engine";
import { describe, expect, it } from "vitest";
import {
  atelierDepuisLigne,
  materielDepuisLedger,
  materielParLocal,
  modulesDepuisLignes,
  salarieDepuisLigne,
  SELECTION_WORKSHOPS,
  type LigneWorkshop,
} from "./stockageSupabase.js";

// 3D-7 : chargerEtat lit tous les locaux de la société et répartit le matériel (2154 / 2815).

const CATALOGUE = chargerModulesV1();

function ligne(o: Partial<LigneWorkshop> & { id: string }): LigneWorkshop {
  return {
    surface_m2: 50,
    loyer_mensuel_centimes: 100_000,
    placed_modules: [
      { module_type_id: "poste_couture_base", x: 2, y: 1, pivote: false, statut: "actif" },
      { module_type_id: "poste_couture_base", x: 5, y: 1, pivote: false, statut: "actif" },
      { module_type_id: "poste_couture_base", x: 8, y: 1, pivote: false, statut: "prevu" },
    ],
    depot_garantie_centimes: 100_000,
    charges_mensuelles_centimes: 30_000,
    mois_signature: 2,
    mois_fin: null,
    mode_detention: "bail",
    prix_achat_centimes: 0,
    apport_centimes: 0,
    mois_achat: null,
    duree_amortissement_mois: null,
    ...o,
  };
}

describe("3D-7 : matériel réparti entre les locaux", () => {
  const lignes = [
    { ecriture_id: "amenagement_wA_123", compte: "2154", sens: "debit", montant_centimes: 60_000 },
    { ecriture_id: "amenagement_wB_456", compte: "2154", sens: "debit", montant_centimes: 40_000 },
    { ecriture_id: "amort_4_ent_wB", compte: "2815", sens: "credit", montant_centimes: 1_000 },
    // Écriture d'avant 3D-7 (sans id de local) : au plus ancien local.
    { ecriture_id: "amort_3_ent", compte: "2815", sens: "credit", montant_centimes: 2_000 },
  ];

  it("chaque écriture revient au local dont elle porte l'id, les anciennes au plus ancien", () => {
    const m = materielParLocal(lignes, ["wA", "wB"]);
    expect(m.get("wA")).toEqual({ valeurBrute: 60_000, amortissementsCumules: 2_000 });
    expect(m.get("wB")).toEqual({ valeurBrute: 40_000, amortissementsCumules: 1_000 });
  });

  it("un seul local : tout le matériel, comme avant 3D-7", () => {
    expect(materielParLocal(lignes, ["wA"]).get("wA")).toEqual(materielDepuisLedger(lignes));
  });

  it("aucun local : rien", () => {
    expect(materielParLocal(lignes, []).size).toBe(0);
  });
});

describe("3D-7 : locaux lus en base", () => {
  it("un local loué garde son id, son bail et ses seuls modules en service", () => {
    const w = ligne({ id: "wA" });
    const a = atelierDepuisLigne(w, modulesDepuisLignes(w.placed_modules, CATALOGUE), { valeurBrute: centimes(0), amortissementsCumules: centimes(0) });
    expect(a.id).toBe("wA");
    expect(a.loyerMensuel).toBe(100_000);
    expect(a.bail?.depotGarantie).toBe(100_000);
    expect(a.achat).toBeUndefined();
    expect(a.modules).toHaveLength(2);
  });

  it("un local acheté n'a pas de loyer ; la capacité additionne les postes des deux locaux", () => {
    const wA = ligne({ id: "wA" });
    const wB = ligne({ id: "wB", mode_detention: "credit", prix_achat_centimes: 9_000_000, apport_centimes: 3_000_000, mois_achat: 4, duree_amortissement_mois: 240 });
    const vide = { valeurBrute: centimes(0), amortissementsCumules: centimes(0) };
    const ateliers = [wA, wB].map((w) => atelierDepuisLigne(w, modulesDepuisLignes(w.placed_modules, CATALOGUE), vide));
    expect(ateliers[1]!.loyerMensuel).toBe(0);
    expect(ateliers[1]!.achat?.prixAchat).toBe(9_000_000);
    expect(postesEquipesAteliers(ateliers)).toBe(4);
  });
});

describe("T4 : date de signature du bail (workshops.cree_le), pour le prorata du premier mois", () => {
  const vide = { valeurBrute: centimes(0), amortissementsCumules: centimes(0) };
  const reel = Date.parse("2026-11-21T09:00:00.000Z");

  it("cree_le (instant réel) devient l'heure du jeu de la signature, en retirant worlds.debut_reel", () => {
    const w = ligne({ id: "wA", cree_le: "2026-11-21T09:00:00.000Z" });
    expect(atelierDepuisLigne(w, [], vide).bail?.signatureMs).toBe(reel);
    // Recette : l'outil d'admin a reculé debut_reel de 10 jours, le jeu est en avance d'autant.
    const recul = -10 * 86_400_000;
    expect(atelierDepuisLigne(w, [], vide, recul).bail?.signatureMs).toBe(reel - recul);
  });

  it("sans cree_le : pas de date de signature (mois entier)", () => {
    expect(atelierDepuisLigne(ligne({ id: "wA" }), [], vide).bail).not.toHaveProperty("signatureMs");
    expect(atelierDepuisLigne(ligne({ id: "wA", cree_le: null }), [], vide).bail).not.toHaveProperty("signatureMs");
  });

  it("la lecture des locaux demande cree_le", () => {
    expect(SELECTION_WORKSHOPS).toMatch(/\bcree_le\b/);
  });
});

describe("T4 : salariés lus en base (date d'embauche en heure du jeu)", () => {
  const LIGNE_SALARIE = {
    id: "sal-uuid",
    poste: "artisan" as const,
    salaire_brut_mensuel_centimes: 200_000,
    anciennete_mois_debut: 0,
    experience_mois_debut: 0,
    mois_jeu_debut: 24322,
  };
  const reel = Date.parse("2026-11-21T09:00:00.000Z");

  it("cree_le devient embaucheMs, en retirant worlds.debut_reel", () => {
    const l = { ...LIGNE_SALARIE, cree_le: "2026-11-21T09:00:00.000Z" };
    expect(salarieDepuisLigne(l, 24322).embaucheMs).toBe(reel);
    const recul = -10 * 86_400_000;
    expect(salarieDepuisLigne(l, 24322, recul).embaucheMs).toBe(reel - recul);
  });

  it("ancienneté et expérience comptées en mois depuis l'embauche, comme avant", () => {
    const s = salarieDepuisLigne({ ...LIGNE_SALARIE, anciennete_mois_debut: 2, experience_mois_debut: 3 }, 24324);
    expect(s).toMatchObject({ id: "sal-uuid", poste: "artisan", salaireBrutMensuel: 200_000, ancienneteMois: 4, experienceMois: 5 });
    expect(s).not.toHaveProperty("embaucheMs");
  });
});
