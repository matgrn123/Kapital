import type { Parametres } from "@kapital/content";
import {
  centimes,
  configTempsDepuis,
  cumulDemarrantAuPas,
  debutDuPasEnMs,
  graine,
  moisJeu,
  pasAbsoluDepuisInstantReel,
  pasTerminesDepuis,
  positionDuPasAbsolu,
  simulerPas,
  type ConfigTemps,
  type CumulMois,
  type DonneesFinMois,
  type DonneesFlux,
  type EcritureComptable,
  type Entreprise,
  type MarketInputs,
} from "@kapital/engine";
import {
  ErreurPasDejaTraite,
  type EntrepriseDuMonde,
  type LivraisonsEnAttente,
  type ResultatLotAEnregistrer,
  type StockageMonde,
} from "./port.js";

const MS_PAR_MINUTE = 60_000;

export type OptionsAvance = {
  /**
   * Plafond de pas traités par entreprise et par appel : le reste est rattrapé
   * à l'appel suivant (par défaut 3 mois de jeu).
   */
  readonly maxPasParEntreprise?: number;
  /** Nombre d'entreprises traitées en parallèle (par défaut 5). */
  readonly concurrence?: number;
};

export type ResultatAvanceEntreprise = {
  readonly entreprise: string;
  readonly etat: "a_jour" | "avancee" | "demarree" | "deja_traite" | "erreur";
  readonly pasAvant: number | null;
  readonly pasApres: number | null;
  readonly erreur?: string;
};

export type ResultatAvanceMonde = {
  readonly mondeId: string;
  /** Pas que toutes les entreprises doivent avoir traités à cet instant. */
  readonly pasCible: number;
  readonly moisCourant: number;
  readonly horlogeInitialisee: boolean;
  readonly entreprises: readonly ResultatAvanceEntreprise[];
};

/**
 * Valeurs d'attente du marché : le moteur ne les utilise pas encore (branchement
 * des données réelles : ticket T18). Reprises telles quelles de l'ancienne clôture.
 */
function marketInputsPour(params: Parametres, mois: number): MarketInputs {
  return {
    mois: moisJeu(mois),
    smicHoraireBrut: centimes(params["smic_horaire_brut"]?.valeur ?? 1231),
    tauxEstrAnnuel: 0.0265,
    prixElectriciteParKwh: centimes(params["prix_electricite_pro"]?.valeur ?? 16),
    coursCotonParKg: centimes(500),
    inflationMensuelle: 0.003,
  };
}

async function enParallele<T, R>(
  elements: readonly T[],
  concurrence: number,
  travail: (element: T) => Promise<R>,
): Promise<R[]> {
  const resultats: R[] = new Array<R>(elements.length);
  let suivant = 0;
  async function ouvrier(): Promise<void> {
    for (;;) {
      const i = suivant++;
      if (i >= elements.length) return;
      resultats[i] = await travail(elements[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrence, elements.length)) }, ouvrier),
  );
  return resultats;
}

/**
 * Fait avancer tout le monde jusqu'à l'instant `maintenantMs` (fourni par le
 * serveur, jamais par le navigateur) : chaque entreprise traite les pas qui lui
 * manquent, absents compris. Idempotent : rappelé au même instant, il ne fait rien.
 */
