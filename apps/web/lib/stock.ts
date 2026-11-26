// Écran « Stock et ventes » : combien de jours ton stock va tenir. Ce n'est pas
// un moteur : on relit les ventes déjà passées par le serveur (grand livre) et
// les stocks en base, puis on fait des divisions pour l'affichage. Aucune
// division par zéro, jamais d'« Infinity » : sans vente, les jours de stock sont
// « incalculables » (null), pas infinis.

/** Une ligne du grand livre, ce qu'il en faut pour retrouver une vente. */
export type LigneVenteLivre = {
  readonly ecriture_id: string;
  readonly mois_jeu: number;
  readonly libelle: string;
};

/** Pièces sorties (vente) ou rentrées (retour, négatif) à un pas donné. */
export type MouvementVente = {
  readonly produit: string;
  /** Pas absolu depuis le début du monde (mois × pas par mois + rang du pas). */
  readonly pas: number;
  readonly pieces: number;
};

// Libellés des écritures du moteur : ventes/ventes.ts et boutique/boutique.ts.
const LIBELLE_VENTE = /^(Vente directe|Vente revendeur|Vente boutique|Retour) (\d+) (\S+)$/;
// Identifiant d'écriture d'un pas : « …_p<rang du pas dans le mois> » (moteur/pas.ts).
const RANG_DU_PAS = /_p(\d+)$/;

/** Ventes et retours, une fois par écriture, lus dans le libellé (pièces, produit) et l'identifiant (pas). */
export function mouvementsDeVente(lignes: readonly LigneVenteLivre[], pasParMois: number): MouvementVente[] {
  const vues = new Set<string>();
  const r: MouvementVente[] = [];
  for (const l of lignes) {
    if (vues.has(l.ecriture_id)) continue;
    const m = LIBELLE_VENTE.exec(l.libelle);
    if (!m) continue;
    vues.add(l.ecriture_id);
    const rang = RANG_DU_PAS.exec(l.ecriture_id)?.[1];
    const pieces = Number(m[2]);
    r.push({
      produit: m[3]!,
      pas: l.mois_jeu * pasParMois + (rang ? Number(rang) : 0),
      pieces: m[1] === "Retour" ? -pieces : pieces,
    });
  }
  return r;
}

export type Rythme = {
  /** Pièces vendues (retours déduits) dans la fenêtre observée. */
  readonly piecesFenetre: number;
  /** Durée observée, en pas : au plus un mois de jeu, au moins un pas. */
  readonly pasObserves: number;
  /** Rythme ramené à un mois de jeu (toujours fini, jamais négatif). */
  readonly piecesParMois: number;
};

/**
 * Rythme de vente récent d'un produit : ventes nettes du dernier mois de jeu, ramenées à un mois.
 * Si le produit est au catalogue depuis moins d'un mois, on ne compte que le temps écoulé depuis.
 */
export function rythmeDeVente(
  mouvements: readonly MouvementVente[],
  produit: string,
  o: { readonly pasCourant: number; readonly pasParMois: number; readonly pasDebutVente: number | null },
): Rythme {
  const debutFenetre = o.pasCourant - o.pasParMois;
  const debut = o.pasDebutVente === null ? debutFenetre : Math.max(debutFenetre, o.pasDebutVente);
  const pasObserves = Math.max(1, o.pasCourant - debut);
  let pieces = 0;
  for (const m of mouvements) if (m.produit === produit && m.pas >= debutFenetre && m.pas < o.pasCourant) pieces += m.pieces;
  const piecesFenetre = Math.max(0, pieces);
  const piecesParMois = o.pasParMois > 0 ? (piecesFenetre * o.pasParMois) / pasObserves : 0;
  return { piecesFenetre, pasObserves, piecesParMois: Number.isFinite(piecesParMois) ? piecesParMois : 0 };
}

/** Jours de jeu que le stock tiendra au rythme actuel : 0 sans stock, null sans vente (incalculable). */
export function joursDeStock(stock: number, piecesParMois: number, joursParMois: number): number | null {
  if (!(stock > 0)) return 0;
  if (!(piecesParMois > 0) || !Number.isFinite(piecesParMois) || !(joursParMois > 0)) return null;
  const jours = (stock * joursParMois) / piecesParMois;
  return Number.isFinite(jours) ? jours : null;
}

export type Temps = {
  readonly pasParMois: number;
  readonly joursParMois: number;
  readonly minutesReellesParMois: number;
};

/** « 12 jours », « moins d'un jour », « plus d'un an » ; « — » quand c'est incalculable. */
export function libelleJours(jours: number | null, joursParMois: number): string {
  if (jours === null) return "—";
  if (jours <= 0) return "0 jour";
  if (jours < 1) return "moins d'un jour";
  if (jours >= joursParMois * 12) return "plus d'un an";
  const n = Math.floor(jours);
  return `${n} jour${n > 1 ? "s" : ""}`;
}

export function libelleRythme(piecesParMois: number): string {
  if (!(piecesParMois > 0)) return "aucune vente";
  if (piecesParMois < 1) return "moins d'une pièce / mois";
  return `${Math.round(piecesParMois).toLocaleString("fr-FR")} pièces / mois`;
}

