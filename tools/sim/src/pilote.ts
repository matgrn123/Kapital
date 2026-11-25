import { chargerBatimentsV1, chargerModulesV1, type Parametres } from "@kapital/content";
import {
  achatModulesAmenagement,
  apercuOuvertureBoutique,
  ecrituresOuvertureBoutique,
  estEmplacementBoutique,
  nouveauPointDeVente,
  passantsReferenceBoutiques,
  transfererStockVersBoutique,
  postesEquipesAtelier,
  centimes,
  coefficientsSalairesDepuisParametres,
  commanderAuGrossiste,
  configTempsDepuis,
  coutRevientEstime,
  creerSociete,
  ecritureAchatModules,
  ecritureSignatureBail,
  evaluerEmbauche,
  graine as graineMoteur,
  idEntreprise,
  idSalarie,
  moisJeu,
  montantFactureFaconnier,
  montantLivraisonMatiere,
  nouveauBail,
  passerCommande,
  preparerSerieLancement,
  seuilsEtapesDepuis,
  simulerMoisEntreprise,
  verifierQuantiteCommande,
  verrouPour,
  type ActionVerrouillable,
  type Canal,
  type CreanceAEncaisser,
  type DetteFournisseurEchue,
  type DonneesReellesMois,
  type EcritureComptable,
  type Entreprise,
  type Gamme,
  type LivraisonFaconnier,
  type LivraisonMatiere,
  type MarketInputs,
  type Poste,
  type VentePerdueParProduit,
} from "@kapital/engine";
import { construireAtelier, type ModulePose } from "./atelier.js";
import { FOURNISSEURS, GROSSISTE_LOCAL, PRODUITS, prixMedianMatiere } from "./catalogueBanc.js";
import { verifierGardeFouMonetaire, type Anomalie } from "./gardeFou.js";

// Pilote de scénario : applique au moteur, sans base de données, les décisions qu'un
// joueur prend sur le site (création, série de lancement, grossiste, matière, bail,
// postes, embauche, prix, production), avec les mêmes briques du moteur que les routes
// web et les fonctions SQL. Puis il fait avancer le monde mois par mois avec
// `simulerMoisEntreprise` et contrôle chaque clôture (garde-fou 3D-9).
//
// Tout est pur : chaque action rend un nouvel état, rien n'est modifié en place, aucune
// horloge ni hasard. Deux lancements identiques donnent exactement le même résultat.

/** Commande passée et pas encore réglée (matière chez un fournisseur, pièces chez le grossiste). */
export type CommandeEnCours = {
  readonly id: string;
  readonly nature: "matiere" | "faconnier";
  readonly moisLivraison: number;
  readonly delaiPaiementMois: number;
  /** Dette fournisseur inscrite à la livraison (401), réglée à l'échéance. */
  readonly montantDette: number;
  readonly livraisonMatiere: LivraisonMatiere | null;
  readonly livraisonFaconnier: LivraisonFaconnier | null;
  readonly livree: boolean;
  readonly reglee: boolean;
};

export type BilanMensuel = {
  readonly mois: number;
  readonly etape: number;
  readonly tresorerie: number;
  readonly chiffreAffairesHtCumule: number;
  readonly piecesVenduesCumulees: number;
  readonly stockFiniPieces: number;
  /** AE-10 : pièces en stock dans les boutiques. */
  readonly stockBoutiquePieces: number;
  readonly salaries: number;
  readonly postes: number;
  readonly ventesPerdues: readonly VentePerdueParProduit[];
  readonly anomalies: readonly Anomalie[];
};

export type EtatBanc = {
  readonly params: Parametres;
  /** Mois de jeu en cours (compté depuis 0) : les décisions s'y appliquent. */
  readonly mois: number;
  readonly entreprise: Entreprise;
  /** Tout le grand livre depuis la création, dans l'ordre. */
  readonly ecritures: readonly EcritureComptable[];
  readonly commandes: readonly CommandeEnCours[];
  readonly batimentId: string | null;
  readonly modulesPoses: readonly ModulePose[];
  readonly moisDecouvertConsecutifs: number;
  /** Compteur pour des identifiants stables (commandes, salariés). */
  readonly sequence: number;
  /** État et nombre d'écritures à la dernière clôture : point de départ du garde-fou. */
  readonly derniereCloture: { readonly entreprise: Entreprise | null; readonly nbEcritures: number };
  readonly historique: readonly BilanMensuel[];
};

