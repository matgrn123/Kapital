// Primitives de dessin isométrique (portées de la maquette V2), en JSX pur et sans état.
// Toutes les positions sont en cases du monde (x, y, z) ; voir geometrie.ts.

import type { ReactElement, ReactNode } from "react";
import {
  faceDroite,
  faceGauche,
  iso,
  nuance,
  points,
  quad,
  teintesFaces,
  type FaceParam,
  type Point3,
} from "./geometrie";
import { urlTexture, type Texture } from "./defs";

const f1 = (n: number) => Math.round(n * 10) / 10;

export function Poly(p: {
  pts: readonly Point3[];
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}): ReactElement {
  return (
    <polygon
      points={points(p.pts)}
      fill={p.fill}
      stroke={p.stroke}
      strokeWidth={p.stroke ? (p.strokeWidth ?? 0.5) : undefined}
      strokeLinejoin={p.stroke ? "round" : undefined}
      opacity={p.opacity}
    />
  );
}

export function Seg(p: { a: Point3; b: Point3; stroke: string; largeur?: number; opacity?: number }): ReactElement {
  const [x1, y1] = iso(p.a[0], p.a[1], p.a[2] ?? 0);
  const [x2, y2] = iso(p.b[0], p.b[1], p.b[2] ?? 0);
  return (
    <line x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} stroke={p.stroke} strokeWidth={p.largeur ?? 1} strokeLinecap="round" opacity={p.opacity} />
  );
}

/** Une face colorée, avec texture, dégradé de lumière et occlusion au pied. */
export function Face(p: {
  pts: readonly Point3[];
  couleur: string;
  texture?: string;
  lumiere?: "L" | "R";
  occlusion?: boolean;
}): ReactElement {
  return (
    <>
      <Poly pts={p.pts} fill={p.couleur} stroke={nuance(p.couleur, 0.6)} />
      {p.texture ? <Poly pts={p.pts} fill={p.texture} /> : null}
      {p.lumiere ? <Poly pts={p.pts} fill={`url(#iso-lum${p.lumiere})`} /> : null}
      {p.occlusion !== false ? <Poly pts={p.pts} fill="url(#iso-ao)" /> : null}
    </>
  );
}

export type BoiteProps = {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  couleur: string;
  z?: number;
  texture?: Texture;
  textureDessus?: "bruit" | "paves" | "parquet";
  occlusion?: boolean;
};

/** Pavé éclairé : face gauche claire, face droite sombre, dessus le plus clair. */
export function Boite({ x, y, w, d, h, couleur, z = 0, texture, textureDessus, occlusion }: BoiteProps): ReactElement {
  const t = z + h;
  const c = teintesFaces(couleur);
  const dessus: Point3[] = [[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]];
  return (
    <g>
      <Face pts={[[x, y + d, z], [x + w, y + d, z], [x + w, y + d, t], [x, y + d, t]]} couleur={c.gauche} texture={urlTexture(texture, "L")} lumiere={w > 1 ? "L" : undefined} occlusion={occlusion} />
      <Face pts={[[x + w, y, z], [x + w, y + d, z], [x + w, y + d, t], [x + w, y, t]]} couleur={c.droite} texture={urlTexture(texture, "R")} lumiere={d > 1 ? "R" : undefined} occlusion={occlusion} />
      <Poly pts={dessus} fill={c.dessus} stroke={c.arete} />
      {textureDessus ? <Poly pts={dessus} fill={`url(#iso-${textureDessus})`} /> : null}
    </g>
  );
}

/** Ombre portée douce d'un volume (la lumière vient de la gauche-haut). */
export function OmbreBoite({ x, y, w, d, h, opacite = 0.3 }: { x: number; y: number; w: number; d: number; h: number; opacite?: number }): ReactElement {
  const s = Math.max(0.15, h * 0.55),
    k = 0.4;
  return (
    <g opacity={opacite} filter="url(#iso-soft)" pointerEvents="none">
      <Poly pts={[[x, y + d], [x, y], [x + s, y - s * k], [x + w + s, y - s * k], [x + w + s, y + d - s * k], [x + w, y + d]]} fill="#14201A" />
    </g>
  );
}

