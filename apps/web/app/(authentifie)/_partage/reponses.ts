import { formaterEuros } from "../../../lib/formatage";

// Lecture des réponses des routes /api/actions/* (côté navigateur).

export type ConditionEtape = {
  cle: "pieces_vendues" | "chiffre_affaires_ht_cumule" | "tresorerie_positive" | "tresorerie_minimale" | "notoriete";
  unite: "pieces" | "centimes" | "points";
  actuel: number;
  requis: number;
  manque: number;
};

export type ReponseAction = {
  error?: string;
  code?: string;
  etapeRequise?: number;
  conditions?: ConditionEtape[];
  [cle: string]: unknown;
};

/** Une condition d'étape manquante, en clair. */
export function phraseCondition(c: ConditionEtape): string {
  switch (c.cle) {
    case "pieces_vendues":
      return `il manque ${c.manque} pièces vendues (${c.actuel} sur ${c.requis})`;
    case "chiffre_affaires_ht_cumule":
      return `il manque ${formaterEuros(c.manque)} € de chiffre d'affaires hors taxes cumulé (${formaterEuros(c.actuel)} € sur ${formaterEuros(c.requis)} €)`;
    case "tresorerie_positive":
      return `la trésorerie doit être positive (actuellement ${formaterEuros(c.actuel)} €)`;
    case "tresorerie_minimale":
      return `il manque ${formaterEuros(c.manque)} € de trésorerie (${formaterEuros(c.actuel)} € sur ${formaterEuros(c.requis)} €)`;
    case "notoriete":
      return `il manque ${Math.ceil(c.manque)} points de notoriété (${Math.floor(c.actuel)} sur ${c.requis})`;
  }
}

/** Message d'erreur lisible : pour un verrou d'étape, la condition manquante chiffrée. */
export function messageErreur(data: ReponseAction | null, statut: number): string {
  if (!data) return `Erreur inattendue (code ${statut}).`;
  if (data.code === "etape_insuffisante" && data.conditions && data.conditions.length > 0) {
    const etape = data.etapeRequise !== undefined ? ` à partir de l'étape ${data.etapeRequise}` : "";
    return `Cette action n'est pas encore débloquée${etape} : ${data.conditions.map(phraseCondition).join(" ; ")}.`;
  }
  return data.error ?? `Erreur inattendue (code ${statut}).`;
}

/** Envoie une action en POST JSON et rend le résultat décodé, sans jamais lever d'exception. */
export async function appelerAction(
  url: string,
  corps?: unknown,
): Promise<{ ok: boolean; data: ReponseAction; message: string | null }> {
  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    });
    let data: ReponseAction | null = null;
    try {
      data = (await reponse.json()) as ReponseAction;
    } catch {
      data = null;
    }
    if (!reponse.ok || !data || data.error) {
      return { ok: false, data: data ?? {}, message: messageErreur(data, reponse.status) };
    }
    return { ok: true, data, message: null };
  } catch {
    return { ok: false, data: {}, message: "Connexion impossible : réessayez dans un instant." };
  }
}