export type Refus = { readonly ok: false; readonly code: string; readonly message: string };
export type ResultatAction = { readonly ok: true; readonly etat: EtatBanc } | Refus;

const refus = (code: string, message: string): Refus => ({ ok: false, code, message });
const accepte = (etat: EtatBanc): ResultatAction => ({ ok: true, etat });

function suivant(etat: EtatBanc, prefixe: string): { id: string; etat: EtatBanc } {
  const n = etat.sequence + 1;
  return { id: `${prefixe}_${n}`, etat: { ...etat, sequence: n } };
}

/** Passe une écriture de décision : grand livre, et la banque suit le compte 512. */
function passerEcriture(etat: EtatBanc, ecriture: EcritureComptable): EtatBanc {
  let net = 0;
  for (const l of ecriture.lignes) if (l.compte === "512") net += l.sens === "debit" ? l.montant : -l.montant;
  return {
    ...etat,
    ecritures: [...etat.ecritures, ecriture],
    entreprise: { ...etat.entreprise, tresorerie: centimes(etat.entreprise.tresorerie + net) },
  };
}

/** Verrou d'étape avec l'étape RÉELLE (le banc ignore deblocage_total_developpement). */
function verrou(etat: EtatBanc, action: ActionVerrouillable): Refus | null {
  const e = etat.entreprise;
  const v = verrouPour(
    action,
    {
      etape: e.etape,
      cumuls: e.cumulsEtape ?? { piecesVendues: 0, chiffreAffairesHt: centimes(0) },
      tresorerie: e.tresorerie,
    },
    seuilsEtapesDepuis(etat.params),
  );
  return v === null
    ? null
    : refus("etape_insuffisante", `${action} se débloque à l'étape ${v.etapeRequise} (étape actuelle ${v.etapeActuelle}).`);
}

function produitDuMonde(produit: string) {
  const p = PRODUITS[produit];
  if (!p) throw new Error(`Produit inconnu du catalogue du banc : ${produit}`);
  return p;
}

/** Coût « usine » d'une pièce, comme le serveur (matière médiane, chute, fournitures, façon). */
export function coutUsine(params: Parametres, produit: string): number {
  const { fiche } = produitDuMonde(produit);
  return coutRevientEstime(
    {
      consommationParPiece: fiche.consommationParPiece,
      fournituresParPieceCentimes: fiche.fournituresParPiece,
      prixMatiereParUniteCentimes: prixMedianMatiere(fiche.matiere),
    },
    params,
  );
}

// ---------------------------------------------------------------------------
// Décisions
// ---------------------------------------------------------------------------

/** AE-1 : la société naît avec son capital en banque (512 / 101), étape 0, sans atelier. */
export function creerEntreprise(p: {
  readonly params: Parametres;
  readonly nom: string;
  readonly gamme: Gamme;
  readonly id?: string;
}): EtatBanc {
  const societe = creerSociete({ params: p.params, nom: p.nom, gamme: p.gamme, mois: moisJeu(0) });
  const entreprise: Entreprise = {
    id: idEntreprise(p.id ?? "banc_solo"),
    nom: societe.nom,
    gamme: societe.gamme,
    etape: 0,
    cumulsEtape: { piecesVendues: 0, chiffreAffairesHt: centimes(0) },
    proprietaire: { type: "joueur", idProfil: "banc" },
    statut: "active",
    tresorerie: centimes(0),
    stocksMatiere: [],
    stocksFinis: [],
    salaries: [],
    atelier: null,
    // Valeurs par défaut de la table brand_state (0007_marketing.sql).
    marque: { notoriete: 0, desirabilite: 0 },
    prets: [],
    catalogue: [],
  };
  const vierge: EtatBanc = {
    params: p.params,
    mois: 0,
    entreprise,
    ecritures: [],
    commandes: [],
    batimentId: null,
    modulesPoses: [],
    moisDecouvertConsecutifs: 0,
    sequence: 0,
    derniereCloture: { entreprise: null, nbEcritures: 0 },
    historique: [],
  };
  return passerEcriture(vierge, societe.ecritureApport);
}

