// Géométrie isométrique pure (aucun accès au DOM, aucune aléa) : testée par Vitest.
// Repère : x vers la droite-bas, y vers la gauche-bas, z vers le haut, en « cases ».
// Projection 2:1 : une case fait TW pixels de large et TH de haut à l'écran, un étage TZ.

export const TW = 64;
export const TH = 32;
export const TZ = 32;

export type Point3 = readonly [number, number, number?];
export type Point2 = readonly [number, number];

/** Projette un point (x, y, z) du monde vers l'écran SVG. */
export function iso(x: number, y: number, z = 0): [number, number] {
  return [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z * TZ];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Attribut `points` d'un <polygon> à partir de points du monde. */
export function points(pts: readonly Point3[]): string {
  return pts
    .map((p) => {
      const [px, py] = iso(p[0], p[1], p[2] ?? 0);
      return `${r1(px)},${r1(py)}`;
    })
    .join(" ");
}

/** Fonction de paramétrage d'une face : (u le long du mur, v la hauteur) -> point du monde. */
export type FaceParam = (u: number, v: number) => [number, number, number];

/** Face « gauche » (tournée vers le spectateur, le long de x, à y = Y). */
export const faceGauche =
  (x: number, Y: number): FaceParam =>
  (u, v) => [x + u, Y, v];

/** Face « droite » (le long de y, à x = X). */
export const faceDroite =
  (X: number, y: number): FaceParam =>
  (u, v) => [X, y + u, v];

/** Rectangle (u0..u1, v0..v1) sur une face. */
export function quad(f: FaceParam, u0: number, u1: number, v0: number, v1: number): Point3[] {
  return [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)];
}

/** Assombrit (f < 1) ou éclaircit (f > 1) une couleur #rrggbb. */
export function nuance(hex: string, f: number): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))),
  );
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Lumière unique venant de la gauche-haut : la face gauche est claire, la droite plus sombre,
 * le dessus le plus clair. Mêmes facteurs que la maquette.
 */
export const LUMIERE = { gauche: 0.9, droite: 0.7, dessus: 1.06, arete: 0.6 } as const;

export function teintesFaces(couleur: string) {
  return {
    gauche: nuance(couleur, LUMIERE.gauche),
    droite: nuance(couleur, LUMIERE.droite),
    dessus: nuance(couleur, LUMIERE.dessus),
    arete: nuance(couleur, LUMIERE.arete),
  };
}

/** Clé de profondeur d'un objet posé (algorithme du peintre) : plus elle est grande, plus il est devant. */
export function cleProfondeur(o: { x: number; y: number; w?: number; d?: number }): number {
  return o.x + o.y + (o.w ?? 0) + (o.d ?? 0);
}

/** Trie du fond vers l'avant, sans modifier la liste reçue ; tri stable à clé égale. */
export function trierProfondeur<T extends { x: number; y: number; w?: number; d?: number; cle?: number }>(
  objets: readonly T[],
): T[] {
  return objets
    .map((o, i) => ({ o, i, k: o.cle ?? cleProfondeur(o) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((e) => e.o);
}

export type Cadre = { minX: number; minY: number; largeur: number; hauteur: number };

/** Boîte englobante à l'écran d'un ensemble de points du monde, avec une marge en pixels. */
export function boiteEnglobante(pts: readonly Point3[], marge = 0): Cadre {
  if (pts.length === 0) return { minX: 0, minY: 0, largeur: 0, hauteur: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    const [px, py] = iso(p[0], p[1], p[2] ?? 0);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  return { minX: minX - marge, minY: minY - marge, largeur: maxX - minX + 2 * marge, hauteur: maxY - minY + 2 * marge };
}

/** Les 8 coins d'un pavé (x, y, w, d, hauteur h, posé à z). */
export function coinsPave(x: number, y: number, w: number, d: number, h: number, z = 0): Point3[] {
  const c: Point3[] = [];
  for (const X of [x, x + w]) for (const Y of [y, y + d]) for (const Z of [z, z + h]) c.push([X, Y, Z]);
  return c;
}

export function viewBox(c: Cadre): string {
  return `${r1(c.minX)} ${r1(c.minY)} ${r1(c.largeur)} ${r1(c.hauteur)}`;
}

/** Case de la grille sous un point de l'écran (inverse de la projection, à z = 0). */
export function caseSousPoint(px: number, py: number): [number, number] {
  const a = px / (TW / 2),
    b = py / (TH / 2);
  return [Math.floor((a + b) / 2), Math.floor((b - a) / 2)];
}
