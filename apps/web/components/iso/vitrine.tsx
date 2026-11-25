"use client";

// Vitrine du moteur isométrique (adresse /design/iso). Données d'exemple, pas des chiffres du jeu.

import { useState } from "react";
import { Lampadaire, Paves, Pelouse, Piece, Route, Sol, SceneIso, TAILLE_MEUBLE, type ObjetIso } from "./index";

const QUARTIER: ObjetIso[] = [
  { type: "batiment", id: "atelier", x: 1, y: 1, w: 3, d: 2.6, h: 1.5, couleur: "#A85B44", texture: "brique", toit: 0.95, couleurToit: "#3E4753", enseigne: "MAISON LUMEN", store: "#2D4A9E", cheminee: true, etiquette: "Toi · Maison Lumen", aToi: true },
  { type: "batiment", id: "banque", x: 6, y: 1, w: 3, d: 2.6, h: 2.25, couleur: "#DDD5C4", style: "classique", texture: "pierre", enseigne: "BANQUE DU QUAI", fondEnseigne: "#F4EFE4", encreEnseigne: "#2D3646", drapeau: true, etiquette: "Banque du Quai" },
  { type: "batiment", id: "faconnier", x: 6.4, y: 6.2, w: 2, d: 2.4, h: 1.35, couleur: "#8E9AA4", style: "industriel", texture: "tole", enseigne: "DUVAL & CIE", etiquette: "Façonnier Duval" },
  { type: "batiment", id: "boutique", x: 1.2, y: 6.2, w: 2.2, d: 2.2, h: 1.45, couleur: "#E8E1D3", style: "boutique", enseigne: "COTON & FILS", fondEnseigne: "#4A5D86", store: "#4A5D86", etiquette: "Coton & Fils" },
  { type: "arbre", x: 4.6, y: 1.4, variante: 1 },
  { type: "arbre", x: 4.7, y: 3.2, echelle: 0.85, variante: 2 },
  { type: "arbre", x: 4.4, y: 7.6, echelle: 0.9 },
  { type: "buisson", x: 0.6, y: 4.1, w: 2.4, d: 0.22 },
  { type: "voiture", x: 2.4, y: 4.75, couleur: "#B0362A" },
  { type: "voiture", x: 7.2, y: 5.15, couleur: "#E9E4DA" },
  { type: "personnage", x: 5.4, y: 4.45, haut: "#C46E8A", echelle: 0.5 },
  { type: "personnage", x: 3.6, y: 5.8, haut: "#3E7D4A", echelle: 0.5, peau: "#C68E64", cheveux: "#1C1410" },
  { type: "libre", x: 0.5, y: 4.5, cle: 5.1, rendu: <Lampadaire x={0.5} y={4.5} /> },
  { type: "libre", x: 9, y: 5.6, cle: 14.7, rendu: <Lampadaire x={9} y={5.6} /> },
];

const SOL_QUARTIER = (
  <>
    <Sol x={0} y={0} w={10} d={10} epaisseur={0.6} />
    <Route x={0} y={4.4} w={10} d={1.3} sens="x" passages={[4.6]} />
    <Paves x={0.05} y={0.05} w={9.9} d={4.3} />
    <Paves x={0.05} y={5.75} w={9.9} d={4.2} />
    <Pelouse x={0.3} y={0.3} w={9.4} d={3.8} z={0.101} />
    <Pelouse x={0.3} y={6} w={9.4} d={3.7} z={0.101} />
  </>
);

const W = 7,
  D = 5;
const MEUBLES: { id: string; meuble: "machine" | "bureau" | "etagere"; x: number; y: number }[] = [
  { id: "m1", meuble: "machine", x: 3, y: 1 },
  { id: "b1", meuble: "bureau", x: 3, y: 3 },
  { id: "e1", meuble: "etagere", x: 0, y: 1 },
];

function occupe(x: number, y: number) {
  return MEUBLES.some((m) => {
    const t = TAILLE_MEUBLE[m.meuble];
    return x >= m.x && x < m.x + t.w && y >= m.y && y < m.y + t.d;
  });
}

export function VitrineIso() {
  const [choix, setChoix] = useState<string | null>("atelier");
  const [survol, setSurvol] = useState<{ x: number; y: number } | null>({ x: 5, y: 2 });
  const [meuble, setMeuble] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Un petit quartier</h2>
        <p className="text-sm text-muted">Clique ou utilise Tab puis Entrée sur un bâtiment. Sélection : {choix ?? "aucune"}.</p>
        <div className="max-w-[880px]">
          <SceneIso titre="Quartier de démonstration" sol={SOL_QUARTIER} objets={QUARTIER} selection={choix} onSelect={setChoix} etendue={{ x: 0, y: 0, w: 10, d: 10, h: 3.6, z: -0.6 }} marge={20} />
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Un petit intérieur</h2>
        <p className="text-sm text-muted">
          Survol d&apos;une case : {survol ? `${survol.x + 1}, ${survol.y + 1} (${occupe(survol.x, survol.y) ? "occupée" : "libre"})` : "aucune"}. Meuble choisi : {meuble ?? "aucun"}.
        </p>
        <div className="max-w-[720px]">
          <SceneIso
            titre="Atelier de démonstration"
            sol={<Piece W={W} D={D} enseigne="MAISON LUMEN" />}
            grille={{
              W,
              D,
              traits: true,
              couleur: (x, y) => (survol && survol.x === x && survol.y === y ? (occupe(x, y) ? "rgba(220,80,60,.55)" : "rgba(60,180,90,.55)") : occupe(x, y) ? undefined : "rgba(120,200,120,.14)"),
            }}
            objets={[
              ...MEUBLES.map((m) => ({ type: "meuble" as const, ...m, nom: m.meuble })),
              { type: "personnage", x: 3.5, y: 2.2, haut: "#C46E8A", peau: "#C68E64", cheveux: "#1C1410" },
              { type: "personnage", id: "moi", x: 5.6, y: 4.2, haut: "#17202E", etiquette: "Toi", aToi: true, selectionnable: false },
            ]}
            selection={meuble}
            onSelect={setMeuble}
            onCaseSurvol={setSurvol}
            onCaseClic={(c) => setSurvol(c)}
            etendue={{ x: -0.2, y: -0.2, w: W + 0.2, d: D + 0.2, h: 2.6 }}
            marge={24}
          />
        </div>
      </section>
    </div>
  );
}
