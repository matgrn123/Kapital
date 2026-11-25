import {
  type CreanceAEncaisser,
  type CumulMois,
  type DonneesFinMois,
  type EcritureComptable,
  type Entreprise,
  centimes,
} from "@kapital/engine";
import {
  ErreurPasDejaTraite,
  type EntrepriseDuMonde,
  type EtatChargeEntreprise,
  type LivraisonFaconnierDatee,
  type LivraisonMatiereDatee,
  type LivraisonsEnAttente,
  type MondeActif,
  type ResultatLotAEnregistrer,
  type StockageMonde,
} from "./port.js";

/** Passe par du JSON, comme la vraie base : ce qui n'est pas sérialisable est perdu. */
function viaJson<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

export type LivraisonEnBase =
  | ({ readonly type: "matiere"; statut: "en_cours" | "livree" } & LivraisonMatiereDatee)
  | ({ readonly type: "faconnier"; statut: "en_cours" | "livree" } & LivraisonFaconnierDatee);

type EnregistrementEntreprise = {
  entreprise: Entreprise;
  pasTraites: number | null;
  cumul: CumulMois | null;
  moisDecouvertConsecutifs: number;
};

/**
 * Base factice pour les tests de l'orchestrateur. Elle reproduit ce que la fonction
 * Postgres garantit : un pas ne s'applique qu'une fois (le compteur doit valoir
 * `pasAttendu`), tout ou rien, et la trésorerie suit la banque (compte 512).
 */
export class StockageMemoire implements StockageMonde {
  monde: { id: string; moisCourant: number; debutReelMs: number | null };
  readonly entreprises = new Map<string, EnregistrementEntreprise>();
  /** Toutes les écritures enregistrées, dans l'ordre. */
  readonly ecritures: { companyId: string; ecriture: EcritureComptable }[] = [];
  readonly livraisons = new Map<string, LivraisonEnBase[]>();
  readonly creancesParMois = new Map<string, readonly CreanceAEncaisser[]>();

  /** Pannes simulées : nombre d'enregistrements qui échouent avant d'écrire quoi que ce soit. */
  pannesAEnregistrer = 0;
  /** Entreprises dont le chargement échoue. */
  readonly entreprisesEnPanne = new Set<string>();
  /** Fait « attendre » chaque chargement, pour entrecroiser deux traitements simultanés. */
  cederLaMain = false;
  nbAppliquerPas = 0;

  constructor(monde: { id: string; moisCourant: number; debutReelMs: number | null }) {
    this.monde = { ...monde };
  }

  ajouterEntreprise(entreprise: Entreprise, pasTraites: number | null): void {
    this.entreprises.set(entreprise.id as string, {
      entreprise: viaJson(entreprise),
      pasTraites,
      cumul: null,
      moisDecouvertConsecutifs: 0,
    });
  }

  ajouterLivraison(companyId: string, livraison: LivraisonEnBase): void {
    const liste = this.livraisons.get(companyId) ?? [];
    liste.push(livraison);
    this.livraisons.set(companyId, liste);
  }

  private enregistrement(companyId: string): EnregistrementEntreprise {
    const e = this.entreprises.get(companyId);
    if (!e) throw new Error(`entreprise inconnue : ${companyId}`);
    return e;
  }

  ecrituresDe(companyId: string): readonly EcritureComptable[] {
    return this.ecritures.filter((l) => l.companyId === companyId).map((l) => l.ecriture);
  }

  async chargerMondeActif(): Promise<MondeActif | null> {
    return { id: this.monde.id, moisCourant: this.monde.moisCourant, debutReelMs: this.monde.debutReelMs };
  }

  async definirDebutReel(_mondeId: string, debutReelMs: number): Promise<void> {
    this.monde.debutReelMs = debutReelMs;
  }

  async definirMoisCourant(_mondeId: string, mois: number): Promise<void> {
    this.monde.moisCourant = mois;
  }

