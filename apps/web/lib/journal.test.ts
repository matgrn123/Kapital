import { describe, expect, it } from "vitest";
import { formaterEuros } from "./formatage";
import {
  evenementAffiche,
  instantVu,
  nouveautes,
  parMois,
  quantiteMatiere,
  resumeAbsence,
  ventesDepuis,
  type LigneEvenementLue,
  type NomsJournal,
} from "./journal";

const eur = (c: number) => `${formaterEuros(c)} €`;

const NOMS: NomsJournal = {
  produits: { prod_tshirt: "T-shirt basique" },
  matieres: { mat_jersey_coton: { nom: "Jersey de coton bio", unite: "metre" } },
};

function ev(type: string, detail: Record<string, unknown>, s: Partial<LigneEvenementLue> = {}): LigneEvenementLue {
  return {
    id: `${type}-${s.cle ?? "1"}`,
    type,
    cle: type,
    mois_jeu: 3,
    instant: "2026-11-25T10:00:00.000Z",
    titre: "Titre de secours",
    detail,
    cree_le: "2026-11-25T10:00:01.000Z",
    ...s,
  };
}

describe("evenementAffiche : une phrase par événement, sans identifiant technique", () => {
  it("livraison de matière avec l'unité", () => {
    const a = evenementAffiche(ev("livraison_matiere", { matiere: "mat_jersey_coton", quantite: 300, montant: 105_000, aCredit: true }), NOMS);
    expect(a.texte).toBe(`Livraison reçue : 300 m de jersey de coton bio, à payer plus tard (${eur(105_000)}).`);
    expect(a.lien?.href).toBe("/achats");
  });

  it("production livrée, rupture, découvert, encaissement, étape, mission", () => {
    expect(evenementAffiche(ev("livraison_production", { produit: "prod_tshirt", quantite: 120 }), NOMS).texte).toBe(
      "Production livrée : 120 × t-shirt basique, prêts à vendre.",
    );
    const rupture = evenementAffiche(ev("rupture_stock", { produit: "prod_tshirt", lieu: "atelier" }), NOMS);
    expect(rupture.texte).toContain("plus aucun t-shirt basique à l'atelier");
    expect(rupture.ton).toBe("alerte");
    expect(evenementAffiche(ev("decouvert", { tresorerie: -1200 }), NOMS).ton).toBe("critique");
    expect(evenementAffiche(ev("creance_encaissee", { montant: 36_000 }), NOMS).texte).toBe(`Les revendeurs t'ont payé ${eur(36_000)}.`);
    expect(evenementAffiche(ev("etape_franchie", { etapeApres: 2 }), NOMS).texte).toMatch(/^Étape 2 franchie/);
    expect(evenementAffiche(ev("mission_validee", { titreMission: "Premières ventes" }), NOMS).texte).toBe("Mission validée : Premières ventes.");
  });

  it("clôture : total payé et résultat, ton selon la situation", () => {
    const perte = evenementAffiche(ev("cloture_mois", { totalPaye: 436_702, resultat: -50_000, tresorerieFin: 10 }), NOMS);
    expect(perte.texte).toBe(`Mois 3 clos : ${eur(436_702)} payés (paie, loyers, échéances, TVA), perte de ${eur(50_000)}.`);
    expect(perte.ton).toBe("alerte");
    expect(evenementAffiche(ev("cloture_mois", { totalPaye: 1, resultat: 5, tresorerieFin: -1 }), NOMS).ton).toBe("critique");
  });

  it("type inconnu : le titre de secours", () => {
    expect(evenementAffiche(ev("autre", {}), NOMS).texte).toBe("Titre de secours");
  });

  it("matière inconnue : un nom lisible quand même", () => {
    expect(quantiteMatiere(2, "mat_toile_coton", NOMS)).toBe("2 × toile coton");
  });
});

describe("nouveautés et ventes depuis la dernière visite", () => {
  const evs = [ev("a", {}, { cree_le: "2026-11-25T09:00:00Z" }), ev("b", {}, { cree_le: "2026-11-25T11:00:00Z" })];

  it("seulement ce qui a été enregistré après la visite ; rien pour un premier passage", () => {
    expect(nouveautes(evs, "2026-11-25T10:00:00Z").map((e) => e.type)).toEqual(["b"]);
    expect(nouveautes(evs, null)).toEqual([]);
  });

  it("ventes HT du compte 707 après la visite, retours déduits", () => {
    const lignes = [
      { compte: "707", sens: "credit", montant_centimes: 1000, cree_le: "2026-11-25T09:00:00Z" },
      { compte: "707", sens: "credit", montant_centimes: 3000, cree_le: "2026-11-25T11:00:00Z" },
      { compte: "707", sens: "debit", montant_centimes: 500, cree_le: "2026-11-25T11:30:00Z" },
      { compte: "512", sens: "debit", montant_centimes: 3600, cree_le: "2026-11-25T11:00:00Z" },
    ];
    expect(ventesDepuis(lignes, "2026-11-25T10:00:00Z")).toBe(2500);
  });
});

describe("resumeAbsence", () => {
  it("compte livraisons, charges payées, encaissements, et met les alertes en tête", () => {
    const r = resumeAbsence(
      [
        ev("livraison_matiere", { matiere: "mat_jersey_coton", quantite: 10 }, { instant: "2026-11-25T08:00:00Z" }),
        ev("livraison_production", { produit: "prod_tshirt", quantite: 5 }, { instant: "2026-11-25T09:00:00Z" }),
        ev("cloture_mois", { totalPaye: 400_000, resultat: 10 }, { mois_jeu: 2 }),
        ev("creance_encaissee", { montant: 7_000 }),
        ev("rupture_stock", { produit: "prod_tshirt" }, { instant: "2026-11-25T07:00:00Z" }),
      ],
      12_345,
      NOMS,
    );
    expect(r).toMatchObject({ ventesHt: 12_345, livraisons: 2, chargesPayees: 400_000, moisClos: [2], encaisse: 7_000 });
    expect(r.faits[0]!.type).toBe("rupture_stock");
    // Parmi les faits « bons », le plus récent d'abord.
    expect(r.faits.map((f) => f.type).slice(1, 4)).toEqual(["cloture_mois", "creance_encaissee", "livraison_production"]);
  });
});

describe("instantVu et parMois", () => {
  it("l'instant vu n'est jamais dans le futur et doit être une date", () => {
    const maintenant = Date.parse("2026-11-25T12:00:00Z");
    expect(instantVu("2026-11-25T11:00:00Z", maintenant)).toBe("2026-11-25T11:00:00.000Z");
    expect(instantVu("2030-01-01T00:00:00Z", maintenant)).toBe("2026-11-25T12:00:00.000Z");
    expect(instantVu("n'importe quoi", maintenant)).toBeNull();
    expect(instantVu(42, maintenant)).toBeNull();
  });

  it("groupe par mois de jeu, le plus récent d'abord", () => {
    const g = parMois([
      { mois: 1, quand: "2026-11-24T10:00:00Z" },
      { mois: 2, quand: "2026-11-25T10:00:00Z" },
      { mois: 1, quand: "2026-11-24T12:00:00Z" },
    ]);
    expect(g.map((x) => x.mois)).toEqual([2, 1]);
    expect(g[1]!.evenements.map((e) => e.quand)).toEqual(["2026-11-24T12:00:00Z", "2026-11-24T10:00:00Z"]);
  });
});
