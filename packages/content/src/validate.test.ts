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
      "rendement_tau_mois",
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
});
