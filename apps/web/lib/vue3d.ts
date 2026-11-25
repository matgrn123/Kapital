// Plan du village (/vue-3d) : où dessiner chaque acteur. Purement décoratif :
// la position ne change aucun chiffre. Fonction pure et déterministe.

/**
 * Genres d'acteurs. Bâtiments du joueur : `joueur` (atelier principal), `local2` (deuxième
 * local), `boutique` (point de vente, dessiné à la place du terrain du futur magasin).
 */
export type GenreActeur = "joueur" | "local2" | "boutique" | "banque" | "terrain" | "fournisseur" | "faconnier" | "concurrent";

export type ActeurVillage = { readonly id: string; readonly genre: GenreActeur };

export type Emplacement = { readonly x: number; readonly y: number; readonly w: number; readonly d: number };

export type ActeurPlace = ActeurVillage & Emplacement;

/** Taille du plateau, en cases, et position des deux routes qui le coupent en quatre îlots. */
export const PLAN = { W: 12, D: 12, route: { debut: 5.4, largeur: 1.2 } } as const;

type GenreFixe = "joueur" | "local2" | "banque" | "terrain" | "boutique";

/** Emplacements réservés. La boutique prend la place du terrain : le magasin s'ouvre sur ce terrain. */
export const EMPLACEMENTS_FIXES: Readonly<Record<GenreFixe, Emplacement>> = {
  joueur: { x: 0.6, y: 0.6, w: 3.2, d: 2.6 },
  local2: { x: 0.6, y: 3.6, w: 2.4, d: 1.3 },
  banque: { x: 7.4, y: 0.6, w: 3, d: 2.6 },
  terrain: { x: 0.6, y: 7.1, w: 3, d: 2.4 },
  boutique: { x: 0.6, y: 7.1, w: 3, d: 2.4 },
};

/** Emplacements des autres acteurs, dans l'ordre de remplissage. */
export const EMPLACEMENTS_LIBRES: readonly Emplacement[] = [
  { x: 7.0, y: 7.1, w: 2, d: 1.8 },
  { x: 9.6, y: 7.1, w: 2, d: 1.8 },
  { x: 7.0, y: 9.6, w: 2, d: 1.8 },
  { x: 9.6, y: 9.6, w: 2, d: 1.8 },
  { x: 7.0, y: 3.5, w: 2, d: 1.6 },
  { x: 9.6, y: 3.5, w: 2, d: 1.6 },
  { x: 0.6, y: 10.0, w: 2, d: 1.5 },
  { x: 2.9, y: 10.0, w: 2, d: 1.5 },
];

const ORDRE_GENRES: readonly GenreActeur[] = ["fournisseur", "faconnier", "concurrent"];
const GENRES_FIXES: readonly GenreFixe[] = ["joueur", "local2", "banque", "boutique", "terrain"];

const parId = (p: ActeurVillage, q: ActeurVillage) => p.id.localeCompare(q.id);

/**
 * Place les bâtiments du joueur (atelier, deuxième local, boutique), la banque et le terrain
 * sur leurs emplacements réservés, puis les autres acteurs à tour de rôle (un fournisseur,
 * un façonnier, un concurrent…), triés par id. Si le joueur a une boutique, elle occupe le
 * terrain, qui n'est alors plus dessiné. Le surplus part dans `nonPlaces`.
 */
export function placerActeurs(acteurs: readonly ActeurVillage[]): { places: ActeurPlace[]; nonPlaces: ActeurVillage[] } {
  const places: ActeurPlace[] = [];
  const nonPlaces: ActeurVillage[] = [];
  const aBoutique = acteurs.some((x) => x.genre === "boutique");
  for (const g of GENRES_FIXES) {
    if (g === "terrain" && aBoutique) continue;
    const a = acteurs.filter((x) => x.genre === g).sort(parId);
    if (a[0]) places.push({ ...a[0], ...EMPLACEMENTS_FIXES[g] });
    nonPlaces.push(...a.slice(1));
  }
  const files = ORDRE_GENRES.map((g) => acteurs.filter((x) => x.genre === g).sort(parId));
  const alternes: ActeurVillage[] = [];
  for (let i = 0; files.some((f) => i < f.length); i++) for (const f of files) if (f[i]) alternes.push(f[i]!);
  alternes.forEach((a, i) => {
    const e = EMPLACEMENTS_LIBRES[i];
    if (e) places.push({ ...a, ...e });
    else nonPlaces.push(a);
  });
  return { places, nonPlaces };
}

/**
 * Bâtiments du joueur autres que l'atelier principal. L'écran les lit en base (deuxième local,
 * points de vente) ; listes vides tant que ces tables n'existent pas.
 */
export type BatimentJoueur = { readonly id: string; readonly nom: string };
export type BatimentsDuJoueur = { readonly locaux: readonly BatimentJoueur[]; readonly pointsDeVente: readonly BatimentJoueur[] };
export const AUCUN_AUTRE_BATIMENT: BatimentsDuJoueur = { locaux: [], pointsDeVente: [] };

/** Identifiants des fiches des bâtiments du joueur dans le village. */
export const idLocal = (b: BatimentJoueur) => `local-${b.id}`;
export const idBoutique = (b: BatimentJoueur) => `boutique-${b.id}`;

/**
 * Acteurs du joueur : sa société (atelier principal), ses autres locaux, ses points de vente,
 * et le terrain du futur magasin tant qu'il n'a aucun point de vente.
 */
export function acteursDuJoueur(b: BatimentsDuJoueur): ActeurVillage[] {
  return [
    { id: "societe", genre: "joueur" },
    ...b.locaux.map((l): ActeurVillage => ({ id: idLocal(l), genre: "local2" })),
    ...b.pointsDeVente.map((p): ActeurVillage => ({ id: idBoutique(p), genre: "boutique" })),
    ...(b.pointsDeVente.length === 0 ? [{ id: "terrain", genre: "terrain" } as const] : []),
  ];
}

/** Retire les éléments de décor (arbres) posés sur un bâtiment, marge comprise. */
export function horsBatiments<T extends { readonly x: number; readonly y: number }>(decor: readonly T[], places: readonly Emplacement[], marge = 0.35): T[] {
  return decor.filter((o) => !places.some((p) => o.x > p.x - marge && o.x < p.x + p.w + marge && o.y > p.y - marge && o.y < p.y + p.d + marge));
}

/** Nom affiché d'une société : sans le préfixe technique « PNJ_ » ni tirets bas. */
export function nomLisibleSociete(nom: string): string {
  return nom.replace(/^PNJ_/, "").replace(/_/g, " ").trim();
}

/** Texte d'enseigne : en capitales ; s'il est trop long, les premiers mots qui tiennent, sinon coupé. */
export function raccourcirEnseigne(nom: string, max = 16): string {
  const t = nom.toLocaleUpperCase("fr-FR");
  if (t.length <= max) return t;
  let mots = "";
  for (const m of t.split(/\s+/)) {
    const essai = mots ? `${mots} ${m}` : m;
    if (essai.length > max) break;
    mots = essai;
  }
  return mots || t.slice(0, max - 1) + "…";
}
