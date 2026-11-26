import { chargerBatimentsV1, chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1, soldeCompte, type EcritureComptable } from "../comptabilite/index.js";
import { postesALaSignature, postesEquipesAteliers } from "../atelier/effetsPlan.js";
import { acheterLocal } from "../locaux/achat.js";
import { ecritureSignatureBail, nouveauBail } from "../locaux/bail.js";
import { chargesFixesMensuelles, parametresIndicateursDepuis } from "../indicateurs/indicateurs.js";
import type { Atelier, Entreprise, Salarie } from "../types/entreprise.js";
import { centimes, idEntreprise, idMatiere, idPret, idProduit, idSalarie, moisJeu } from "../types/primitifs.js";
import { cloturerMois } from "./cloture.js";
import { cumulVide } from "./donneesMois.js";
import { planProductionDuMois } from "./flux.js";
import { debutDuMoisMs, indexDuMois } from "./temps.js";

// 3D-7 : plusieurs locaux par société. Chaque local paie son loyer (ou son amortissement), la
// capacité est la somme des postes posés, et la fin d'un bail ne libère que ce local.

const PARAMS = chargerParametresV1();
const MODULES = chargerModulesV1();
const PETIT = chargerBatimentsV1().find((b) => b.id === "petit_atelier")!;
const FIN = { tvaAPayerCeMois: centimes(0), moisDecouvertConsecutifs: 0 };
const ENT = "ent_multi";

function salarie(id: string): Salarie {
  return { id: idSalarie(id), poste: "artisan", salaireBrutMensuel: centimes(200_000), ancienneteMois: 12, experienceMois: 12 };
}

function entreprise(ateliers: readonly Atelier[], o: Partial<Entreprise> = {}): Entreprise {
  return {
    id: idEntreprise(ENT),
    nom: "Multi SAS",
    gamme: "milieu",
    etape: 2,
    proprietaire: { type: "pnj" },
    statut: "active",
    tresorerie: centimes(50_000_000),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    ateliers,
    marque: { notoriete: 50, desirabilite: 50 },
    prets: [],
    catalogue: [],
    ...o,
  };
}

function cloturer(e: Entreprise, mois: number) {
  return cloturerMois(e, cumulVide(moisJeu(mois), e.tresorerie), FIN, PARAMS, moisJeu(mois));
}

function grandLivre(ecritures: readonly EcritureComptable[]) {
  return ecritures.reduce(enregistrer, planComptableV1());
}

const bailA = nouveauBail({
  loyerMensuel: centimes(PETIT.loyer_mensuel_centimes),
  chargesMensuelles: centimes(PETIT.charges_mensuelles_centimes),
  moisSignature: moisJeu(0),
  params: PARAMS,
});

function localLoue(id: string | undefined, postes = 2): Atelier {
  return {
    ...(id === undefined ? {} : { id }),
    surfaceM2: PETIT.surface_m2,
    loyerMensuel: centimes(PETIT.loyer_mensuel_centimes),
    modules: postesALaSignature(postes, MODULES),
    bail: bailA,
  };
}

describe("3D-7 : non-régression avec un seul local", () => {
  it("un local sans identifiant donne exactement les écritures d'avant (identifiants compris)", () => {
    const r = cloturer(entreprise([localLoue(undefined)]), 5);
    const ids = r.ecritures.map((e) => e.id);
    expect(ids).toContain(`loyer_5_${ENT}`);
    expect(ids).toContain(`charges_locatives_5_${ENT}`);
    expect(ids).toContain(`energie_5_${ENT}`);
  });

  it("le même local avec un identifiant donne les mêmes comptes et montants", () => {
    const sans = cloturer(entreprise([localLoue(undefined)]), 5);
    const avec = cloturer(entreprise([localLoue("w1")]), 5);
    const resume = (r: typeof sans) => r.ecritures.map((e) => ({ libelle: e.libelle, lignes: e.lignes }));
    expect(resume(avec)).toEqual(resume(sans));
    expect(avec.entrepriseApres.tresorerie).toBe(sans.entrepriseApres.tresorerie);
    expect(avec.ecritures.find((e) => e.id.startsWith("loyer_"))!.id).toBe(`loyer_5_${ENT}_w1`);
  });
});

