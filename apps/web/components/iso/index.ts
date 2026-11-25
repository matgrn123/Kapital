/**
 * Moteur de rendu isométrique SVG de Kapital (village et atelier).
 * Le dessin n'affiche que l'état calculé par le moteur ; il ne décide d'aucun chiffre.
 *
 * Repère : x vers la droite-bas, y vers la gauche-bas, z vers le haut, en cases.
 * Le plus simple : <SceneIso> avec une liste d'objets ; il trie (peintre), cadre, gère clic,
 * clavier (Entrée/Espace) et survol, et dessine les étiquettes par-dessus. Aucun état interne.
 *
 * Exemple village :
 *   <SceneIso
 *     titre="Le village"
 *     sol={<><Sol x={0} y={0} w={10} d={8} epaisseur={0.6} /><Route x={0} y={4} w={10} d={1} sens="x" /></>}
 *     objets={[
 *       { type: "batiment", id: "atelier", x: 1, y: 1, w: 3, d: 2.5, h: 1.5, couleur: "#A85B44",
 *         texture: "brique", toit: 0.9, couleurToit: "#3E4753", enseigne: "MAISON LUMEN",
 *         etiquette: "Toi · Maison Lumen", aToi: true },
 *       { type: "arbre", x: 5, y: 3.5, variante: 1 },
 *       { type: "personnage", x: 4, y: 4.6, haut: "#B0362A", echelle: 0.5 },
 *     ]}
 *     selection={choisi}
 *     onSelect={(id) => setChoisi(id)}
 *   />
 *
 * Exemple atelier (grille de cases pour placer un meuble) :
 *   <SceneIso
 *     titre="L'atelier"
 *     sol={<Piece W={8} D={6} enseigne="MAISON LUMEN" />}
 *     grille={{ W: 8, D: 6, traits: true, couleur: (x, y) => (libre(x, y) ? "rgba(60,180,90,.4)" : undefined) }}
 *     objets={[{ type: "meuble", id: "m1", meuble: "machine", x: 2, y: 2 }]}
 *     onCaseSurvol={setSurvol}
 *     onCaseClic={(c) => demanderPlacement(c)}
 *     etendue={{ x: 0, y: 0, w: 8, d: 6, h: 2.8 }}
 *   />
 *
 * Types d'objets : batiment (style maison | industriel | classique | boutique | vitre, texture
 * brique | pierre | tole | enduit, toit, enseigne, store, cheminee, drapeau, aLouer), meuble
 * (machine, coupe, presse, etagere, bureau, plante, cartons, portant, mannequin), arbre, buisson,
 * lampadaire, voiture, personnage, libre (dessin JSX quelconque).
 *
 * Primitives pour dessins sur mesure (à mettre dans `sol`, `dessus` ou un objet « libre ») :
 * Boite, Face, Facade, Batiment, Toit, Fenetre, Fenetres, Enseigne, TexteSurFace, OmbreBoite,
 * OmbrePied, Arbre, Buisson, Lampadaire, Voiture, Personnage, Etiquette, Sol, Route, Paves,
 * Pelouse, Parquet, Piece, Meuble. Si vous dessinez un <svg> à vous, ajoutez-y <Defs /> une fois.
 * Thème : ciel via --sky-top / --sky-bot (définis par la scène, clair et sombre).
 */
export * from "./geometrie";
export { Defs, urlTexture, type Texture } from "./defs";
export * from "./primitives";
export { Batiment, Facade, sommetBatiment, type BatimentProps, type StyleBatiment } from "./batiment";
export { Meuble, Piece, TAILLE_MEUBLE, tailleMeuble, type TypeMeuble } from "./interieur";
export { SceneIso, cadreScene, encombrement, type ObjetIso, type GrilleIso, type SceneIsoProps } from "./scene";
