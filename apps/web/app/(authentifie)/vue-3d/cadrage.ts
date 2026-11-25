// Cadrage de caméra : calcul pur (aucune dépendance à Three.js), testé à part.
// Place la caméra en surplomb, à 45° comme une vue isométrique, assez loin
// pour que toute la boîte englobante tienne dans l'écran.

export type Vec3 = [number, number, number];

export type Cadrage = { position: Vec3; cible: Vec3; distance: number };

/** Direction de la caméra depuis la cible : azimut 45°, élévation ~38°. */
const DIRECTION: Vec3 = [1, 1.1, 1];
/** Marge autour de la scène (1 = au ras du bord). */
const MARGE = 1.05;

export function cadrerBoite(
  boite: { min: Vec3; max: Vec3 },
  fovVerticalDeg: number,
  ratio: number,
): Cadrage {
  const { min, max } = boite;
  const cible: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const rayon = Math.hypot(
    boite.max[0] - boite.min[0],
    boite.max[1] - boite.min[1],
    boite.max[2] - boite.min[2],
  ) / 2;
  const fovV = (fovVerticalDeg * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * ratio);
  const demiAngle = Math.min(fovV, fovH) / 2;
  const distance = (rayon / Math.sin(demiAngle)) * MARGE;
  const n = Math.hypot(...DIRECTION);
  const k = distance / n;
  const position: Vec3 = [cible[0] + DIRECTION[0] * k, cible[1] + DIRECTION[1] * k, cible[2] + DIRECTION[2] * k];
  return { position, cible, distance };
}
