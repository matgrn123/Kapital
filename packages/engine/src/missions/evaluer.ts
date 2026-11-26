import type {
  EtatMission,
  IdMission,
  MetriquesMissions,
  ProgressionMission,
  SoldeTresorerie,
} from "./types.js";

const CIBLE_PIECES_MISSION_1 = 50;
const RATIO_MISSION_3 = 2;
const MS_PAR_JOUR = 86_400_000;

/** Jours entiers écoulés entre deux instants (heure du jeu, ms) ; jamais négatif. */
function joursEntiers(depuisMs: number, jusquAMs: number): number {
  return Math.max(0, Math.floor((jusquAMs - depuisMs) / MS_PAR_JOUR));
}

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

/**
 * Mission 2 « Tenir 7 jours » (horloge réelle) : la trésorerie n'est jamais passée sous zéro,
 * et `regles.joursTenir` jours se sont écoulés depuis la création. Un découvert la rend ratée
 * (retour « à faire »). Progression : jours entiers écoulés.
 */
export function evaluerMission2(m: MetriquesMissions): ProgressionMission {
  const cible = m.regles.joursTenir;
  const jours = joursEntiers(m.creation_ms, m.maintenant_ms);
  if (m.a_eu_decouvert) return { id: "mission2", etat: "a_faire", actuel: 0, cible };
  return {
    id: "mission2",
    etat: jours >= cible ? "validee" : "en_cours",
    actuel: Math.min(jours, cible),
    cible,
  };
}

/**
 * Mission 3 « Survivre à la croissance » : le CA HT d'une période (une semaine, paramètre
 * `mission_croissance_periode_jours`) atteint le double de celui de la première période de
 * ventes, sans découvert depuis la création.
 */
export function evaluerMission3(m: MetriquesMissions): ProgressionMission {
  const cible = m.ca_periode_initiale_centimes * RATIO_MISSION_3;
  const aDouble =
    m.ca_periode_initiale_centimes > 0 &&
    m.ca_periode_max_centimes >= cible;
  const etat: EtatMission =
    aDouble && !m.a_eu_decouvert
      ? "validee"
      : m.ca_periode_initiale_centimes > 0
        ? "en_cours"
        : "a_faire";
  return {
    id: "mission3",
    etat,
    actuel: m.ca_periode_max_centimes,
    cible,
  };
}

/**
 * Solde de trésorerie à l'instant `instantMs` : le dernier solde connu à cet instant ou avant
 * (avant toute écriture, 0). Les soldes sont triés par instant croissant.
 */
export function soldeA(soldes: readonly SoldeTresorerie[], instantMs: number): number {
  let solde = 0;
  for (const s of soldes) {
    if (s.instant_ms > instantMs) break;
    solde = s.solde_centimes;
  }
  return solde;
}

/**
 * Mission 4 « Ouvrir ma boutique sans découvert » (AE-11, revue pour l'horloge réelle). Règle :
 * une boutique est signée, et le solde de trésorerie reste positif ou nul pendant les
 * `regles.joursBoutique` jours qui suivent la signature du bail : les travaux (le loyer court
 * déjà), puis les premières ventes. Le solde à la signature compte (resté à découvert : ratée).
 * La mission se valide quand la fenêtre est écoulée. Un découvert dans la fenêtre la rend ratée
 * pour cette boutique (retour « à faire »). Progression : jours entiers écoulés depuis la signature.
 */
export function evaluerMission4(m: MetriquesMissions): ProgressionMission {
  const cible = m.regles.joursBoutique;
  let meilleure: ProgressionMission | null = null;
  for (const b of m.boutiques) {
    const finFenetre = b.signee_le_ms + cible * MS_PAR_JOUR;
    const jusqua = Math.min(m.maintenant_ms, finFenetre);
    // Le solde qui court à la signature compte, sauf s'il est remplacé à l'instant même par les
    // écritures de la signature (dépôt, travaux : même transaction que le point de vente).
    const ecrituresALaSignature = m.tresorerie.some((s) => s.instant_ms === b.signee_le_ms);
    let decouvert = !ecrituresALaSignature && soldeA(m.tresorerie, b.signee_le_ms) < 0;
    for (const s of m.tresorerie) {
      if (s.instant_ms >= b.signee_le_ms && s.instant_ms <= jusqua && s.solde_centimes < 0) decouvert = true;
    }
    const actuel = Math.min(cible, joursEntiers(b.signee_le_ms, m.maintenant_ms));
    const etat: EtatMission = decouvert ? "a_faire" : m.maintenant_ms >= finFenetre ? "validee" : "en_cours";
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
