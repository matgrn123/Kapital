import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ajouterComptes,
  calculerIndicateurs,
  centimes,
  configTempsDepuis,
  enEquilibre,
  grandLivreVide,
  moisJeu,
  PLAN_COMPTABLE_V1,
  enregistrer,
  ventesMensuellesDepuisCumul,
  type EcritureComptable,
  type GrandLivre,
  type Indicateurs,
  type LigneEcriture,
} from "@kapital/engine";
import type { Parametres } from "@kapital/content";
import type { StockageMonde } from "../avance/port.js";

// AE-3 : lecture seule. Charge l'état et les écritures d'une entreprise, puis
// laisse le moteur calculer. Rien n'est écrit en base.

export type LigneLedger = {
  readonly ecriture_id: string;
  readonly mois_jeu: number;
  readonly libelle: string;
  readonly compte: string;
  readonly sens: "debit" | "credit";
  readonly montant_centimes: number;
};

/** Reconstruit le grand livre à partir des lignes de la table ledger_entries. */
export function construireGrandLivre(lignes: readonly LigneLedger[]): GrandLivre {
  const parEcriture = new Map<string, { mois: number; libelle: string; lignes: LigneEcriture[] }>();
  for (const l of lignes) {
    let e = parEcriture.get(l.ecriture_id);
    if (!e) {
      e = { mois: l.mois_jeu, libelle: l.libelle, lignes: [] };
      parEcriture.set(l.ecriture_id, e);
    }
    e.lignes.push({ compte: l.compte, sens: l.sens, montant: centimes(Number(l.montant_centimes)) });
  }
  let gl = ajouterComptes(grandLivreVide(), PLAN_COMPTABLE_V1);
  for (const [id, e] of parEcriture) {
    const ecriture: EcritureComptable = { id, mois: moisJeu(e.mois), libelle: e.libelle, lignes: e.lignes };
    gl = enregistrer(gl, ecriture); // lève si l'écriture n'est pas équilibrée
  }
  if (!enEquilibre(gl)) throw new Error("Grand livre déséquilibré : actif différent de passif + résultat.");
  return gl;
}

const TAILLE_PAGE = 1000;

/** Lit toutes les lignes du grand livre d'une entreprise, par pages (la base plafonne à 1 000 lignes). */
export async function chargerLignesGrandLivreSupabase(
  supabase: SupabaseClient,
  companyId: string,
): Promise<readonly LigneLedger[]> {
  const toutes: LigneLedger[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes")
      .eq("company_id", companyId)
      .order("cree_le", { ascending: true })
      .order("id", { ascending: true })
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(`ledger_entries : ${error.message}`);
    const page = (data ?? []) as LigneLedger[];
    toutes.push(...page);
    if (page.length < TAILLE_PAGE) return toutes;
  }
}

export type SourceIndicateurs = {
  readonly chargerEtat: StockageMonde["chargerEtat"];
  readonly chargerLignesGrandLivre: (companyId: string) => Promise<readonly LigneLedger[]>;
};

export async function lireIndicateursEntreprise(
  source: SourceIndicateurs,
  params: Parametres,
  p: { readonly companyId: string; readonly moisCourant: number },
): Promise<Indicateurs> {
  const [etat, lignes] = await Promise.all([
    source.chargerEtat(p.companyId, p.moisCourant),
    source.chargerLignesGrandLivre(p.companyId),
  ]);
  const { pasParMois } = configTempsDepuis(params);
  return calculerIndicateurs({
    entreprise: etat.entreprise,
    grandLivre: construireGrandLivre(lignes),
    ventesMensuelles: ventesMensuellesDepuisCumul(etat.cumul, pasParMois),
    moisCourant: moisJeu(p.moisCourant),
    params,
  });
}
