import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerParametresV1 } from "@kapital/content";
import { configTempsDepuis, horlogeDepuis, parametreObligatoire } from "@kapital/engine";
import { lignesStock, mouvementsDeVente, type LigneStock, type LigneVenteLivre, type Temps } from "../../../lib/stock";

// Lecture en base de tout ce qu'il faut à l'écran Stock (et à l'alerte « stock bas » du tableau
// de bord, et à la tuile de l'écran Vente). Lecture seule : les calculs sont dans lib/stock.ts.

export type SituationStock = {
  readonly lignes: readonly LigneStock[];
  readonly temps: Temps;
  readonly seuilJours: number;
  readonly boutiqueOuverte: boolean;
};

const TAILLE_PAGE = 1000;
const PAGES_MAX = 50;

/** Ventes et retours du mois en cours et du précédent (compte 707), page par page. */
async function lignesDeVente(supabase: SupabaseClient, companyId: string, depuisMois: number): Promise<LigneVenteLivre[]> {
  const r: LigneVenteLivre[] = [];
  for (let page = 0; page < PAGES_MAX; page++) {
    const de = page * TAILLE_PAGE;
    const { data } = await supabase
      .from("ledger_entries")
      .select("ecriture_id, mois_jeu, libelle")
      .eq("company_id", companyId)
      .eq("compte", "707")
      .gte("mois_jeu", depuisMois)
      .order("id")
      .range(de, de + TAILLE_PAGE - 1);
    const lot = (data ?? []) as LigneVenteLivre[];
    r.push(...lot);
    if (lot.length < TAILLE_PAGE) break;
  }
  return r;
}

export async function chargerSituationStock(supabase: SupabaseClient, companyId: string): Promise<SituationStock> {
  const params = chargerParametresV1();
  const config = configTempsDepuis(params);
  const temps: Temps = {
    pasParMois: config.pasParMois,
    joursParMois: parametreObligatoire(params, "temps_jours_par_mois_jeu"),
    minutesReellesParMois: config.minutesReellesParMoisJeu,
  };
  const seuilJours = parametreObligatoire(params, "alerte_stock_bas_jours");

  const [{ data: societe }, { data: monde }] = await Promise.all([
    supabase.from("companies").select("pas_traites").eq("id", companyId).maybeSingle(),
    supabase.from("worlds").select("mois_courant, debut_reel").limit(1).maybeSingle(),
  ]);
  const debutMs = monde?.debut_reel ? Date.parse(monde.debut_reel as string) : Number.NaN;
  const horloge = Number.isFinite(debutMs) ? horlogeDepuis(config, debutMs, Date.now()) : null;
  // Les ventes sont enregistrées jusqu'au dernier pas traité pour la société.
  const pasCourant =
    societe?.pas_traites != null
      ? Number(societe.pas_traites)
      : (horloge?.pasTermines ?? (Number(monde?.mois_courant ?? 0) + 1) * config.pasParMois);
  const moisCourant = Math.floor(pasCourant / config.pasParMois);
  const pasDepuisInstant = (iso: string | null | undefined): number | null => {
    const ms = iso ? Date.parse(iso) : Number.NaN;
    if (!Number.isFinite(debutMs) || !Number.isFinite(ms) || ms < debutMs) return null;
    return horlogeDepuis(config, debutMs, ms).pasTermines;
  };

  const [{ data: catalogue }, { data: produits }, { data: stocks }, { data: stocksBoutique }, { data: boutiques }, { data: ordres }, ventes] =
    await Promise.all([
      supabase
        .from("company_products")
        .select("product_id, prix_vente_directe_centimes, prix_revendeur_centimes, prix_boutique_centimes, cree_le")
        .eq("company_id", companyId),
      supabase.from("products").select("id, nom").order("nom"),
      supabase.from("product_stock").select("product_id, quantite_pieces").eq("company_id", companyId),
      supabase.from("stock_boutique").select("product_id, quantite_pieces").eq("company_id", companyId),
      supabase.from("points_de_vente").select("mois_ouverture").eq("company_id", companyId).eq("statut", "actif"),
      supabase.from("production_orders").select("product_id, quantite").eq("company_id", companyId).eq("statut", "en_cours"),
      lignesDeVente(supabase, companyId, Math.max(0, moisCourant - 1)),
    ]);

  const somme = (lignes: Array<{ product_id: string; q: number }>) => {
    const r: Record<string, number> = {};
    for (const l of lignes) r[l.product_id] = (r[l.product_id] ?? 0) + l.q;
    return r;
  };
  const nomParId = new Map(((produits ?? []) as Array<{ id: string; nom: string }>).map((p) => [p.id, p.nom]));
  const ordreNom = [...nomParId.keys()];
  const lignesCatalogue = (
    (catalogue ?? []) as Array<{
      product_id: string;
      prix_vente_directe_centimes: number;
      prix_revendeur_centimes: number;
      prix_boutique_centimes: number | null;
      cree_le: string | null;
    }>
  ).sort((a, b) => ordreNom.indexOf(a.product_id) - ordreNom.indexOf(b.product_id));
  const boutiqueOuverte = ((boutiques ?? []) as Array<{ mois_ouverture: number }>).some(
    (b) => Number(b.mois_ouverture) <= moisCourant,
  );

  const lignes = lignesStock({
    ...temps,
    produits: lignesCatalogue.map((c) => ({
      id: c.product_id,
      nom: nomParId.get(c.product_id) ?? c.product_id,
      prixDirect: Number(c.prix_vente_directe_centimes ?? 0),
      prixRevendeur: Number(c.prix_revendeur_centimes ?? 0),
      prixBoutique: c.prix_boutique_centimes == null ? null : Number(c.prix_boutique_centimes),
      pasDebutVente: pasDepuisInstant(c.cree_le),
    })),
    stockAtelier: somme(
      ((stocks ?? []) as Array<{ product_id: string; quantite_pieces: number }>).map((s) => ({
        product_id: s.product_id,
        q: Number(s.quantite_pieces),
      })),
    ),
    stockBoutique: somme(
      ((stocksBoutique ?? []) as Array<{ product_id: string; quantite_pieces: number }>).map((s) => ({
        product_id: s.product_id,
        q: Number(s.quantite_pieces),
      })),
    ),
    enRoute: somme(
      ((ordres ?? []) as Array<{ product_id: string; quantite: number }>).map((o) => ({
        product_id: o.product_id,
        q: Number(o.quantite),
      })),
    ),
    boutiqueOuverte,
    mouvements: mouvementsDeVente(ventes, config.pasParMois),
    pasCourant,
    seuilJours,
  });

  return { lignes, temps, seuilJours, boutiqueOuverte };
}