/** Ombre de contact au pied d'un objet. */
export function OmbrePied({ x, y, w, d, opacite = 0.28 }: { x: number; y: number; w: number; d: number; opacite?: number }): ReactElement {
  return (
    <g opacity={opacite} filter="url(#iso-soft2)" pointerEvents="none">
      <Poly pts={[[x - 0.03, y - 0.03], [x + w + 0.06, y - 0.03], [x + w + 0.06, y + d + 0.06], [x - 0.03, y + d + 0.06]]} fill="#000" />
    </g>
  );
}

export type FenetreProps = {
  f: FaceParam;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  cadre?: string;
  chaude?: boolean;
  rideaux?: boolean;
  colonnes?: number;
  rangees?: number;
  marge?: number;
  montant?: number;
  appui?: boolean;
};

/** Une fenêtre (cadre, vitre avec reflet, croisillons, appui). */
export function Fenetre(o: FenetreProps): ReactElement {
  const fr = o.cadre ?? "#F4F1EA",
    m = o.marge ?? 0.035,
    { f, u0, u1, v0, v1 } = o;
  const cols = o.colonnes ?? 2,
    rows = o.rangees ?? 1;
  const segs: ReactNode[] = [];
  for (let i = 1; i < cols; i++) {
    const u = u0 + ((u1 - u0) * i) / cols;
    segs.push(<Seg key={`c${i}`} a={f(u, v0)} b={f(u, v1)} stroke={fr} largeur={o.montant ?? 1.1} />);
  }
  for (let j = 1; j < rows; j++) {
    const v = v0 + ((v1 - v0) * j) / rows;
    segs.push(<Seg key={`r${j}`} a={f(u0, v)} b={f(u1, v)} stroke={fr} largeur={o.montant ?? 1.1} />);
  }
  const vitre = quad(f, u0, u1, v0, v1);
  return (
    <g>
      <Poly pts={quad(f, u0 - m, u1 + m, v0 - m, v1 + m)} fill={fr} stroke={nuance(fr, 0.55)} />
      <Poly pts={vitre} fill={o.chaude ? "url(#iso-glassWarm)" : "url(#iso-glass)"} />
      {!o.chaude ? <Poly pts={vitre} fill="url(#iso-reflet)" /> : null}
      {o.rideaux ? (
        <>
          <Poly pts={quad(f, u0, u0 + (u1 - u0) * 0.22, v0, v1)} fill="rgba(245,236,220,.85)" />
          <Poly pts={quad(f, u1 - (u1 - u0) * 0.22, u1, v0, v1)} fill="rgba(245,236,220,.85)" />
        </>
      ) : null}
      {segs}
      {o.appui !== false ? <Poly pts={quad(f, u0 - 0.06, u1 + 0.06, v0 - 0.075, v0 - 0.035)} fill={nuance(fr, 0.78)} /> : null}
    </g>
  );
}

/** Une rangée de fenêtres régulières le long d'une face. `sauf` : centre à laisser libre (porte). */
export function Fenetres(p: {
  f: FaceParam;
  longueur: number;
  v0: number;
  v1: number;
  pas?: number;
  largeur?: number;
  sauf?: number;
} & Omit<FenetreProps, "f" | "u0" | "u1" | "v0" | "v1">): ReactElement {
  const { f, longueur, v0, v1, pas = 0.6, largeur = 0.32, sauf, ...reste } = p;
  const n = Math.max(1, Math.floor(longueur / pas));
  const items: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const c = ((i + 0.5) * longueur) / n;
    if (sauf !== undefined && Math.abs(c - sauf) < 0.45) continue;
    items.push(<Fenetre key={i} f={f} u0={c - largeur / 2} u1={c + largeur / 2} v0={v0} v1={v1} {...reste} />);
  }
  return <g>{items}</g>;
}

/** Texte posé à plat sur une face (gauche ou droite). */
export function TexteSurFace(p: { f: FaceParam; u: number; v: number; texte: string; taille: number; couleur: string; cote: "L" | "R" }): ReactElement {
  const [px, py] = iso(...p.f(p.u, p.v));
  return (
    <text
      textAnchor="middle"
      transform={`translate(${f1(px)},${f1(py)}) skewY(${p.cote === "R" ? -26.565 : 26.565})`}
      style={{ font: `700 ${p.taille}px var(--font-body, system-ui), sans-serif`, letterSpacing: ".06em", fill: p.couleur }}
    >
      {p.texte}
    </text>
  );
}

