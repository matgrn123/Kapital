import { chargerParametresV1, type Parametres } from "@kapital/content";
import {
  centimes,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  idSalarie,
  moisJeu,
  type Entreprise,
} from "@kapital/engine";
import { describe, expect, it } from "vitest";
import { avancerMondeJusquA } from "../avance/orchestrateur.js";
import { StockageMemoire } from "../avance/stockageMemoire.js";
import { avancerLeTemps, type ContexteAction } from "./avancerLeTemps.js";
import { JournalAuditMemoire } from "./journalMemoire.js";
import { ErreurAdmin } from "./port.js";

const MIN = 60_000;
const JOUR_REEL = 24 * 60 * MIN;
const DEBUT = Date.UTC(2026, 10, 1, 8, 0, 0);
const MAINTENANT = DEBUT + 3 * JOUR_REEL;

const PARAMS: Parametres = (() => {
  const p = chargerParametresV1();
  return { ...p, taille_marche_mois_milieu: { ...p["taille_marche_mois_milieu"]!, valeur: 1500 } };
})();

const OK: ContexteAction = {
  modeRecette: true,
  codeAttendu: "code-secret",
  codeSaisi: "code-secret",
  acteur: "profil-admin",
};

function monde(debutReelMs: number | null = DEBUT): StockageMemoire {
  return new StockageMemoire({ id: "monde1", moisCourant: 0, debutReelMs });
}

async function refus(promesse: Promise<unknown>): Promise<ErreurAdmin> {
  try {
    await promesse;
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurAdmin);
    return e as ErreurAdmin;
  }
  throw new Error("aucun refus : l'action aurait dû être refusée");
}

describe("avancerLeTemps — calcul", () => {
  it("avancer d'un mois de jeu décale la création du monde de 1 440 minutes réelles", async () => {
    const s = monde();
    const r = await avancerLeTemps(s, new JournalAuditMemoire(), PARAMS, "mois", OK);
    expect(r.decalageMs).toBe(1440 * MIN);
    expect(s.monde.debutReelMs).toBe(DEBUT - 1440 * MIN);
  });

  it("une semaine de jeu = 7/30 de mois, un jour de jeu = 1/30 de mois", async () => {
    const semaine = monde();
    await avancerLeTemps(semaine, new JournalAuditMemoire(), PARAMS, "semaine", OK);
    expect(DEBUT - semaine.monde.debutReelMs!).toBe(336 * MIN); // 7/30 de 1 440 minutes

    const jour = monde();
    await avancerLeTemps(jour, new JournalAuditMemoire(), PARAMS, "jour", OK);
    expect(DEBUT - jour.monde.debutReelMs!).toBe(48 * MIN); // 1/30 de 1 440 minutes
  });

  it("les avances se cumulent", async () => {
    const s = monde();
    const audit = new JournalAuditMemoire();
    await avancerLeTemps(s, audit, PARAMS, "mois", OK);
    await avancerLeTemps(s, audit, PARAMS, "mois", OK);
    expect(DEBUT - s.monde.debutReelMs!).toBe(2 * 1440 * MIN);
  });
});

