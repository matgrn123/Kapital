import type { Parametres } from "@kapital/content";
import { configTempsDepuis, estMoisCalendaire, horlogeDepuis } from "@kapital/engine";
import type { ResultatAvanceMonde } from "../avance/orchestrateur.js";
import type { HorlogeDuMonde } from "../avance/horloge.js";
import type { MondeActif } from "../avance/port.js";

// ---------------------------------------------------------------------------
// Données brutes lues en base
// ---------------------------------------------------------------------------

export type Declencheur = "minuterie" | "manuel" | "avance-temps";

export type PassageJournal = {
  readonly creeLeMs: number;
  readonly declencheur: string;
  readonly pasCible: number;
  readonly nbEntreprises: number;
  readonly nbAvancees: number;
  readonly nbErreurs: number;
  readonly erreurs: readonly string[];
  readonly dureeMs: number;
};

export type DonneesCockpit = {
  readonly monde: MondeActif;
  readonly entreprises: readonly {
    readonly id: string;
    readonly nom: string;
    readonly statut: string;
    readonly pasTraites: number | null;
    readonly tresorerieCentimes: number;
  }[];
  readonly dernierPassage: PassageJournal | null;
  readonly commandes: readonly {
    readonly id: string;
    readonly companyId: string;
    readonly type: "matiere" | "faconnier";
    readonly libelle: string;
    readonly instantLivraisonMs: number;
  }[];
};

// ---------------------------------------------------------------------------
// Ce que la page affiche
// ---------------------------------------------------------------------------

/** Retard toléré entre deux passages de la minuterie, en pas. */
const TOLERANCE_RETARD_PAS = 2;
/** Au-delà de ce nombre de pas sans passage, la minuterie est considérée silencieuse. */
const SEUIL_SILENCE_PAS = 3;

export type VueCockpit = {
  readonly horloge: HorlogeDuMonde;
  readonly entreprises: readonly {
    readonly id: string;
    readonly nom: string;
    readonly statut: string;
    readonly tresorerieCentimes: number;
    readonly pasTraites: number | null;
    readonly retardPas: number | null;
    readonly retardMinutes: number | null;
    readonly etat: "a_jour" | "en_retard" | "non_demarree";
  }[];
  readonly dernierPassage:
    | (Omit<PassageJournal, "creeLeMs"> & {
        readonly ageSecondes: number;
        readonly etat: "ok" | "silencieuse" | "erreurs";
      })
    | null;
  readonly commandes: readonly {
    readonly id: string;
    readonly entreprise: string;
    readonly type: "matiere" | "faconnier";
    readonly libelle: string;
    readonly resteMs: number;
    readonly etat: "en_attente" | "a_traiter";
  }[];
  readonly alertes: readonly string[];
};

export function construireVueCockpit(
  donnees: DonneesCockpit,
  params: Parametres,
  maintenantMs: number,
): VueCockpit {
  const config = configTempsDepuis(params);
  const alertes: string[] = [];

  const ancienCalendrier = !estMoisCalendaire(donnees.monde.moisCourant);
  const horloge: HorlogeDuMonde =
    donnees.monde.debutReelMs === null || ancienCalendrier
      ? { actif: false, moisCourant: donnees.monde.moisCourant }
      : {
          actif: true,
          maintenantMs,
          horloge: horlogeDepuis(config, donnees.monde.debutReelMs, maintenantMs),
        };
  if (ancienCalendrier) {
    alertes.push(
      "Monde encore sur l'ancien calendrier : la migration 0043 (horloge réelle) n'est pas appliquée, rien n'avance.",
    );
  } else if (!horloge.actif) {
    alertes.push(
      "Horloge commune non initialisée : cliquer sur « Mettre le monde à jour maintenant ».",
    );
  }
  const pasCible = horloge.actif ? horloge.horloge.pasTermines : null;

  const entreprises = donnees.entreprises.map((e) => {
    const retardPas =
      pasCible === null || e.pasTraites === null ? null : Math.max(0, pasCible - e.pasTraites);
    const etat =
      retardPas === null ? "non_demarree" : retardPas <= TOLERANCE_RETARD_PAS ? "a_jour" : "en_retard";
    return {
      id: e.id,
      nom: e.nom,
      statut: e.statut,
      tresorerieCentimes: e.tresorerieCentimes,
      pasTraites: e.pasTraites,
      retardPas,
      retardMinutes: retardPas === null ? null : retardPas * config.minutesReellesParPas,
      etat,
    } as const;
  });
  const enRetard = entreprises.filter((e) => e.etat === "en_retard").length;
  if (enRetard > 0) alertes.push(`${enRetard} entreprise(s) en retard sur l'horloge.`);

  let dernierPassage: VueCockpit["dernierPassage"] = null;
  if (donnees.dernierPassage === null) {
    alertes.push("Aucun passage de la minuterie enregistré.");
  } else {
    const { creeLeMs, ...reste } = donnees.dernierPassage;
    const ageSecondes = Math.max(0, Math.round((maintenantMs - creeLeMs) / 1000));
    const silenceMs = SEUIL_SILENCE_PAS * config.minutesReellesParPas * 60_000;
    const etat =
      maintenantMs - creeLeMs > silenceMs ? "silencieuse" : reste.nbErreurs > 0 ? "erreurs" : "ok";
    dernierPassage = { ...reste, ageSecondes, etat };
    if (etat === "silencieuse") {
      alertes.push(
        `La minuterie semble arrêtée : dernier passage il y a ${Math.round(ageSecondes / 60)} min.`,
      );
    }
    if (reste.nbErreurs > 0) {
      alertes.push(`${reste.nbErreurs} erreur(s) au dernier passage.`);
    }
  }

  const noms = new Map(donnees.entreprises.map((e) => [e.id, e.nom]));
  const commandes = donnees.commandes
    .map((c) => {
      const resteMs = c.instantLivraisonMs - maintenantMs;
      return {
        id: c.id,
        entreprise: noms.get(c.companyId) ?? c.companyId,
        type: c.type,
        libelle: c.libelle,
        resteMs,
        etat: resteMs <= 0 ? ("a_traiter" as const) : ("en_attente" as const),
      };
    })
    .sort((a, b) => a.resteMs - b.resteMs);

  return { horloge, entreprises, dernierPassage, commandes, alertes };
}

// ---------------------------------------------------------------------------
// Journal des passages de l'orchestrateur
// ---------------------------------------------------------------------------

export type LigneJournalAvance = {
  readonly monde_id: string;
  readonly declencheur: Declencheur;
  readonly pas_cible: number;
  readonly mois_courant: number;
  readonly nb_entreprises: number;
  readonly nb_avancees: number;
  readonly nb_erreurs: number;
  readonly erreurs: readonly string[];
  readonly duree_ms: number;
};

/** Résume un passage de l'orchestrateur pour la table journal_avance. */
export function ligneJournalDepuisResultat(
  r: ResultatAvanceMonde,
  dureeMs: number,
  declencheur: Declencheur,
): LigneJournalAvance {
  const enErreur = r.entreprises.filter((e) => e.etat === "erreur");
  return {
    monde_id: r.mondeId,
    declencheur,
    pas_cible: r.pasCible,
    mois_courant: r.moisCourant,
    nb_entreprises: r.entreprises.length,
    nb_avancees: r.entreprises.filter((e) => e.etat === "avancee").length,
    nb_erreurs: enErreur.length,
    erreurs: enErreur.slice(0, 5).map((e) => `${e.entreprise} : ${e.erreur ?? "erreur inconnue"}`),
    duree_ms: dureeMs,
  };
}