/** Enseigne rectangulaire sur une face, centrée en u = cx, à la hauteur v. */
export function Enseigne(p: { f: FaceParam; cx: number; v: number; longueur?: number; texte: string; fond?: string; encre?: string; cote?: "L" | "R"; taille?: number }): ReactElement {
  const fond = p.fond ?? "#2D3646";
  const len = p.longueur ?? p.texte.length * 0.085 + 0.34;
  const q = quad(p.f, p.cx - len / 2, p.cx + len / 2, p.v - 0.13, p.v + 0.13);
  return (
    <g>
      <Poly pts={q} fill={fond} stroke={nuance(fond, 0.6)} strokeWidth={0.6} />
      <Poly pts={q} fill="url(#iso-signSheen)" />
      <TexteSurFace f={p.f} u={p.cx} v={p.v - 0.075} texte={p.texte} taille={p.taille ?? 8} couleur={p.encre ?? "#FFFFFF"} cote={p.cote ?? "L"} />
    </g>
  );
}

/** Toit à deux pans en tuiles (faîtage le long de x). `mur` : couleur du pignon. */
export function Toit({ x, y, w, d, h, r, couleur, mur }: { x: number; y: number; w: number; d: number; h: number; r: number; couleur: string; mur: string }): ReactElement {
  const o = 0.14,
    X0 = x - o,
    X1 = x + w + o,
    Y0 = y - o,
    Y1 = y + d + o,
    ym = y + d / 2,
    hb = h - 0.07;
  const arriere: Point3[] = [[X0, Y0, hb], [X1, Y0, hb], [X1, ym, h + r], [X0, ym, h + r]];
  const avant: Point3[] = [[X0, Y1, hb], [X1, Y1, hb], [X1, ym, h + r], [X0, ym, h + r]];
  return (
    <g>
      <Poly pts={arriere} fill={nuance(couleur, 0.72)} stroke={nuance(couleur, 0.6)} />
      <Poly pts={arriere} fill="url(#iso-tuilesL)" />
      <Face pts={[[x + w, y, h], [x + w, y + d, h], [x + w, ym, h + r]]} couleur={nuance(mur, 0.68)} />
      <Poly pts={[[X1, Y0, hb], [X1, Y1, hb], [X1, ym, h + r]]} fill="none" stroke={nuance(couleur, 0.4)} strokeWidth={2} />
      <Poly pts={avant} fill={couleur} stroke={nuance(couleur, 0.6)} />
      <Poly pts={avant} fill="url(#iso-tuilesL)" />
      <Poly pts={avant} fill="url(#iso-roofSheen)" />
      <Seg a={[X0, Y1, hb]} b={[X1, Y1, hb]} stroke={nuance(couleur, 0.45)} largeur={2.4} />
      <Seg a={[X0, ym, h + r]} b={[X1, ym, h + r]} stroke={nuance(couleur, 0.55)} largeur={3} />
    </g>
  );
}

/** Arbre feuillu ; `variante` 0, 1 ou 2 change le vert. */
export function Arbre({ x, y, echelle = 1, variante = 0 }: { x: number; y: number; echelle?: number; variante?: number }): ReactElement {
  const [px, py] = iso(x, y, 0);
  const s = echelle;
  const blobs: [number, number, number][] = [[0, -38, 18], [-11, -30, 13], [11, -31, 13], [-5, -50, 12], [8, -46, 11], [0, -27, 11]];
  return (
    <g pointerEvents="none">
      <ellipse cx={px + 16 * s} cy={py - 3 * s} rx={24 * s} ry={9 * s} fill="#14201A" opacity=".28" filter="url(#iso-soft)" />
      <path d={`M${px - 3 * s} ${py}L${px - 1.6 * s} ${py - 28 * s}L${px + 1.6 * s} ${py - 28 * s}L${px + 3 * s} ${py}Z`} fill="#5A3E28" />
      <path d={`M${px} ${py}L${px + 1.6 * s} ${py - 28 * s}L${px + 3 * s} ${py}Z`} fill="#3F2B1C" />
      {blobs.map(([dx, dy, r], i) => (
        <circle key={i} cx={f1(px + dx * s)} cy={f1(py + dy * s)} r={f1(r * s)} fill={`url(#iso-leaf${(i + variante) % 3})`} />
      ))}
      <circle cx={f1(px + 7 * s)} cy={f1(py - 34 * s)} r={f1(14 * s)} fill="#14201A" opacity=".12" />
    </g>
  );
}

