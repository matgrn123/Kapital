// <SceneIso> : rend une liste d'objets placés, triés par profondeur, dans un SVG isométrique.
// Sans état : la sélection, le survol et les cases viennent des props.

import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { boiteEnglobante, cleProfondeur, coinsPave, trierProfondeur, viewBox as vb, type Cadre, type Point3 } from "./geometrie";
import { Defs } from "./defs";
import { Batiment, sommetBatiment, type BatimentProps } from "./batiment";
import { Meuble, tailleMeuble, type TypeMeuble } from "./interieur";
import { Arbre, Buisson, Etiquette, Lampadaire, Personnage, Poly, Voiture } from "./primitives";

type Commun = {
  /** Identifiant : obligatoire pour qu'un objet soit cliquable. */
  id?: string;
  x: number;
  y: number;
  /** Texte de la bulle au-dessus de l'objet. */
  etiquette?: string;
  /** Bulle en couleur d'accent (« à toi »). */
  aToi?: boolean;
  /** Nom lu par les lecteurs d'écran (par défaut : l'étiquette). */
  nom?: string;
  /** Force la clé de profondeur (sinon x + y + w + d). */
  cle?: number;
  /** Cliquable même si un id est fourni ? (défaut : oui si id et onSelect). */
  selectionnable?: boolean;
};

export type ObjetIso =
  | (Commun & { type: "batiment" } & Omit<BatimentProps, "x" | "y">)
  | (Commun & { type: "meuble"; meuble: TypeMeuble; pivote?: boolean })
  | (Commun & { type: "arbre"; echelle?: number; variante?: number })
  | (Commun & { type: "buisson"; w: number; d: number })
  | (Commun & { type: "lampadaire" })
  | (Commun & { type: "voiture"; couleur: string; sens?: "x" | "y" })
  | (Commun & { type: "personnage"; haut?: string; peau?: string; cheveux?: string; echelle?: number })
  /** Dessin libre : `rendu` est déjà en coordonnées écran ; w, d, h servent au tri et au cadre. */
  | (Commun & { type: "libre"; w?: number; d?: number; h?: number; rendu: ReactNode });

export type GrilleIso = {
  W: number;
  D: number;
  /** Couleur de remplissage d'une case (ex. vert = libre, rouge = refusé) ; undefined = transparente. */
  couleur?: (x: number, y: number) => string | undefined;
  /** Affiche le quadrillage. */
  traits?: boolean;
};

export type SceneIsoProps = {
  objets: readonly ObjetIso[];
  /** Décor dessiné en premier, sans tri (sol, routes, pelouses, pièce). */
  sol?: ReactNode;
  /** Décor dessiné après les objets (suspensions, premier plan). */
  dessus?: ReactNode;
  grille?: GrilleIso;
  /** id de l'objet sélectionné. */
  selection?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onCaseSurvol?: (c: { x: number; y: number } | null) => void;
  onCaseClic?: (c: { x: number; y: number }) => void;
  /** Zone du monde à cadrer : sinon calculée depuis les objets et la grille. */
  etendue?: { x: number; y: number; w: number; d: number; h?: number; z?: number };
  marge?: number;
  /** Nom de la scène pour les lecteurs d'écran. */
  titre: string;
  /** Fond en ciel dégradé (défaut : oui). */
  ciel?: boolean;
  className?: string;
};

/** Encombrement (w, d, h) d'un objet, pour le tri et le cadrage. */
export function encombrement(o: ObjetIso): { w: number; d: number; h: number } {
  switch (o.type) {
    case "batiment":
      return { w: o.w, d: o.d, h: sommetBatiment(o) };
    case "meuble":
      return { ...tailleMeuble(o.meuble, o.pivote), h: o.meuble === "etagere" ? 2 : 1.2 };
    case "arbre":
      return { w: 0.5, d: 0.5, h: 2 * (o.echelle ?? 1) };
    case "buisson":
      return { w: o.w, d: o.d, h: 0.4 };
    case "lampadaire":
      return { w: 0.2, d: 0.2, h: 2 };
    case "voiture":
      return o.sens === "y" ? { w: 0.52, d: 1.1, h: 0.45 } : { w: 1.1, d: 0.52, h: 0.45 };
    case "personnage":
      return { w: 0.3, d: 0.3, h: 1.6 * (o.echelle ?? 1) };
    case "libre":
      return { w: o.w ?? 0, d: o.d ?? 0, h: o.h ?? 0 };
  }
}

function dessin(o: ObjetIso): ReactNode {
  switch (o.type) {
    case "batiment": {
      const { type: _t, id: _i, etiquette: _e, aToi: _a, nom: _n, cle: _c, selectionnable: _s, ...b } = o;
      return <Batiment {...b} />;
    }
    case "meuble":
      return <Meuble type={o.meuble} x={o.x} y={o.y} pivote={o.pivote} />;
    case "arbre":
      return <Arbre x={o.x} y={o.y} echelle={o.echelle} variante={o.variante} />;
    case "buisson":
      return <Buisson x={o.x} y={o.y} w={o.w} d={o.d} />;
    case "lampadaire":
      return <Lampadaire x={o.x} y={o.y} />;
    case "voiture":
      return <Voiture x={o.x} y={o.y} couleur={o.couleur} sens={o.sens} />;
    case "personnage":
      return <Personnage x={o.x} y={o.y} haut={o.haut} peau={o.peau} cheveux={o.cheveux} echelle={o.echelle} />;
    case "libre":
      return o.rendu;
  }
}

