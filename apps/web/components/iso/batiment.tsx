// Bâtiments du village (portés de buildingSVG dans la maquette V2).

import type { ReactElement, ReactNode } from "react";
import { faceDroite, faceGauche, iso, nuance, quad } from "./geometrie";
import type { Texture } from "./defs";
import { Boite, Enseigne, Face, Fenetre, Fenetres, OmbreBoite, Poly, Seg, TexteSurFace, Toit } from "./primitives";

/** Style d'architecture. */
export type StyleBatiment = "maison" | "industriel" | "classique" | "boutique" | "vitre";

export type BatimentProps = {
  x: number;
  y: number;
  w: number;
  d: number;
  /** Hauteur des murs en étages (1 ≈ un niveau). */
  h: number;
  couleur: string;
  style?: StyleBatiment;
  texture?: Texture;
  /** Toit à deux pans : hauteur du faîtage (0 = toit plat). */
  toit?: number;
  couleurToit?: string;
  enseigne?: string;
  fondEnseigne?: string;
  encreEnseigne?: string;
  /** Couleur du store au-dessus de la porte. */
  store?: string;
  cheminee?: boolean;
  drapeau?: boolean;
  aLouer?: boolean;
  /** Parvis pavé autour du bâtiment (défaut : oui). */
  parvis?: boolean;
};

/** Murs texturés sur un socle de pierre, avec ombre portée et grain : la base de tout bâtiment. */
export function Facade({ x, y, w, d, h, couleur, texture, ombre = true }: { x: number; y: number; w: number; d: number; h: number; couleur: string; texture?: Texture; ombre?: boolean }): ReactElement {
  const Y = y + d,
    X = x + w;
  return (
    <g>
      {ombre ? <OmbreBoite x={x} y={y} w={w} d={d} h={h} /> : null}
      <Boite x={x} y={y} w={w} d={d} h={0.14} couleur={nuance(couleur, 0.72)} texture={texture === "brique" ? undefined : "pierre"} />
      <Boite x={x} y={y} w={w} d={d} h={h - 0.14} couleur={couleur} z={0.14} texture={texture ?? "enduit"} />
      {texture !== "brique" ? <Poly pts={[[x, Y, 0.14], [X, Y, 0.14], [X, Y, h], [x, Y, h]]} fill="url(#iso-bruit)" opacity={0.35} /> : null}
    </g>
  );
}