/** Haie basse taillée. */
export function Buisson({ x, y, w, d, z = 0 }: { x: number; y: number; w: number; d: number; z?: number }): ReactElement {
  const touffes: ReactNode[] = [];
  for (let i = 0; i < w / 0.22; i++) {
    const [px, py] = iso(x + 0.1 + i * 0.22, y + d, z + 0.28);
    touffes.push(<circle key={i} cx={f1(px)} cy={f1(py)} r={4.2} fill={`url(#iso-leaf${i % 3})`} />);
  }
  return (
    <g pointerEvents="none">
      <OmbrePied x={x} y={y} w={w} d={d} opacite={0.25} />
      <Boite x={x} y={y} w={w} d={d} h={0.28} couleur="#3F7A3A" z={z} textureDessus="bruit" />
      {touffes}
    </g>
  );
}

/** Lampadaire avec halo. */
export function Lampadaire({ x, y, z = 0, allume = true }: { x: number; y: number; z?: number; allume?: boolean }): ReactElement {
  const [px, py] = iso(x, y, z);
  return (
    <g pointerEvents="none">
      <ellipse cx={px + 3} cy={py} rx={5} ry={2} fill="#000" opacity=".25" />
      <rect x={px - 1.3} y={py - 60} width={2.6} height={60} fill="#2B3036" />
      <rect x={px - 2.5} y={py - 6} width={5} height={6} fill="#2B3036" />
      <path d={`M${px} ${py - 60}q9 -7 15 -1`} stroke="#2B3036" strokeWidth={2.4} fill="none" />
      <path d={`M${px + 9} ${py - 61}h12l-2.5 5h-7z`} fill="#2B3036" />
      <ellipse cx={px + 15} cy={py - 55.5} rx={4.5} ry={1.6} fill="#FFF1C2" />
      {allume ? <circle cx={px + 15} cy={py - 50} r={12} fill="url(#iso-glow)" opacity=".55" /> : null}
    </g>
  );
}

/** Voiture ; `sens` = "x" (le long de x) ou "y". */
export function Voiture({ x, y, sens = "x", couleur, z = 0 }: { x: number; y: number; sens?: "x" | "y"; couleur: string; z?: number }): ReactElement {
  const [w, d] = sens === "x" ? [1.1, 0.52] : [0.52, 1.1];
  const c = sens === "x" ? [x + 0.28, y + 0.05, 0.58, d - 0.1] : [x + 0.05, y + 0.28, w - 0.1, 0.58];
  const [cx, cy, cw, cd] = c as [number, number, number, number];
  const roues: [number, number][] =
    sens === "x" ? [0.2, 0.86].map((u) => iso(x + u, y + d, z + 0.07)) : [0.2, 0.86].map((u) => iso(x + w, y + u, z + 0.07));
  const phares: [number, number][] =
    sens === "x"
      ? [iso(x + w, y + 0.12, z + 0.15), iso(x + w, y + d - 0.12, z + 0.15)]
      : [iso(x + 0.12, y + d, z + 0.15), iso(x + w - 0.12, y + d, z + 0.15)];
  const vitreL = sens === "x" ? quad(faceGauche(cx, cy + cd), 0.04, cw - 0.04, z + 0.27, z + 0.39) : quad(faceGauche(cx, cy + cd), 0.03, cw - 0.03, z + 0.27, z + 0.39);
  const vitreR = sens === "x" ? quad(faceDroite(cx + cw, cy), 0.03, cd - 0.03, z + 0.27, z + 0.39) : quad(faceDroite(cx + cw, cy), 0.04, cd - 0.04, z + 0.27, z + 0.39);
  return (
    <g pointerEvents="none">
      <OmbrePied x={x} y={y} w={w} d={d} opacite={0.4} />
      <Boite x={x} y={y} w={w} d={d} h={0.2} couleur={couleur} z={z + 0.05} />
      <Boite x={cx} y={cy} w={cw} d={cd} h={0.17} couleur={nuance(couleur, 0.95)} z={z + 0.25} />
      <Poly pts={vitreL} fill="url(#iso-glass)" />
      <Poly pts={vitreR} fill="url(#iso-glass)" />
      {roues.map(([px, py], i) => (
        <g key={i}>
          <ellipse cx={px} cy={py} rx={4.2} ry={5} fill="#1A1C20" />
          <ellipse cx={px} cy={py} rx={1.8} ry={2.2} fill="#8B9097" />
        </g>
      ))}
      {phares.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={1.6} fill="#FFF6D0" />
      ))}
    </g>
  );
}

