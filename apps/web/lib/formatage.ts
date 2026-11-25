export function formaterEuros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formaterEurosCompact(centimes: number): string {
  if (Math.abs(centimes) >= 100_000_00) {
    return (centimes / 100_00).toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " k€";
  }
  return formaterEuros(centimes);
}

/* --------------------------------------------------- Unités de matière */

// Une quantité de matière se lit avec son unité : « 300 m de jersey », « 3,50 € le mètre ».
// L'unité vient de la base (materials.unite : « metre » ou « lot »).
const UNITES: Readonly<Record<string, { court: string; pluriel: string; article: string }>> = {
  metre: { court: "m", pluriel: "m", article: "le mètre" },
  lot: { court: "lot", pluriel: "lots", article: "le lot" },
};

/** Unité courte, accordée : « m », « lot », « lots » ; une unité inconnue reste telle quelle. */
export function symboleUnite(unite: string, quantite: number): string {
  const u = UNITES[unite];
  if (!u) return unite;
  return quantite >= 2 ? u.pluriel : u.court;
}

/** « 300 m de jersey de coton bio », « 3 lots de fournitures ». */
export function quantiteMatiere(quantite: number, unite: string, nom: string): string {
  // « Fournitures (lot) » : l'unité est déjà dite, on retire la parenthèse.
  const net = nom.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const minuscule = net.charAt(0).toLocaleLowerCase("fr-FR") + net.slice(1);
  const de = /^[aeiouàâéèêëîïôûù]/i.test(minuscule) ? "d'" : "de ";
  return `${quantite.toLocaleString("fr-FR")} ${symboleUnite(unite, quantite)} ${de}${minuscule}`;
}

/** « le mètre », « le lot », « l'unité » : ce que paie un prix unitaire. */
export function articleUnite(unite: string): string {
  return UNITES[unite]?.article ?? "l'unité";
}

/** « 3,50 € le mètre », « 12,00 € le lot », « 0,99 € l'unité ». */
export function prixParUnite(centimes: number, unite: string): string {
  return `${formaterEuros(centimes)} € ${articleUnite(unite)}`;
}

// Le jeu se joue à l'heure de Paris, même quand la page est rendue sur un serveur en UTC.
const FUSEAU = "Europe/Paris";

export function formaterDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: FUSEAU,
  });
}

export function formaterDateHeure(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSEAU,
  });
}
