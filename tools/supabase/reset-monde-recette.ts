// A.6 : reset du monde de recette.
//
// Après A.1 à A.5, le monde contient des données incohérentes :
// - écritures déséquilibrées (anciens prêts/marketing sans contrepartie)
// - trésoreries désynchronisées du grand livre (corrigées par le trigger A.3
//   mais les écarts historiques sont perdus)
// - stock produits finis non adossé aux écritures 35
//
// Ce script remet le monde dans un état propre :
// 1. Vide ledger_entries
// 2. Remet companies.tresorerie_centimes à 0
// 3. Remet product_stock (quantite = 0, valeur = 0)
// 4. Remet worlds.mois_courant à 0
// 5. Pour chaque entreprise, recrée l'écriture d'apport initial via le
//    grand livre (512 débit / 101 crédit). Le trigger apport_initial sur
//    insert companies ne s'applique PAS ici (on met à jour, pas d'insert).
//    On fait les écritures manuellement.
//
// ATTENTION : destructif. À exécuter uniquement en recette, jamais sur un
// monde public. Le CDC autorise explicitement une remise à zéro du monde
// de recette avant l'ouverture publique.

import { createClient } from "@supabase/supabase-js";

const APPORT_DEFAUT_PAR_GAMME: Record<string, number> = {
  entree: 2_000_000, // 20 000 €
  milieu: 2_000_000,
  haut: 2_000_000,
};

// Les PNJ gardent leur trésorerie actuelle (ils ont été seedés avec
// tresorerie_centimes initiale par la migration 0014). On la réécrit comme
// apport via ledger pour que le trigger A.3 reste cohérent.
const APPORT_PNJ_PAR_GAMME: Record<string, number> = {
  entree: 50_000_000,
  milieu: 80_000_000,
  haut: 150_000_000,
};

function env(cle: string): string {
  const v = process.env[cle];
  if (!v) throw new Error(`Variable d'environnement manquante : ${cle}`);
  return v;
}

async function main() {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  // Garde-fou : refuser si la variable RESET_MONDE_CONFIRMATION != 'oui'
  if (process.env.RESET_MONDE_CONFIRMATION !== "oui") {
    console.error(
      "Refus : définissez RESET_MONDE_CONFIRMATION=oui pour confirmer la remise à zéro.",
    );
    process.exit(1);
  }

  console.log("1/5 Suppression des écritures comptables...");
  const { error: errLedger } = await client
    .from("ledger_entries")
    .delete()
    .gte("montant_centimes", 0); // filtre bidon pour matcher toutes les lignes
  if (errLedger) throw new Error(`Suppression ledger : ${errLedger.message}`);

  console.log("2/5 Remise à zéro des trésoreries...");
  const { error: errTres } = await client
    .from("companies")
    .update({ tresorerie_centimes: 0 })
    .gt("tresorerie_centimes", -1); // match toutes les lignes
  if (errTres) throw new Error(`Reset trésoreries : ${errTres.message}`);

  console.log("3/5 Remise à zéro des stocks produits finis...");
  const { error: errStock } = await client
    .from("product_stock")
    .update({ quantite_pieces: 0, valeur_totale_centimes: 0 })
    .gte("quantite_pieces", 0);
  if (errStock) throw new Error(`Reset stocks : ${errStock.message}`);

  console.log("4/5 Remise du mois courant à 0...");
  const { error: errWorld } = await client
    .from("worlds")
    .update({ mois_courant: 0 })
    .eq("etat", "actif");
  if (errWorld) throw new Error(`Reset mois : ${errWorld.message}`);

  console.log("5/5 Recréation des apports initiaux...");
  const { data: entreprises, error: errFetch } = await client
    .from("companies")
    .select("id, nom, gamme, owner_profile_id");
  if (errFetch) throw new Error(`Lecture entreprises : ${errFetch.message}`);

  const lignes: Array<{
    company_id: string;
    ecriture_id: string;
    mois_jeu: number;
    libelle: string;
    compte: string;
    sens: "debit" | "credit";
    montant_centimes: number;
  }> = [];

  for (const ent of (entreprises ?? []) as Array<{
    id: string;
    nom: string;
    gamme: string;
    owner_profile_id: string | null;
  }>) {
    const estPNJ = ent.owner_profile_id === null;
    const montant = estPNJ
      ? (APPORT_PNJ_PAR_GAMME[ent.gamme] ?? 50_000_000)
      : (APPORT_DEFAUT_PAR_GAMME[ent.gamme] ?? 2_000_000);

    const ecritureId = `apport_initial_reset_${ent.id}`;
    lignes.push(
      {
        company_id: ent.id,
        ecriture_id: ecritureId,
        mois_jeu: 0,
        libelle: `Apport de capital initial (reset)`,
        compte: "512",
        sens: "debit",
        montant_centimes: montant,
      },
      {
        company_id: ent.id,
        ecriture_id: ecritureId,
        mois_jeu: 0,
        libelle: `Apport de capital initial (reset)`,
        compte: "101",
        sens: "credit",
        montant_centimes: montant,
      },
    );
  }

  if (lignes.length > 0) {
    // Insérer par lots de 500 pour éviter des requêtes trop grosses et pour
    // que le trigger d'équilibre vérifie par lot (ecriture_id réutilisé, mais
    // chaque compagnie a sa propre paire débit/crédit dans le même ecriture_id
    // si deux entreprises partagent l'id — ce qui n'est pas le cas ici car on
    // suffixe par company_id dans ecriture_id).
    // Note : on utilise le même ecriture_id 'apport_initial_reset' pour tous
    // mais le trigger A.2 vérifie que la somme des débits = somme des crédits
    // sur toute la table. Sur un lot équilibré (chaque entreprise ajoute 1
    // débit + 1 crédit du même montant), l'équilibre est garanti.
    for (let i = 0; i < lignes.length; i += 500) {
      const lot = lignes.slice(i, i + 500);
      const { error } = await client.from("ledger_entries").insert(lot);
      if (error) throw new Error(`Insert apports (lot ${i}) : ${error.message}`);
    }
  }

  console.log(`\nMonde de recette remis à zéro.`);
  console.log(`- ${(entreprises ?? []).length} entreprises ré-approvisionnées en apport initial`);
  console.log(`- ${lignes.length} écritures comptables insérées`);
  console.log(`- Trésorerie dérivée du grand livre via le trigger A.3`);
}

main().catch((err) => {
  console.error("Échec reset :", err.message);
  process.exit(1);
});
