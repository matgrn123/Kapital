/**
 * Montant en centimes écrit pour un joueur : « 1 005 000,00 € ».
 * Séparateur de milliers : espace ; décimales : virgule. Ne dépend pas de la langue
 * du serveur, pour que les messages soient identiques partout.
 */
export function eurosTexte(centimes: number): string {
  const signe = centimes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(centimes));
  const entier = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimales = (abs % 100).toString().padStart(2, "0");
  return `${signe}${entier},${decimales} €`;
}
