import { describe, expect, it } from "vitest";
import { chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { MODULE_POSE_A_LA_SIGNATURE } from "@kapital/engine";
import {
  deciderAmenagement,
  delaiMiseEnPlaceAmenagementMs,
  postesFournisDepuisParametres,
  retraitsAchetes,
  valeurNetteMaterielEnService,
} from "./amenagement";

describe("delaiMiseEnPlaceAmenagementMs (T3)", () => {
  it("le plan entre en service 2 h réelles après sa sauvegarde (paramètre amenagement_delai_heures)", () => {
    const params = chargerParametresV1();
    expect(delaiMiseEnPlaceAmenagementMs(params)).toBe(2 * 3_600_000);
    expect(delaiMiseEnPlaceAmenagementMs({ ...params, amenagement_delai_heures: { ...params["amenagement_delai_heures"]!, valeur: 0.5 } })).toBe(1_800_000);
  });

  it("refuse un paramètre manquant ou négatif", () => {
    const { amenagement_delai_heures: _retire, ...sans } = chargerParametresV1();
    expect(() => delaiMiseEnPlaceAmenagementMs(sans)).toThrow(/amenagement_delai_heures/);
    const params = chargerParametresV1();
    expect(() =>
      delaiMiseEnPlaceAmenagementMs({ ...params, amenagement_delai_heures: { ...params["amenagement_delai_heures"]!, valeur: -1 } }),
    ).toThrow(/>= 0/);
  });
});

describe("valeurNetteMaterielEnService", () => {
  it("2154 − 2815, sans la commande du plan prévu pas encore posée", () => {
    const lignes = [
      { compte: "2154", sens: "debit", montant_centimes: 170_000 },
      { compte: "2815", sens: "credit", montant_centimes: 1_000 },
      { compte: "2154", sens: "debit", montant_centimes: 40_000 },
      { compte: "512", sens: "credit", montant_centimes: 210_000 },
    ];
    expect(valeurNetteMaterielEnService(lignes, 40_000)).toBe(169_000);
    expect(valeurNetteMaterielEnService(lignes, 0)).toBe(209_000);
    expect(valeurNetteMaterielEnService([], 0)).toBe(0);
  });
});

const CAT = chargerModulesV1();
const POSTE = CAT.find((m) => m.id === MODULE_POSE_A_LA_SIGNATURE)!;
const STOCK = CAT.find((m) => m.effet.type === "stockage")!;
const TABLE = CAT.find((m) => m.effet.type === "table_coupe")!;
const GRILLE = { largeur_grille: 10, hauteur_grille: 5, entree_x: 0, entree_y: 3 };
const FOURNIS = postesFournisDepuisParametres(chargerParametresV1());
const m = (x: number, y: number, id = POSTE.id, pivote = false) => ({ module_type_id: id, x, y, pivote });
const base = { grille: GRILLE, catalogue: CAT, tresorerie: 10_000_000, postesFournis: FOURNIS, valeurNetteMateriel: 0, coutPlanPrevu: 0 };

/** Somme des débits = somme des crédits, pour chaque écriture affichée. */
function equilibre(ecritures: readonly { lignes: readonly { sens: string; montant: number }[] }[]): boolean {
  return ecritures.every((e) => {
    const d = e.lignes.filter((l) => l.sens === "debit").reduce((s, l) => s + l.montant, 0);
    const c = e.lignes.filter((l) => l.sens === "credit").reduce((s, l) => s + l.montant, 0);
    return d === c;
  });
}

describe("deciderAmenagement", () => {
  it("lit les postes fournis avec le local dans les paramètres", () => {
    expect(FOURNIS).toBe(chargerParametresV1()["bail_machines_a_la_signature"]!.valeur);
  });

  it("accepte un plan valide et fait payer le module ajouté", () => {
    const r = deciderAmenagement({ ...base, ancien: [], nouveau: [m(2, 1)] });
    expect(r).toMatchObject({ ok: true, cout: POSTE.prix_centimes });
  });
  it("compte à partir de 1 : un module en x = 0 dépasse de l'atelier", () => {
    const r = deciderAmenagement({ ...base, ancien: [], nouveau: [m(0, 1)] });
    expect(r).toMatchObject({ ok: false, code: "plan_invalide" });
    if (!r.ok) expect(r.message).toMatch(/dépasse/);
  });
  it("refuse deux modules qui se chevauchent", () => {
    const r = deciderAmenagement({ ...base, ancien: [], nouveau: [m(2, 1), m(3, 2)] });
    expect(r).toMatchObject({ ok: false, code: "plan_invalide" });
  });
  it("refuse si la trésorerie ne couvre pas les modules ajoutés, manque chiffré", () => {
    const r = deciderAmenagement({ ...base, ancien: [], nouveau: [m(2, 1)], tresorerie: POSTE.prix_centimes - 100 });
    expect(r).toMatchObject({ ok: false, code: "tresorerie_insuffisante" });
    if (!r.ok) expect(r.message).toMatch(/il manque 1,00 €/);
  });
  it("déplacer un module déjà payé ne coûte rien", () => {
    const r = deciderAmenagement({ ...base, ancien: [m(2, 1)], nouveau: [m(6, 3)], tresorerie: 0 });
    expect(r).toMatchObject({ ok: true, cout: 0, ecritures: [] });
  });

  it("pivoter un module est validé par le moteur : l'emprise pivotée doit tenir dans l'atelier", () => {
    // Table de coupe : largeur ≠ profondeur, la rotation change l'emprise.
    expect(TABLE.hauteur_grille).toBeGreaterThan(TABLE.largeur_grille);
    // Pivotée, sa profondeur est sa largeur du catalogue : elle tient sur les dernières rangées de la grille.
    const yBord = GRILLE.hauteur_grille - TABLE.largeur_grille + 1;
    const pivotee = m(2, yBord, TABLE.id, true);
    const droite = { ...pivotee, pivote: false };
    expect(deciderAmenagement({ ...base, ancien: [droite], nouveau: [pivotee] })).toMatchObject({ ok: true, cout: 0 });
    const r = deciderAmenagement({ ...base, ancien: [pivotee], nouveau: [droite] });
    expect(r).toMatchObject({ ok: false, code: "plan_invalide" });
  });

  it("aperçu du coût : écriture 2154 / 512 équilibrée, du montant des modules ajoutés", () => {
    const r = deciderAmenagement({ ...base, ancien: [m(2, 1)], nouveau: [m(2, 1), m(5, 1), m(8, 1, STOCK.id)] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const total = POSTE.prix_centimes + STOCK.prix_centimes;
    expect(r.cout).toBe(total);
    expect(r.achetes.map((a) => [a.id_type, a.quantite])).toEqual([[POSTE.id, 1], [STOCK.id, 1]]);
    expect(r.ecritures).toHaveLength(1);
    expect(r.ecritures[0]!.lignes).toEqual([
      { compte: "2154", sens: "debit", montant: total },
      { compte: "512", sens: "credit", montant: total },
    ]);
    expect(equilibre(r.ecritures)).toBe(true);
    expect(r.variationTresorerie).toBe(-total);
  });

  it("remplacer un plan prévu : sa commande est remboursée et compte dans la trésorerie disponible", () => {
    const r = deciderAmenagement({
      ...base,
      ancien: [],
      nouveau: [m(2, 1)],
      tresorerie: 0,
      coutPlanPrevu: POSTE.prix_centimes,
    });
    expect(r).toMatchObject({ ok: true, cout: POSTE.prix_centimes, remboursement: POSTE.prix_centimes, variationTresorerie: 0 });
    if (!r.ok) return;
    expect(r.ecritures.map((e) => e.lignes.map((l) => `${l.compte} ${l.sens}`))).toEqual([
      ["512 debit", "2154 credit"],
      ["2154 debit", "512 credit"],
    ]);
    expect(equilibre(r.ecritures)).toBe(true);
  });

  it("refuse le retrait d'un module acheté tant que le matériel n'est pas amorti", () => {
    const ancien = [m(2, 1), m(5, 1), m(8, 1, STOCK.id)];
    const r = deciderAmenagement({ ...base, ancien, nouveau: [m(2, 1), m(5, 1)], valeurNetteMateriel: STOCK.prix_centimes });
    expect(r).toMatchObject({ ok: false, code: "retrait_module_achete" });
    if (!r.ok) expect(r.message).toContain(STOCK.nom);
    // Matériel entièrement amorti : le retrait est permis.
    expect(deciderAmenagement({ ...base, ancien, nouveau: [m(2, 1), m(5, 1)], valeurNetteMateriel: 0 })).toMatchObject({ ok: true });
  });

  it("les postes fournis avec le local peuvent être retirés : ils ne sont pas à l'actif", () => {
    const ancien = [m(2, 1), m(5, 1)].slice(0, FOURNIS);
    const r = deciderAmenagement({ ...base, ancien, nouveau: [], valeurNetteMateriel: 1_000_000 });
    expect(r).toMatchObject({ ok: true, cout: 0 });
  });
});

describe("retraitsAchetes", () => {
  it("un poste en plus des postes fournis est acheté ; le retirer compte comme retrait", () => {
    const ancien = [m(2, 1), m(5, 1), m(8, 1)].slice(0, FOURNIS + 1);
    expect(retraitsAchetes(ancien, ancien.slice(1), CAT, FOURNIS)).toEqual([{ id_type: POSTE.id, quantite: 1, prixUnitaire: POSTE.prix_centimes }]);
    expect(retraitsAchetes(ancien, ancien, CAT, FOURNIS)).toEqual([]);
  });
});
