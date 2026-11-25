// Fil rouge Louis Vuitton : encadrés historiques affichés sur certains écrans.
// Décision du 25 novembre 2026 (Mathieu). Chaque texte doit citer sa source et
// sa date de vérification ; un texte sans source n'est pas publié.

import brut from "../fil-rouge-lv.json" with { type: "json" };

export const ECRANS_FIL_ROUGE = [
  "atelier",
  "societe",
  "production",
  "publicite",
  "vente",
  "magasin",
  "banque",
  "locaux",
  "embauche",
  "village",
] as const;

export type EcranFilRouge = (typeof ECRANS_FIL_ROUGE)[number];

export type TexteFilRouge = {
  readonly ecran: EcranFilRouge;
  readonly texte: string;
  /** Référence vérifiable : ouvrage, article ou page officielle. */
  readonly source: string;
  readonly url?: string;
  /** Date de vérification, AAAA-MM-JJ. */
  readonly date: string;
};

function chaine(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validerFilRouge(donnees: unknown): TexteFilRouge[] {
  const textes = (donnees as { textes?: unknown })?.textes;
  if (!Array.isArray(textes)) throw new Error("fil-rouge-lv.json : « textes » doit être une liste.");
  return textes.map((t, i) => {
    const x = t as Record<string, unknown>;
    if (!ECRANS_FIL_ROUGE.includes(x.ecran as EcranFilRouge)) {
      throw new Error(`fil rouge n°${i + 1} : écran inconnu (${String(x.ecran)}).`);
    }
    if (!chaine(x.texte)) throw new Error(`fil rouge n°${i + 1} : texte manquant.`);
    if (!chaine(x.source)) throw new Error(`fil rouge n°${i + 1} : source manquante.`);
    if (!chaine(x.date) || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) {
      throw new Error(`fil rouge n°${i + 1} : date manquante ou pas au format AAAA-MM-JJ.`);
    }
    if (x.url !== undefined && !chaine(x.url)) throw new Error(`fil rouge n°${i + 1} : url vide.`);
    return {
      ecran: x.ecran as EcranFilRouge,
      texte: x.texte,
      source: x.source,
      ...(x.url ? { url: x.url as string } : {}),
      date: x.date,
    };
  });
}

export function chargerFilRougeLV(): TexteFilRouge[] {
  return validerFilRouge(brut);
}
