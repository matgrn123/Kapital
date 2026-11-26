import type { Parametres } from "@kapital/content";
import {
  centimes,
  configTempsDepuis,
  cumulDemarrantAuPas,
  debutDuPasEnMs,
  estMoisCalendaire,
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
import { evenementsDuPas } from "../evenements/evenementsDuPas.js";
import type { EvenementJournal } from "../evenements/types.js";

/** Minutes dans le plus long mois calendaire (31 jours) : sert aux plafonds par défaut. */
const MINUTES_PAR_MOIS_LONG = 31 * 24 * 60;
const MINUTES_PAR_JOUR = 24 * 60;

export type OptionsAvance = {
  /**
   * Plafond de pas traités par entreprise et par appel : le reste est rattrapé
   * à l'appel suivant (par défaut 3 mois de 31 jours : 3 × 44 640 pas d'une minute).
   */
  readonly maxPasParEntreprise?: number;
  /**
   * Taille maximale d'un lot (pas calculés en mémoire puis enregistrés d'un bloc).
   * Par défaut une journée (1 440 pas d'une minute) : la même taille maximale qu'avec
   * l'ancien mois d'un jour, pour garder des enregistrements de taille raisonnable.
   */
  readonly maxPasParLot?: number;
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

/** Le monde est encore sur l'ancien compteur de mois (avant la migration 0043). */
export class ErreurMondeAncienCalendrier extends Error {
  constructor(moisCourant: number) {
    super(
      `Monde sur l'ancien calendrier (mois_courant = ${moisCourant}) : en attente de la migration 0043, rien n'est avancé.`,
    );
    this.name = "ErreurMondeAncienCalendrier";
  }
}

/**
 * Fait avancer tout le monde jusqu'à l'instant `maintenantMs` (fourni par le
 * serveur, jamais par le navigateur) : chaque entreprise traite les pas qui lui
 * manquent, absents compris. Idempotent : rappelé au même instant, il ne fait rien.
 *
 * Un mois de jeu est un mois calendaire réel (28 à 31 jours, heure de Paris) :
 * le nombre de pas de chaque mois se lit sur le calendrier.
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

  // Garde-fou de bascule : un monde dont le mois courant compte encore depuis 0 n'a pas
  // reçu la migration 0043 (remise à zéro). On n'y écrit rien : ce code-ci peut être en
  // ligne quelques instants avant la migration, et les prévisualisations partagent la base.
  if (!estMoisCalendaire(monde.moisCourant)) throw new ErreurMondeAncienCalendrier(monde.moisCourant);

  // Origine non fixée : l'horloge du jeu est l'horloge réelle (1er janvier 1970).
  let debutReelMs = monde.debutReelMs;
  let horlogeInitialisee = false;
  if (debutReelMs === null) {
    debutReelMs = 0;
    await stockage.definirDebutReel(monde.id, debutReelMs);
    horlogeInitialisee = true;
  }

  const pasCible = pasTerminesDepuis(config, debutReelMs, maintenantMs);
  const maxPas = options.maxPasParEntreprise ?? (3 * MINUTES_PAR_MOIS_LONG) / config.minutesReellesParPas;
  const maxPasParLot = options.maxPasParLot ?? MINUTES_PAR_JOUR / config.minutesReellesParPas;
  const entreprises = await stockage.listerEntreprises(monde.id);

  const contexte: ContexteAvance = { stockage, params, config, debutReelMs, pasCible, maxPas, maxPasParLot };
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
  readonly maxPasParLot: number;
};

async function avancerEntreprise(
  ctx: ContexteAvance,
  e: EntrepriseDuMonde,
): Promise<ResultatAvanceEntreprise> {
  const { stockage, config, pasCible, maxPas, maxPasParLot } = ctx;
  try {
    // Nouvelle entreprise : elle démarre maintenant, sans rejouer d'historique.
    if (e.pasTraites === null) {
      const position = positionDuPasAbsolu(config, pasCible);
      let cumul: CumulMois | null = null;
      if (position.indexDansMois > 0) {
        const etat = await stockage.chargerEtat(e.id, position.mois, ctx.debutReelMs);
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
      const restantDansLeMois = position.pasDansLeMois - position.indexDansMois;
      const nb = Math.min(pasCible - courant, restantDansLeMois, maxPas - faits, maxPasParLot);
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
  const dernierIndexDuMois = position.pasDansLeMois - 1;
  const cloture = indexDernier === dernierIndexDuMois;

  const etat = await stockage.chargerEtat(companyId, moisEnCours, debutReelMs);
  let cumul = etat.cumul;
  // Un état en avance sur ce lot : un autre traitement simultané est passé entre deux lots
  // (les lots d'une journée rendent ce croisement possible au milieu d'un rattrapage).
  if (
    cumul !== null &&
    (cumul.mois > moisFin || (cumul.mois === moisFin && cumul.pasTraites > position.indexDansMois))
  ) {
    throw new ErreurPasDejaTraite(
      `pas_deja_traite: ${companyId} est déjà au pas ${cumul.pasTraites} du mois ${cumul.mois}`,
    );
  }
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
  // Fournisseurs et façonniers : réglés à leur échéance, au premier pas du mois.
  const dettesEchues =
    position.indexDansMois === 0 ? await stockage.chargerDettesEchues(companyId, moisEnCours) : [];
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
  const evenements: EvenementJournal[] = [];

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
      dettesEchues: index === 0 ? dettesEchues : [],
    };
    const r = simulerPas(
      entreprise,
      cumul,
      flux,
      index === dernierIndexDuMois ? donneesFin : null,
      marketInputs,
      params,
      graine(pasAbsolu),
      moisFin,
      index,
    );
    // Journal : ce que ce pas a changé (livraisons, rupture, découvert, clôture…).
    evenements.push(
      ...evenementsDuPas(entreprise, r.entrepriseApres, r, {
        flux,
        cumulAvant: cumul,
        mois: moisFin,
        pasAbsolu,
        instantMs: debutDuPasEnMs(config, debutReelMs, pasAbsolu + 1),
      }),
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
    finDuLotMs,
  } satisfies ResultatLotAEnregistrer);

  // Après le pas, jamais avant : un pas refusé (déjà traité, panne) n'écrit rien au journal.
  // Le journal ne fait que raconter : s'il échoue, le pas reste enregistré et l'argent juste.
  if (evenements.length > 0) {
    try {
      await stockage.enregistrerEvenements(companyId, evenements);
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      console.error(`[avance] journal ${companyId} : ${message}`);
    }
  }
}
