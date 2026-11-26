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
  /** Pas absolu (premier pas du mois + rang du pas dans le mois). */
  readonly pas: number;
  readonly pieces: number;
};

// Libellés des écritures du moteur : ventes/ventes.ts et boutique/boutique.ts.
const LIBELLE_VENTE = /^(Vente directe|Vente revendeur|Vente boutique|Retour) (\d+) (\S+)$/;
// Identifiant d'écriture d'un pas : « …_p<rang du pas dans le mois> » (moteur/pas.ts).
const RANG_DU_PAS = /_p(\d+)$/;

/**
 * Ventes et retours, une fois par écriture, lus dans le libellé (pièces, produit) et l'identifiant (pas).
 * `premierPasDuMois` donne le pas absolu où commence un mois : les mois calendaires n'ont pas tous
 * le même nombre de pas.
 */
export function mouvementsDeVente(
  lignes: readonly LigneVenteLivre[],
  premierPasDuMois: (mois: number) => number,
): MouvementVente[] {
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
      pas: premierPasDuMois(l.mois_jeu) + (rang ? Number(rang) : 0),
      pieces: m[1] === "Retour" ? -pieces : pieces,
    });
  }
  return r;
}

export type Rythme = {
  /** Pièces vendues (retours déduits) dans la fenêtre observée. */
  readonly piecesFenetre: number;
  /** Durée réellement observée, en pas : au plus un mois, au moins un pas. */
  readonly pasObserves: number;
  /**
   * Vrai quand on observe le produit depuis moins d'un jour : le rythme est alors ramené à un jour
   * plein (100 pièces vendues en une minute font 100 pièces par jour, pas 144 000).
   */
  readonly moinsDUnJour: boolean;
  /** Pièces vendues par jour (toujours fini, jamais négatif). */
  readonly piecesParJour: number;
};

/**
 * Rythme de vente récent d'un produit : ventes nettes du dernier mois, ramenées à un jour.
 * Si le produit est au catalogue depuis moins d'un mois, on ne compte que le temps écoulé depuis,
 * mais jamais moins d'un jour : extrapoler quelques minutes de ventes donnerait des rythmes absurdes.
 */
export function rythmeDeVente(
  mouvements: readonly MouvementVente[],
  produit: string,
  o: {
    readonly pasCourant: number;
    readonly pasParMois: number;
    readonly pasParJour: number;
    readonly pasDebutVente: number | null;
  },
): Rythme {
  const debutFenetre = o.pasCourant - o.pasParMois;
  const debut = o.pasDebutVente === null ? debutFenetre : Math.max(debutFenetre, o.pasDebutVente);
  const ecoules = Math.max(0, o.pasCourant - debut);
  let pieces = 0;
  for (const m of mouvements) if (m.produit === produit && m.pas >= debutFenetre && m.pas < o.pasCourant) pieces += m.pieces;
  const piecesFenetre = Math.max(0, pieces);
  const pasParJour = o.pasParJour > 0 ? o.pasParJour : 0;
  const diviseur = Math.max(1, pasParJour, ecoules);
  const piecesParJour = pasParJour > 0 ? (piecesFenetre * pasParJour) / diviseur : 0;
  return {
    piecesFenetre,
    pasObserves: Math.max(1, ecoules),
    moinsDUnJour: ecoules < pasParJour,
    piecesParJour: Number.isFinite(piecesParJour) ? piecesParJour : 0,
  };
}

/** Jours que le stock tiendra au rythme actuel : 0 sans stock, null sans vente (incalculable). */
export function joursDeStock(stock: number, piecesParJour: number): number | null {
  if (!(stock > 0)) return 0;
  if (!(piecesParJour > 0) || !Number.isFinite(piecesParJour)) return null;
  const jours = stock / piecesParJour;
  return Number.isFinite(jours) ? jours : null;
}

export type Temps = {
  /** Pas du mois en cours (28 à 31 jours). */
  readonly pasParMois: number;
  /** Pas dans une journée (24 h). */
  readonly pasParJour: number;
  /** Longueur de la jauge des jours de stock : un mois. */
  readonly joursParMois: number;
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

function nombreDePieces(n: number): string {
  return `${n.toLocaleString("fr-FR")} pièce${n > 1 ? "s" : ""}`;
}

/** « 100 pièces par jour », « environ 3 pièces par semaine » ; « aucune vente » à zéro. */
export function libelleRythme(piecesParJour: number): string {
  if (!(piecesParJour > 0) || !Number.isFinite(piecesParJour)) return "aucune vente";
  if (piecesParJour >= 1) return `${nombreDePieces(Math.round(piecesParJour))} par jour`;
  const parSemaine = Math.round(piecesParJour * 7);
  if (parSemaine >= 1) return `environ ${nombreDePieces(parSemaine)} par semaine`;
  return "moins d'une pièce par semaine";
}

/** Historique de moins d'un jour : « 100 pièces depuis jeu. 11 h 31 » (le moment où l'on a commencé à compter). */
export function libelleVenduDepuis(piecesVendues: number, depuis: string): string {
  if (!(piecesVendues > 0)) return `aucune vente depuis ${depuis}`;
  return `${nombreDePieces(Math.round(piecesVendues))} depuis ${depuis}`;
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
 * vente depuis un mois entier ; nouveau : au catalogue depuis moins d'un mois, pas encore de vente.
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
  /** Pièces vendues par jour, sur la période observée (au moins un jour). */
  readonly piecesParJour: number;
  /** Pièces vendues (retours déduits) sur la période observée. */
  readonly piecesObservees: number;
  /**
   * Début de l'observation (instant du jeu, ms) quand le produit est en vente depuis moins
   * d'un jour : l'écran dit alors « 100 pièces depuis jeu. 11 h 31 ». Null sinon.
   */
  readonly depuisMs: number | null;
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
  /** Instant du jeu (ms) où le produit est arrivé au catalogue ; null ou absent si inconnu. */
  readonly debutVenteMs?: number | null;
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
  /** Seuil de l'alerte « stock bas », en jours (paramètre alerte_stock_bas_jours). */
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
    const r = rythmeDeVente(e.mouvements, p.id, {
      pasCourant: e.pasCourant,
      pasParMois: e.pasParMois,
      pasParJour: e.pasParJour,
      pasDebutVente: p.pasDebutVente,
    });
    const jours = joursDeStock(disponible, r.piecesParJour);
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
      piecesParJour: r.piecesParJour,
      piecesObservees: r.piecesFenetre,
      depuisMs: r.moinsDUnJour ? (p.debutVenteMs ?? null) : null,
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
