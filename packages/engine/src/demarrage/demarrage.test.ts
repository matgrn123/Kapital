import { chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1 } from "../comptabilite/index.js";
import { configTempsDepuis, indexDuMois, pasAbsoluDepuisInstantReel } from "../moteur/temps.js";
import { centimes, idProduit, moisJeu } from "../types/primitifs.js";
import {
  commanderAuGrossiste,
  delaiGrossisteMinutes,
  ErreurDemarrage,
  preparerSerieLancement,
  prixGrossiste,
  quantiteSerieLancement,
} from "./index.js";

const PARAMS = chargerParametresV1();
const PRODUIT = idProduit("prod_tshirt");
const COUT_USINE = centimes(1_150);

describe("série de lancement", () => {
  it("la quantité vient des paramètres, jamais du code", () => {
    expect(quantiteSerieLancement(PARAMS)).toBe(PARAMS["serie_lancement_pieces"]!.valeur);
    expect(quantiteSerieLancement(PARAMS)).toBeGreaterThan(0);
  });

  it("entre dans le stock à son coût de revient et sort de la banque, bilan équilibré", () => {
    const s = preparerSerieLancement({
      params: PARAMS,
      produit: PRODUIT,
      coutUnitaire: COUT_USINE,
      mois: moisJeu(0),
    });
    const quantite = quantiteSerieLancement(PARAMS);
    expect(s.quantite).toBe(quantite);
    expect(s.valeurTotale).toBe(quantite * COUT_USINE);

    const gl = enregistrer(planComptableV1(), s.ecriture);
    expect(enEquilibre(gl)).toBe(true);
    const debit35 = s.ecriture.lignes.find((l) => l.compte === "35" && l.sens === "debit");
    const credit512 = s.ecriture.lignes.find((l) => l.compte === "512" && l.sens === "credit");
    expect(debit35?.montant).toBe(s.valeurTotale);
    expect(credit512?.montant).toBe(s.valeurTotale);
  });

  it("a un identifiant stable par produit (jamais comptée deux fois)", () => {
    const a = preparerSerieLancement({ params: PARAMS, produit: PRODUIT, coutUnitaire: COUT_USINE, mois: moisJeu(0) });
    const b = preparerSerieLancement({ params: PARAMS, produit: PRODUIT, coutUnitaire: COUT_USINE, mois: moisJeu(3) });
    expect(a.ecriture.id).toBe(b.ecriture.id);
    expect(a.ecriture.id).toContain("prod_tshirt");
  });

  it("refuse un coût de revient nul ou négatif", () => {
    expect(() =>
      preparerSerieLancement({ params: PARAMS, produit: PRODUIT, coutUnitaire: centimes(0), mois: moisJeu(0) }),
    ).toThrow(ErreurDemarrage);
  });
});

describe("grossiste local", () => {
  it("coûte plus cher que l'usine", () => {
    expect(prixGrossiste(COUT_USINE, PARAMS)).toBeGreaterThan(COUT_USINE);
  });

  it("livre en 30 minutes réelles : paramètre grossiste_delai_minutes, jamais en dur", () => {
    expect(delaiGrossisteMinutes(PARAMS)).toBe(PARAMS["grossiste_delai_minutes"]!.valeur);
    expect(delaiGrossisteMinutes(PARAMS)).toBe(30);
  });

  it("refuse un délai du grossiste négatif ou absent", () => {
    const sans = { ...PARAMS };
    delete sans["grossiste_delai_minutes"];
    expect(() => delaiGrossisteMinutes(sans)).toThrow(ErreurDemarrage);
    const negatif = { ...PARAMS, grossiste_delai_minutes: { ...PARAMS["grossiste_delai_minutes"]!, valeur: -1 } };
    expect(() => delaiGrossisteMinutes(negatif)).toThrow(ErreurDemarrage);
  });

  it("commande : total = quantité × prix, livraison 30 minutes plus tard", () => {
    const maintenantMs = Date.UTC(2026, 10, 24, 10, 0, 0);
    const c = commanderAuGrossiste({
      params: PARAMS,
      produit: PRODUIT,
      quantite: 50,
      coutUsineParPiece: COUT_USINE,
      instantCommandeMs: maintenantMs,
    });
    expect(c.prixParPiece).toBe(prixGrossiste(COUT_USINE, PARAMS));
    expect(c.total).toBe(50 * c.prixParPiece);
    expect(c.instantLivraisonMs - maintenantMs).toBe(30 * 60_000);
    expect(c.moisLivraison).toBe(indexDuMois(2026, 11));
  });

  it("commandé le 30 novembre à 23 h 45 (Paris) : livré le 1er décembre, mois de décembre", () => {
    const c = commanderAuGrossiste({
      params: PARAMS,
      produit: PRODUIT,
      quantite: 5,
      coutUsineParPiece: COUT_USINE,
      instantCommandeMs: Date.UTC(2026, 10, 30, 22, 45),
    });
    expect(c.moisLivraison).toBe(indexDuMois(2026, 12));
  });

  it("la livraison tombe au 30e pas d'une horloge à pas d'une minute", () => {
    const config = configTempsDepuis(PARAMS);
    const debutMs = Date.UTC(2026, 10, 1, 0, 0, 0);
    const commandeMs = debutMs + 100 * 60_000;
    const c = commanderAuGrossiste({
      params: PARAMS,
      produit: PRODUIT,
      quantite: 10,
      coutUsineParPiece: COUT_USINE,
      instantCommandeMs: commandeMs,
    });
    const pasCommande = pasAbsoluDepuisInstantReel(config, debutMs, commandeMs);
    const pasLivraison = pasAbsoluDepuisInstantReel(config, debutMs, c.instantLivraisonMs);
    expect(pasLivraison - pasCommande).toBe(30);
  });

  it("refuse une quantité nulle, négative ou non entière", () => {
    for (const quantite of [0, -5, 2.5]) {
      expect(() =>
        commanderAuGrossiste({
          params: PARAMS,
          produit: PRODUIT,
          quantite,
          coutUsineParPiece: COUT_USINE,
          instantCommandeMs: 0,
        }),
      ).toThrow(ErreurDemarrage);
    }
  });

  it("est rejouable à l'identique", () => {
    const entree = {
      params: PARAMS,
      produit: PRODUIT,
      quantite: 20,
      coutUsineParPiece: COUT_USINE,
      instantCommandeMs: 1_000_000,
    };
    expect(commanderAuGrossiste(entree)).toEqual(commanderAuGrossiste(entree));
  });
});
