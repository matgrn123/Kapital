import type { DetailCloture, PaiementsCloture } from "@kapital/server";
import { enMois, majuscule } from "./cadre";
import { formaterEuros } from "./formatage";

// Bilan du mois en trois phrases : ce qui s'est passé, pourquoi, quoi essayer.
// Fonction pure : elle lit l'événement de clôture enregistré par le serveur
// (packages/server/src/evenements) et n'invente aucun chiffre.

export type Debrief = {
  readonly quoi: string;
  readonly pourquoi: string;
  readonly essayer: string;
  readonly lien: { readonly href: string; readonly libelle: string };
};

const NOMS_PAIEMENTS: Readonly<Record<keyof PaiementsCloture, string>> = {
  paie: "la paie",
  loyers: "les loyers",
  echeances: "les échéances de prêt",
  tva: "la TVA",
  impot: "l'impôt sur les sociétés",
  agios: "les agios",
  energie: "l'énergie",
  autres: "les autres frais",
};

const eur = (c: number) => `${formaterEuros(c)} €`;

/** Le plus gros paiement de la clôture, ou null si rien n'a été payé. */
export function plusGrosPaiement(p: PaiementsCloture): { nom: string; montant: number } | null {
  let meilleur: { nom: string; montant: number } | null = null;
  for (const cle of Object.keys(NOMS_PAIEMENTS) as (keyof PaiementsCloture)[]) {
    const montant = p[cle] ?? 0;
    if (montant > 0 && (meilleur === null || montant > meilleur.montant)) {
      meilleur = { nom: NOMS_PAIEMENTS[cle], montant };
    }
  }
  return meilleur;
}

export function debriefDuMois(d: DetailCloture, nomsProduits: Readonly<Record<string, string>> = {}): Debrief {
  const tresorerie = `ta trésorerie est passée de ${eur(d.tresorerieDebut)} à ${eur(d.tresorerieFin)}`;
  const quoi =
    d.chiffreAffairesHt > 0
      ? `${majuscule(enMois(d.mois))}, tu as vendu pour ${eur(d.chiffreAffairesHt)} HT et ${tresorerie}.`
      : `${majuscule(enMois(d.mois))}, tu n'as rien vendu et ${tresorerie}.`;

  // Pourquoi : la cause la plus parlante d'abord.
  let pourquoi: string;
  const poste = plusGrosPaiement(d.paiements);
  if (d.piecesNonLivrees > 0) {
    const pire = [...d.ventesPerdues].sort((a, b) => b.manquantes - a.manquantes)[0];
    const nom = pire ? nomsProduits[pire.produit] : undefined;
    pourquoi = `Tu as manqué ${d.piecesNonLivrees} vente${d.piecesNonLivrees > 1 ? "s" : ""} faute de stock${
      nom ? `, surtout en ${nom.charAt(0).toLowerCase()}${nom.slice(1)}` : ""
    }.`;
  } else if (d.resultat < 0) {
    pourquoi = `Tes charges (${eur(d.charges)}) ont dépassé tes produits (${eur(d.produits)})${
      poste ? ` ; le plus gros paiement du mois est ${poste.nom} (${eur(poste.montant)})` : ""
    }.`;
  } else if (d.chiffreAffairesHt > 0) {
    pourquoi = `Tes ventes ont couvert tes charges : le mois se termine sur un bénéfice de ${eur(d.resultat)}.`;
  } else {
    pourquoi = "Sans vente, seules tes charges fixes ont fait bouger le compte.";
  }

  // Quoi essayer : le plus urgent d'abord.
  let essayer: string;
  let lien: Debrief["lien"];
  if (d.tresorerieFin < 0) {
    essayer = "Trouve de la trésorerie avant la prochaine paie : un prêt, ou vendre le stock qui dort.";
    lien = { href: "/banque", libelle: "Banque et prêt" };
  } else if (d.piecesNonLivrees > 0) {
    essayer = "Lance une production plus tôt ou plus grande, pour ne plus laisser partir des clients.";
    lien = { href: "/atelier", libelle: "Production" };
  } else if (d.chiffreAffairesHt <= 0) {
    essayer = "Vérifie qu'un produit est en vente, avec un prix et du stock.";
    lien = { href: "/produits", libelle: "Vente" };
  } else if (d.resultat < 0) {
    essayer = "Relève un peu ton prix ou fais connaître ta marque pour vendre plus, afin de couvrir tes charges fixes.";
    lien = { href: "/produits", libelle: "Vente et prix" };
  } else if (d.etapeApres > d.etapeAvant) {
    essayer = `Tu passes à l'étape ${d.etapeApres} : regarde ce qui vient de s'ouvrir à toi.`;
    lien = { href: "/societe", libelle: "Société" };
  } else {
    essayer = "Réinvestis une partie du bénéfice : de la publicité pour la notoriété, ou une production plus grande.";
    lien = { href: "/marketing", libelle: "Publicité" };
  }

  return { quoi, pourquoi, essayer, lien };
}