export async function avancerMondeJusquA(
  stockage: StockageMonde,
  params: Parametres,
  maintenantMs: number,
  options: OptionsAvance = {},
): Promise<ResultatAvanceMonde> {
  const config = configTempsDepuis(params);
  const monde = await stockage.chargerMondeActif();
  if (!monde) throw new Error("Aucun monde actif");

  // Ancien monde (clôture mensuelle) : l'horloge est calée pour garder le mois courant.
  let debutReelMs = monde.debutReelMs;
  let horlogeInitialisee = false;
  if (debutReelMs === null) {
    debutReelMs = maintenantMs - monde.moisCourant * config.minutesReellesParMoisJeu * MS_PAR_MINUTE;
    await stockage.definirDebutReel(monde.id, debutReelMs);
    horlogeInitialisee = true;
  }

  const pasCible = pasTerminesDepuis(config, debutReelMs, maintenantMs);
  const maxPas = options.maxPasParEntreprise ?? 3 * config.pasParMois;
  const entreprises = await stockage.listerEntreprises(monde.id);

  const contexte: ContexteAvance = { stockage, params, config, debutReelMs, pasCible, maxPas };
  const resultats = await enParallele(entreprises, options.concurrence ?? 5, (e) =>
    avancerEntreprise(contexte, e),
  );

  const moisCible = positionDuPasAbsolu(config, pasCible).mois;
  if (moisCible !== monde.moisCourant) {
    await stockage.definirMoisCourant(monde.id, moisCible);
  }

  return {
    mondeId: monde.id,
    pasCible,
    moisCourant: moisCible,
    horlogeInitialisee,
    entreprises: resultats,
  };
}

type ContexteAvance = {
  readonly stockage: StockageMonde;
  readonly params: Parametres;
  readonly config: ConfigTemps;
  readonly debutReelMs: number;
  readonly pasCible: number;
  readonly maxPas: number;
};

async function avancerEntreprise(
  ctx: ContexteAvance,
  e: EntrepriseDuMonde,
): Promise<ResultatAvanceEntreprise> {
  const { stockage, config, pasCible, maxPas } = ctx;
  try {
    // Nouvelle entreprise : elle démarre maintenant, sans rejouer d'historique.
    if (e.pasTraites === null) {
      const position = positionDuPasAbsolu(config, pasCible);
      let cumul: CumulMois | null = null;
      if (position.indexDansMois > 0) {
        const etat = await stockage.chargerEtat(e.id, position.mois);
        cumul = cumulDemarrantAuPas(
          moisJeu(position.mois), // une écriture porte le mois de jeu où elle a lieu
          etat.entreprise.tresorerie,
          position.indexDansMois,
        );
      }
      await stockage.demarrerEntreprise(e.id, pasCible, cumul);
      return { entreprise: e.id, etat: "demarree", pasAvant: null, pasApres: pasCible };
    }

    let courant = e.pasTraites;
    const pasAvant = courant;
    let faits = 0;
    while (courant < pasCible && faits < maxPas) {
      const position = positionDuPasAbsolu(config, courant);
      // Un lot ne dépasse jamais la fin du mois : la clôture lit des données déjà enregistrées.
      const restantDansLeMois = config.pasParMois - position.indexDansMois;
      const nb = Math.min(pasCible - courant, restantDansLeMois, maxPas - faits);
      await traiterLot(ctx, e.id, courant, nb);
      courant += nb;
      faits += nb;
    }
    return {
      entreprise: e.id,
      etat: faits > 0 ? "avancee" : "a_jour",
      pasAvant,
      pasApres: courant,
    };
  } catch (erreur) {
    if (erreur instanceof ErreurPasDejaTraite) {
      return { entreprise: e.id, etat: "deja_traite", pasAvant: e.pasTraites, pasApres: null };
    }
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    console.error(`[avance] entreprise ${e.id} : ${message}`);
    return { entreprise: e.id, etat: "erreur", pasAvant: e.pasTraites, pasApres: null, erreur: message };
  }
}