/** Ajoute un produit au catalogue de la société, vendu en direct au prix TTC donné. */
export function ajouterProduit(
  etat: EtatBanc,
  produit: string,
  prixVenteDirecteTtc: number,
  qualiteVisee = 60,
): ResultatAction {
  const { id, fiche } = produitDuMonde(produit);
  if (etat.entreprise.catalogue.some((p) => p.produit === id)) {
    return refus("produit_deja_au_catalogue", `${produit} est déjà au catalogue.`);
  }
  return accepte({
    ...etat,
    entreprise: {
      ...etat.entreprise,
      catalogue: [
        ...etat.entreprise.catalogue,
        {
          produit: id,
          qualiteVisee,
          prix: { vente_directe: centimes(prixVenteDirecteTtc), revendeur: centimes(0) },
          productionMensuelleCible: 0,
          fabrication: fiche,
        },
      ],
    },
  });
}

/** TP-3 : la série de lancement, payée sur le capital (35 / 512), une seule fois par produit. */
export function serieDeLancement(etat: EtatBanc, produit: string): ResultatAction {
  const { id } = produitDuMonde(produit);
  const serie = preparerSerieLancement({
    params: etat.params,
    produit: id,
    coutUnitaire: centimes(coutUsine(etat.params, produit)),
    mois: moisJeu(etat.mois),
  });
  if (etat.ecritures.some((e) => e.id === serie.ecriture.id)) {
    return refus("serie_deja_faite", `La série de lancement de ${produit} est déjà faite.`);
  }
  if (etat.entreprise.tresorerie < serie.valeurTotale) {
    return refus("tresorerie_insuffisante", "Trésorerie insuffisante pour la série de lancement.");
  }
  const apres = passerEcriture(etat, serie.ecriture);
  return accepte({
    ...apres,
    entreprise: {
      ...apres.entreprise,
      stocksFinis: ajouterStockFini(apres.entreprise, id as string, serie.quantite, serie.valeurTotale),
    },
  });
}

function ajouterStockFini(e: Entreprise, produit: string, quantite: number, valeur: number): Entreprise["stocksFinis"] {
  const existe = e.stocksFinis.some((s) => s.produit === produit);
  if (!existe) return [...e.stocksFinis, { produit: produitDuMonde(produit).id, quantite, valeurTotale: centimes(valeur) }];
  return e.stocksFinis.map((s) =>
    s.produit === produit ? { ...s, quantite: s.quantite + quantite, valeurTotale: centimes(s.valeurTotale + valeur) } : s,
  );
}

function msParMoisJeu(params: Parametres): number {
  return configTempsDepuis(params).minutesReellesParMoisJeu * 60_000;
}

/** TP-3 : commande au grossiste local, livrée dans le mois, payée le mois suivant. */
export function commanderGrossiste(etat: EtatBanc, produit: string, quantite: number): ResultatAction {
  const { id } = produitDuMonde(produit);
  const debutMoisMs = etat.mois * msParMoisJeu(etat.params);
  const c = commanderAuGrossiste({
    params: etat.params,
    produit: id,
    quantite,
    coutUsineParPiece: centimes(coutUsine(etat.params, produit)),
    instantCommandeMs: debutMoisMs,
  });
  const verif = verifierQuantiteCommande({
    quantite,
    minimum: GROSSISTE_LOCAL.minimumCommande,
    prixUnitaire: c.prixParPiece,
    tresorerie: etat.entreprise.tresorerie,
  });
  if (!verif.ok) return refus(verif.code, verif.message);
  const { id: idCommande, etat: e2 } = suivant(etat, "grossiste");
  const livraison: LivraisonFaconnier = {
    id: idCommande,
    produit: id,
    quantite,
    prixFaconParPiece: c.prixParPiece,
    matiereDuJoueur: null,
  };
  return accepte({
    ...e2,
    commandes: [
      ...e2.commandes,
      {
        id: idCommande,
        nature: "faconnier",
        moisLivraison: Math.floor(c.instantLivraisonMs / msParMoisJeu(etat.params)),
        delaiPaiementMois: GROSSISTE_LOCAL.delaiPaiementMois,
        montantDette: montantFactureFaconnier(quantite, c.prixParPiece, null),
        livraisonMatiere: null,
        livraisonFaconnier: livraison,
        livree: false,
        reglee: false,
      },
    ],
  });
}

