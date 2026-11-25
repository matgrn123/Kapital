// Plan du village (/vue-3d) : où dessiner chaque acteur. Purement décoratif :
// la position ne change aucun chiffre. Fonction pure et déterministe.

export type GenreActeur = "joueur" | "banque" | "terrain" | "fournisseur" | "faconnier" | "concurrent";

export type ActeurVillage = { readonly id: string; readonly genre: GenreActeur };

export type Emplacement = { readonly x: number; readonly y: number; readonly w: number; readonly d: number };

export type ActeurPlace = ActeurVillage & Emplacement;

/** Taille du plateau, en cases, et position des deux routes qui le coupent en quatre îlots. */
export const PLAN = { W: 12, D: 12, route: { debut: 5.4, largeur: 1.2 } } as const;

export const EMPLACEMENTS_FIXES: Readonly<Record<"joueur" | "banque" | "terrain", Emplacement>> = {
  joueur: { x: 0.6, y: 0.6, w: 3.2, d: 2.6 },
  banque: { x: 7.4, y: 0.6, w: 3, d: 2.6 },
  terrain: { x: 0.6, y: 7.1, w: 3, d: 2.4 },
};

/** Emplacements des autres acteurs, dans l'ordre de remplissage. */
export const EMPLACEMENTS_LIBRES: readonly Emplacement[] = [
  { x: 7.0, y: 7.1, w: 2, d: 1.8 },
  { x: 9.6, y: 7.1, w: 2, d: 1.8 },
  { x: 7.0, y: 9.6, w: 2, d: 1.8 },
  { x: 9.6, y: 9.6, w: 2, d: 1.8 },
  { x: 7.0, y: 3.5, w: 2, d: 1.6 },
  { x: 9.6, y: 3.5, w: 2, d: 1.6 },
];

const ORDRE_GENRES: readonly GenreActeur[] = ["fournisseur", "faconnier", "concurrent"];

/**
 * Place la société, la banque et le terrain sur leurs emplacements fixes, puis les autres
 * acteurs à tour de rôle (un fournisseur, un façonnier, un concurrent…), triés par id.
 */
export function placerActeurs(acteurs: readonly ActeurVillage[]): { places: ActeurPlace[]; nonPlaces: ActeurVillage[] } {
  const places: ActeurPlace[] = [];
  const nonPlaces: ActeurVillage[] = [];
  for (const g of ["joueur", "banque", "terrain"] as const) {
    const a = acteurs.filter((x) => x.genre === g).sort((p, q) => p.id.localeCompare(q.id));
    if (a[0]) places.push({ ...a[0], ...EMPLACEMENTS_FIXES[g] });
    nonPlaces.push(...a.slice(1));
  }
  const files = ORDRE_GENRES.map((g) => acteurs.filter((x) => x.genre === g).sort((p, q) => p.id.localeCompare(q.id)));
  const alternes: ActeurVillage[] = [];
  for (let i = 0; files.some((f) => i < f.length); i++) for (const f of files) if (f[i]) alternes.push(f[i]!);
  alternes.forEach((a, i) => {
    const e = EMPLACEMENTS_LIBRES[i];
    if (e) places.push({ ...a, ...e });
    else nonPlaces.push(a);
  });
  return { places, nonPlaces };
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
