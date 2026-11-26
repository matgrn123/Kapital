import type { DetailCloture } from "@kapital/server";
import { titreMois } from "./cadre";
import { formaterEuros } from "./formatage";

// Journal d'événements (table evenements, migration 0041) : phrases lisibles,
// résumé « Pendant ton absence » et nouveautés depuis la dernière visite.
// Fonctions pures : elles ne lisent que ce qu'on leur donne.

/** Ligne lue dans la table evenements. */
export type LigneEvenementLue = {
  readonly id: string;
  readonly type: string;
  readonly cle: string;
  readonly mois_jeu: number;
  readonly instant: string;
  readonly titre: string;
  readonly detail: Readonly<Record<string, unknown>> | null;
  readonly cree_le: string;
};

export const COLONNES_EVENEMENTS = "id, type, cle, mois_jeu, instant, titre, detail, cree_le";

export type NomsJournal = {
  readonly produits: Readonly<Record<string, string>>;
  readonly matieres: Readonly<Record<string, { readonly nom: string; readonly unite: string }>>;
};

export type TonEvenement = "bon" | "neutre" | "alerte" | "critique";

export type EvenementAffiche = {
  readonly id: string;
  readonly type: string;
  readonly ton: TonEvenement;
  readonly texte: string;
  readonly mois: number;
  readonly quand: string;
  readonly lien: { readonly href: string; readonly libelle: string } | null;
};

const eur = (c: number) => `${formaterEuros(c)} €`;

