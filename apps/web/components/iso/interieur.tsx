// Intérieur (atelier) : pièce avec murs et parquet, meubles (portés d'itemSVG de la maquette V2).

import type { ReactElement, ReactNode } from "react";
import { faceDroite, faceGauche, iso, quad } from "./geometrie";
import { Boite, Enseigne, Face, Fenetre, OmbrePied, Parquet, Poly, Seg } from "./primitives";

export type TypeMeuble = "machine" | "coupe" | "presse" | "etagere" | "bureau" | "plante" | "cartons" | "portant" | "mannequin";

/** Encombrement au sol (en cases) de chaque meuble, pour l'aperçu. Le moteur reste juge du placement. */
export const TAILLE_MEUBLE: Record<TypeMeuble, { w: number; d: number }> = {
  machine: { w: 1, d: 1 },
  coupe: { w: 2, d: 1 },
  presse: { w: 1, d: 1 },
  etagere: { w: 1, d: 2 },
  bureau: { w: 2, d: 1 },
  plante: { w: 1, d: 1 },
  cartons: { w: 1, d: 1 },
  portant: { w: 2, d: 1 },
  mannequin: { w: 1, d: 1 },
};

const pieds = (x: number, y: number, w: number, d: number, h: number, c = "#3A3F46", t = 0.05) => (
  <>
    <Boite x={x} y={y + d - t} w={t} d={t} h={h} couleur={c} />
    <Boite x={x + w - t} y={y + d - t} w={t} d={t} h={h} couleur={c} />
    <Boite x={x + w - t} y={y} w={t} d={t} h={h} couleur={c} />
  </>
);

/** Encombrement au sol d'un meuble, pivoté d'un quart de tour ou non (largeur et profondeur échangées). */
export function tailleMeuble(type: TypeMeuble, pivote = false): { w: number; d: number } {
  const t = TAILLE_MEUBLE[type];
  return pivote ? { w: t.d, d: t.w } : t;
}

/**
 * Un meuble posé en (x, y). Pivoté, il occupe tailleMeuble(type, true) : on le dessine en (y, x)
 * puis on le retourne en miroir sur l'axe vertical de l'écran. La projection iso (sans décalage)
 * échange alors les axes x et y du monde : le meuble tourne d'un quart de tour au sol. Seul défaut
 * connu : la face éclairée passe de l'autre côté (lumière par face approchée).
 */
export function Meuble({ type, x, y, pivote = false }: { type: TypeMeuble; x: number; y: number; pivote?: boolean }): ReactElement {
  if (!pivote) return <MeubleDroit type={type} x={x} y={y} />;
  return (
    <g transform="scale(-1 1)">
      <MeubleDroit type={type} x={y} y={x} />
    </g>
  );
}

