// Calcul pur : échelle uniforme pour qu'un meuble 3D tienne dans l'emprise
// (en cases) de son module, sans dépasser une hauteur maximale. Purement
// visuel : l'emprise vient du catalogue, la 3D ne fait que s'y adapter.

export function echelleDansEmprise(
  taille: [number, number, number],
  largeur: number,
  profondeur: number,
  marge = 0.85,
  hauteurMax = 2.4,
): number {
  const [sx, sy, sz] = taille;
  if (sx <= 0 || sz <= 0) return 1;
  let e = Math.min((largeur * marge) / sx, (profondeur * marge) / sz);
  if (sy > 0) e = Math.min(e, hauteurMax / sy);
  return e;
}