function nombre(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function texte(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function minuscule(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

const UNITES: Readonly<Record<string, [string, string]>> = {
  metre: ["m", "m"],
  kg: ["kg", "kg"],
  lot: ["lot", "lots"],
  piece: ["pièce", "pièces"],
};

/** « 300 m de jersey de coton bio » ; sans nom connu, l'identifiant sans préfixe. */
export function quantiteMatiere(quantite: number, matiereId: string, noms: NomsJournal): string {
  const m = noms.matieres[matiereId];
  const nom = m ? minuscule(m.nom) : matiereId.replace(/^mat_/, "").replace(/_/g, " ");
  const [un, plusieurs] = UNITES[m?.unite ?? ""] ?? ["", ""];
  const unite = quantite > 1 ? plusieurs : un;
  const q = quantite.toLocaleString("fr-FR");
  return unite ? `${q} ${unite} de ${nom}` : `${q} × ${nom}`;
}

function nomProduit(id: string, noms: NomsJournal): string {
  return noms.produits[id] ?? id.replace(/^prod_/, "").replace(/_/g, " ");
}

/** Phrase, ton et lien d'un événement du journal. */
export function evenementAffiche(e: LigneEvenementLue, noms: NomsJournal): EvenementAffiche {
  const d = e.detail ?? {};
  const base = { id: e.id, type: e.type, mois: e.mois_jeu, quand: e.instant };
  switch (e.type) {
    case "livraison_matiere":
      return {
        ...base,
        ton: "neutre",
        texte: `Livraison reçue : ${quantiteMatiere(nombre(d.quantite), texte(d.matiere), noms)}${
          d.aCredit === true ? `, à payer plus tard (${eur(nombre(d.montant))})` : ""
        }.`,
        lien: { href: "/achats", libelle: "Achats" },
      };
    case "livraison_production":
      return {
        ...base,
        ton: "bon",
        texte: `Production livrée : ${nombre(d.quantite).toLocaleString("fr-FR")} × ${minuscule(nomProduit(texte(d.produit), noms))}, prêts à vendre.`,
        lien: { href: "/produits", libelle: "Vente" },
      };
    case "rupture_stock":
      return {
        ...base,
        ton: "alerte",
        texte: `Rupture de stock : plus aucun ${minuscule(nomProduit(texte(d.produit), noms))} ${
          d.lieu === "boutique" ? "en boutique" : "à l'atelier"
        }. Les clients repartent sans acheter.`,
        lien: d.lieu === "boutique" ? { href: "/magasin", libelle: "Magasin" } : { href: "/atelier", libelle: "Production" },
      };
    case "decouvert":
      return {
        ...base,
        ton: "critique",
        texte: `Ton compte est passé à découvert (${eur(nombre(d.tresorerie))}) : la banque facture des agios.`,
        lien: { href: "/banque", libelle: "Banque" },
      };
    case "creance_encaissee":
      return {
        ...base,
        ton: "bon",
        texte: `Les revendeurs t'ont payé ${eur(nombre(d.montant))}.`,
        lien: { href: "/finances", libelle: "Finances" },
      };
    case "etape_franchie":
      return {
        ...base,
        ton: "bon",
        texte: `Étape ${nombre(d.etapeApres)} franchie : de nouvelles possibilités s'ouvrent.`,
        lien: { href: "/societe", libelle: "Société" },
      };
    case "cloture_mois": {
      const c = d as unknown as Partial<DetailCloture>;
      const resultat = nombre(c.resultat);
      return {
        ...base,
        ton: nombre(c.tresorerieFin) < 0 ? "critique" : resultat < 0 ? "alerte" : "bon",
        texte: `${titreMois(nombre(e.mois_jeu))} clos : ${eur(nombre(c.totalPaye))} payés (paie, loyers, échéances, TVA), ${
          resultat >= 0 ? `bénéfice de ${eur(resultat)}` : `perte de ${eur(-resultat)}`
        }.`,
        lien: { href: "/finances", libelle: "Finances" },
      };
    }
    case "mission_validee":
      return {
        ...base,
        ton: "bon",
        texte: `Mission validée : ${texte(d.titreMission) || texte(d.mission)}.`,
        lien: { href: "/missions", libelle: "Missions" },
      };
    default:
      return { ...base, ton: "neutre", texte: e.titre, lien: null };
  }
}

/** Événements enregistrés après la dernière visite ; aucun si le joueur n'est jamais venu. */
export function nouveautes<T extends { readonly cree_le: string }>(
  evenements: readonly T[],
  derniereVisite: string | null,
): T[] {
  if (derniereVisite === null) return [];
  const depuis = Date.parse(derniereVisite);
  if (!Number.isFinite(depuis)) return [];
  return evenements.filter((e) => Date.parse(e.cree_le) > depuis);
}

/** Ventes HT (compte 707, crédit − débit) enregistrées après un instant. */
export function ventesDepuis(
  lignes: readonly { compte: string; sens: string; montant_centimes: number; cree_le: string }[],
  depuisIso: string,
): number {
  const depuis = Date.parse(depuisIso);
  return lignes
    .filter((l) => l.compte === "707" && Date.parse(l.cree_le) > depuis)
    .reduce((s, l) => s + (l.sens === "credit" ? l.montant_centimes : -l.montant_centimes), 0);
}

export type ResumeAbsence = {
  readonly ventesHt: number;
  readonly livraisons: number;
  readonly chargesPayees: number;
  readonly moisClos: readonly number[];
  readonly encaisse: number;
  /** Les faits marquants, alertes d'abord, puis du plus récent au plus ancien. */
  readonly faits: readonly EvenementAffiche[];
};

const ORDRE_TON: Readonly<Record<TonEvenement, number>> = { critique: 0, alerte: 1, bon: 2, neutre: 3 };

/** Ce que la carte « Pendant ton absence » résume, à partir des nouveautés. */
export function resumeAbsence(
  nouveaux: readonly LigneEvenementLue[],
  ventesHt: number,
  noms: NomsJournal,
): ResumeAbsence {
  let livraisons = 0;
  let chargesPayees = 0;
  let encaisse = 0;
  const moisClos: number[] = [];
  for (const e of nouveaux) {
    const d = e.detail ?? {};
    if (e.type === "livraison_matiere" || e.type === "livraison_production") livraisons += 1;
    if (e.type === "cloture_mois") {
      chargesPayees += nombre(d.totalPaye);
      moisClos.push(e.mois_jeu);
    }
    if (e.type === "creance_encaissee") encaisse += nombre(d.montant);
  }
  const faits = nouveaux
    .map((e) => evenementAffiche(e, noms))
    .sort((a, b) => ORDRE_TON[a.ton] - ORDRE_TON[b.ton] || Date.parse(b.quand) - Date.parse(a.quand));
  return { ventesHt, livraisons, chargesPayees, moisClos: moisClos.sort((a, b) => a - b), encaisse, faits };
}

/**
 * Instant jusqu'auquel le joueur a vu son journal : celui envoyé par la page, jamais dans le
 * futur (horloge du serveur). Null si la valeur reçue n'est pas une date.
 */
export function instantVu(jusquaIso: unknown, maintenantMs: number): string | null {
  if (typeof jusquaIso !== "string") return null;
  const t = Date.parse(jusquaIso);
  if (!Number.isFinite(t)) return null;
  return new Date(Math.min(t, maintenantMs)).toISOString();
}

/** Événements groupés par mois de jeu, du plus récent au plus ancien (page Journal). */
export function parMois<T extends { readonly mois: number; readonly quand: string }>(
  evenements: readonly T[],
): { mois: number; evenements: T[] }[] {
  const groupes = new Map<number, T[]>();
  for (const e of evenements) {
    const g = groupes.get(e.mois);
    if (g) g.push(e);
    else groupes.set(e.mois, [e]);
  }
  return [...groupes.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([mois, evs]) => ({ mois, evenements: evs.sort((a, b) => Date.parse(b.quand) - Date.parse(a.quand)) }));
}
