import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { centimes } from "@kapital/engine";
import { verifierGardeFouMonetaire } from "./gardeFou.js";
import {
  ajouterProduit,
  avancerMois,
  commanderGrossiste,
  commanderMatiere,
  creerEntreprise,
  embaucher,
  poserModules,
  serieDeLancement,
  signerBail,
  type EtatBanc,
  type ResultatAction,
} from "./pilote.js";

const PARAMS = chargerParametresV1();

function ok(r: ResultatAction): EtatBanc {
  if (!r.ok) throw new Error(`refus inattendu : ${r.code} — ${r.message}`);
  return r.etat;
}

function depart(): EtatBanc {
  const e = creerEntreprise({ params: PARAMS, nom: "Test", gamme: "entree" });
  return ok(ajouterProduit(e, "prod_tshirt", 3500));
}

/** Force l'étape 2 (le scénario complet l'atteint en vendant ; ici on teste les décisions). */
function aEtape2(e: EtatBanc): EtatBanc {
  return { ...e, entreprise: { ...e.entreprise, etape: 2 } };
}

describe("pilote du banc : décisions", () => {
  it("création : le capital de départ en banque, égal au capital (AE-1)", () => {
    const e = depart();
    const capital = PARAMS["capital_depart_centimes"]!.valeur;
    expect(e.entreprise.tresorerie).toBe(capital);
    expect(e.entreprise.etape).toBe(0);
    expect(e.entreprise.atelier).toBeNull();
    expect(e.ecritures).toHaveLength(1);
  });

  it("série de lancement : stock et banque bougent ensemble, une seule fois", () => {
    const e = ok(serieDeLancement(depart(), "prod_tshirt"));
    const stock = e.entreprise.stocksFinis[0]!;
    expect(stock.quantite).toBe(PARAMS["serie_lancement_pieces"]!.valeur);
    expect(e.entreprise.tresorerie).toBe(PARAMS["capital_depart_centimes"]!.valeur - stock.valeurTotale);
    const r = serieDeLancement(e, "prod_tshirt");
    expect(r.ok).toBe(false);
  });

  it("bail et embauche sont verrouillés avant l'étape 2 (étape réelle)", () => {
    const e = depart();
    expect(signerBail(e, "petit_atelier")).toMatchObject({ ok: false, code: "etape_insuffisante" });
    expect(embaucher(e, "artisan", 200_000)).toMatchObject({ ok: false, code: "etape_insuffisante" });
  });

  it("bail : dépôt de garantie (275 / 512) et postes de départ posés", () => {
    const e = ok(signerBail(aEtape2(depart()), "petit_atelier"));
    expect(e.entreprise.atelier?.nombreMachines).toBe(PARAMS["bail_machines_a_la_signature"]!.valeur);
    expect(e.entreprise.atelier?.bail?.depotGarantie).toBe(250_000);
    expect(e.ecritures.at(-1)!.lignes.map((l) => l.compte)).toEqual(["275", "512"]);
  });

  it("poser un poste : achat au 2154 et un poste de plus", () => {
    const e = ok(poserModules(ok(signerBail(aEtape2(depart()), "petit_atelier")), "poste_couture_base", 1));
    expect(e.entreprise.atelier?.nombreMachines).toBe(3);
    expect(e.ecritures.at(-1)!.lignes[0]).toMatchObject({ compte: "2154", montant: 130_000 });
  });

  it("embauche : refusée sous le SMIC", () => {
    const r = embaucher(aEtape2(depart()), "artisan", 100_000);
    expect(r).toMatchObject({ ok: false, code: "salaire_sous_smic" });
  });

  it("grossiste : refusé au-delà de la trésorerie, livré dans le mois, payé le mois suivant", () => {
    const e = depart();
    expect(commanderGrossiste(e, "prod_tshirt", 100_000)).toMatchObject({ ok: false, code: "tresorerie_insuffisante" });
    // Prix à zéro : rien ne se vend, on suit seulement la livraison et la dette.
    const sansVente = { ...e, entreprise: { ...e.entreprise, catalogue: e.entreprise.catalogue.map((p) => ({ ...p, prix: { vente_directe: centimes(0), revendeur: centimes(0) } })) } };
    const m0 = avancerMois(ok(commanderGrossiste(sansVente, "prod_tshirt", 10)), 1);
    expect(m0.entreprise.stocksFinis[0]?.quantite).toBe(10);
    expect(m0.ecritures.some((x) => x.id.startsWith("reglement_"))).toBe(false);
    const m1 = avancerMois(m0, 2);
    expect(m1.ecritures.filter((x) => x.id.startsWith("reglement_faconnier_"))).toHaveLength(1);
    expect(m1.historique.every((b) => b.anomalies.length === 0)).toBe(true);
  });

  it("matière : livrée après le délai du fournisseur, réglée après le délai de paiement", () => {
    let e = ok(commanderMatiere(depart(), "four_fr", "mat_jersey_coton", 100));
    e = avancerMois(e, 1); // mois 0 : en route
    expect(e.entreprise.stocksMatiere).toHaveLength(0);
    e = avancerMois(e, 2); // mois 1 : livrée (31 / 401)
    expect(e.entreprise.stocksMatiere[0]?.quantite).toBe(100);
    expect(e.ecritures.some((x) => x.id.startsWith("reglement_matiere_"))).toBe(false);
    e = avancerMois(e, 3); // mois 2 : réglée (401 / 512)
    expect(e.ecritures.filter((x) => x.id.startsWith("reglement_matiere_"))).toHaveLength(1);
    for (const b of e.historique) expect(b.anomalies).toEqual([]);
  });

  it("le garde-fou de chaque clôture couvre aussi les décisions du mois", () => {
    const e = avancerMois(ok(serieDeLancement(depart(), "prod_tshirt")), 1);
    const toutes = verifierGardeFouMonetaire({
      ecrituresAvant: [],
      ecrituresPeriode: e.ecritures,
      entrepriseAvant: null,
      entrepriseApres: e.entreprise,
    });
    expect(toutes).toEqual(e.historique[0]!.anomalies);
  });
});
