import { createHash, timingSafeEqual } from "node:crypto";
import { estMoisCalendaire, finDuMoisMs, moisDeLInstantMs } from "@kapital/engine";
import type { StockageMonde } from "../avance/port.js";
import { ErreurAdmin, type JournalAudit } from "./port.js";

const MS_PAR_HEURE = 3_600_000;
const MS_PAR_JOUR = 24 * MS_PAR_HEURE;

/**
 * Durées proposées : jamais de saisie libre. L'horloge du jeu est l'horloge réelle :
 * « heure » et « jour » avancent d'une vraie heure ou d'un vrai jour, « fin_du_mois »
 * amène le jeu au 1er du mois suivant à 0 h (heure de Paris), ce qui clôture le mois.
 */
export const DUREES_AVANCE = ["heure", "jour", "fin_du_mois"] as const;
export type DureeAvance = (typeof DUREES_AVANCE)[number];

export type ContexteAction = {
  /** Vrai seulement dans le monde de recette (variable d'environnement). */
  readonly modeRecette: boolean;
  /** Code admin attendu (variable d'environnement). Absent ou vide : tout est refusé. */
  readonly codeAttendu: string | undefined;
  /** Code saisi par l'administrateur sur la page. */
  readonly codeSaisi: string | undefined;
  /** Profil de l'administrateur, pour le journal d'audit. */
  readonly acteur: string | null;
};

export type ResultatAvanceTemps = {
  readonly decalageMs: number;
  readonly debutReelAvantMs: number;
  readonly debutReelApresMs: number;
};

function codesIdentiques(attendu: string, saisi: string | undefined): boolean {
  // On compare des empreintes de même taille : pas de fuite par la durée ni la longueur.
  const empreinte = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(empreinte(attendu), empreinte(saisi ?? ""));
}

/** Décalage à appliquer, à partir de l'heure du jeu actuelle (ms depuis le 1er janvier 1970). */
function decalagePour(duree: DureeAvance, heureJeuMs: number): number {
  if (duree === "heure") return MS_PAR_HEURE;
  if (duree === "jour") return MS_PAR_JOUR;
  return finDuMoisMs(moisDeLInstantMs(heureJeuMs)) - heureJeuMs;
}

/**
 * Fait avancer le temps du monde de recette d'une durée prédéfinie.
 *
 * L'heure du jeu vaut « maintenant − worlds.debut_reel » : l'avancer, c'est reculer cette
 * origine. Le serveur seul décide (le navigateur n'envoie qu'un nom de durée ; l'instant
 * `maintenantMs` est l'horloge du serveur), puis le moteur rattrape les pas manquants à la
 * mise à jour suivante. Irréversible : seule une remise à zéro du monde ramène en arrière.
 */
export async function avancerLeTemps(
  stockage: StockageMonde,
  audit: JournalAudit,
  duree: string,
  ctx: ContexteAction,
  maintenantMs: number,
): Promise<ResultatAvanceTemps> {
  if (!ctx.modeRecette) {
    throw new ErreurAdmin("Avancer le temps est désactivé hors du mode recette.", 403);
  }
  if (!ctx.codeAttendu) {
    throw new ErreurAdmin("Code admin non configuré : l'avance du temps reste verrouillée.", 403);
  }
  if (!codesIdentiques(ctx.codeAttendu, ctx.codeSaisi)) {
    await audit.enregistrer({
      profileId: ctx.acteur,
      action: "admin.avancer_temps.refuse",
      cible: null,
      details: { raison: "code incorrect", duree },
    });
    throw new ErreurAdmin("Code admin incorrect.", 403);
  }
  if (!(DUREES_AVANCE as readonly string[]).includes(duree)) {
    throw new ErreurAdmin(`Durée inconnue : choisir ${DUREES_AVANCE.join(", ")}.`, 400);
  }

  const monde = await stockage.chargerMondeActif();
  if (!monde) throw new ErreurAdmin("Aucun monde actif.", 409);
  if (monde.debutReelMs === null) {
    throw new ErreurAdmin(
      "L'horloge commune n'est pas encore initialisée : cliquer d'abord sur « Mettre le monde à jour maintenant ».",
      409,
    );
  }
  if (!estMoisCalendaire(monde.moisCourant)) {
    throw new ErreurAdmin(
      "Le monde est encore sur l'ancien calendrier : la migration 0043 (horloge réelle) n'est pas appliquée.",
      409,
    );
  }

  const decalageMs = decalagePour(duree as DureeAvance, maintenantMs - monde.debutReelMs);
  const debutReelApresMs = monde.debutReelMs - decalageMs;
  await stockage.definirDebutReel(monde.id, debutReelApresMs);
  await audit.enregistrer({
    profileId: ctx.acteur,
    action: "admin.avancer_temps",
    cible: monde.id,
    details: { duree, decalageMs, debutReelAvantMs: monde.debutReelMs, debutReelApresMs },
  });
  return { decalageMs, debutReelAvantMs: monde.debutReelMs, debutReelApresMs };
}