function MeubleDroit({ type, x, y }: { type: TypeMeuble; x: number; y: number }): ReactElement {
  const t = TAILLE_MEUBLE[type];
  const s: ReactNode[] = [<OmbrePied key="o" x={x + 0.05} y={y + 0.08} w={t.w - 0.1} d={t.d - 0.12} opacite={0.3} />];
  switch (type) {
    case "machine": {
      const [px, py] = iso(x + 0.45, y + 0.42, 1.17);
      const [gx, gy] = iso(x + 0.3, y + 0.45, 1.1);
      s.push(
        <g key="m">
          {pieds(x + 0.1, y + 0.15, 0.8, 0.7, 0.66)}
          <Boite x={x + 0.1} y={y + 0.15} w={0.8} d={0.7} h={0.06} couleur="#D6B588" z={0.66} textureDessus="bruit" />
          <Poly pts={[[x + 0.2, y + 0.45, 0.721], [x + 0.55, y + 0.45, 0.721], [x + 0.55, y + 0.8, 0.721], [x + 0.2, y + 0.8, 0.721]]} fill="#3F63B8" opacity={0.9} />
          <Boite x={x + 0.22} y={y + 0.3} w={0.58} d={0.3} h={0.07} couleur="#F3F0E9" z={0.72} />
          <Boite x={x + 0.64} y={y + 0.32} w={0.14} d={0.26} h={0.34} couleur="#F3F0E9" z={0.79} />
          <Boite x={x + 0.26} y={y + 0.34} w={0.52} d={0.22} h={0.1} couleur="#F3F0E9" z={1.06} />
          <Boite x={x + 0.22} y={y + 0.34} w={0.1} d={0.22} h={0.2} couleur="#ECE7DD" z={0.88} />
          <Poly pts={quad(faceGauche(x + 0.26, y + 0.56), 0.05, 0.45, 1.08, 1.13)} fill="#B0362A" />
          <Boite x={x + 0.24} y={y + 0.43} w={0.03} d={0.03} h={0.14} couleur="#9AA3AD" z={0.74} />
          <rect x={px - 2.5} y={py - 7} width={5} height={7} rx={1.5} fill="#B0362A" />
          <ellipse cx={px} cy={py - 7} rx={2.5} ry={1.2} fill="#D9584A" />
          <circle cx={gx} cy={gy} r={9} fill="url(#iso-glow)" opacity=".45" />
        </g>,
      );
      break;
    }
    case "coupe": {
      const plateau = [[x + 0.15, y + 0.18, 0.871], [x + 1.85, y + 0.18, 0.871], [x + 1.85, y + 0.82, 0.871], [x + 0.15, y + 0.82, 0.871]] as const;
      s.push(
        <g key="c">
          {pieds(x + 0.05, y + 0.1, 1.9, 0.8, 0.8)}
          <Boite x={x + 0.05} y={y + 0.1} w={1.9} d={0.8} h={0.07} couleur="#E3D2B2" z={0.8} textureDessus="bruit" />
          <Poly pts={plateau} fill="#3E6F55" />
          <Poly pts={plateau} fill="url(#iso-tapis)" />
          <Poly pts={[[x + 0.3, y + 0.25, 0.875], [x + 1.25, y + 0.25, 0.875], [x + 1.25, y + 0.72, 0.875], [x + 0.3, y + 0.72, 0.875]]} fill="#3F63B8" />
          <Boite x={x + 1.35} y={y + 0.22} w={0.42} d={0.16} h={0.14} couleur="#C46E8A" z={0.875} />
          <Seg a={[x + 1.15, y + 0.75, 0.88]} b={[x + 1.35, y + 0.62, 0.88]} stroke="#2B3036" largeur={1.4} />
          <Seg a={[x + 1.18, y + 0.62, 0.88]} b={[x + 1.34, y + 0.76, 0.88]} stroke="#2B3036" largeur={1.4} />
        </g>,
      );
      break;
    }
    case "presse":
      s.push(
        <g key="p">
          <Boite x={x + 0.12} y={y + 0.2} w={0.76} d={0.6} h={0.75} couleur="#7E8892" />
          <Poly pts={quad(faceGauche(x + 0.12, y + 0.8), 0, 0.76, 0, 0.75)} fill="url(#iso-steel)" opacity={0.35} />
          <Boite x={x + 0.18} y={y + 0.25} w={0.64} d={0.5} h={0.06} couleur="#C8CED4" z={0.75} />
          <Boite x={x + 0.2} y={y + 0.3} w={0.5} d={0.36} h={0.1} couleur="#E9ECEF" z={0.95} />
          <Boite x={x + 0.68} y={y + 0.3} w={0.12} d={0.36} h={0.3} couleur="#5D646C" z={0.81} />
        </g>,
      );
      break;
    case "etagere": {
      const f = faceDroite(x + 0.95, y + 0.05);
      const cols = ["#F2EFE8", "#2D4A9E", "#B0362A", "#3E7D4A", "#2E3440", "#D9C49A", "#C46E8A"];
      const rayons: ReactNode[] = [];
      let k = 0;
      for (const v of [0.08, 0.56, 1.04, 1.52]) {
        rayons.push(<Poly key={`r${v}`} pts={quad(f, 0.04, 1.86, v - 0.04, v)} fill="#8A6646" />);
        for (let u = 0.1; u < 1.7; u += 0.3) {
          const hh = 0.12 + ((k * 7) % 3) * 0.05;
          const c = cols[k % 7]!;
          rayons.push(<Face key={`p${k}`} pts={quad(f, u, u + 0.24, v, v + hh + 0.18)} couleur={c} occlusion={false} />);
          k++;
        }
      }
      s.push(
        <g key="e">
          <Boite x={x + 0.05} y={y + 0.05} w={0.9} d={1.9} h={2} couleur="#6E4F35" textureDessus="bruit" />
          {rayons}
        </g>,
      );
      break;
    }
    case "bureau":
      s.push(
        <g key="b">
          {pieds(x + 0.05, y + 0.1, 1.9, 0.8, 0.72, "#2B3036", 0.04)}
          <Boite x={x + 0.05} y={y + 0.1} w={1.9} d={0.8} h={0.05} couleur="#EDE7DC" z={0.72} textureDessus="bruit" />
          <Boite x={x + 0.95} y={y + 0.38} w={0.08} d={0.08} h={0.08} couleur="#2A2F38" z={0.77} />
          <Boite x={x + 0.72} y={y + 0.32} w={0.55} d={0.06} h={0.36} couleur="#1E2228" z={0.85} />
          <Poly pts={quad(faceGauche(x + 0.72, y + 0.381), 0.03, 0.52, 0.88, 1.18)} fill="#203046" />
          <Poly pts={quad(faceGauche(x + 0.72, y + 0.382), 0.03, 0.52, 0.88, 1.18)} fill="url(#iso-reflet)" />
          <Poly pts={[[x + 0.75, y + 0.55, 0.771], [x + 1.2, y + 0.55, 0.771], [x + 1.2, y + 0.68, 0.771], [x + 0.75, y + 0.68, 0.771]]} fill="#3A3F48" />
          <Boite x={x + 1.5} y={y + 0.5} w={0.08} d={0.08} h={0.1} couleur="#F4F1EA" z={0.77} />
        </g>,
      );
      break;
    case "plante": {
      const [px, py] = iso(x + 0.5, y + 0.5, 0.42);
      const feuilles: [number, number, number][] = [[0, -16, 13], [-8, -9, 9], [8, -11, 9], [-3, -25, 9], [5, -22, 8]];
      s.push(
        <g key="pl">
          <Boite x={x + 0.3} y={y + 0.3} w={0.4} d={0.4} h={0.36} couleur="#B86F45" textureDessus="bruit" />
          <Boite x={x + 0.27} y={y + 0.27} w={0.46} d={0.46} h={0.06} couleur="#C98157" z={0.36} />
          {feuilles.map(([dx, dy, r], i) => (
            <circle key={i} cx={px + dx} cy={py + dy} r={r} fill={`url(#iso-leaf${i % 3})`} />
          ))}
        </g>,
      );
      break;
    }
    case "cartons":
      s.push(
        <g key="ca">
          <Boite x={x + 0.1} y={y + 0.1} w={0.8} d={0.8} h={0.45} couleur="#C39257" textureDessus="bruit" />
          <Boite x={x + 0.18} y={y + 0.2} w={0.6} d={0.55} h={0.38} couleur="#D0A266" z={0.45} textureDessus="bruit" />
          <Seg a={[x + 0.48, y + 0.2, 0.831]} b={[x + 0.48, y + 0.75, 0.831]} stroke="#E8D3A8" largeur={2.2} />
        </g>,
      );
      break;
    case "portant": {
      const cols = ["#F2EFE8", "#2D4A9E", "#B0362A", "#F2EFE8", "#3E7D4A", "#C46E8A", "#D9C49A"];
      const f = faceGauche(x, y + 0.42);
      s.push(
        <g key="po">
          <Boite x={x + 0.1} y={y + 0.4} w={0.05} d={0.05} h={1.5} couleur="#9AA3AD" />
          <Boite x={x + 1.85} y={y + 0.4} w={0.05} d={0.05} h={1.5} couleur="#9AA3AD" />
          <Seg a={[x + 0.12, y + 0.42, 1.5]} b={[x + 1.88, y + 0.42, 1.5]} stroke="#9AA3AD" largeur={2.4} />
          {cols.map((c, i) => {
            const u = 0.25 + i * 0.23;
            return <Face key={i} pts={[f(u - 0.09, 1.45), f(u + 0.09, 1.45), f(u + 0.12, 0.78), f(u - 0.12, 0.78)]} couleur={c} occlusion={false} />;
          })}
        </g>,
      );
      break;
    }
    case "mannequin": {
      const [px, py] = iso(x + 0.5, y + 0.5, 0);
      s.push(
        <g key="ma">
          <ellipse cx={px} cy={py} rx={10} ry={5} fill="#2B3036" />
          <rect x={px - 1.2} y={py - 30} width={2.4} height={30} fill="#5D646C" />
          <path d={`M${px - 10} ${py - 58}q10 -6 20 0l-2 26q-8 4 -16 0z`} fill="#2D4A9E" />
          <path d={`M${px + 1} ${py - 61}q5 1 9 3l-2 26q-3 2 -7 2z`} fill="#000" opacity=".15" />
          <ellipse cx={px} cy={py - 62} rx={4} ry={3} fill="#E9E2D4" />
        </g>,
      );
      break;
    }
  }
  return <g>{s}</g>;
}