/** Calcule `nb` pas consécutifs en mémoire, dans un même mois, puis les enregistre d'un bloc. */
async function traiterLot(
  ctx: ContexteAvance,
  companyId: string,
  premierPas: number,
  nb: number,
): Promise<void> {
  const { stockage, params, config, debutReelMs } = ctx;
  const position = positionDuPasAbsolu(config, premierPas);
  const moisEnCours = position.mois; // numéro du mois de jeu en cours, depuis 0
  // Une seule convention : toute écriture porte le mois de jeu où elle a lieu, celui de
  // worlds.mois_courant (compté depuis 0). Les écritures de clôture portent le mois qui se termine.
  const moisFin = moisJeu(moisEnCours);
  const indexDernier = position.indexDansMois + nb - 1;
  const cloture = indexDernier === config.pasParMois - 1;

  const etat = await stockage.chargerEtat(companyId, moisEnCours);
  let cumul = etat.cumul;
  if (cumul !== null && (cumul.mois !== moisFin || cumul.pasTraites !== position.indexDansMois)) {
    throw new Error(
      `État du mois incohérent pour ${companyId} : cumul du mois ${cumul.mois} à ${cumul.pasTraites} pas, attendu mois ${moisFin} à ${position.indexDansMois} pas.`,
    );
  }
  if (cumul === null && position.indexDansMois > 0) {
    throw new Error(
      `État du mois manquant pour ${companyId} au pas ${position.indexDansMois} du mois ${moisFin}.`,
    );
  }

  const finDuLotMs = debutDuPasEnMs(config, debutReelMs, premierPas + nb);
  const livraisons: LivraisonsEnAttente = await stockage.chargerLivraisons(companyId, finDuLotMs);
  const creances =
    position.indexDansMois === 0 ? await stockage.chargerCreances(companyId, moisEnCours) : [];
  const donneesFin: DonneesFinMois | null = cloture
    ? await stockage.chargerFinDeMois(companyId, moisEnCours)
    : null;
  const marketInputs = marketInputsPour(params, moisFin);

  // Une livraison en retard est traitée au premier pas du lot.
  const pasDeLaLivraison = (instantMs: number): number =>
    Math.max(premierPas, pasAbsoluDepuisInstantReel(config, debutReelMs, instantMs));

  let entreprise: Entreprise = etat.entreprise;
  const ecritures: EcritureComptable[] = [];
  let moisDecouvertConsecutifs: number | null = null;

  for (let k = 0; k < nb; k++) {
    const pasAbsolu = premierPas + k;
    const index = position.indexDansMois + k;
    const flux: DonneesFlux = {
      livraisonsMatiere: livraisons.matiere.filter((l) => pasDeLaLivraison(l.instantMs) === pasAbsolu),
      livraisonsFaconniers: livraisons.faconniers.filter(
        (l) => pasDeLaLivraison(l.instantMs) === pasAbsolu,
      ),
      depensesMarketing: [], // le marketing s'enregistre à l'action du joueur
      creancesAEncaisser: index === 0 ? creances : [],
    };
    const r = simulerPas(
      entreprise,
      cumul,
      flux,
      index === config.pasParMois - 1 ? donneesFin : null,
      marketInputs,
      params,
      graine(pasAbsolu),
      moisFin,
      index,
    );
    entreprise = r.entrepriseApres;
    cumul = r.cumul;
    ecritures.push(...r.ecrituresDuPas);
    if (r.cloture) moisDecouvertConsecutifs = r.cloture.moisDecouvertConsecutifsApres;
  }

  // Échéances de prêt payées pendant ce lot (écritures « echeance_<mois>_<prêt> »)
  const echeancesPayees: { pretId: string; numero: number }[] = [];
  for (const pret of entreprise.prets) {
    if (ecritures.some((ec) => ec.id === `echeance_${moisFin}_${pret.id}`)) {
      echeancesPayees.push({ pretId: pret.id as string, numero: moisFin - pret.moisDebut });
    }
  }

  await stockage.appliquerPas(companyId, premierPas, nb, {
    ecritures,
    entreprise,
    moisDecouvertConsecutifs,
    echeancesPayees,
    commandesMatiereLivrees: livraisons.matiere.map((l) => l.id),
    ordresFaconnierLivres: livraisons.faconniers.map((l) => l.id),
    cumul,
  } satisfies ResultatLotAEnregistrer);
}