/** Personnage debout, pieds en (x, y). */
export function Personnage({
  x,
  y,
  z = 0,
  haut = "#2D4A9E",
  echelle = 1,
  peau = "#E0B08A",
  cheveux = "#3A2A20",
  bas = "#2E3440",
}: {
  x: number;
  y: number;
  z?: number;
  haut?: string;
  echelle?: number;
  peau?: string;
  cheveux?: string;
  bas?: string;
}): ReactElement {
  const [px, py] = iso(x, y, z);
  return (
    <g transform={`translate(${f1(px)},${f1(py)}) scale(${echelle})`} pointerEvents="none">
      <ellipse cx="4" cy="0" rx="11" ry="4" fill="#000" opacity=".22" filter="url(#iso-soft2)" />
      <path d="M-5 -1L-4.6 -19L-.4 -19L-.9 -1Z" fill={bas} />
      <path d="M1 -1L.5 -19L4.6 -19L5 -1Z" fill={nuance(bas, 0.78)} />
      <ellipse cx="-3.2" cy="-1" rx="3" ry="1.5" fill="#1C1C20" />
      <ellipse cx="3.2" cy="-1" rx="3" ry="1.5" fill="#1C1C20" />
      <path d="M-7 -19Q-7.8 -33.5 -4 -34.5L4 -34.5Q7.8 -33.5 7 -19Z" fill={haut} />
      <path d="M1.5 -34.5L4 -34.5Q7.8 -33.5 7 -19L1.5 -19Z" fill="#000" opacity=".14" />
      <path d="M-6.5 -32.5Q-10 -26 -8.6 -20" stroke={nuance(haut, 1.03)} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M6.5 -32.5Q10 -26 8.6 -20" stroke={nuance(haut, 0.78)} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="-8.6" cy="-19.4" r="1.8" fill={peau} />
      <circle cx="8.6" cy="-19.4" r="1.8" fill={nuance(peau, 0.85)} />
      <rect x="-1.6" y="-37.5" width="3.2" height="3.4" fill={nuance(peau, 0.85)} />
      <ellipse cx="0" cy="-42" rx="5.3" ry="6.1" fill={peau} />
      <ellipse cx="2.2" cy="-41.5" rx="2.6" ry="5.2" fill="#000" opacity=".08" />
      <path d="M-5.6 -42.5Q-5.9 -49.2 0 -49.2Q5.9 -49.2 5.6 -42.5Q3.5 -46 -1 -45.6Q-3.6 -45.2 -5.6 -42.5Z" fill={cheveux} />
    </g>
  );
}

/** Étiquette en bulle au-dessus d'un point ; `aToi` = couleur d'accent (ta société). */
export function Etiquette({ x, y, z, texte, aToi = false }: { x: number; y: number; z: number; texte: string; aToi?: boolean }): ReactElement {
  const [px, py] = iso(x, y, z);
  const w = texte.length * 6.3 + 20;
  const fond = aToi ? "var(--accent, #2D4A9E)" : "#FFFFFF";
  const encre = aToi ? "var(--on-accent, #FFFFFF)" : "#17202E";
  return (
    <g pointerEvents="none" aria-hidden="true">
      <rect x={f1(px - w / 2)} y={f1(py - 10)} width={f1(w)} height={21} rx={10.5} fill={fond} stroke={aToi ? "none" : "#17202E"} strokeOpacity={0.15} filter="url(#iso-tagShadow)" />
      <text x={f1(px)} y={f1(py + 4)} textAnchor="middle" style={{ font: "600 11px var(--font-body, system-ui), sans-serif", fill: encre }}>
        {texte}
      </text>
      <path d={`M${px - 5} ${py + 11}l5 5l5 -5z`} fill={fond} />
    </g>
  );
}

/* ---------- Sols ---------- */

type Rect = { x: number; y: number; w: number; d: number; z?: number };
const rect = ({ x, y, w, d, z = 0 }: Rect): Point3[] => [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]];