/** Commande de matière chez un fournisseur : livrée après son délai, payée à crédit. */
export function commanderMatiere(
  etat: EtatBanc,
  fournisseurId: string,
  matiere: string,
  quantite: number,
): ResultatAction {
  const f = FOURNISSEURS[fournisseurId];
  if (!f) return refus("fournisseur_inconnu", `Fournisseur inconnu : ${fournisseurId}.`);
  const { id: idCommande, etat: e2 } = suivant(etat, "matiere");
  let commande;
  try {
    commande = passerCommande({
      id: idCommande,
      entreprise: etat.entreprise.id,
      fournisseur: f.fournisseur,
      catalogue: f.catalogue,
      matiere: matiere as never,
      quantite,
      moisCommande: moisJeu(etat.mois),
    });
  } catch (err) {
    return refus("commande_refusee", (err as Error).message);
  }
  const verif = verifierQuantiteCommande({
    quantite,
    minimum: f.fournisseur.minimumCommande,
    prixUnitaire: commande.prixUnitaire,
    tresorerie: etat.entreprise.tresorerie,
  });
  if (!verif.ok) return refus(verif.code, verif.message);
  return accepte({
    ...e2,
    commandes: [
      ...e2.commandes,
      {
        id: idCommande,
        nature: "matiere",
        moisLivraison: commande.moisLivraisonPrevu,
        delaiPaiementMois: f.fournisseur.delaiPaiementMois,
        montantDette: montantLivraisonMatiere(quantite, commande.prixUnitaire),
        livraisonMatiere: {
          id: idCommande,
          matiere: commande.matiere,
          quantite,
          prixUnitaire: commande.prixUnitaire,
          modePaiement: "credit",
        },
        livraisonFaconnier: null,
        livree: false,
        reglee: false,
      },
    ],
  });
}

/**
 * AE-5 : signature d'un bail. Comme la fonction SQL signer_bail : dépôt de garantie
 * (275 / 512) et les postes de départ posés (paramètre bail_machines_a_la_signature,
 * en postes de couture de base).
 */
export function signerBail(etat: EtatBanc, batimentId: string): ResultatAction {
  const bloque = verrou(etat, "louer_atelier");
  if (bloque) return bloque;
  if (etat.entreprise.atelier !== null) return refus("local_deja_loue", "La société a déjà un atelier.");
  const batiment = chargerBatimentsV1().find((b) => b.id === batimentId && b.categorie === "atelier");
  if (!batiment) return refus("batiment_inconnu", `Local inconnu : ${batimentId}.`);
  const bail = nouveauBail({
    loyerMensuel: centimes(batiment.loyer_mensuel_centimes),
    chargesMensuelles: centimes(batiment.charges_mensuelles_centimes),
    moisSignature: moisJeu(etat.mois),
    params: etat.params,
  });
  if (etat.entreprise.tresorerie < bail.depotGarantie) {
    return refus("depot_insuffisant", "Trésorerie insuffisante pour le dépôt de garantie.");
  }
  const postesALaSignature = etat.params["bail_machines_a_la_signature"]?.valeur ?? 0;
  const modulesPoses: ModulePose[] = Array.from({ length: postesALaSignature }, () => ({
    id_type: "poste_couture_base",
  }));
  const apres = passerEcriture(etat, ecritureSignatureBail(etat.entreprise.id, moisJeu(etat.mois), bail));
  return accepte({
    ...apres,
    batimentId: batiment.id,
    modulesPoses,
    entreprise: { ...apres.entreprise, atelier: construireAtelier({ batiment, bail, modulesPoses }) },
  });
}

