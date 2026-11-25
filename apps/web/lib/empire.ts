// 3D-8 : écran « Mon Empire » et profil public d'une société.
// Fonctions pures : liste des bâtiments du joueur, lecture de la vue comptes_publics, apparence
// des vignettes. Aucun chiffre métier ici : loyers et surfaces viennent de la base et du catalogue.

import type { TypeBatiment } from "@kapital/content";
import type { BatimentProps, StyleBatiment } from "../components/iso";

/* ------------------------------------------------------------ Comptes publics */

/**
 * Liste blanche des colonnes de la vue comptes_publics (migration 0035). C'est tout ce qu'un
 * joueur voit d'une autre société : identité, extérieur, comptes annuels du dernier exercice clos.
 */
export const COLONNES_COMPTES_PUBLICS = [
  "company_id",
  "nom",
  "gamme",
  "etape",
  "valeur_centimes",
  "batiment_id",
  "exercice",
  "exercice_mois_debut",
  "exercice_mois_fin",
  "chiffre_affaires_ht_centimes",
  "resultat_centimes",
  "total_bilan_centimes",
] as const;

export const SELECT_COMPTES_PUBLICS = COLONNES_COMPTES_PUBLICS.join(", ");

type Nombre = number | string | null;
export type LigneComptesPublics = {
  company_id: string;
  nom: string;
  gamme: string;
  etape: number;
  valeur_centimes: Nombre;
  batiment_id: string | null;
  exercice: Nombre;
  exercice_mois_debut: Nombre;
  exercice_mois_fin: Nombre;
  chiffre_affaires_ht_centimes: Nombre;
  resultat_centimes: Nombre;
  total_bilan_centimes: Nombre;
};

export type ExercicePublic = {
  numero: number;
  moisDebut: number;
  moisFin: number;
  chiffreAffairesHtCentimes: number;
  resultatCentimes: number;
  totalBilanCentimes: number;
};

export type ComptesPublics = {
  companyId: string;
  nom: string;
  gamme: string;
  etape: number;
  valeurCentimes: number;
  batimentId: string | null;
  /** null tant que le premier exercice n'est pas clos. */
  exercice: ExercicePublic | null;
};

/** Les bigint arrivent parfois en texte depuis PostgREST. */
function nombre(v: Nombre): number {
  return v === null ? 0 : Number(v);
}

export function lireComptesPublics(l: LigneComptesPublics): ComptesPublics {
  return {
    companyId: l.company_id,
    nom: l.nom,
    gamme: l.gamme,
    etape: Number(l.etape),
    valeurCentimes: nombre(l.valeur_centimes),
    batimentId: l.batiment_id,
    exercice:
      l.exercice === null
        ? null
        : {
            numero: nombre(l.exercice),
            moisDebut: nombre(l.exercice_mois_debut),
            moisFin: nombre(l.exercice_mois_fin),
            chiffreAffairesHtCentimes: nombre(l.chiffre_affaires_ht_centimes),
            resultatCentimes: nombre(l.resultat_centimes),
            totalBilanCentimes: nombre(l.total_bilan_centimes),
          },
  };
}

/** Durée d'un exercice comptable en mois de jeu (le moteur clôt l'exercice au 12e mois). */
const MOIS_PAR_EXERCICE = 12;