/** Cadre automatique : objets + grille. */
export function cadreScene(objets: readonly ObjetIso[], grille?: GrilleIso, etendue?: SceneIsoProps["etendue"], marge = 24): Cadre {
  const pts: Point3[] = [];
  if (etendue) pts.push(...coinsPave(etendue.x, etendue.y, etendue.w, etendue.d, etendue.h ?? 0, etendue.z ?? 0));
  else {
    for (const o of objets) {
      const e = encombrement(o);
      pts.push(...coinsPave(o.x, o.y, e.w, e.d, e.h + (o.etiquette ? 0.9 : 0)));
    }
    if (grille) pts.push(...coinsPave(0, 0, grille.W, grille.D, 0));
  }
  return boiteEnglobante(pts, marge);
}

const STYLE = `
.iso-scene{--sky-top:#BCD8EA;--sky-bot:#E4EEF2;--scene-dim:1;--iso-sel:var(--accent,#2D4A9E);position:relative;overflow:hidden;border-radius:16px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .iso-scene{--sky-top:#22364C;--sky-bot:#3A4D60;--scene-dim:.86}}
:root[data-theme="dark"] .iso-scene{--sky-top:#22364C;--sky-bot:#3A4D60;--scene-dim:.86}
.iso-scene.iso-ciel{background:radial-gradient(120% 80% at 30% 0%,var(--sky-bot),var(--sky-top))}
.iso-scene>svg{display:block;width:100%;height:auto;filter:brightness(var(--scene-dim))}
.iso-obj[role="button"]{cursor:pointer;outline:none}
.iso-obj[role="button"]:hover,.iso-obj[role="button"]:focus-visible{filter:brightness(1.1) drop-shadow(0 0 5px rgba(255,255,255,.85))}
.iso-obj.iso-sel{filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 6px var(--iso-sel))}
.iso-case{outline:none}
.iso-case[role="button"]{cursor:crosshair}
.iso-case[role="button"]:focus-visible{stroke:var(--iso-sel);stroke-width:2}
@media (prefers-reduced-motion:no-preference){.iso-obj{transition:filter .15s}}
`;

const touche = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

export function SceneIso(p: SceneIsoProps): ReactElement {
  const cadre = cadreScene(p.objets, p.grille, p.etendue, p.marge);
  const tries = trierProfondeur(
    p.objets.map((o) => {
      const e = encombrement(o);
      return { o, x: o.x, y: o.y, w: e.w, d: e.d, cle: o.cle ?? cleProfondeur({ x: o.x, y: o.y, w: e.w, d: e.d }) };
    }),
  );

  const cases: ReactNode[] = [];
  if (p.grille) {
    const g = p.grille;
    for (let x = 0; x < g.W; x++)
      for (let y = 0; y < g.D; y++) {
        const actif = !!p.onCaseClic;
        cases.push(
          <g
            key={`${x},${y}`}
            className="iso-case"
            role={actif ? "button" : undefined}
            tabIndex={actif ? 0 : undefined}
            aria-label={actif ? `Case ${x + 1}, ${y + 1}` : undefined}
            onClick={p.onCaseClic ? () => p.onCaseClic?.({ x, y }) : undefined}
            onKeyDown={p.onCaseClic ? touche(() => p.onCaseClic?.({ x, y })) : undefined}
            onMouseEnter={p.onCaseSurvol ? () => p.onCaseSurvol?.({ x, y }) : undefined}
            onFocus={p.onCaseSurvol ? () => p.onCaseSurvol?.({ x, y }) : undefined}
          >
            <Poly
              pts={[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]}
              fill={g.couleur?.(x, y) ?? "rgba(0,0,0,0)"}
              stroke={g.traits ? "rgba(255,255,255,.35)" : undefined}
              strokeWidth={0.6}
            />
          </g>,
        );
      }
  }

  return (
    <div className={`iso-scene${p.ciel !== false ? " iso-ciel" : ""}${p.className ? " " + p.className : ""}`}>
      <style>{STYLE}</style>
      <svg viewBox={vb(cadre)} role="group" aria-label={p.titre} onMouseLeave={() => { p.onHover?.(null); p.onCaseSurvol?.(null); }}>
        <Defs />
        {p.sol}
        {cases.length ? <g>{cases}</g> : null}
        {tries.map(({ o }, i) => {
          const actif = !!o.id && !!p.onSelect && o.selectionnable !== false;
          const nom = o.nom ?? o.etiquette ?? o.id;
          const sel = !!o.id && o.id === p.selection;
          return (
            <g
              key={o.id ?? `${o.type}-${i}`}
              className={`iso-obj${sel ? " iso-sel" : ""}`}
              role={actif ? "button" : undefined}
              tabIndex={actif ? 0 : undefined}
              aria-label={actif ? nom : undefined}
              aria-pressed={actif ? sel : undefined}
              onClick={actif ? () => p.onSelect?.(o.id!) : undefined}
              onKeyDown={actif ? touche(() => p.onSelect?.(o.id!)) : undefined}
              onMouseEnter={p.onHover && o.id ? () => p.onHover?.(o.id!) : undefined}
              onFocus={p.onHover && o.id ? () => p.onHover?.(o.id!) : undefined}
              pointerEvents={o.type === "meuble" && !actif ? "none" : undefined}
            >
              {dessin(o)}
            </g>
          );
        })}
        {p.dessus}
        {p.objets
          .filter((o) => o.etiquette)
          .map((o, i) => {
            const e = encombrement(o);
            return <Etiquette key={`et-${o.id ?? i}`} x={o.x + e.w / 2} y={o.y + e.d / 2} z={e.h + 0.55} texte={o.etiquette!} aToi={o.aToi} />;
          })}
      </svg>
    </div>
  );
}
