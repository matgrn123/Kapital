import { describe, expect, it } from "vitest";
import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import { equilibreEcriture } from "../../../components/ui/calculs";
import {
  lirePrixBoutique,
  margeMoyenneParPiece,
  offresEmplacements,
  piecesPourCouvrir,
  ventesBoutiqueDuMois,
} from "./donnees";

const PARAMS = chargerParametresV1();
const CATALOGUE = chargerBatimentsV1();

describe("offres d'emplacements (écran Magasin)", () => {
  // Signature simulée le jeudi 26 novembre 2026 à 10 h 21, heure de Paris.
  const NOVEMBRE_2026 = 2026 * 12 + 10;
  const MAINTENANT = Date.UTC(2026, 10, 26, 9, 21);
  const offres = offresEmplacements({
    catalogue: CATALOGUE,
    params: PARAMS,
    mois: NOVEMBRE_2026,
    instantMs: MAINTENANT,
    tresorerie: 3_000_000,
    margeParPiece: 2_000,
  });

  it("une offre par emplacement boutique du catalogue, chiffres du moteur", () => {
    const boutiques = CATALOGUE.filter((b) => b.categorie === "boutique");
    expect(offres.map((o) => o.apercu.batimentId)).toEqual(boutiques.map((b) => b.id));
    const quartier = offres.find((o) => o.apercu.batimentId === "boutique_quartier_createurs")!;
    // Dépôt = 3 mois de loyer (paramètre), travaux = surface × coût au m² (paramètre).
    expect(quartier.apercu.depotGarantie).toBe(76_500 * PARAMS["boutique_depot_garantie_mois_de_loyer"]!.valeur);
    expect(quartier.apercu.travaux).toBe(45 * PARAMS["boutique_travaux_amenagement_centimes_par_m2"]!.valeur);
    // T3 : 24 h de travaux (paramètre) : ouverture le lendemain à la même heure, en novembre.
    expect(quartier.apercu.dureeTravauxHeures).toBe(PARAMS["boutique_travaux_duree_heures"]!.valeur);
    expect(quartier.apercu.ouvertureMs).toBe(MAINTENANT + PARAMS["boutique_travaux_duree_heures"]!.valeur * 3_600_000);
    expect(quartier.apercu.moisOuverture).toBe(NOVEMBRE_2026);
  });

  it("l'écriture de signature est équilibrée et sort dépôt + travaux de la banque", () => {
    for (const o of offres) {
      for (const e of o.ecritures) expect(equilibreEcriture(e.lignes).equilibree).toBe(true);
      const sorties = o.ecritures.flatMap((e) => e.lignes).filter((l) => l.compte === "512").reduce((s, l) => s + (l.credit ?? 0), 0);
      expect(sorties).toBe(o.apercu.totalALaSignature);
    }
  });

  it("point mort : charges fixes avec un vendeur ÷ marge par pièce, à la pièce supérieure", () => {
    for (const o of offres) {
      expect(o.piecesPointMort).toBe(Math.ceil(o.apercu.chargesFixesMensuellesAvecUnVendeur / 2_000));
    }
  });
});

describe("piecesPourCouvrir", () => {
  it("null sans marge positive", () => {
    expect(piecesPourCouvrir(100_000, null)).toBeNull();
    expect(piecesPourCouvrir(100_000, 0)).toBeNull();
    expect(piecesPourCouvrir(100_000, -5)).toBeNull();
    expect(piecesPourCouvrir(100_001, 1_000)).toBe(101);
  });
});

describe("margeMoyenneParPiece", () => {
  it("prix HT − coût moyen, pondéré par les pièces", () => {
    // 60 € TTC à 20 % = 50 € HT ; coût 20 € → 30 € ; 120 € TTC = 100 € HT ; coût 40 € → 60 €.
    const m = margeMoyenneParPiece(
      [
        { prixBoutiqueTtc: 6_000, pieces: 3, valeur: 6_000 },
        { prixBoutiqueTtc: 12_000, pieces: 1, valeur: 4_000 },
      ],
      0.2,
    );
    expect(m).toBe(Math.floor((3_000 * 3 + 6_000) / 4));
  });
  it("null sans stock", () => {
    expect(margeMoyenneParPiece([{ prixBoutiqueTtc: 6_000, pieces: 0, valeur: 0 }], 0.2)).toBeNull();
  });
});

describe("ventesBoutiqueDuMois", () => {
  const l = (ecriture_id: string, mois: number, compte: string, sens: "debit" | "credit", montant: number, libelle: string) => ({
    ecriture_id,
    mois_jeu: mois,
    compte,
    sens,
    montant_centimes: montant,
    libelle,
  });
  it("compte les pièces une fois par écriture et le chiffre d'affaires HT du 707", () => {
    const lignes = [
      l("vente_5_e_tshirt_boutique", 5, "512", "debit", 12_000, "Vente boutique 2 tshirt"),
      l("vente_5_e_tshirt_boutique", 5, "707", "credit", 10_000, "Vente boutique 2 tshirt"),
      l("vente_5_e_tshirt_boutique", 5, "44571", "credit", 2_000, "Vente boutique 2 tshirt"),
      l("vente_5_e_tshirt", 5, "707", "credit", 99_000, "Vente directe 30 tshirt"),
      l("vente_4_e_tshirt_boutique", 4, "707", "credit", 5_000, "Vente boutique 1 tshirt"),
    ];
    expect(ventesBoutiqueDuMois(lignes, 5)).toEqual({ pieces: 2, chiffreAffairesHt: 10_000 });
  });
});

describe("lirePrixBoutique", () => {
  it("accepte un entier de centimes positif, ou null pour reprendre le prix en ligne", () => {
    expect(lirePrixBoutique(4_500)).toEqual({ ok: true, valeur: 4_500 });
    expect(lirePrixBoutique(null)).toEqual({ ok: true, valeur: null });
    expect(lirePrixBoutique(0).ok).toBe(false);
    expect(lirePrixBoutique(12.5).ok).toBe(false);
    expect(lirePrixBoutique("45").ok).toBe(false);
  });
});
