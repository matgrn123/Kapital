import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { construireVueCockpit, ligneJournalDepuisResultat, type DonneesCockpit } from "./cockpit.js";

const PARAMS = chargerParametresV1();
const MIN = 60_000;
const JOUR = 24 * 60 * MIN;
const DEBUT = Date.UTC(2026, 10, 1, 8, 0, 0);
const MAINTENANT = DEBUT + 2 * JOUR + 30 * MIN; // pas terminés : 2 × 1440 + 30 = 2910

function donnees(surcharge: Partial<DonneesCockpit> = {}): DonneesCockpit {
  return {
    monde: { id: "m1", moisCourant: 2, debutReelMs: DEBUT },
    entreprises: [
      { id: "a", nom: "Atelier A", statut: "active", pasTraites: 2910, tresorerieCentimes: 500_000 },
      { id: "b", nom: "Atelier B", statut: "active", pasTraites: 2860, tresorerieCentimes: 120_000 },
      { id: "c", nom: "Atelier C", statut: "active", pasTraites: null, tresorerieCentimes: 0 },
    ],
    dernierPassage: {
      creeLeMs: MAINTENANT - 20_000,
      declencheur: "minuterie",
      pasCible: 2910,
      nbEntreprises: 3,
      nbAvancees: 2,
      nbErreurs: 0,
      erreurs: [],
      dureeMs: 850,
    },
    commandes: [
      { id: "o1", companyId: "a", type: "matiere", libelle: "mat_coton ×500", instantLivraisonMs: MAINTENANT + 12 * MIN },
      { id: "o2", companyId: "b", type: "faconnier", libelle: "prod_tshirt ×100", instantLivraisonMs: MAINTENANT - 3 * MIN },
    ],
    ...surcharge,
  };
}

describe("construireVueCockpit — horloge", () => {
  it("donne la date de jeu commune", () => {
    const v = construireVueCockpit(donnees(), PARAMS, MAINTENANT);
    expect(v.horloge).toMatchObject({
      actif: true,
      horloge: { pasTermines: 2910, moisEnCours: 2, indexDansMois: 30 },
    });
  });

  it("signale un monde dont l'horloge n'est pas initialisée", () => {
    const v = construireVueCockpit(
      donnees({ monde: { id: "m1", moisCourant: 2, debutReelMs: null } }),
      PARAMS,
      MAINTENANT,
    );
    expect(v.horloge.actif).toBe(false);
    expect(v.alertes.join(" ")).toMatch(/Mettre le monde à jour/);
  });
});

describe("construireVueCockpit — entreprises", () => {
  it("calcule le retard de chaque entreprise en pas et en minutes réelles", () => {
    const v = construireVueCockpit(donnees(), PARAMS, MAINTENANT);
    const parId = Object.fromEntries(v.entreprises.map((e) => [e.id, e]));
    expect(parId["a"]).toMatchObject({ retardPas: 0, retardMinutes: 0, etat: "a_jour" });
    expect(parId["b"]).toMatchObject({ retardPas: 50, retardMinutes: 50, etat: "en_retard" });
    expect(parId["c"]).toMatchObject({ retardPas: null, etat: "non_demarree" });
  });

  it("tolère un retard de quelques pas entre deux passages de la minuterie", () => {
    const v = construireVueCockpit(
      donnees({ entreprises: [{ id: "a", nom: "A", statut: "active", pasTraites: 2908, tresorerieCentimes: 0 }] }),
      PARAMS,
      MAINTENANT,
    );
    expect(v.entreprises[0]!.etat).toBe("a_jour");
  });
});

