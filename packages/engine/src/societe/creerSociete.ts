import type { Parametres } from "@kapital/content";
import type { EcritureComptable } from "../comptabilite/types.js";
import type { Gamme } from "../types/entreprise.js";
import { centimes, type Centimes, type MoisJeu } from "../types/primitifs.js";

export class ErreurSociete extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurSociete";
  }
}

const GAMMES: readonly Gamme[] = ["entree", "milieu", "haut"];
const LONGUEUR_NOM_MAX = 60;

/** Capital de départ : un paramètre sourcé (20 000 €), jamais une valeur en dur. */
export function capitalDeDepart(params: Parametres): Centimes {
  const p = params["capital_depart_centimes"];
  if (!p) throw new ErreurSociete("Paramètre manquant : capital_depart_centimes.");
  if (!Number.isInteger(p.valeur) || p.valeur <= 0) {
    throw new ErreurSociete(`capital_depart_centimes doit être un entier positif, reçu ${p.valeur}.`);
  }
  return centimes(p.valeur);
}

export type EntreesCreationSociete = {
  readonly params: Parametres;
  readonly nom: string;
  readonly gamme: Gamme;
  readonly mois: MoisJeu;
};

export type Societe = {
  readonly nom: string;
  readonly gamme: Gamme;
  /** Une seule forme juridique en V1 : la SAS (plan d'architecture, §0). */
  readonly formeJuridique: "SAS";
  readonly etape: 0;
  /** Pas d'atelier à la création : le joueur démarre sans local. */
  readonly atelier: null;
  readonly tresorerie: Centimes;
  /** 512 Banque (débit) / 101 Capital (crédit). */
  readonly ecritureApport: EcritureComptable;
};

export function creerSociete(e: EntreesCreationSociete): Societe {
  const nom = e.nom.trim().replace(/\s+/g, " ");
  if (nom.length === 0) throw new ErreurSociete("Le nom de la marque est obligatoire.");
  if (nom.length > LONGUEUR_NOM_MAX) {
    throw new ErreurSociete(`Le nom de la marque ne peut pas dépasser ${LONGUEUR_NOM_MAX} caractères.`);
  }
  if (!GAMMES.includes(e.gamme)) {
    throw new ErreurSociete(`Gamme inconnue : ${String(e.gamme)} (entrée, milieu ou haut de gamme).`);
  }
  const capital = capitalDeDepart(e.params);
  return {
    nom,
    gamme: e.gamme,
    formeJuridique: "SAS",
    etape: 0,
    atelier: null,
    tresorerie: capital,
    ecritureApport: {
      id: "apport_initial",
      mois: e.mois,
      libelle: "Apport de capital initial",
      lignes: [
        { compte: "512", sens: "debit", montant: capital },
        { compte: "101", sens: "credit", montant: capital },
      ],
    },
  };
}
