import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ValidationError, validateParametres } from "./validate.js";

const ici = dirname(fileURLToPath(import.meta.url));
const cheminParametres = resolve(ici, "..", "parametres-v1.json");

function parametreValide() {
  return {
    smic_horaire_brut: {
      valeur: 1231,
      unite: "centimes_par_heure",
      source: "https://www.urssaf.fr/",
      date: "2026-06-01",
    },
  };
}

describe("validateParametres", () => {
  it("accepte un paramètre complet", () => {
    expect(() => validateParametres(parametreValide())).not.toThrow();
  });

  it("refuse un paramètre sans source (critère d'acceptation T02)", () => {
    const data = parametreValide();
    delete (data.smic_horaire_brut as Partial<typeof data.smic_horaire_brut>)
      .source;
    expect(() => validateParametres(data)).toThrow(ValidationError);
    expect(() => validateParametres(data)).toThrow(/source/);
  });

  it("refuse un paramètre sans valeur", () => {
    const data = parametreValide();
    delete (data.smic_horaire_brut as Partial<typeof data.smic_horaire_brut>)
      .valeur;
    expect(() => validateParametres(data)).toThrow(/valeur/);
  });

  it("refuse un paramètre sans unité", () => {
    const data = parametreValide();
    delete (data.smic_horaire_brut as Partial<typeof data.smic_horaire_brut>)
      .unite;
    expect(() => validateParametres(data)).toThrow(/unite/);
  });

  it("refuse un paramètre sans date", () => {
    const data = parametreValide();
    delete (data.smic_horaire_brut as Partial<typeof data.smic_horaire_brut>)
      .date;
    expect(() => validateParametres(data)).toThrow(/date/);
  });

  it("refuse une source vide", () => {
    const data = parametreValide();
    data.smic_horaire_brut.source = "   ";
    expect(() => validateParametres(data)).toThrow(/source/);
  });

  it("refuse une date au mauvais format", () => {
    const data = parametreValide();
    data.smic_horaire_brut.date = "01/06/2026";
    expect(() => validateParametres(data)).toThrow(/date/);
  });

  it("refuse une date inexistante", () => {
    const data = parametreValide();
    data.smic_horaire_brut.date = "2026-02-30";
    expect(() => validateParametres(data)).toThrow(/date/);
  });

  it("refuse une valeur non numérique", () => {
    const data = parametreValide();
    (data.smic_horaire_brut as unknown as { valeur: string }).valeur = "1231";
    expect(() => validateParametres(data)).toThrow(/valeur/);
  });

  it("refuse un montant en centimes non entier", () => {
    const data = parametreValide();
    data.smic_horaire_brut.valeur = 12.31;
    expect(() => validateParametres(data)).toThrow(/centimes/);
  });

  it("refuse un champ en trop", () => {
    const data = parametreValide();
    (data.smic_horaire_brut as Record<string, unknown>).commentaire =
      "pas prévu";
    expect(() => validateParametres(data)).toThrow(/commentaire/);
  });

  it("refuse une racine qui n'est pas un objet", () => {
    expect(() => validateParametres([])).toThrow(ValidationError);
    expect(() => validateParametres(null)).toThrow(ValidationError);
    expect(() => validateParametres("coucou")).toThrow(ValidationError);
  });

  it("mentionne le nom du paramètre fautif dans le message", () => {
    const data = parametreValide();
    delete (data.smic_horaire_brut as Partial<typeof data.smic_horaire_brut>)
      .source;
    expect(() => validateParametres(data)).toThrow(/smic_horaire_brut/);
  });
});

