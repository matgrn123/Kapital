import type { DecisionChangerPrix } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

export function validerChangerPrix(
  ctx: ContexteValidation,
  d: DecisionChangerPrix,
): Result {
  if (d.canal === "revendeur") {
    const verrou = verifierDeblocage(ctx, "vente_revendeur");
    if (!verrou.ok) return verrou;
  }
  if (d.prix <= 0) {
    return refuse(
      "prix_negatif_ou_nul",
      `Le prix doit être strictement positif (reçu ${d.prix} centimes).`,
    );
  }
  const entree = ctx.entreprise.catalogue.find((c) => c.produit === d.produit);
  if (!entree) {
    return refuse(
      "produit_pas_au_catalogue",
      `Le produit ${d.produit} n'est pas dans le catalogue de votre entreprise.`,
    );
  }
  return ok();
}
