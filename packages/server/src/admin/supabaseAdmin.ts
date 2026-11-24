import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultatAvanceMonde } from "../avance/orchestrateur.js";
import { StockageSupabase } from "../avance/stockageSupabase.js";
import {
  ligneJournalDepuisResultat,
  type Declencheur,
  type DonneesCockpit,
  type PassageJournal,
} from "./cockpit.js";
import type { EntreeAudit, JournalAudit } from "./port.js";

function verifier<T>(nom: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${nom} : ${r.error.message}`);
  return r.data as T;
}

/** Journal d'audit des actions d'administration (table audit_log). */
export class JournalAuditSupabase implements JournalAudit {
  constructor(private readonly supabase: SupabaseClient) {}

  async enregistrer(entree: EntreeAudit): Promise<void> {
    verifier(
      "audit_log",
      await this.supabase.from("audit_log").insert({
        profile_id: entree.profileId,
        action: entree.action,
        cible: entree.cible,
        details: entree.details,
      }),
    );
  }
}

/** Les journaux de plus de cette durée sont supprimés (environ un passage par minute). */
const CONSERVATION_JOURNAL_MS = 3 * 24 * 3_600_000;

/**
 * Garde une trace d'un passage de l'orchestrateur. Ne doit jamais faire échouer le
 * passage lui-même : une erreur d'écriture du journal est seulement signalée.
 */
export async function enregistrerPassage(
  supabase: SupabaseClient,
  resultat: ResultatAvanceMonde,
  dureeMs: number,
  declencheur: Declencheur,
  maintenantMs: number,
): Promise<void> {
  try {
    verifier(
      "journal_avance",
      await supabase.from("journal_avance").insert(ligneJournalDepuisResultat(resultat, dureeMs, declencheur)),
    );
    // Ménage environ une fois par heure
    if (resultat.pasCible % 60 === 0) {
      await supabase
        .from("journal_avance")
        .delete()
        .lt("cree_le", new Date(maintenantMs - CONSERVATION_JOURNAL_MS).toISOString());
    }
  } catch (e) {
    console.error(`[avance] journal non enregistré : ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Lit tout ce que le cockpit affiche (clé de service : toutes les entreprises). */
export async function chargerDonneesCockpit(supabase: SupabaseClient): Promise<DonneesCockpit> {
  const monde = await new StockageSupabase(supabase).chargerMondeActif();
  if (!monde) throw new Error("Aucun monde actif");

  const [entreprisesR, passageR, achatsR, productionsR] = await Promise.all([
    supabase
      .from("companies")
      .select("id, nom, statut, pas_traites, tresorerie_centimes")
      .eq("world_id", monde.id)
      .order("nom"),
    supabase
      .from("journal_avance")
      .select("cree_le, declencheur, pas_cible, nb_entreprises, nb_avancees, nb_erreurs, erreurs, duree_ms")
      .eq("monde_id", monde.id)
      .order("cree_le", { ascending: false })
      .limit(1),
    supabase
      .from("purchase_orders")
      .select("id, company_id, material_id, quantite, instant_livraison_prevue")
      .eq("statut", "en_cours")
      .order("instant_livraison_prevue")
      .limit(50),
    supabase
      .from("production_orders")
      .select("id, company_id, product_id, quantite, instant_livraison_prevue")
      .eq("statut", "en_cours")
      .eq("lieu_type", "faconnier")
      .order("instant_livraison_prevue")
      .limit(50),
  ]);

  const entreprises = (verifier("companies", entreprisesR) ?? []) as Array<{
    id: string; nom: string; statut: string; pas_traites: number | null; tresorerie_centimes: number;
  }>;
  const passages = (verifier("journal_avance", passageR) ?? []) as Array<{
    cree_le: string; declencheur: string; pas_cible: number; nb_entreprises: number;
    nb_avancees: number; nb_erreurs: number; erreurs: string[]; duree_ms: number;
  }>;
  const achats = (verifier("purchase_orders", achatsR) ?? []) as Array<{
    id: string; company_id: string; material_id: string; quantite: number; instant_livraison_prevue: string;
  }>;
  const productions = (verifier("production_orders", productionsR) ?? []) as Array<{
    id: string; company_id: string; product_id: string; quantite: number; instant_livraison_prevue: string;
  }>;

  const dernier = passages[0];
  const dernierPassage: PassageJournal | null = dernier
    ? {
        creeLeMs: Date.parse(dernier.cree_le),
        declencheur: dernier.declencheur,
        pasCible: dernier.pas_cible,
        nbEntreprises: dernier.nb_entreprises,
        nbAvancees: dernier.nb_avancees,
        nbErreurs: dernier.nb_erreurs,
        erreurs: dernier.erreurs,
        dureeMs: dernier.duree_ms,
      }
    : null;

  return {
    monde,
    entreprises: entreprises.map((e) => ({
      id: e.id,
      nom: e.nom,
      statut: e.statut,
      pasTraites: e.pas_traites,
      tresorerieCentimes: Number(e.tresorerie_centimes),
    })),
    dernierPassage,
    commandes: [
      ...achats.map((a) => ({
        id: a.id,
        companyId: a.company_id,
        type: "matiere" as const,
        libelle: `${a.material_id} ×${a.quantite}`,
        instantLivraisonMs: Date.parse(a.instant_livraison_prevue),
      })),
      ...productions.map((p) => ({
        id: p.id,
        companyId: p.company_id,
        type: "faconnier" as const,
        libelle: `${p.product_id} ×${p.quantite}`,
        instantLivraisonMs: Date.parse(p.instant_livraison_prevue),
      })),
    ],
  };
}
