// 3D-7 : une société peut avoir plusieurs locaux (table workshops). Fonctions pures partagées par
// les routes et les écrans : quel local viser, quel local afficher.

export type LocalMinimal = { readonly id: string; readonly mode_detention?: string | null };

export type LocalVise =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly code: "aucun_local" | "local_a_preciser"; readonly message: string };

/**
 * Le local visé par une action sur un bail (congé) : celui demandé, s'il appartient à la société ;
 * sans précision, le seul local loué (refus s'il y en a plusieurs).
 */
export function localVise(locaux: readonly LocalMinimal[], workshopId?: string): LocalVise {
  if (workshopId !== undefined) {
    return locaux.some((l) => l.id === workshopId)
      ? { ok: true, id: workshopId }
      : { ok: false, code: "aucun_local", message: "Ce local n'est pas à vous." };
  }
  const loues = locaux.filter((l) => (l.mode_detention ?? "bail") === "bail");
  if (loues.length === 0) return { ok: false, code: "aucun_local", message: "Vous n'avez aucun local loué." };
  if (loues.length > 1) {
    return { ok: false, code: "local_a_preciser", message: "Vous avez plusieurs locaux : précisez lequel quitter." };
  }
  return { ok: true, id: loues[0]!.id };
}

/** Le local affiché par un écran (paramètre ?local=<id>) : celui demandé s'il existe, sinon le plus ancien. */
export function localAffiche<T extends LocalMinimal>(locaux: readonly T[], demande?: string | null): T | null {
  return locaux.find((l) => l.id === demande) ?? locaux[0] ?? null;
}

/**
 * Salariés montrés dans un local de l'atelier 3D (dessin seulement : le moteur compte les postes
 * de tous les locaux ensemble). Les artisans remplissent les postes local par local, dans l'ordre
 * des locaux et de leur embauche ; les artisans sans poste et l'encadrement restent dans le premier.
 */
export function salariesDuLocal<T extends { readonly poste: string }>(
  salaries: readonly T[],
  postesParLocal: readonly number[],
  indexLocal: number,
): T[] {
  const artisans = salaries.filter((s) => s.poste === "artisan");
  const autres = salaries.filter((s) => s.poste !== "artisan");
  const debut = postesParLocal.slice(0, indexLocal).reduce((s, n) => s + n, 0);
  const total = postesParLocal.reduce((s, n) => s + n, 0);
  const auPoste = artisans.slice(debut, debut + (postesParLocal[indexLocal] ?? 0));
  return indexLocal === 0 ? [...auPoste, ...artisans.slice(total), ...autres] : auPoste;
}