/** Aménagement : pose de modules achetés (2154 / 512), comme l'enregistrement du plan. */
export function poserModules(etat: EtatBanc, idType: string, nombre: number): ResultatAction {
  const atelier = etat.entreprise.atelier;
  if (atelier === null || atelier.bail === undefined || etat.batimentId === null) {
    return refus("sans_atelier", "Il faut un atelier loué pour poser des modules.");
  }
  const nouveaux = [...etat.modulesPoses, ...Array.from({ length: nombre }, () => ({ id_type: idType }))];
  // Seul le nombre de modules par type compte pour l'achat : la place n'est pas simulée.
  const position = (m: ModulePose) => ({ id_type: m.id_type, x: 1, y: 1, pivote: false });
  const achat = achatModulesAmenagement(
    etat.modulesPoses.map(position),
    nouveaux.map(position),
    chargerModulesV1(),
  );
  if (!achat.ok) return refus(achat.code, achat.message);
  if (etat.entreprise.tresorerie < achat.total) {
    return refus("tresorerie_insuffisante", "Trésorerie insuffisante pour acheter ces modules.");
  }
  const { id, etat: e2 } = suivant(etat, "amenagement");
  const apres =
    achat.total > 0
      ? passerEcriture(e2, ecritureAchatModules({ idEcriture: id, mois: moisJeu(etat.mois), montant: achat.total }))
      : e2;
  const batiment = chargerBatimentsV1().find((b) => b.id === etat.batimentId)!;
  return accepte({
    ...apres,
    modulesPoses: nouveaux,
    entreprise: {
      ...apres.entreprise,
      atelier: construireAtelier({ batiment, bail: atelier.bail, modulesPoses: nouveaux }),
    },
  });
}

/**
 * AE-10 : ouverture d'une boutique. Comme la route ouvrir-boutique et la fonction SQL
 * ouvrir_boutique : dépôt (275 / 512) et travaux d'agencement (2135 / 512), ouverture après
 * les travaux. Le verrou d'étape (étape 3) arrive avec AE-11 : le banc ne le vérifie pas encore.
 */
export function ouvrirBoutique(etat: EtatBanc, batimentId: string): ResultatAction {
  if ((etat.entreprise.pointsDeVente ?? []).length > 0) {
    return refus("boutique_deja_ouverte", "La société a déjà une boutique.");
  }
  const catalogue = chargerBatimentsV1();
  const batiment = catalogue.find((b) => b.id === batimentId);
  if (!batiment || !estEmplacementBoutique(batiment)) return refus("batiment_inconnu", `Boutique inconnue : ${batimentId}.`);
  const apercu = apercuOuvertureBoutique({
    batiment,
    params: etat.params,
    mois: moisJeu(etat.mois),
    tresorerie: etat.entreprise.tresorerie,
  });
  if (!apercu.tresorerieSuffisante) {
    return refus("tresorerie_insuffisante", "Trésorerie insuffisante pour le dépôt et les travaux.");
  }
  const { id, etat: e2 } = suivant(etat, "boutique");
  const pdv = nouveauPointDeVente({
    id,
    batiment,
    mois: moisJeu(etat.mois),
    params: etat.params,
    passantsReference: passantsReferenceBoutiques(catalogue),
  });
  let apres = e2;
  for (const ecriture of ecrituresOuvertureBoutique(pdv)) apres = passerEcriture(apres, ecriture);
  return accepte({
    ...apres,
    entreprise: { ...apres.entreprise, pointsDeVente: [...(apres.entreprise.pointsDeVente ?? []), pdv] },
  });
}

/** AE-10 : transfert de pièces de l'atelier vers la boutique, au coût moyen, sans écriture. */
export function transfererStockBoutique(
  etat: EtatBanc,
  idPointDeVente: string,
  produit: string,
  quantite: number,
): ResultatAction {
  const r = transfererStockVersBoutique(etat.entreprise, idPointDeVente, produitDuMonde(produit).id, quantite);
  if (!r.ok) return refus(r.code, r.message);
  return accepte({ ...etat, entreprise: r.entreprise });
}

/** AE-7 : embauche (étape, salaire au moins au SMIC, réserve de mois de coût employeur). */
export function embaucher(etat: EtatBanc, poste: Poste, salaireBrutMensuel: number): ResultatAction {
  const bloque = verrou(etat, "embauche");
  if (bloque) return bloque;
  if (poste === "vendeur" && (etat.entreprise.pointsDeVente ?? []).length === 0) {
    return refus("sans_boutique", "Un vendeur travaille en boutique : il faut d'abord ouvrir une boutique.");
  }
  const moisReserve = etat.params["embauche_reserve_mois_cout_employeur"]?.valeur;
  if (moisReserve === undefined) return refus("parametre_manquant", "embauche_reserve_mois_cout_employeur manquant.");
  const r = evaluerEmbauche(
    salaireBrutMensuel,
    etat.entreprise.tresorerie,
    coefficientsSalairesDepuisParametres(etat.params),
    moisReserve,
  );
  if (!r.ok) return refus(r.code, r.message);
  const { id, etat: e2 } = suivant(etat, "salarie");
  return accepte({
    ...e2,
    entreprise: {
      ...e2.entreprise,
      salaries: [
        ...e2.entreprise.salaries,
        { id: idSalarie(id), poste, salaireBrutMensuel: centimes(salaireBrutMensuel), ancienneteMois: 0, experienceMois: 0 },
      ],
    },
  });
}