export function Batiment(b: BatimentProps): ReactElement {
  const style = b.style ?? "maison";
  const Y = b.y + b.d,
    X = b.x + b.w;
  const fL = faceGauche(b.x, Y),
    fR = faceDroite(X, b.y);
  const r = b.toit ?? 0;
  const pad = 0.28;
  const p: ReactNode[] = [];
  const indus = style === "industriel",
    classique = style === "classique",
    boutique = style === "boutique",
    vitre = style === "vitre";

  if (b.parvis !== false) {
    const pts = [[b.x - pad, b.y - pad], [X + pad, b.y - pad], [X + pad, Y + pad], [b.x - pad, Y + pad]] as const;
    p.push(
      <g key="parvis" pointerEvents="none">
        <Poly pts={pts} fill="#D8D2C6" />
        <Poly pts={pts} fill="url(#iso-paves)" />
        <Poly pts={pts} fill="url(#iso-bruit)" opacity={0.5} />
      </g>,
    );
  }
  p.push(<OmbreBoite key="ombre" x={b.x} y={b.y} w={b.w} d={b.d} h={b.h + r * 0.6} />);
  p.push(<Facade key="facade" x={b.x} y={b.y} w={b.w} d={b.d} h={b.h} couleur={b.couleur} texture={vitre ? "bruit" : b.texture} ombre={false} />);

  if (vitre) {
    p.push(<Poly key="vL" pts={quad(fL, 0.08, b.w - 0.08, 0.22, b.h - 0.12)} fill="url(#iso-glass)" />);
    p.push(<Poly key="vLr" pts={quad(fL, 0.08, b.w - 0.08, 0.22, b.h - 0.12)} fill="url(#iso-reflet)" />);
    p.push(<Poly key="vR" pts={quad(fR, 0.08, b.d - 0.08, 0.22, b.h - 0.12)} fill="url(#iso-glass)" opacity={0.85} />);
    for (let i = 1; i < 6; i++) {
      p.push(<Seg key={`mL${i}`} a={fL((b.w * i) / 6, 0.22)} b={fL((b.w * i) / 6, b.h - 0.12)} stroke="#2A2F38" largeur={1.2} />);
      p.push(<Seg key={`mR${i}`} a={fR((b.d * i) / 6, 0.22)} b={fR((b.d * i) / 6, b.h - 0.12)} stroke="#2A2F38" largeur={1.2} />);
    }
    for (const v of [0.75, 1.25].filter((v) => v < b.h - 0.12)) {
      p.push(<Seg key={`tL${v}`} a={fL(0.08, v)} b={fL(b.w - 0.08, v)} stroke="#2A2F38" largeur={1.6} />);
      p.push(<Seg key={`tR${v}`} a={fR(0.08, v)} b={fR(b.d - 0.08, v)} stroke="#2A2F38" largeur={1.6} />);
    }
  } else {
    const fh = 0.72,
      etages = Math.max(1, Math.floor((b.h - 0.2) / fh));
    for (let f = 0; f < etages; f++) {
      const v0 = 0.34 + f * fh,
        v1 = v0 + 0.38;
      if (v1 > b.h - 0.1) break;
      const rdc = f === 0;
      const opt = { colonnes: classique ? 1 : 2, rangees: classique ? 2 : 1, chaude: boutique && rdc };
      if (!(boutique && rdc)) p.push(<Fenetres key={`fL${f}`} f={fL} longueur={b.w} v0={v0} v1={v1} sauf={rdc ? b.w / 2 : undefined} rideaux={!indus && !boutique && f > 0} {...opt} />);
      p.push(<Fenetres key={`fR${f}`} f={fR} longueur={b.d} v0={v0} v1={v1} rideaux={!indus && f > 0} {...opt} />);
    }
    if (boutique) {
      p.push(<Fenetre key="vit1" f={fL} u0={0.2} u1={b.w / 2 - 0.35} v0={0.22} v1={0.78} chaude cadre="#2B3036" appui={false} />);
      p.push(<Fenetre key="vit2" f={fL} u0={b.w / 2 + 0.35} u1={b.w - 0.2} v0={0.22} v1={0.78} chaude cadre="#2B3036" appui={false} />);
    }
    // porte
    p.push(
      <g key="porte">
        <Poly pts={quad(fL, b.w / 2 - 0.22, b.w / 2 + 0.22, 0.14, 0.8)} fill="#3A2E25" stroke="#211913" strokeWidth={0.6} />
        <Poly pts={quad(fL, b.w / 2 - 0.16, b.w / 2 + 0.16, 0.42, 0.74)} fill={indus ? "#5A6068" : "url(#iso-glass)"} />
        <Seg a={fL(b.w / 2, 0.14)} b={fL(b.w / 2, 0.8)} stroke="#211913" largeur={0.8} />
      </g>,
    );
    if (indus && b.d > 1.4) {
      const lames: ReactNode[] = [];
      for (let v = 0.2; v < 0.95; v += 0.07) lames.push(<Seg key={v} a={fR(0.3, v)} b={fR(1.3, v)} stroke="#4E555D" largeur={0.6} />);
      p.push(
        <g key="rideau">
          <Face pts={quad(fR, 0.3, 1.3, 0.14, 0.95)} couleur="#6B737C" occlusion={false} />
          {lames}
        </g>,
      );
    }
    if (classique) {
      const n = b.w > 2.5 ? 4 : 3;
      const colonnes: ReactNode[] = [];
      for (let i = 0; i < n; i++) {
        const u = b.w / 2 - (n - 1) * 0.22 + i * 0.44;
        colonnes.push(<Boite key={i} x={b.x + u - 0.06} y={Y + 0.1} w={0.12} d={0.12} h={b.h * 0.55} couleur="#F4F0E7" z={0.26} />);
      }
      const vz = 0.38 + b.h * 0.55;
      const fronton = [[b.x + b.w / 2 - 0.75, Y + 0.3, vz], [b.x + b.w / 2 + 0.75, Y + 0.3, vz], [b.x + b.w / 2, Y + 0.3, vz + 0.32]] as const;
      p.push(
        <g key="portique">
          <Boite x={b.x + 0.15} y={Y} w={b.w - 0.3} d={0.28} h={0.12} couleur="#EFEAE0" z={0.14} />
          {colonnes}
          <Boite x={b.x + 0.15} y={Y} w={b.w - 0.3} d={0.3} h={0.12} couleur="#EFEAE0" z={0.26 + b.h * 0.55} />
          <Face pts={fronton} couleur="#F4F0E7" />
        </g>,
      );
    }
    if (b.store) {
      const u0 = b.w / 2 - 0.45,
        u1 = b.w / 2 + 0.45,
        v = 0.92;
      const pts = [[b.x + u0, Y, v], [b.x + u1, Y, v], [b.x + u1, Y + 0.38, v - 0.2], [b.x + u0, Y + 0.38, v - 0.2]] as const;
      p.push(
        <g key="store">
          <Poly pts={pts} fill={b.store} stroke={nuance(b.store, 0.6)} />
          <Poly pts={pts} fill="url(#iso-store)" opacity={0.5} />
          <Poly pts={[[b.x + u0, Y + 0.38, v - 0.2], [b.x + u1, Y + 0.38, v - 0.2], [b.x + u1, Y + 0.38, v - 0.28], [b.x + u0, Y + 0.38, v - 0.28]]} fill={nuance(b.store, 0.8)} />
        </g>,
      );
    }
  }
  if (b.aLouer) {
    p.push(
      <g key="alouer">
        <Poly pts={quad(fL, 0.2, 0.6, 0.4, 0.7)} fill="#F4F1EA" />
        <TexteSurFace f={fL} u={0.4} v={0.5} texte="À LOUER" taille={5.5} couleur="#B0362A" cote="L" />
      </g>,
    );
  }
  // toit
  if (r > 0) {
    p.push(<Toit key="toit" x={b.x} y={b.y} w={b.w} d={b.d} h={b.h} r={r} couleur={b.couleurToit ?? "#3E4753"} mur={b.couleur} />);
    if (b.cheminee) {
      p.push(
        <g key="chem">
          <Boite x={b.x + 0.5} y={b.y + 0.35} w={0.3} d={0.3} h={0.75} couleur="#8E4E3B" z={b.h + 0.2} texture="brique" />
          <Boite x={b.x + 0.47} y={b.y + 0.32} w={0.36} d={0.36} h={0.06} couleur="#5E3529" z={b.h + 0.95} />
        </g>,
      );
    }
  } else {
    const t = b.h;
    const dessus = [[b.x, b.y, t], [X, b.y, t], [X, Y, t], [b.x, Y, t]] as const;
    const rim = nuance(vitre ? "#2E333B" : b.couleur, 0.92);
    const [fx, fy] = iso(b.x + 0.75, b.y + 0.7, t + 0.24);
    p.push(
      <g key="toitplat">
        <Poly pts={dessus} fill="#9C978D" />
        <Poly pts={dessus} fill="url(#iso-bruit)" opacity={0.5} />
        <Boite x={b.x} y={b.y} w={b.w} d={0.08} h={0.12} couleur={rim} z={t} />
        <Boite x={b.x} y={b.y} w={0.08} d={b.d} h={0.12} couleur={rim} z={t} />
        {!classique ? (
          <>
            <Boite x={b.x + 0.5} y={b.y + 0.5} w={0.5} d={0.4} h={0.24} couleur="#B9BEC4" z={t} textureDessus="bruit" />
            <ellipse cx={fx} cy={fy} rx={7} ry={3.5} fill="#5D646C" />
          </>
        ) : (
          <Boite x={b.x + 0.9} y={b.y + 0.9} w={Math.max(0.2, b.w - 1.8)} d={Math.max(0.2, b.d - 1.8)} h={0.15} couleur="#CFC7B6" z={t} textureDessus="bruit" />
        )}
        <Boite x={b.x} y={Y - 0.08} w={b.w} d={0.08} h={0.12} couleur={rim} z={t} />
        <Boite x={X - 0.08} y={b.y} w={0.08} d={b.d} h={0.12} couleur={rim} z={t} />
      </g>,
    );
  }
  if (b.enseigne) {
    const v = Math.min(b.h - 0.15, b.store || boutique ? 1.18 : 1.02);
    p.push(<Enseigne key="ens" f={faceGauche(b.x, Y + 0.01)} cx={b.w / 2} v={v} texte={b.enseigne} fond={b.fondEnseigne} encre={b.encreEnseigne} />);
  }
  if (b.drapeau) {
    const [px, py] = iso(X - 0.2, Y - 0.2, b.h + 0.12);
    p.push(
      <g key="drap">
        <rect x={px - 1} y={py - 40} width={2} height={40} fill="#5D646C" />
        <rect x={px + 1} y={py - 40} width={7} height={12} fill="#2B4AA0" />
        <rect x={px + 8} y={py - 40} width={7} height={12} fill="#F4F1EA" />
        <rect x={px + 15} y={py - 40} width={7} height={12} fill="#C8352E" />
      </g>,
    );
  }
  if (!indus && !vitre) {
    for (const u of [0.12, b.w - 0.42]) {
      const [px, py] = iso(b.x + u + 0.15, Y + 0.12, 0.14);
      p.push(
        <g key={`jard${u}`}>
          <Boite x={b.x + u} y={Y + 0.05} w={0.3} d={0.14} h={0.12} couleur="#7A5A44" />
          <circle cx={px - 3} cy={py - 2} r={3} fill="#E3647A" />
          <circle cx={px + 3} cy={py - 3} r={3} fill="#F2C14E" />
          <circle cx={px} cy={py - 5} r={2.6} fill="#5A9445" />
        </g>,
      );
    }
  }
  return <g>{p}</g>;
}

/** Hauteur du sommet d'un bâtiment (pour y poser une étiquette). */
export function sommetBatiment(b: Pick<BatimentProps, "h" | "toit">): number {
  return b.h + (b.toit ?? 0) + 0.12;
}
