import type { DecisionCommanderMatiere } from "@kapital/engine";
import { ok, refuse, type ContexteValidation, type Result } from "../types.js";

export function validerCommanderMatiere(
  ctx: ContexteValidation,
  d: DecisionCommanderMatiere,
): Result {
  if (d.quantite <= 0 || !Number.isFinite(d.quantite)) {
    return refuse(
      "quantite_invalide",
      `La quantité doit être strictement positive (reçu ${d.quantite}).`,
    );
  }
  const fournisseurs = ctx.fournisseurs ?? [];
  const f = fournisseurs.find((x) => x.id === d.fournisseur);
  if (!f) {
    return refuse(
      "fournisseur_inconnu",
      `Le fournisseur ${d.fournisseur} n'existe pas.`,
    );
  }
  if (d.quantite < f.minimumCommande) {
    return refuse(
      "sous_minimum_commande",
      `Commande sous le minimum du fournisseur (${f.minimumCommande}). Vous avez demandé ${d.quantite}.`,
    );
  }
  const catalogues = ctx.catalogues ?? [];
  const cat = catalogues.find((c) => c.fournisseur === d.fournisseur);
  if (!cat) {
    return refuse(
      "catalogue_absent",
      `Aucun catalogue de prix connu pour le fournisseur ${d.fournisseur}.`,
    );
  }
  const ligne = cat.lignes.find((l) => l.matiere === d.matiere);
  if (!ligne) {
    return refuse(
      "matiere_pas_au_catalogue",
      `Le fournisseur ${d.fournisseur} ne vend pas la matière ${d.matiere}.`,
    );
  }
  return ok();
}
