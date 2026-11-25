// Motifs, dégradés et filtres partagés par tout le dessin isométrique.
// Un seul <Defs /> par <svg> (SceneIso l'ajoute d'office). Les identifiants commencent par « iso- ».
// Couleurs de matière fixes (brique, verre, feuillage) : le thème ne change que le ciel et le fond.

import type { ReactElement } from "react";

/** Identifiants de textures utilisables dans `texture` des composants. */
export type Texture =
  | "brique"
  | "pierre"
  | "tole"
  | "enduit"
  | "bruit";

/** Renvoie l'url des motifs de face gauche / droite pour une texture. */
export function urlTexture(t: Texture | undefined, cote: "L" | "R"): string | undefined {
  if (!t) return undefined;
  if (t === "bruit" || t === "enduit") return `url(#iso-${t})`;
  return `url(#iso-${t}${cote})`;
}

const skewL = "skewY(26.565)";
const skewR = "skewY(-26.565)";
const SOL = "matrix(32 16 -32 16 0 0)";

export function Defs(): ReactElement {
  return (
    <defs>
      {/* lumière et occlusion */}
      <linearGradient id="iso-ao" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".10" />
        <stop offset=".55" stopColor="#000" stopOpacity="0" />
        <stop offset=".9" stopColor="#000" stopOpacity=".16" />
        <stop offset="1" stopColor="#000" stopOpacity=".32" />
      </linearGradient>
      <linearGradient id="iso-lumL" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity=".10" />
        <stop offset="1" stopColor="#000" stopOpacity=".06" />
      </linearGradient>
      <linearGradient id="iso-lumR" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity=".02" />
        <stop offset="1" stopColor="#000" stopOpacity=".16" />
      </linearGradient>
      <linearGradient id="iso-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#EAF5FB" />
        <stop offset=".38" stopColor="#9CC4DA" />
        <stop offset=".42" stopColor="#C9E2EF" />
        <stop offset=".5" stopColor="#7EA9C3" />
        <stop offset="1" stopColor="#365A72" />
      </linearGradient>
      <linearGradient id="iso-glassWarm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFE9B8" />
        <stop offset=".6" stopColor="#E9B96B" />
        <stop offset="1" stopColor="#9C6B33" />
      </linearGradient>
      <linearGradient id="iso-reflet" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset=".3" stopColor="#fff" stopOpacity="0" />
        <stop offset=".34" stopColor="#fff" stopOpacity=".55" />
        <stop offset=".44" stopColor="#fff" stopOpacity=".15" />
        <stop offset=".48" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="iso-signSheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".28" />
        <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".18" />
      </linearGradient>
      <linearGradient id="iso-roofSheen" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity=".18" />
        <stop offset="1" stopColor="#fff" stopOpacity=".12" />
      </linearGradient>
      <linearGradient id="iso-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFF8E1" stopOpacity=".55" />
        <stop offset="1" stopColor="#FFF8E1" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="iso-steel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#D5DAE0" />
        <stop offset=".5" stopColor="#9AA3AD" />
        <stop offset="1" stopColor="#6E7782" />
      </linearGradient>
      <linearGradient id="iso-water" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#BFE3F2" />
        <stop offset="1" stopColor="#5E9FC0" />
      </linearGradient>
      {[
        ["#9ACD6E", "#5A9445", "#2E5A2A"],
        ["#86BE5E", "#4C843C", "#284F25"],
        ["#A8D27A", "#679E4C", "#33622D"],
      ].map(([a, b, c], i) => (
        <radialGradient key={i} id={`iso-leaf${i}`} cx=".35" cy=".3" r=".75">
          <stop offset="0" stopColor={a} />
          <stop offset=".55" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </radialGradient>
      ))}
      <radialGradient id="iso-glow">
        <stop offset="0" stopColor="#FFF1C2" stopOpacity=".9" />
        <stop offset="1" stopColor="#FFF1C2" stopOpacity="0" />
      </radialGradient>

      {/* ombres douces */}
      <filter id="iso-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.5" />
      </filter>
      <filter id="iso-soft2" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      <filter id="iso-tagShadow" x="-20%" y="-40%" width="140%" height="200%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity=".25" />
      </filter>
      <filter id="iso-turb" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={3} seed={7} stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 -.42" />
      </filter>
      <filter id="iso-turb2" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves={2} seed={3} stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 .08  0 0 0 0 .2  0 0 0 0 .04  0 0 0 1.8 -.75" />
      </filter>
      <filter id="iso-turb3" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".35 .08" numOctaves={2} seed={11} stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 -.45" />
      </filter>

      {/* textures */}
      <pattern id="iso-bruit" width="160" height="160" patternUnits="userSpaceOnUse">
        <rect width="160" height="160" filter="url(#iso-turb)" />
      </pattern>
      <pattern id="iso-mottle" width="480" height="480" patternUnits="userSpaceOnUse">
        <rect width="480" height="480" filter="url(#iso-turb2)" />
      </pattern>
      <pattern id="iso-enduit" width="200" height="200" patternUnits="userSpaceOnUse">
        <rect width="200" height="200" filter="url(#iso-turb3)" opacity=".18" />
        <rect width="200" height="200" filter="url(#iso-turb)" opacity=".22" />
      </pattern>
      {(["L", "R"] as const).map((c) => (
        <g key={c}>
          <pattern id={`iso-brique${c}`} width="12" height="6" patternUnits="userSpaceOnUse" patternTransform={c === "L" ? skewL : skewR}>
            <path d="M0 0H12M0 3H12M6 0V3M0 3V6M12 3V6" stroke="#000" strokeOpacity=".22" strokeWidth=".7" />
            <rect x={c === "L" ? 1 : 7} y=".6" width="3" height="1.6" fill="#fff" opacity=".06" />
            <rect x={c === "L" ? 7 : 1} y="3.6" width="3" height="1.6" fill="#000" opacity=".07" />
          </pattern>
          <pattern id={`iso-pierre${c}`} width="24" height="10" patternUnits="userSpaceOnUse" patternTransform={c === "L" ? skewL : skewR}>
            <path d="M0 0H24M0 5H24M12 0V5M0 5V10M24 5V10" stroke="#000" strokeOpacity=".12" strokeWidth=".6" />
          </pattern>
          <pattern id={`iso-tole${c}`} width="3" height="10" patternUnits="userSpaceOnUse" patternTransform={c === "L" ? skewL : skewR}>
            <rect width="1.2" height="10" fill="#fff" opacity=".12" />
            <rect x="1.8" width="1" height="10" fill="#000" opacity=".11" />
          </pattern>
          <pattern id={`iso-tuiles${c}`} width="10" height="4.5" patternUnits="userSpaceOnUse" patternTransform={c === "L" ? skewL : skewR}>
            <path d="M0 4.2H10" stroke="#000" strokeOpacity=".28" strokeWidth=".9" />
            <path d="M5 0V4.2" stroke="#000" strokeOpacity=".12" strokeWidth=".6" />
            <path d="M0 .4H10" stroke="#fff" strokeOpacity=".08" strokeWidth=".6" />
          </pattern>
        </g>
      ))}
      <pattern id="iso-store" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={skewL}>
        <rect width="4" height="8" fill="#fff" opacity=".85" />
      </pattern>
      <pattern id="iso-parquet" width="2" height=".5" patternUnits="userSpaceOnUse" patternTransform={SOL}>
        <rect width="2" height=".25" fill="#C9996A" />
        <rect y=".25" width="2" height=".25" fill="#BE8D5D" />
        <rect y=".238" width="2" height=".014" fill="#8A6240" />
        <rect y=".488" width="2" height=".014" fill="#8A6240" />
        <rect x="1.3" width=".014" height=".25" fill="#8A6240" />
        <rect x=".55" y=".25" width=".014" height=".25" fill="#8A6240" />
        <rect x=".15" y=".08" width=".8" height=".02" fill="#E0B583" opacity=".5" />
        <rect x="1.1" y=".34" width=".6" height=".02" fill="#9C6F47" opacity=".5" />
      </pattern>
      <pattern id="iso-paves" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform={SOL}>
        <rect width="1" height="1" fill="none" stroke="#000" strokeOpacity=".08" strokeWidth=".03" />
        <rect x=".5" width=".012" height="1" fill="#000" opacity=".05" />
        <rect y=".5" width="1" height=".012" fill="#000" opacity=".05" />
      </pattern>
      <pattern id="iso-herbe" width=".2" height=".2" patternUnits="userSpaceOnUse" patternTransform={SOL}>
        <rect x=".03" y=".05" width=".012" height=".04" fill="#2E5A2A" opacity=".35" />
        <rect x=".12" y=".13" width=".012" height=".04" fill="#A8D27A" opacity=".35" />
        <rect x=".16" y=".02" width=".012" height=".03" fill="#2E5A2A" opacity=".25" />
      </pattern>
      <pattern id="iso-tapis" width=".25" height=".25" patternUnits="userSpaceOnUse" patternTransform={SOL}>
        <rect width=".25" height=".25" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth=".008" />
      </pattern>
    </defs>
  );
}
