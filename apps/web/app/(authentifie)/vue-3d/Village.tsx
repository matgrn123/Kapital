"use client";

// Scène isométrique du village et panneau de la fiche sélectionnée.
// Le dessin ne décide d'aucun chiffre : il montre les fiches préparées par le serveur.

import { useMemo, useState, type ReactNode } from "react";
import { Lampadaire, Paves, Pelouse, Route, SceneIso, Sol, type ObjetIso } from "../../../components/iso";
import { BoutonLien, Carte, EncadreNotion, FilRouge, SurTitre } from "../../../components/ui";
import { Faits, Note } from "../../../components/ui/formulaire";
import { PLAN, placerActeurs, raccourcirEnseigne, type ActeurPlace, type ActeurVillage, type GenreActeur } from "../../../lib/vue3d";

export type FicheActeur = {
  id: string;
  genre: GenreActeur;
  nom: string;
  surTitre: string;
  description: string;
  faits: ReadonlyArray<readonly [string, string]>;
  liens: ReadonlyArray<{ href: string; libelle: string }>;
};

const { W, D, route } = PLAN;
const R0 = route.debut,
  R1 = route.debut + route.largeur;

const SOL = (
  <>
    <Sol x={0} y={0} w={W} d={D} epaisseur={0.6} />
    <Route x={0} y={R0} w={W} d={route.largeur} sens="x" passages={[R0 - 0.9]} />
    <Route x={R0} y={0} w={route.largeur} d={R0} sens="y" />
    <Route x={R0} y={R1} w={route.largeur} d={D - R1} sens="y" />
    {[
      [0, 0, R0, R0],
      [R1, 0, W - R1, R0],
      [0, R1, R0, D - R1],
      [R1, R1, W - R1, D - R1],
    ].map(([x, y, w, d]) => (
      <g key={`${x}-${y}`}>
        <Paves x={x! + 0.05} y={y! + 0.05} w={w! - 0.1} d={d! - 0.1} />
        <Pelouse x={x! + 0.25} y={y! + 0.25} w={w! - 0.5} d={d! - 0.5} z={0.101} />
      </g>
    ))}
  </>
);

// Décor fixe : arbres et lampadaires le long des routes.
const DECOR: ObjetIso[] = [
  { type: "arbre", x: 4.4, y: 0.9, variante: 1 },
  { type: "arbre", x: 4.6, y: 2.3, echelle: 0.85, variante: 2 },
  { type: "arbre", x: 11.2, y: 1.0, echelle: 0.9 },
  { type: "arbre", x: 4.3, y: 7.4, variante: 2 },
  { type: "arbre", x: 4.6, y: 8.8, echelle: 0.8, variante: 1 },
  { type: "arbre", x: 11.5, y: 5.0, echelle: 0.7 },
  { type: "arbre", x: 1.0, y: 3.9, echelle: 0.9 },
  { type: "arbre", x: 2.7, y: 4.2, variante: 2 },
  { type: "arbre", x: 3.9, y: 3.7, echelle: 0.8, variante: 1 },
  { type: "arbre", x: 1.1, y: 10.5, variante: 1 },
  { type: "arbre", x: 2.7, y: 10.9, echelle: 0.85 },
  { type: "arbre", x: 4.3, y: 10.4, echelle: 0.9, variante: 2 },
  { type: "buisson", x: 0.6, y: 5.0, w: 4.4, d: 0.22 },
  { type: "buisson", x: 7.0, y: 6.75, w: 4.6, d: 0.22 },
  ...[1.2, 4.9, 8.0, 11.4].map((x): ObjetIso => ({ type: "libre", x, y: R0 - 0.15, cle: x + R0, rendu: <Lampadaire x={x} y={R0 - 0.15} /> })),
  ...[2.8, 9.6].map((y): ObjetIso => ({ type: "libre", x: R1 + 0.15, y, cle: y + R1 + 0.3, rendu: <Lampadaire x={R1 + 0.15} y={y} /> })),
  { type: "voiture", x: 2.6, y: R0 + 0.62, couleur: "#B0362A" },
  { type: "voiture", x: R0 + 0.15, y: 9.0, couleur: "#E9E4DA", sens: "y" },
  { type: "personnage", x: 6.9, y: R0 - 0.3, haut: "#C46E8A", echelle: 0.5 },
  { type: "personnage", x: 3.4, y: R1 + 0.25, haut: "#3E7D4A", echelle: 0.5, peau: "#C68E64", cheveux: "#1C1410" },
];

const COULEURS_CONCURRENTS = ["#E8E1D3", "#D9C6B0", "#C9D3DC", "#E3D2D8"];