describe("avancerLeTemps — verrous", () => {
  it("refuse hors du mode recette, sans rien modifier", async () => {
    const s = monde();
    const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), PARAMS, "jour", { ...OK, modeRecette: false }));
    expect(e.statut).toBe(403);
    expect(s.monde.debutReelMs).toBe(DEBUT);
  });

  it("refuse tant qu'aucun code admin n'est configuré", async () => {
    for (const codeAttendu of [undefined, ""]) {
      const s = monde();
      const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), PARAMS, "jour", { ...OK, codeAttendu }));
      expect(e.statut).toBe(403);
      expect(e.message).toMatch(/non configuré/);
      expect(s.monde.debutReelMs).toBe(DEBUT);
    }
  });

  it("refuse un mauvais code ou un code absent, et garde une trace du refus", async () => {
    for (const codeSaisi of ["faux", "", undefined, "code-secret "]) {
      const s = monde();
      const audit = new JournalAuditMemoire();
      const e = await refus(avancerLeTemps(s, audit, PARAMS, "jour", { ...OK, codeSaisi }));
      expect(e.statut).toBe(403);
      expect(s.monde.debutReelMs).toBe(DEBUT);
      expect(audit.entrees.map((x) => x.action)).toEqual(["admin.avancer_temps.refuse"]);
    }
  });

  it("refuse une durée qui n'est pas dans la liste", async () => {
    for (const duree of ["an", "10", "", "__proto__", "constructor"]) {
      const s = monde();
      const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), PARAMS, duree, OK));
      expect(e.statut).toBe(400);
      expect(s.monde.debutReelMs).toBe(DEBUT);
    }
  });

  it("refuse tant que l'horloge commune n'est pas initialisée", async () => {
    const s = monde(null);
    const e = await refus(avancerLeTemps(s, new JournalAuditMemoire(), PARAMS, "jour", OK));
    expect(e.statut).toBe(409);
    expect(e.message).toMatch(/Mettre le monde à jour/);
  });
});

describe("avancerLeTemps — journal d'audit", () => {
  it("garde une trace de chaque avance réussie : qui, quoi, de combien", async () => {
    const audit = new JournalAuditMemoire();
    await avancerLeTemps(monde(), audit, PARAMS, "semaine", OK);
    expect(audit.entrees).toHaveLength(1);
    expect(audit.entrees[0]).toMatchObject({
      profileId: "profil-admin",
      action: "admin.avancer_temps",
      cible: "monde1",
      details: { duree: "semaine", debutReelApresMs: expect.any(Number) },
    });
    // jamais le code, ni saisi ni attendu
    expect(JSON.stringify(audit.entrees)).not.toContain("code-secret");
  });
});

describe("avancerLeTemps — effet sur les entreprises", () => {
  const e: Entreprise = {
    id: idEntreprise("a"),
    nom: "A",
    gamme: "milieu",
    etape: 1,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(5_000_000),
    stocksMatiere: [{ matiere: idMatiere("mat_coton"), quantite: 1000, valeurTotale: centimes(1_500_000) }],
    stocksFinis: [{ produit: idProduit("prod_tshirt"), quantite: 2000, valeurTotale: centimes(3_000_000) }],
    salaries: [{ id: idSalarie("s1"), poste: "artisan", salaireBrutMensuel: centimes(186702), ancienneteMois: 6, experienceMois: 6 }],
    atelier: { surfaceM2: 150, loyerMensuel: centimes(250_000), nombreMachines: 2 },
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [{ id: idPret("p1"), capitalInitial: centimes(1_000_000), capitalRestant: centimes(1_000_000), tauxAnnuel: 0.04, dureeTotaleMois: 24, moisDebut: moisJeu(0) }],
    catalogue: [{ produit: idProduit("prod_tshirt"), qualiteVisee: 60, prix: { vente_directe: centimes(3000), revendeur: centimes(1800) }, productionMensuelleCible: 60 }],
  };

  it("après avoir avancé d'un mois, la mise à jour fait rattraper un mois aux entreprises", async () => {
    const s = monde();
    s.ajouterEntreprise(e, 0);
    // Le monde est à 3 jours réels (3 mois de jeu), les entreprises à jour
    await avancerMondeJusquA(s, PARAMS, MAINTENANT);
    const pasAvant = s.entreprises.get("a")!.pasTraites!;
    expect(pasAvant).toBe(3 * 1440);

    await avancerLeTemps(s, new JournalAuditMemoire(), PARAMS, "mois", OK);
    await avancerMondeJusquA(s, PARAMS, MAINTENANT);

    expect(s.entreprises.get("a")!.pasTraites).toBe(4 * 1440);
    expect(s.ecrituresDe("a").map((x) => x.id)).toContain("salaire_4_s1");
    expect(s.monde.moisCourant).toBe(4);
  });
});