/** Sol uni avec grain ; `epaisseur` > 0 dessine la tranche (dalle du quartier). */
export function Sol(p: Rect & { couleur?: string; epaisseur?: number }): ReactElement {
  const { x, y, w, d, z = 0, couleur = "#53585F", epaisseur = 0 } = p;
  const e = epaisseur;
  return (
    <g pointerEvents="none">
      {e > 0 ? (
        <>
          <Poly pts={[[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z - e], [x, y + d, z - e]]} fill="#6E5A43" />
          <Poly pts={[[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z - e], [x, y + d, z - e]]} fill="url(#iso-bruit)" />
          <Poly pts={[[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z - e], [x + w, y, z - e]]} fill="#56463A" />
          <Poly pts={[[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z - e], [x + w, y, z - e]]} fill="url(#iso-bruit)" />
          <Poly pts={[[x, y + d, z - 0.06], [x + w, y + d, z - 0.06], [x + w, y + d, z - 0.12], [x, y + d, z - 0.12]]} fill="#4D4F53" />
        </>
      ) : null}
      <Poly pts={rect(p)} fill={couleur} />
      <Poly pts={rect(p)} fill="url(#iso-bruit)" />
      <Poly pts={rect(p)} fill="url(#iso-mottle)" opacity={0.4} />
    </g>
  );
}

/** Route asphaltée avec ligne médiane pointillée ; `sens` = axe de la route. */
export function Route(p: Rect & { sens: "x" | "y"; passages?: number[] }): ReactElement {
  const { x, y, w, d, z = 0, sens } = p;
  const tirets: ReactNode[] = [];
  if (sens === "x") {
    const ym = y + d / 2;
    for (let u = x; u < x + w; u += 1) tirets.push(<Seg key={u} a={[u + 0.15, ym, z]} b={[u + 0.6, ym, z]} stroke="#EDE6CF" largeur={1.8} />);
  } else {
    const xm = x + w / 2;
    for (let u = y; u < y + d; u += 1) tirets.push(<Seg key={u} a={[xm, u + 0.15, z]} b={[xm, u + 0.6, z]} stroke="#EDE6CF" largeur={1.8} />);
  }
  const zebras: ReactNode[] = [];
  for (const c of p.passages ?? []) {
    for (let i = 0; i < 5; i++) {
      const o = i * 0.17;
      zebras.push(
        sens === "x" ? (
          <Poly key={`${c}-${i}`} pts={[[c + o, y + 0.05, z], [c + o + 0.09, y + 0.05, z], [c + o + 0.09, y + d - 0.05, z], [c + o, y + d - 0.05, z]]} fill="#F1ECDF" opacity={0.9} />
        ) : (
          <Poly key={`${c}-${i}`} pts={[[x + 0.05, c + o, z], [x + w - 0.05, c + o, z], [x + w - 0.05, c + o + 0.09, z], [x + 0.05, c + o + 0.09, z]]} fill="#F1ECDF" opacity={0.9} />
        ),
      );
    }
  }
  return (
    <g pointerEvents="none">
      <Poly pts={rect(p)} fill="#53585F" />
      <Poly pts={rect(p)} fill="url(#iso-bruit)" />
      <Poly pts={rect(p)} fill="url(#iso-mottle)" opacity={0.4} />
      {tirets}
      {zebras}
    </g>
  );
}

/** Trottoir ou parvis pavé, légèrement surélevé. */
export function Paves(p: Rect & { hauteur?: number; couleur?: string }): ReactElement {
  return (
    <g pointerEvents="none">
      <Boite x={p.x} y={p.y} w={p.w} d={p.d} h={p.hauteur ?? 0.1} couleur={p.couleur ?? "#CBC6BD"} z={p.z} textureDessus="paves" />
    </g>
  );
}

/** Pelouse texturée avec bordure. */
export function Pelouse(p: Rect): ReactElement {
  const pts = rect(p);
  return (
    <g pointerEvents="none">
      <Poly pts={pts} fill="#7DAA56" />
      <Poly pts={pts} fill="url(#iso-mottle)" />
      <Poly pts={pts} fill="url(#iso-herbe)" />
      <Poly pts={pts} fill="url(#iso-bruit)" opacity={0.7} />
      <Poly pts={pts} fill="none" stroke="#6E8F4C" strokeWidth={1} />
    </g>
  );
}

/** Plancher en parquet (intérieur). */
export function Parquet(p: Rect): ReactElement {
  const pts = rect(p);
  return (
    <g pointerEvents="none">
      <Poly pts={pts} fill="#C49565" />
      <Poly pts={pts} fill="url(#iso-parquet)" />
      <Poly pts={pts} fill="url(#iso-bruit)" opacity={0.45} />
    </g>
  );
}
