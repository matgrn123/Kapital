import type { DecisionOrdreProduction } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";
import { verifierDeblocage } from "./verrouEtape.js";

export function validerOrdreProduction(
  ctx: ContexteValidation,
  d: DecisionOrdreProduction,
): Result {
  if (d.lieu.type === "atelier") {
    const verrou = verifierDeblocage(ctx, "production_atelier");
    if (!verrou.ok) return verrou;
  }
  if (d.quantite <= 0 || !Number.isFinite(d.quantite)) {
    return refuse(
      "quantite_invalide",
      `La quantité à produire doit être strictement positive (reçu ${d.quantite}).`,
    );
  }
  const produits = ctx.produits ?? [];
  const produit = produits.find((p) => p.id === d.produit);
  if (!produit) {
    return refuse(
      "produit_inconnu",
      `Le produit ${d.produit} n'existe pas dans le catalogue de référence.`,
    );
  }
  // Vérifie le stock matière requis
  const metresRequis = produit.consommationParPiece * d.quantite;
  const stock = ctx.entreprise.stocksMatiere.find(
    (s) => s.matiere === produit.matiere,
  );
  if (!stock || stock.quantite < metresRequis) {
    const dispo = stock ? stock.quantite : 0;
    return refuse(
      "stock_matiere_insuffisant",
      `Matière insuffisante : besoin ${metresRequis.toFixed(1)}, disponible ${dispo.toFixed(1)}.`,
    );
  }
  // Si production en atelier, vérifie que l'atelier existe
  if (d.lieu.type === "atelier" && ctx.entreprise.ateliers.length === 0) {
    return refuse(
      "sans_atelier",
      `Votre entreprise n'a pas d'atelier propre. Utilisez un façonnier.`,
    );
  }
  return ok();
}