function objetPour(p: ActeurPlace, f: FicheActeur, index: number, nomSociete: string): ObjetIso {
  const commun = { id: p.id, x: p.x, y: p.y, w: p.w, d: p.d, nom: `${f.surTitre} : ${f.nom}` };
  switch (p.genre) {
    case "joueur":
      return { ...commun, type: "batiment", h: 1.5, couleur: "#A85B44", texture: "brique", toit: 0.95, couleurToit: "#3E4753", enseigne: raccourcirEnseigne(nomSociete), store: "#2D4A9E", cheminee: true, drapeau: true, etiquette: `Toi · ${nomSociete}`, aToi: true };
    case "banque":
      return { ...commun, type: "batiment", h: 2.25, couleur: "#DDD5C4", style: "classique", texture: "pierre", enseigne: "BANQUE", fondEnseigne: "#F4EFE4", encreEnseigne: "#2D3646", drapeau: true, etiquette: "Banque" };
    case "terrain":
      return {
        ...commun,
        type: "libre",
        h: 0.2,
        etiquette: "Terrain du futur magasin",
        rendu: <Paves x={p.x} y={p.y} w={p.w} d={p.d} hauteur={0.14} couleur="#B49A72" />,
      };
    case "fournisseur":
      return { ...commun, type: "batiment", h: 1.3, couleur: "#8E9AA4", style: "industriel", texture: "tole", enseigne: raccourcirEnseigne(f.nom, 12), etiquette: f.nom };
    case "faconnier":
      return { ...commun, type: "batiment", h: 1.35, couleur: "#9C6B52", style: "industriel", texture: "brique", enseigne: raccourcirEnseigne(f.nom, 12), etiquette: f.nom };
    case "concurrent": {
      const c = COULEURS_CONCURRENTS[index % COULEURS_CONCURRENTS.length]!;
      return { ...commun, type: "batiment", h: 1.45, couleur: c, style: "boutique", enseigne: raccourcirEnseigne(f.nom, 12), fondEnseigne: "#4A5D86", store: "#4A5D86", etiquette: f.nom };
    }
  }
}

export function Village({ fiches, acteurs, nomSociete }: { fiches: readonly FicheActeur[]; acteurs: readonly ActeurVillage[]; nomSociete: string }) {
  const [choix, setChoix] = useState<string>("societe");
  const parId = useMemo(() => new Map(fiches.map((f) => [f.id, f])), [fiches]);
  const { places, nonPlaces } = useMemo(() => placerActeurs(acteurs), [acteurs]);
  const objets = useMemo<ObjetIso[]>(
    () => [...DECOR, ...places.map((p, i) => objetPour(p, parId.get(p.id)!, i, nomSociete))],
    [places, parId, nomSociete],
  );
  const fiche = parId.get(choix) ?? fiches[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <SceneIso
          titre="Le village"
          sol={SOL}
          objets={objets}
          selection={choix}
          onSelect={setChoix}
          etendue={{ x: 0, y: 0, w: W, d: D, h: 3.4, z: -0.6 }}
          marge={20}
          className="border border-line"
        />
        {nonPlaces.length > 0 && (
          <p className="mt-2 text-[0.8rem] text-muted">
            Le plan montre quelques acteurs ; les {nonPlaces.length} autres t&apos;attendent dans Achats, Production et
            Marché.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-4">
        {fiche && <PanneauFiche fiche={fiche} />}
        <EncadreNotion titre="Chaque bâtiment est un acteur">
          La banque, le façonnier, tes concurrents : chacun a son propre bilan, tenu en partie double. Quand tu
          empruntes, ta dette est la créance de la banque.
        </EncadreNotion>
        <FilRouge ecran="village" />
      </div>
    </div>
  );
}

function PanneauFiche({ fiche }: { fiche: FicheActeur }): ReactNode {
  return (
    <Carte>
      <div className="flex flex-col gap-3" aria-live="polite">
        <div>
          <SurTitre>{fiche.surTitre}</SurTitre>
          <h2 className="text-[1.15rem] font-bold">{fiche.nom}</h2>
        </div>
        <p className="text-[0.9rem]">{fiche.description}</p>
        {fiche.faits.length > 0 ? <Faits lignes={fiche.faits} /> : <Note>Pas encore débloqué.</Note>}
        <div className="flex flex-wrap gap-2">
          {fiche.liens.map((l, i) => (
            <BoutonLien key={l.href} href={l.href} variante={i === 0 ? "principal" : "secondaire"}>
              {l.libelle}
            </BoutonLien>
          ))}
        </div>
      </div>
    </Carte>
  );
}