/** Mois de jeu à partir duquel les comptes de l'exercice en cours seront publiés. */
export function moisDuProchainDepot(moisCourant: number): number {
  return (Math.floor(moisCourant / MOIS_PAR_EXERCICE) + 1) * MOIS_PAR_EXERCICE;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estIdentifiantSociete(id: string): boolean {
  return UUID.test(id);
}

/* ------------------------------------------------------------ Mon Empire */

/** Le local du joueur tel que lu dans workshops (ses propres données, protégées par RLS). */
export type LocalDuJoueur = {
  batiment_id: string | null;
  surface_m2: number;
  loyer_mensuel_centimes: number;
  charges_mensuelles_centimes: number;
  mode_detention: "bail" | "achat" | "credit";
};

export type BatimentEmpire = {
  /** Clé stable (un type de local par clé en V1 ; la boutique viendra ensuite). */
  cle: string;
  nom: string;
  /** Catégorie du catalogue (atelier, entrepot, bureau, prestige) ou boutique. */
  categorie: string;
  surfaceM2: number;
  nbEtages: number;
  mode: "locataire" | "proprietaire";
  loyerMensuelCentimes: number;
  chargesMensuellesCentimes: number;
  liens: ReadonlyArray<{ href: string; libelle: string }>;
};

/**
 * Tous les bâtiments du joueur. Aujourd'hui son atelier s'il en a un ; demain la boutique et
 * les autres locaux s'ajoutent comme de nouvelles entrées de `locaux`.
 */
export function batimentsDeLEmpire(
  locaux: { atelier: LocalDuJoueur | null },
  catalogue: readonly TypeBatiment[],
): BatimentEmpire[] {
  const liste: BatimentEmpire[] = [];
  if (locaux.atelier) {
    const a = locaux.atelier;
    const type = a.batiment_id ? catalogue.find((b) => b.id === a.batiment_id) : undefined;
    liste.push({
      cle: "atelier",
      nom: type?.nom ?? "Atelier",
      categorie: type?.categorie ?? "atelier",
      surfaceM2: Number(a.surface_m2),
      nbEtages: type?.nb_etages ?? 1,
      mode: a.mode_detention === "bail" ? "locataire" : "proprietaire",
      loyerMensuelCentimes: Number(a.loyer_mensuel_centimes),
      chargesMensuellesCentimes: Number(a.charges_mensuelles_centimes),
      liens: [
        { href: "/atelier-3d", libelle: "Voir l'intérieur" },
        { href: "/locaux", libelle: "Gérer le local" },
      ],
    });
  }
  return liste;
}

export const LIBELLE_CATEGORIE: Record<string, string> = {
  atelier: "Atelier",
  entrepot: "Entrepôt",
  bureau: "Bureaux",
  prestige: "Prestige",
  boutique: "Boutique",
};

/* ------------------------------------------------------------ Vignettes */

type Apparence = Omit<BatimentProps, "x" | "y" | "w" | "d">;

/** Apparence d'un bâtiment selon sa catégorie (choix de dessin, sans effet sur les chiffres). */
export function apparenceBatiment(categorie: string, nbEtages: number, enseigne: string): Apparence {
  const h = 1.1 + 0.55 * Math.max(0, nbEtages - 1);
  const base = { h, enseigne };
  const styles: Record<string, Apparence & { style: StyleBatiment }> = {
    atelier:
      nbEtages >= 3
        ? { ...base, style: "industriel", couleur: "#9A8C7A", texture: "tole", couleurToit: "#4A5260" }
        : { ...base, style: "maison", couleur: "#A85B44", texture: "brique", toit: 0.9, couleurToit: "#3E4753", cheminee: true, store: "#2D4A9E" },
    entrepot: { ...base, style: "industriel", couleur: "#8E9AA6", texture: "tole", couleurToit: "#4A5260" },
    bureau: { ...base, style: "vitre", couleur: "#C9D3DC" },
    prestige: { ...base, style: "classique", couleur: "#DDD5C4", texture: "pierre", drapeau: true },
    boutique: { ...base, style: "boutique", couleur: "#E8E1D3", texture: "enduit", store: "#B0362A" },
  };
  return styles[categorie] ?? { ...base, style: "maison", couleur: "#D9C6B0", texture: "enduit", toit: 0.8, couleurToit: "#3E4753" };
}

/** Emprise de la vignette (en cases) : plus large avec la surface, bornée pour rester lisible. */
export function dimensionsVignette(surfaceM2: number): { w: number; d: number } {
  const w = Math.min(4, Math.max(2, 1.6 + surfaceM2 / 150));
  return { w, d: Math.min(3, Math.max(1.8, w * 0.75)) };
}
