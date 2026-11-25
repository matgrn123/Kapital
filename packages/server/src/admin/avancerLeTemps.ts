import { createHash, timingSafeEqual } from "node:crypto";
import type { Parametres } from "@kapital/content";
import { configTempsDepuis } from "@kapital/engine";
import type { StockageMonde } from "../avance/port.js";
import { ErreurAdmin, type JournalAudit } from "./port.js";

const MS_PAR_MINUTE = 60_000;

/** Durées proposées : jamais de saisie libre. */
export const DUREES_AVANCE = ["jour", "semaine", "mois"] as const;
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

function nombreDeJours(duree: DureeAvance, joursParMois: number): number {
  if (duree === "jour") return 1;
  if (duree === "semaine") return 7;
  return joursParMois;
}

/**
 * Fait avancer le temps du monde de recette d'une durée prédéfinie.
 *
 * L'horloge se déduit de la date de création du monde : l'avancer, c'est reculer cette date.
 * Le serveur seul décide (le navigateur n'envoie qu'un nom de durée), puis le moteur rattrape
 * les pas manquants à la mise à jour suivante. Irréversible : seule une remise à zéro du
 * monde de recette ramène en arrière.
 */
export async function avancerLeTemps(
  stockage: StockageMonde,
  audit: JournalAudit,
  params: Parametres,
  duree: string,
  ctx: ContexteAction,
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

  const config = configTempsDepuis(params);
  const joursParMois = params["temps_jours_par_mois_jeu"]?.valeur;
  if (!joursParMois || joursParMois <= 0) {
    throw new Error("Paramètre manquant : temps_jours_par_mois_jeu");
  }
  const jours = nombreDeJours(duree as DureeAvance, joursParMois);
  const decalageMs = Math.round(
    ((config.minutesReellesParMoisJeu * jours) / joursParMois) * MS_PAR_MINUTE,
  );

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