export type Canal = "vente_directe" | "revendeur" | "boutique";
export type CanalEnVente = {
  readonly canal: Canal;
  readonly libelle: string;
  readonly prix: number;
  readonly taxe: "TTC" | "HT";
};

/**
 * rupture : plus une pièce ; bas : moins de jours que le seuil d'alerte ; dort : du stock et aucune
 * vente depuis un mois de jeu entier ; nouveau : au catalogue depuis moins d'un mois, pas encore de vente.
 */
export type StatutStock = "rupture" | "bas" | "ok" | "nouveau" | "dort";

export type LigneStock = {
  readonly id: string;
  readonly nom: string;
  readonly atelier: number;
  readonly boutique: number;
  readonly enRoute: number;
  /** Atelier + boutique : ce qui peut se vendre aujourd'hui. */
  readonly disponible: number;
  readonly piecesParMois: number;
  readonly jours: number | null;
  readonly statut: StatutStock;
  readonly canaux: readonly CanalEnVente[];
};

export type ProduitStock = {
  readonly id: string;
  readonly nom: string;
  /** Prix TTC en ligne (0 = pas en vente). */
  readonly prixDirect: number;
  /** Prix HT aux revendeurs (0 = pas en vente). */
  readonly prixRevendeur: number;
  /** Prix TTC en boutique ; null = celui de la vente en ligne. */
  readonly prixBoutique: number | null;
  /** Pas où le produit est arrivé au catalogue ; null si inconnu. */
  readonly pasDebutVente: number | null;
};

export type EntreeStock = Temps & {
  readonly produits: readonly ProduitStock[];
  readonly stockAtelier: Readonly<Record<string, number>>;
  readonly stockBoutique: Readonly<Record<string, number>>;
  /** Pièces des productions et commandes en cours. */
  readonly enRoute: Readonly<Record<string, number>>;
  readonly boutiqueOuverte: boolean;
  readonly mouvements: readonly MouvementVente[];
  /** Dernier pas traité par le moteur pour la société. */
  readonly pasCourant: number;
  /** Seuil de l'alerte « stock bas », en jours de jeu (paramètre alerte_stock_bas_jours). */
  readonly seuilJours: number;
};

const ORDRE: Record<StatutStock, number> = { rupture: 0, bas: 1, nouveau: 2, ok: 3, dort: 4 };

function canauxEnVente(p: ProduitStock, boutiqueOuverte: boolean): CanalEnVente[] {
  const r: CanalEnVente[] = [];
  if (p.prixDirect > 0) r.push({ canal: "vente_directe", libelle: "En ligne", prix: p.prixDirect, taxe: "TTC" });
  if (p.prixRevendeur > 0) r.push({ canal: "revendeur", libelle: "Revendeurs", prix: p.prixRevendeur, taxe: "HT" });
  const prixBoutique = p.prixBoutique ?? p.prixDirect;
  if (boutiqueOuverte && prixBoutique > 0) r.push({ canal: "boutique", libelle: "Boutique", prix: prixBoutique, taxe: "TTC" });
  return r;
}

/** Une ligne par produit du catalogue, de la plus urgente (rupture) à la moins urgente (stock qui dort). */
export function lignesStock(e: EntreeStock): LigneStock[] {
  const lignes = e.produits.map((p, rang) => {
    const atelier = Math.max(0, e.stockAtelier[p.id] ?? 0);
    const boutique = Math.max(0, e.stockBoutique[p.id] ?? 0);
    const disponible = atelier + boutique;
    const r = rythmeDeVente(e.mouvements, p.id, { pasCourant: e.pasCourant, pasParMois: e.pasParMois, pasDebutVente: p.pasDebutVente });
    const jours = joursDeStock(disponible, r.piecesParMois, e.joursParMois);
    let statut: StatutStock;
    if (disponible === 0) statut = "rupture";
    else if (jours === null) statut = r.pasObserves >= e.pasParMois ? "dort" : "nouveau";
    else statut = jours < e.seuilJours ? "bas" : "ok";
    const ligne: LigneStock = {
      id: p.id,
      nom: p.nom,
      atelier,
      boutique,
      enRoute: Math.max(0, e.enRoute[p.id] ?? 0),
      disponible,
      piecesParMois: r.piecesParMois,
      jours,
      statut,
      canaux: canauxEnVente(p, e.boutiqueOuverte),
    };
    return { ligne, rang };
  });
  return lignes
    .sort((a, b) => ORDRE[a.ligne.statut] - ORDRE[b.ligne.statut] || a.rang - b.rang)
    .map((x) => x.ligne);
}

/** Produits à réapprovisionner pour l'alerte du tableau de bord : ruptures et stocks bas. */
export function produitsEnStockBas(lignes: readonly LigneStock[]): Array<{ nom: string; jours: number }> {
  return lignes
    .filter((l) => l.statut === "rupture" || l.statut === "bas")
    .map((l) => ({ nom: l.nom, jours: l.jours ?? 0 }));
}