describe("parametres-v1.json (le vrai fichier)", () => {
  it("passe la validation", () => {
    const brut = JSON.parse(readFileSync(cheminParametres, "utf-8"));
    expect(() => validateParametres(brut)).not.toThrow();
  });

  it("contient au moins les paramètres de base du moteur", () => {
    const brut = JSON.parse(readFileSync(cheminParametres, "utf-8"));
    const params = validateParametres(brut);
    const clesRequises = [
      "smic_horaire_brut",
      "smic_mensuel_brut",
      "cout_employeur_smic_mensuel",
      "heures_mensuelles_legales",
      "rendement_atelier_min",
      "rendement_atelier_max",
      "rendement_tau_jours",
      "taux_chute_matiere_defaut",
      "taux_retour_vente_en_ligne",
      "cout_traitement_retour",
      "prix_electricite_pro",
      "decroissance_notoriete_mois",
      "decroissance_desirabilite_mois",
      "taux_cotisations_au_dela_1_6_smic",
    ];
    for (const cle of clesRequises) {
      expect(params[cle], `paramètre manquant : ${cle}`).toBeDefined();
    }
  });
  it("horloge réelle (T3) : travaux 24 h, aménagement 2 h, préavis d'un mois, sourcés et datés", () => {
    const params = validateParametres(JSON.parse(readFileSync(cheminParametres, "utf-8")));
    expect(params["boutique_travaux_duree_heures"]).toMatchObject({ valeur: 24, unite: "heures_reelles", date: "2026-11-26" });
    expect(params["amenagement_delai_heures"]).toMatchObject({ valeur: 2, unite: "heures_reelles", date: "2026-11-26" });
    expect(params["bail_preavis_mois"]).toMatchObject({ valeur: 1, unite: "mois_de_jeu", date: "2026-11-26" });
    for (const cle of ["boutique_travaux_duree_heures", "amenagement_delai_heures", "bail_preavis_mois"]) {
      expect(params[cle]!.source).toContain("26/11/2026");
    }
  });

  it("contient les paramètres de la tranche boutique (AE-9)", () => {
    const params = validateParametres(JSON.parse(readFileSync(cheminParametres, "utf-8")));
    const cles = [
      "boutique_travaux_amenagement_centimes_par_m2",
      "boutique_travaux_duree_heures",
      "boutique_amortissement_agencement_mois",
      "boutique_depot_garantie_mois_de_loyer",
      "vendeur_salaire_brut_mensuel_centimes",
      "vendeur_ventes_max_pieces_par_mois",
      "seuil_etape_3_chiffre_affaires_ht_cumule_centimes",
      "seuil_etape_3_tresorerie_minimale_centimes",
      "seuil_etape_3_notoriete_minimale",
    ];
    for (const cle of cles) {
      expect(params[cle], `paramètre manquant : ${cle}`).toBeDefined();
    }
  });

  it("boutique : travaux de 24 h réelles, dépôt dans le plafond légal de 3 mois", () => {
    const params = validateParametres(JSON.parse(readFileSync(cheminParametres, "utf-8")));
    expect(params["boutique_travaux_duree_heures"]!.valeur).toBe(24);
    expect(params["boutique_travaux_duree_mois"]).toBeUndefined();
    const depot = params["boutique_depot_garantie_mois_de_loyer"]!.valeur;
    expect(depot).toBeGreaterThan(0);
    expect(depot).toBeLessThanOrEqual(3);
  });

  it("étape 3 : plus exigeante que l'étape 2, notoriété sur l'échelle 0 à 100", () => {
    const params = validateParametres(JSON.parse(readFileSync(cheminParametres, "utf-8")));
    expect(params["seuil_etape_3_chiffre_affaires_ht_cumule_centimes"]!.valeur).toBeGreaterThan(
      params["seuil_etape_2_chiffre_affaires_ht_cumule_centimes"]!.valeur,
    );
    expect(params["seuil_etape_3_tresorerie_minimale_centimes"]!.valeur).toBeGreaterThan(0);
    const noto = params["seuil_etape_3_notoriete_minimale"]!.valeur;
    expect(noto).toBeGreaterThan(0);
    expect(noto).toBeLessThanOrEqual(100);
  });

  it("vendeur : salaire au moins égal au SMIC, ventes plafonnées par un entier positif", () => {
    const params = validateParametres(JSON.parse(readFileSync(cheminParametres, "utf-8")));
    expect(params["vendeur_salaire_brut_mensuel_centimes"]!.valeur).toBeGreaterThanOrEqual(
      params["smic_mensuel_brut"]!.valeur,
    );
    const max = params["vendeur_ventes_max_pieces_par_mois"]!.valeur;
    expect(Number.isInteger(max)).toBe(true);
    expect(max).toBeGreaterThan(0);
  });
});