/** Objectif de production mensuelle de l'atelier pour un produit (étape 2). */
export function fixerProduction(etat: EtatBanc, produit: string, piecesParMois: number): ResultatAction {
  const bloque = verrou(etat, "production_atelier");
  if (bloque) return bloque;
  if (etat.entreprise.atelier === null) return refus("sans_atelier", "Pas d'atelier propre.");
  return modifierProduit(etat, produit, (p) => ({ ...p, productionMensuelleCible: piecesParMois }));
}

/** Prix TTC d'un canal ; le prix revendeur se débloque à l'étape 2. */
export function fixerPrix(etat: EtatBanc, produit: string, canal: Canal, prixTtc: number): ResultatAction {
  if (canal === "revendeur" && prixTtc > 0) {
    const bloque = verrou(etat, "vente_revendeur");
    if (bloque) return bloque;
  }
  return modifierProduit(etat, produit, (p) => ({ ...p, prix: { ...p.prix, [canal]: centimes(prixTtc) } }));
}

function modifierProduit(
  etat: EtatBanc,
  produit: string,
  f: (p: Entreprise["catalogue"][number]) => Entreprise["catalogue"][number],
): ResultatAction {
  if (!etat.entreprise.catalogue.some((p) => p.produit === produit)) {
    return refus("produit_absent", `${produit} n'est pas au catalogue.`);
  }
  return accepte({
    ...etat,
    entreprise: {
      ...etat.entreprise,
      catalogue: etat.entreprise.catalogue.map((p) => (p.produit === produit ? f(p) : p)),
    },
  });
}

// ---------------------------------------------------------------------------
// Avance du monde
// ---------------------------------------------------------------------------

/** Valeurs d'attente du marché, comme l'orchestrateur (le moteur ne les lit pas encore). */
function marketInputs(params: Parametres, mois: number): MarketInputs {
  return {
    mois: moisJeu(mois),
    smicHoraireBrut: centimes(params["smic_horaire_brut"]?.valeur ?? 0),
    tauxEstrAnnuel: 0,
    prixElectriciteParKwh: centimes(params["prix_electricite_pro"]?.valeur ?? 0),
    coursCotonParKg: centimes(0),
    inflationMensuelle: 0,
  };
}

/** Créances revendeurs du mois m−2 encore ouvertes (solde 411 par écriture), comme le serveur. */
function creancesAEncaisser(ecritures: readonly EcritureComptable[], mois: number): CreanceAEncaisser[] {
  const soldes = new Map<string, number>();
  for (const e of ecritures) {
    if (e.mois !== mois - 2) continue;
    for (const l of e.lignes) {
      if (l.compte !== "411") continue;
      soldes.set(e.id, (soldes.get(e.id) ?? 0) + (l.sens === "debit" ? l.montant : -l.montant));
    }
  }
  return [...soldes.entries()]
    .filter(([, s]) => s > 0)
    .map(([ecritureId, s]) => ({ ecritureId, montant: centimes(s) }));
}

/**
 * TVA à payer ce mois : la TVA déclarée à la clôture du mois précédent (crédits du 44551
 * de ce mois-là). Le serveur prend le solde net du 44551 du mois précédent, ce qui en
 * retire le paiement fait ce mois-là : voir le README (bug signalé).
 */
function tvaAPayer(ecritures: readonly EcritureComptable[], mois: number): number {
  let total = 0;
  for (const e of ecritures) {
    if (e.mois !== mois - 1) continue;
    for (const l of e.lignes) if (l.compte === "44551" && l.sens === "credit") total += l.montant;
  }
  return total;
}

/**
 * Formule actuelle du serveur (StockageSupabase.chargerFinDeMois) : solde net du 44551 du
 * mois précédent, paiement de ce mois-là compris. Gardée pour montrer l'écart au banc.
 */