describe("construireVueCockpit — minuterie", () => {
  it("un passage récent est en bonne santé", () => {
    const v = construireVueCockpit(donnees(), PARAMS, MAINTENANT);
    expect(v.dernierPassage).toMatchObject({ ageSecondes: 20, etat: "ok" });
    expect(v.alertes).toEqual(expect.not.arrayContaining([expect.stringMatching(/minuterie/i)]));
  });

  it("alerte quand la minuterie n'a pas tourné depuis plusieurs minutes", () => {
    const v = construireVueCockpit(
      donnees({ dernierPassage: { ...donnees().dernierPassage!, creeLeMs: MAINTENANT - 9 * MIN } }),
      PARAMS,
      MAINTENANT,
    );
    expect(v.dernierPassage).toMatchObject({ etat: "silencieuse" });
    expect(v.alertes.join(" ")).toMatch(/minuterie.*arrêtée|silencieuse/i);
  });

  it("alerte quand aucun passage n'a jamais été enregistré", () => {
    const v = construireVueCockpit(donnees({ dernierPassage: null }), PARAMS, MAINTENANT);
    expect(v.dernierPassage).toBeNull();
    expect(v.alertes.join(" ")).toMatch(/aucun passage/i);
  });

  it("remonte les erreurs du dernier passage", () => {
    const v = construireVueCockpit(
      donnees({ dernierPassage: { ...donnees().dernierPassage!, nbErreurs: 1, erreurs: ["b : état du mois incohérent"] } }),
      PARAMS,
      MAINTENANT,
    );
    expect(v.dernierPassage).toMatchObject({ etat: "erreurs", erreurs: ["b : état du mois incohérent"] });
    expect(v.alertes.join(" ")).toMatch(/erreur/i);
  });
});

describe("construireVueCockpit — commandes en attente", () => {
  it("donne le temps d'attente restant, trié du plus proche au plus lointain", () => {
    const v = construireVueCockpit(donnees(), PARAMS, MAINTENANT);
    expect(v.commandes.map((c) => c.id)).toEqual(["o2", "o1"]);
    expect(v.commandes[1]).toMatchObject({ resteMs: 12 * MIN, entreprise: "Atelier A", etat: "en_attente" });
  });

  it("une commande dont la date est passée mais pas encore livrée est « à traiter »", () => {
    const v = construireVueCockpit(donnees(), PARAMS, MAINTENANT);
    expect(v.commandes[0]).toMatchObject({ id: "o2", etat: "a_traiter", entreprise: "Atelier B" });
  });
});

describe("ligneJournalDepuisResultat", () => {
  it("résume un passage de l'orchestrateur pour le journal", () => {
    const ligne = ligneJournalDepuisResultat(
      {
        mondeId: "m1",
        pasCible: 2910,
        moisCourant: 2,
        horlogeInitialisee: false,
        entreprises: [
          { entreprise: "a", etat: "avancee", pasAvant: 2909, pasApres: 2910 },
          { entreprise: "b", etat: "a_jour", pasAvant: 2910, pasApres: 2910 },
          { entreprise: "c", etat: "erreur", pasAvant: 2800, pasApres: null, erreur: "panne" },
          { entreprise: "d", etat: "deja_traite", pasAvant: 2800, pasApres: null },
        ],
      },
      1234,
      "minuterie",
    );
    expect(ligne).toEqual({
      monde_id: "m1",
      declencheur: "minuterie",
      pas_cible: 2910,
      mois_courant: 2,
      nb_entreprises: 4,
      nb_avancees: 1,
      nb_erreurs: 1,
      erreurs: ["c : panne"],
      duree_ms: 1234,
    });
  });

  it("garde au plus 5 erreurs", () => {
    const entreprises = Array.from({ length: 9 }, (_, i) => ({
      entreprise: `e${i}`,
      etat: "erreur" as const,
      pasAvant: 0,
      pasApres: null,
      erreur: "x",
    }));
    const ligne = ligneJournalDepuisResultat(
      { mondeId: "m", pasCible: 1, moisCourant: 0, horlogeInitialisee: false, entreprises },
      10,
      "manuel",
    );
    expect(ligne.erreurs).toHaveLength(5);
    expect(ligne.nb_erreurs).toBe(9);
  });
});
