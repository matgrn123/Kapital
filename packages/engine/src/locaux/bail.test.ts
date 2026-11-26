import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import { describe, expect, it } from "vitest";
import { enEquilibre, enregistrer, planComptableV1, soldeCompte } from "../comptabilite/index.js";
import { centimes, moisJeu } from "../types/primitifs.js";
import {
  ErreurBail,
  bailTermineAu,
  depotDeGarantie,
  donnerConge,
  ecritureRestitutionDepot,
  ecritureSignatureBail,
  ecrituresMensuellesBail,
  nouveauBail,
  parametresBailDepuis,
} from "./bail.js";

const PARAMS = chargerParametresV1();
const PETIT = chargerBatimentsV1().find((b) => b.id === "petit_atelier")!;

describe("paramètres du bail", () => {
  it("lit le dépôt (en mois de loyer) et le préavis dans les paramètres sourcés", () => {
    const p = parametresBailDepuis(PARAMS);
    expect(p.depotMoisDeLoyer).toBe(1);
    // Horloge réelle (T3) : préavis d'un mois, sortie à la fin du mois qui suit le congé.
    expect(p.preavisMois).toBe(1);
    expect(p.machinesALaSignature).toBe(2);
  });

  it("le dépôt du petit atelier est de 2 500 € (plan d'architecture §3), les charges de 1 050 €", () => {
    expect(depotDeGarantie(centimes(PETIT.loyer_mensuel_centimes), parametresBailDepuis(PARAMS))).toBe(250_000);
    expect(PETIT.charges_mensuelles_centimes).toBe(105_000);
  });
});

describe("signature du bail", () => {
  it("verse le dépôt : 275 au débit, banque au crédit, écriture équilibrée", () => {
    const bail = nouveauBail({
      loyerMensuel: centimes(250_000),
      chargesMensuelles: centimes(105_000),
      moisSignature: moisJeu(3),
      params: PARAMS,
    });
    expect(bail.depotGarantie).toBe(250_000);
    const ec = ecritureSignatureBail("ent_1", moisJeu(3), bail);
    expect(ec.lignes).toEqual([
      { compte: "275", sens: "debit", montant: 250_000 },
      { compte: "512", sens: "credit", montant: 250_000 },
    ]);
    const gl = enregistrer(planComptableV1(), ec);
    expect(soldeCompte(gl, "275")).toBe(250_000);
    expect(soldeCompte(gl, "512")).toBe(-250_000);
    expect(enEquilibre(gl)).toBe(true);
  });
});

describe("loyer et charges de fin de mois", () => {
  it("passe le loyer en 613 et les charges en 614, payés par la banque", () => {
    const ecs = ecrituresMensuellesBail("ent_1", moisJeu(4), centimes(250_000), centimes(105_000));
    expect(ecs.map((e) => e.lignes[0])).toEqual([
      { compte: "613", sens: "debit", montant: 250_000 },
      { compte: "614", sens: "debit", montant: 105_000 },
    ]);
    let gl = planComptableV1();
    for (const e of ecs) gl = enregistrer(gl, e);
    expect(soldeCompte(gl, "512")).toBe(-355_000);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("sans charges, aucune écriture de charges (un montant nul est refusé par le grand livre)", () => {
    const ecs = ecrituresMensuellesBail("ent_1", moisJeu(4), centimes(100_000), centimes(0));
    expect(ecs).toHaveLength(1);
  });
});

describe("congé et fin de bail", () => {
  const bail = nouveauBail({
    loyerMensuel: centimes(250_000),
    chargesMensuelles: centimes(105_000),
    moisSignature: moisJeu(1),
    params: PARAMS,
  });

  it("le congé donné en novembre 2026 avec 1 mois de préavis rend le local fin décembre 2026", () => {
    const novembre = moisJeu(2026 * 12 + 10);
    const apres = donnerConge(bail, novembre, parametresBailDepuis(PARAMS).preavisMois);
    // Dernier mois du bail : décembre (dernier loyer payé et dépôt rendu à sa clôture).
    expect(apres.moisFin).toBe(novembre + 1);
    expect(bailTermineAu(apres, novembre)).toBe(false);
    expect(bailTermineAu(apres, moisJeu(novembre + 1))).toBe(true);
  });

  it("un préavis plus long (paramètre) recule d'autant la fin du bail", () => {
    const apres = donnerConge(bail, moisJeu(10), 6);
    expect(apres.moisFin).toBe(16);
  });

  it("un bail sans congé ne se termine jamais", () => {
    expect(bailTermineAu(bail, moisJeu(500))).toBe(false);
  });

  it("refuse un second congé", () => {
    const apres = donnerConge(bail, moisJeu(10), 6);
    expect(() => donnerConge(apres, moisJeu(11), 6)).toThrow(ErreurBail);
  });

  it("restitue le dépôt : banque au débit, 275 au crédit, et le compte 275 revient à zéro", () => {
    let gl = planComptableV1();
    gl = enregistrer(gl, ecritureSignatureBail("ent_1", moisJeu(1), bail));
    const rest = ecritureRestitutionDepot("ent_1", moisJeu(16), bail);
    expect(rest?.lignes).toEqual([
      { compte: "512", sens: "debit", montant: 250_000 },
      { compte: "275", sens: "credit", montant: 250_000 },
    ]);
    gl = enregistrer(gl, rest!);
    expect(soldeCompte(gl, "275")).toBe(0);
    expect(soldeCompte(gl, "512")).toBe(0);
    expect(enEquilibre(gl)).toBe(true);
  });

  it("sans dépôt (ancien atelier), rien à restituer", () => {
    expect(ecritureRestitutionDepot("ent_1", moisJeu(2), { ...bail, depotGarantie: centimes(0) })).toBeNull();
  });
});
