import type {
  EtatMission,
  IdMission,
  MetriquesMissions,
  ProgressionMission,
} from "./types.js";

const CIBLE_PIECES_MISSION_1 = 50;
const CIBLE_MOIS_MISSION_2 = 6;
const RATIO_MISSION_3 = 2;

export function evaluerMission1(m: MetriquesMissions): ProgressionMission {
  const etat: EtatMission =
    m.pieces_vendues_total >= CIBLE_PIECES_MISSION_1 &&
    m.marge_brute_cumul_centimes > 0
      ? "validee"
      : m.pieces_vendues_total > 0
        ? "en_cours"
        : "a_faire";
  return {
    id: "mission1",
    etat,
    actuel: m.pieces_vendues_total,
    cible: CIBLE_PIECES_MISSION_1,
  };
}

export function evaluerMission2(m: MetriquesMissions): ProgressionMission {
  const moisEcoules = Math.max(0, m.mois_jeu_courant - m.mois_jeu_creation);
  const etat: EtatMission = m.a_eu_decouvert
    ? "a_faire"
    : moisEcoules >= CIBLE_MOIS_MISSION_2
      ? "validee"
      : moisEcoules > 0
        ? "en_cours"
        : "a_faire";
  return {
    id: "mission2",
    etat,
    actuel: Math.min(moisEcoules, CIBLE_MOIS_MISSION_2),
    cible: CIBLE_MOIS_MISSION_2,
  };
}

export function evaluerMission3(m: MetriquesMissions): ProgressionMission {
  const cible = m.ca_mois_initial_centimes * RATIO_MISSION_3;
  const aDouble =
    m.ca_mois_initial_centimes > 0 &&
    m.ca_mois_max_centimes >= cible;
  const etat: EtatMission =
    aDouble && !m.a_eu_decouvert
      ? "validee"
      : m.ca_mois_initial_centimes > 0
        ? "en_cours"
        : "a_faire";
  return {
    id: "mission3",
    etat,
    actuel: m.ca_mois_max_centimes,
    cible,
  };
}

export function evaluerMissions(
  m: MetriquesMissions,
): readonly ProgressionMission[] {
  return [evaluerMission1(m), evaluerMission2(m), evaluerMission3(m)];
}

export function progressionParId(
  progressions: readonly ProgressionMission[],
  id: IdMission,
): ProgressionMission {
  const p = progressions.find((x) => x.id === id);
  if (!p) throw new Error(`Progression introuvable : ${id}`);
  return p;
}
