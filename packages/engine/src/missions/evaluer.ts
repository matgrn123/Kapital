import type {
  EtatMission,
  IdMission,
  MetriquesMissions,
  ProgressionMission,
  SoldeTresorerieMois,
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

/**
 * Solde de trésorerie à la fin du mois `mois` : le dernier solde connu à ce mois ou avant
 * (un mois sans écriture garde le solde du précédent ; avant toute écriture, 0).
 */
export function soldeFinDeMois(soldes: readonly SoldeTresorerieMois[], mois: number): number {
  let solde = 0;
  for (const s of soldes) {
    if (s.mois > mois) break;
    solde = s.solde_centimes;
  }
  return solde;
}

/**
 * Mission 4 « Ouvrir ma boutique sans découvert » (AE-11). Règle : une boutique est signée, et
 * le solde de trésorerie est positif ou nul à la fin de chaque mois de la « fenêtre d'ouverture »,
 * du mois de signature du bail au mois d'ouverture inclus (les travaux, pendant lesquels le loyer
 * court sans aucune vente, puis le premier mois de vente). La mission se valide quand le mois
 * d'ouverture est clos (mois courant > mois d'ouverture). Un découvert dans la fenêtre la rend
 * ratée pour cette boutique (retour « à faire »). Progression : mois clos de la fenêtre.
 */
export function evaluerMission4(m: MetriquesMissions): ProgressionMission {
  let meilleure: ProgressionMission | null = null;
  for (const b of m.boutiques) {
    const cible = Math.max(1, b.mois_ouverture - b.mois_signature + 1);
    const dernierClos = Math.min(m.mois_jeu_courant - 1, b.mois_ouverture);
    let decouvert = false;
    for (let mois = b.mois_signature; mois <= dernierClos; mois++) {
      if (soldeFinDeMois(m.tresorerie_fin_mois, mois) < 0) decouvert = true;
    }
    const actuel = Math.max(0, Math.min(cible, dernierClos - b.mois_signature + 1));
    const etat: EtatMission = decouvert
      ? "a_faire"
      : m.mois_jeu_courant > b.mois_ouverture
        ? "validee"
        : "en_cours";
    const p: ProgressionMission = { id: "mission4", etat, actuel: decouvert ? 0 : actuel, cible };
    if (etat === "validee") return p;
    if (!meilleure || (etat === "en_cours" && meilleure.etat !== "en_cours")) meilleure = p;
  }
  return meilleure ?? { id: "mission4", etat: "a_faire", actuel: 0, cible: 0 };
}

/**
 * Mission 5 « Louer ou acheter » (AE-11). Règle : la société a signé un bail ou acheté un local.
 * Les deux choix se font sur l'écran Locaux, où chaque local montre le comparatif louer / acheter
 * à côté des deux boutons ; le moteur ne mesure pas que le comparatif a été déplié.
 */
export function evaluerMission5(m: MetriquesMissions): ProgressionMission {
  return { id: "mission5", etat: m.local_signe ? "validee" : "a_faire", actuel: m.local_signe ? 1 : 0, cible: 1 };
}

export function evaluerMissions(
  m: MetriquesMissions,
): readonly ProgressionMission[] {
  return [evaluerMission1(m), evaluerMission2(m), evaluerMission3(m), evaluerMission4(m), evaluerMission5(m)];
}

export function progressionParId(
  progressions: readonly ProgressionMission[],
  id: IdMission,
): ProgressionMission {
  const p = progressions.find((x) => x.id === id);
  if (!p) throw new Error(`Progression introuvable : ${id}`);
  return p;
}