  async listerEntreprises(): Promise<readonly EntrepriseDuMonde[]> {
    return [...this.entreprises.entries()].map(([id, e]) => ({ id, pasTraites: e.pasTraites }));
  }

  async demarrerEntreprise(companyId: string, pas: number, cumul: CumulMois | null): Promise<void> {
    const e = this.enregistrement(companyId);
    e.pasTraites = pas;
    e.cumul = cumul === null ? null : viaJson(cumul);
  }

  async chargerEtat(companyId: string): Promise<EtatChargeEntreprise> {
    if (this.cederLaMain) await new Promise((r) => setTimeout(r, 0));
    if (this.entreprisesEnPanne.has(companyId)) throw new Error(`panne de lecture simulée (${companyId})`);
    const e = this.enregistrement(companyId);
    return { entreprise: viaJson(e.entreprise), cumul: e.cumul === null ? null : viaJson(e.cumul) };
  }

  async chargerLivraisons(companyId: string, avantMs: number): Promise<LivraisonsEnAttente> {
    const enAttente = (this.livraisons.get(companyId) ?? []).filter(
      (l) => l.statut === "en_cours" && l.instantMs < avantMs,
    );
    return {
      matiere: enAttente.filter((l): l is LivraisonEnBase & { type: "matiere" } => l.type === "matiere").map(({ type: _t, statut: _s, ...l }) => l as LivraisonMatiereDatee),
      faconniers: enAttente.filter((l): l is LivraisonEnBase & { type: "faconnier" } => l.type === "faconnier").map(({ type: _t, statut: _s, ...l }) => l as LivraisonFaconnierDatee),
    };
  }

  async chargerCreances(companyId: string, moisEnCours: number): Promise<readonly CreanceAEncaisser[]> {
    return this.creancesParMois.get(`${companyId}|${moisEnCours}`) ?? [];
  }

  async chargerFinDeMois(companyId: string): Promise<DonneesFinMois> {
    return {
      tvaAPayerCeMois: centimes(0),
      moisDecouvertConsecutifs: this.enregistrement(companyId).moisDecouvertConsecutifs,
    };
  }

  async appliquerPas(
    companyId: string,
    pasAttendu: number,
    nbPas: number,
    lot: ResultatLotAEnregistrer,
  ): Promise<void> {
    this.nbAppliquerPas += 1;
    const e = this.enregistrement(companyId);
    // --- à partir d'ici, comme la fonction Postgres : verrou, contrôle du compteur, tout ou rien
    if (e.pasTraites !== pasAttendu) {
      throw new ErreurPasDejaTraite(`pas_deja_traite: attendu ${pasAttendu}, trouvé ${e.pasTraites}`);
    }
    if (this.pannesAEnregistrer > 0) {
      this.pannesAEnregistrer -= 1;
      throw new Error("panne simulée pendant l'enregistrement");
    }
    let net512 = 0;
    for (const ec of lot.ecritures) {
      for (const l of ec.lignes) {
        if (l.compte === "512") net512 += l.sens === "debit" ? l.montant : -l.montant;
      }
    }
    const tresorerie = e.entreprise.tresorerie + net512;
    if (tresorerie !== lot.entreprise.tresorerie) {
      throw new Error(
        `trésorerie incohérente : la banque donne ${tresorerie}, le moteur ${lot.entreprise.tresorerie}`,
      );
    }
    e.entreprise = viaJson(lot.entreprise);
    e.pasTraites = pasAttendu + nbPas;
    e.cumul = lot.cumul === null ? null : viaJson(lot.cumul);
    if (lot.moisDecouvertConsecutifs !== null) e.moisDecouvertConsecutifs = lot.moisDecouvertConsecutifs;
    for (const ecriture of lot.ecritures) this.ecritures.push({ companyId, ecriture: viaJson(ecriture) });
    const livrees = new Set([...lot.commandesMatiereLivrees, ...lot.ordresFaconnierLivres]);
    for (const l of this.livraisons.get(companyId) ?? []) if (livrees.has(l.id)) l.statut = "livree";
  }
}