/**
 * Pièce vide vue de l'angle : mur du fond en enduit avec fenêtres d'atelier, mur de gauche en brique,
 * parquet au sol et rais de lumière. W × D cases, hauteur H.
 */
export function Piece({ W, D, H = 2.4, enseigne, fenetres = true }: { W: number; D: number; H?: number; enseigne?: string; fenetres?: boolean }): ReactElement {
  const fond = faceGauche(0, 0);
  const gauche = faceDroite(0, 0);
  const vitres: number[] = [];
  if (fenetres) for (let u = 0.8; u + 1.8 <= W - 0.6; u += 2.6) vitres.push(u);
  const mFond = [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]] as const;
  const mGauche = [[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]] as const;
  return (
    <g pointerEvents="none">
      <Poly pts={[[-0.2, -0.2, H], [W, -0.2, H], [W, 0, H], [0, 0, H], [0, D, H], [-0.2, D, H]]} fill="#8F857A" />
      <Poly pts={mFond} fill="#ECE5D9" />
      <Poly pts={mFond} fill="url(#iso-enduit)" />
      <Poly pts={mFond} fill="url(#iso-ao)" />
      <Poly pts={[[0, 0, 0], [W, 0, 0], [W, 0, 0.12], [0, 0, 0.12]]} fill="#B9AE9E" />
      <Poly pts={mGauche} fill="#A65E47" />
      <Poly pts={mGauche} fill="url(#iso-briqueR)" />
      <Poly pts={mGauche} fill="url(#iso-bruit)" />
      <Poly pts={mGauche} fill="url(#iso-ao)" />
      <Poly pts={[[0, 0, 0], [0, D, 0], [0, D, 0.12], [0, 0, 0.12]]} fill="#7A4535" />
      {vitres.map((u) => (
        <Fenetre key={u} f={fond} u0={u} u1={u + 1.8} v0={0.85} v1={Math.min(2.1, H - 0.2)} cadre="#2F343B" colonnes={4} rangees={3} marge={0.05} montant={1.4} />
      ))}
      {enseigne ? <Enseigne f={gauche} cx={D / 2} v={Math.min(1.7, H - 0.3)} texte={enseigne} fond="#17202E" encre="#F2D9A0" cote="R" taille={10} longueur={Math.min(D - 0.6, enseigne.length * 0.2 + 0.4)} /> : null}
      <Parquet x={0} y={0} w={W} d={D} />
      {vitres.map((u) => (
        <Poly key={`b${u}`} pts={[[u, 0, 0], [u + 1.8, 0, 0], [u + 3.2, 2.8, 0], [u + 1.4, 2.8, 0]]} fill="url(#iso-beam)" />
      ))}
      <Poly pts={[[0, 0, 0], [W, 0, 0], [W, 1.2, 0], [0, 1.2, 0]]} fill="#000" opacity={0.05} />
      <Poly pts={[[0, 0, 0], [1.2, 0, 0], [1.2, D, 0], [0, D, 0]]} fill="#000" opacity={0.05} />
    </g>
  );
}