describe("3D-7 : louer puis acheter un deuxième local", () => {
  // Local A loué (dépôt 275 / 512), local B acheté à crédit (512 / 164 puis 213 / 512).
  const signatureA = ecritureSignatureBail(ENT, moisJeu(0), bailA, "wA");
  const achatB = acheterLocal({
    idEntreprise: ENT,
    idLocal: "wB",
    mois: moisJeu(0),
    batiment: {
      id: PETIT.id,
      surfaceM2: PETIT.surface_m2,
      prixAchat: centimes(PETIT.prix_achat_centimes),
      chargesMensuelles: centimes(PETIT.charges_mensuelles_centimes),
    },
    tauxEstrAnnuel: 0.03,
    tresorerie: centimes(50_000_000 - bailA.depotGarantie),
    detteEnCours: centimes(0),
    params: PARAMS,
  });
  if (!achatB.ok) throw new Error(achatB.message);
  const localB: Atelier = {
    id: "wB",
    surfaceM2: PETIT.surface_m2,
    loyerMensuel: centimes(0),
    modules: postesALaSignature(2, MODULES),
    achat: achatB.achat,
  };
  const e = entreprise([localLoue("wA"), localB], {
    tresorerie: centimes(50_000_000 - bailA.depotGarantie - achatB.apport),
    prets: [
      {
        id: idPret("pret_b"),
        objet: "immobilier",
        capitalInitial: achatB.montantPret,
        capitalRestant: achatB.montantPret,
        tauxAnnuel: achatB.tauxAnnuel,
        dureeTotaleMois: achatB.dureePretMois,
        moisDebut: moisJeu(0),
      },
    ],
  });

  it("chaque local a ses écritures de signature ou d'achat, avec son identifiant", () => {
    expect(signatureA.id).toBe(`bail_signature_0_${ENT}_wA`);
    expect(achatB.ecritures.map((x) => x.id)).toEqual([`pret_achat_0_${ENT}_wB`, `achat_local_0_${ENT}_wB`]);
    const gl = grandLivre([signatureA, ...achatB.ecritures]);
    expect(soldeCompte(gl, "275")).toBe(bailA.depotGarantie);
    expect(soldeCompte(gl, "213")).toBe(PETIT.prix_achat_centimes);
    expect(soldeCompte(gl, "164")).toBe(achatB.montantPret);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("à la clôture : loyer 613 pour le local loué, entretien et amortissement 2813 pour le local acheté", () => {
    const r = cloturer(e, 1);
    const ids = r.ecritures.map((x) => x.id);
    expect(ids).toContain(`loyer_1_${ENT}_wA`);
    expect(ids).toContain(`charges_locatives_1_${ENT}_wA`);
    expect(ids).not.toContain(`loyer_1_${ENT}_wB`);
    expect(ids).toContain(`entretien_local_1_${ENT}_wB`);
    expect(ids).toContain(`amort_construction_1_${ENT}_wB`);
    expect(ids).toContain(`energie_1_${ENT}_wA`);
    expect(ids).toContain(`energie_1_${ENT}_wB`);
    expect(new Set(ids).size).toBe(ids.length);
    const gl = grandLivre([signatureA, ...achatB.ecritures, ...r.ecritures]);
    expect(soldeCompte(gl, "613")).toBe(PETIT.loyer_mensuel_centimes);
    expect(soldeCompte(gl, "614")).toBe(2 * PETIT.charges_mensuelles_centimes);
    expect(soldeCompte(gl, "2813")).toBe(r.ecritures.find((x) => x.id.startsWith("amort_construction_"))!.lignes[0]!.montant);
    expect(enEquilibre(gl)).toBe(true);
    expect(r.entrepriseApres.ateliers.map((a) => a.id)).toEqual(["wA", "wB"]);
  });

  it("l'énergie et les loyers sont ceux de deux locaux", () => {
    const seul = cloturer(entreprise([localLoue("wA")]), 1);
    const deux = cloturer(e, 1);
    const somme = (r: typeof seul, compte: string) => soldeCompte(grandLivre(r.ecritures), compte);
    expect(somme(deux, "606")).toBe(2 * somme(seul, "606"));
    expect(somme(deux, "613")).toBe(somme(seul, "613"));
  });

  it("indicateurs : les charges fixes additionnent les loyers des locaux", () => {
    const p = parametresIndicateursDepuis(PARAMS);
    const deuxLoues = entreprise([localLoue("wA"), localLoue("wC")]);
    expect(chargesFixesMensuelles(deuxLoues, moisJeu(1), p).loyer).toBe(2 * PETIT.loyer_mensuel_centimes);
  });
});

describe("3D-7 : donner congé à un local ne touche pas l'autre", () => {
  it("au mois de fin : dépôt du seul local A restitué, local B conservé", () => {
    const a: Atelier = { ...localLoue("wA"), bail: { ...bailA, moisFin: moisJeu(3) } };
    const b = localLoue("wB");
    const e = entreprise([a, b]);
    const avant = cloturer(e, 2);
    expect(avant.entrepriseApres.ateliers).toHaveLength(2);
    const r = cloturer(e, 3);
    const restitutions = r.ecritures.filter((x) => x.id.startsWith("bail_restitution_"));
    expect(restitutions.map((x) => x.id)).toEqual([`bail_restitution_3_${ENT}_wA`]);
    expect(r.entrepriseApres.ateliers.map((x) => x.id)).toEqual(["wB"]);
    // Les deux loyers du dernier mois sont payés.
    expect(soldeCompte(grandLivre(r.ecritures), "613")).toBe(2 * PETIT.loyer_mensuel_centimes);
    // Dépôts : 2 versés, 1 restitué.
    const gl = grandLivre([
      ecritureSignatureBail(ENT, moisJeu(0), bailA, "wA"),
      ecritureSignatureBail(ENT, moisJeu(0), bailA, "wB"),
      ...r.ecritures,
    ]);
    expect(soldeCompte(gl, "275")).toBe(bailA.depotGarantie);
    expect(enEquilibre(gl)).toBe(true);
  });
});

describe("3D-7 : la capacité de production additionne les postes de tous les locaux", () => {
  const catalogue = [
    {
      produit: idProduit("prod_tshirt"),
      qualiteVisee: 3,
      prix: { vente_directe: centimes(3000), revendeur: centimes(2000) },
      productionMensuelleCible: 10_000,
      fabrication: {
        matiere: idMatiere("mat_jersey_coton"),
        consommationParPiece: 0.8,
        fournituresParPiece: centimes(60),
        tempsStandardMinutes: 30,
      },
    },
  ];
  const equipe = [salarie("a"), salarie("b"), salarie("c"), salarie("d")];
  const total = (e: Entreprise) => planProductionDuMois(e, PARAMS, debutDuMoisMs(indexDuMois(2026, 11))).reduce((s, l) => s + l.pieces, 0);

  it("2 locaux de 2 postes = 1 local de 4 postes ; plus qu'un seul local de 2 postes", () => {
    const deuxLocaux = entreprise([localLoue("wA", 2), localLoue("wB", 2)], { salaries: equipe, catalogue });
    const unGrand = entreprise([localLoue("wA", 4)], { salaries: equipe, catalogue });
    const unPetit = entreprise([localLoue("wA", 2)], { salaries: equipe, catalogue });
    expect(postesEquipesAteliers(deuxLocaux.ateliers)).toBe(4);
    expect(total(deuxLocaux)).toBe(total(unGrand));
    expect(total(deuxLocaux)).toBeGreaterThan(total(unPetit));
  });
});

describe("3D-7 : identifiants des locaux", () => {
  it("plusieurs locaux sans identifiant sont refusés (écritures en double)", () => {
    expect(() => cloturer(entreprise([localLoue(undefined), localLoue(undefined)]), 1)).toThrow(/identifiant/);
    expect(() => cloturer(entreprise([localLoue("w"), localLoue("w")]), 1)).toThrow(/même identifiant/);
  });
});
