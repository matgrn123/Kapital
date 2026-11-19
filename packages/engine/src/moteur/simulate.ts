import type { Parametres } from "@kapital/content";
import {
  coefficientsMarketingDepuisParametres,
  moisDeMarque,
  type DepenseMarketing,
} from "../marketing/index.js";
import type { DecisionsEntreprise } from "../types/decision.js";
import type { Entreprise } from "../types/entreprise.js";
import type { MarketInputs } from "../types/marketInputs.js";
import type { Monde } from "../types/monde.js";
import {
  centimes,
  moisJeu,
  type Graine,
  type IdEntreprise,
} from "../types/primitifs.js";
import type { ResultatMoisEntreprise } from "../types/resultatMois.js";
import { creerRng, type Rng } from "./rng.js";

export type EntreesSimulateMonth = {
  readonly monde: Monde;
  readonly decisions: readonly DecisionsEntreprise[];
  readonly marketInputs: MarketInputs;
  readonly params: Parametres;
  readonly graine: Graine;
};

export type ResultatSimulation = {
  readonly nouveauMonde: Monde;
  readonly resultatsParEntreprise: readonly ResultatMoisEntreprise[];
};

function decisionsParIdEntreprise(
  decisions: readonly DecisionsEntreprise[],
): ReadonlyMap<IdEntreprise, DecisionsEntreprise> {
  const m = new Map<IdEntreprise, DecisionsEntreprise>();
  for (const d of decisions) m.set(d.entreprise, d);
  return m;
}

function depensesMarketing(
  dec: DecisionsEntreprise | undefined,
): readonly DepenseMarketing[] {
  if (!dec) return [];
  const out: DepenseMarketing[] = [];
  for (const d of dec.decisions) {
    if (d.type === "action_marketing") {
      out.push({ action: d.action, montant: d.montant });
    }
  }
  return out;
}

function appliquerMarqueMensuelle(
  entreprises: readonly Entreprise[],
  decisionsPar: ReadonlyMap<IdEntreprise, DecisionsEntreprise>,
  params: Parametres,
): readonly Entreprise[] {
  const coeffs = coefficientsMarketingDepuisParametres(params);
  return entreprises.map((ent) => {
    const dec = decisionsPar.get(ent.id);
    const depenses = depensesMarketing(dec);
    const nouvelleMarque = moisDeMarque(ent.marque, depenses, coeffs);
    return { ...ent, marque: nouvelleMarque };
  });
}

function construireResultats(
  entreprisesAvant: readonly Entreprise[],
  entreprisesApres: readonly Entreprise[],
  moisCourant: number,
): readonly ResultatMoisEntreprise[] {
  return entreprisesApres.map((ent, i): ResultatMoisEntreprise => {
    const avant = entreprisesAvant[i]!;
    const deltaNoto = ent.marque.notoriete - avant.marque.notoriete;
    const deltaDesi = ent.marque.desirabilite - avant.marque.desirabilite;
    return {
      entreprise: ent.id,
      mois: moisJeu(moisCourant),
      chiffreAffaires: centimes(0),
      margeBrute: centimes(0),
      resultatNet: centimes(0),
      tresorerieFin: ent.tresorerie,
      explications: [
        {
          cle: "marque_notoriete",
          message: `Notoriété : ${avant.marque.notoriete.toFixed(1)} → ${ent.marque.notoriete.toFixed(1)} (${deltaNoto >= 0 ? "+" : ""}${deltaNoto.toFixed(1)})`,
        },
        {
          cle: "marque_desirabilite",
          message: `Désirabilité : ${avant.marque.desirabilite.toFixed(1)} → ${ent.marque.desirabilite.toFixed(1)} (${deltaDesi >= 0 ? "+" : ""}${deltaDesi.toFixed(1)})`,
        },
      ],
    };
  });
}

export function simulateMonth(e: EntreesSimulateMonth): ResultatSimulation {
  // Le RNG est préparé pour les futurs étages (PNJ en T14, retours stochastiques, etc.)
  // Il n'est pas utilisé ici mais sa création est déterministe.
  const rng: Rng = creerRng(e.graine);
  void rng;

  const decMap = decisionsParIdEntreprise(e.decisions);
  const entreprisesAvant = e.monde.entreprises;
  const entreprisesApres = appliquerMarqueMensuelle(
    entreprisesAvant,
    decMap,
    e.params,
  );

  const nouveauMonde: Monde = {
    ...e.monde,
    moisCourant: moisJeu(e.monde.moisCourant + 1),
    entreprises: entreprisesApres,
  };

  const resultats = construireResultats(
    entreprisesAvant,
    entreprisesApres,
    e.monde.moisCourant,
  );

  return {
    nouveauMonde,
    resultatsParEntreprise: resultats,
  };
}