export function tvaAPayerSelonServeur(ecritures: readonly EcritureComptable[], mois: number): number {
  let net = 0;
  for (const e of ecritures) {
    if (e.mois !== mois - 1) continue;
    for (const l of e.lignes) if (l.compte === "44551") net += l.sens === "credit" ? l.montant : -l.montant;
  }
  return Math.max(0, net);
}

export type OptionsAvance = {
  /** « declaree » (par défaut) : la TVA déclarée le mois précédent ; « serveur » : la formule du serveur. */
  readonly tva?: "declaree" | "serveur";
};

/**
 * Clôt le mois en cours : livraisons arrivées, dettes échues, créances, TVA, puis
 * `simulerMoisEntreprise`. Contrôle la clôture (garde-fou 3D-9) et l'inscrit à l'historique.
 */
export function avancerMois(etat: EtatBanc, graine: number, options: OptionsAvance = {}): EtatBanc {
  const m = etat.mois;
  const aLivrer = etat.commandes.filter((c) => !c.livree && c.moisLivraison <= m);
  const echues = etat.commandes.filter(
    (c) => c.livree && !c.reglee && c.moisLivraison + c.delaiPaiementMois <= m,
  );
  const dettesEchues: DetteFournisseurEchue[] = echues.map((c) => ({
    ordreId: c.id,
    nature: c.nature,
    montant: centimes(c.montantDette),
  }));
  const donnees: DonneesReellesMois = {
    livraisonsMatiere: aLivrer.flatMap((c) => (c.livraisonMatiere ? [c.livraisonMatiere] : [])),
    livraisonsFaconniers: aLivrer.flatMap((c) => (c.livraisonFaconnier ? [c.livraisonFaconnier] : [])),
    depensesMarketing: [],
    creancesAEncaisser: creancesAEncaisser(etat.ecritures, m),
    dettesEchues,
    tvaAPayerCeMois: centimes(
      options.tva === "serveur" ? tvaAPayerSelonServeur(etat.ecritures, m) : tvaAPayer(etat.ecritures, m),
    ),
    moisDecouvertConsecutifs: etat.moisDecouvertConsecutifs,
  };

  const r = simulerMoisEntreprise(
    etat.entreprise,
    donnees,
    marketInputs(etat.params, m),
    etat.params,
    graineMoteur(graine),
    moisJeu(m),
  );

  const livrees = new Set(aLivrer.map((c) => c.id));
  const reglees = new Set(echues.map((c) => c.id));
  const ecritures = [...etat.ecritures, ...r.ecritures];
  const entreprise = r.entrepriseApres;

  const anomalies = verifierGardeFouMonetaire({
    ecrituresAvant: etat.ecritures.slice(0, etat.derniereCloture.nbEcritures),
    ecrituresPeriode: ecritures.slice(etat.derniereCloture.nbEcritures),
    entrepriseAvant: etat.derniereCloture.entreprise,
    entrepriseApres: entreprise,
  });

  const bilan: BilanMensuel = {
    mois: m,
    etape: entreprise.etape,
    tresorerie: entreprise.tresorerie,
    chiffreAffairesHtCumule: entreprise.cumulsEtape?.chiffreAffairesHt ?? 0,
    piecesVenduesCumulees: entreprise.cumulsEtape?.piecesVendues ?? 0,
    stockFiniPieces: entreprise.stocksFinis.reduce((s, l) => s + l.quantite, 0),
    stockBoutiquePieces: (entreprise.pointsDeVente ?? []).flatMap((p) => p.stock).reduce((s, l) => s + l.quantite, 0),
    salaries: entreprise.salaries.length,
    postes: postesEquipesAtelier(entreprise.atelier ?? null),
    ventesPerdues: r.ventesPerdues,
    anomalies,
  };

  return {
    ...etat,
    mois: m + 1,
    entreprise,
    ecritures,
    commandes: etat.commandes.map((c) => ({
      ...c,
      livree: c.livree || livrees.has(c.id),
      reglee: c.reglee || reglees.has(c.id),
    })),
    moisDecouvertConsecutifs: r.moisDecouvertConsecutifsApres,
    derniereCloture: { entreprise, nbEcritures: ecritures.length },
    historique: [...etat.historique, bilan],
  };
}
