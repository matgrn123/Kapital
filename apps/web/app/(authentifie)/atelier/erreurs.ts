import { formaterEuros } from "../../../lib/formatage";

export type ConditionEtape = {
  cle: string;
  unite?: string;
  actuel: number;
  requis: number;
  manque: number;
};

export type MessageErreur = { texte: string; conditions: string[] };

const LIBELLES: Record<string, string> = {
  pieces_vendues: "Pièces vendues",
  chiffre_affaires_ht_cumule: "Chiffre d'affaires hors taxes cumulé",
  tresorerie_positive: "Trésorerie positive à la clôture du mois",
  tresorerie_minimale: "Trésorerie à la clôture du mois",
  notoriete: "Notoriété de la marque",
};

function valeur(n: number, unite?: string): string {
  if (unite === "centimes") return `${formaterEuros(n)} €`;
  if (unite === "pieces") return `${n} pièces`;
  if (unite === "points") return `${Math.round(n)} points`;
  return unite ? `${n} ${unite}` : String(n);
}

function ligneCondition(c: ConditionEtape): string {
  const nom = LIBELLES[c.cle] ?? c.cle.replace(/_/g, " ");
  return `${nom} : ${valeur(c.actuel, c.unite)} sur ${valeur(c.requis, c.unite)} (il manque ${valeur(c.manque, c.unite)})`;
}

/** Lit une réponse d'erreur de l'API et la rend en clair (message + conditions chiffrées). */
export async function lireErreur(reponse: Response): Promise<MessageErreur> {
  type Corps = { error?: unknown; code?: unknown; etapeRequise?: unknown; conditions?: unknown };
  const data: Corps = await reponse.json().then(
    (j: unknown) => (j && typeof j === "object" ? (j as Corps) : {}),
    () => ({}),
  );
  const message = typeof data.error === "string" && data.error ? data.error : null;
  const etape = data.code === "etape_insuffisante";
  const conditions =
    etape && Array.isArray(data.conditions)
      ? (data.conditions as ConditionEtape[]).map(ligneCondition)
      : [];

  if (etape) {
    const requise = typeof data.etapeRequise === "number" ? ` (étape ${data.etapeRequise})` : "";
    return {
      texte: message ?? `Cette action n'est pas encore débloquée${requise}.`,
      conditions,
    };
  }
  if (message) return { texte: message, conditions };
  if (reponse.status === 401 || reponse.status === 403) {
    return { texte: "Action non autorisée. Reconnectez-vous puis réessayez.", conditions };
  }
  if (reponse.status >= 500) {
    return { texte: "Le serveur a rencontré un problème. Réessayez dans un instant.", conditions };
  }
  return { texte: `Action impossible (erreur ${reponse.status}).`, conditions };
}

export const MESSAGE_RESEAU =
  "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.";
