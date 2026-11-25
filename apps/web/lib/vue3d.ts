export type StatutZone = "ok" | "alerte" | "rupture" | "info" | "inactif";

export type IdZone =
  | "approvisionnement"
  | "atelier"
  | "production"
  | "stock_finis"
  | "equipe"
  | "marque"
  | "tresorerie";

export type ZoneVue3D = {
  readonly id: IdZone;
  readonly libelle: string;
  readonly statut: StatutZone;
  readonly chiffre: string;
  readonly detail: string;
};

// --- Types d'entrée (shape Supabase) ---

export type DonneesVue3D = {
  tresorerie_centimes: number;
  commandes_matieres_en_cours: number;
  atelier: { surface_m2: number; nombre_machines: number } | null;
  productions_en_cours: number;
  stock_finis_total_pieces: number;
  nb_employes: number;
  marque: { notoriete: number; desirabilite: number } | null;
};

// Seuils
const SEUIL_TRESORERIE_ALERTE = 50_000_00; // 50 000 €
const SEUIL_TRESORERIE_RUPTURE = 10_000_00; // 10 000 €

function formaterEuros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function etatPourVue3D(d: DonneesVue3D): ZoneVue3D[] {
  // --- Trésorerie ---
  const statutTreso: StatutZone =
    d.tresorerie_centimes < SEUIL_TRESORERIE_RUPTURE
      ? "rupture"
      : d.tresorerie_centimes < SEUIL_TRESORERIE_ALERTE
        ? "alerte"
        : "ok";

  // --- Approvisionnement ---
  const statutAppro: StatutZone =
    d.commandes_matieres_en_cours > 0 ? "info" : "ok";

  // --- Atelier ---
  const statutAtelier: StatutZone = d.atelier ? "ok" : "inactif";

  // --- Production ---
  const statutProd: StatutZone =
    d.productions_en_cours > 0 ? "ok" : "inactif";

  // --- Stock produits finis ---
  const statutStock: StatutZone =
    d.stock_finis_total_pieces === 0
      ? "rupture"
      : d.stock_finis_total_pieces < 10
        ? "alerte"
        : "ok";

  // --- Équipe ---
  const statutEquipe: StatutZone =
    d.nb_employes === 0 ? "inactif" : "ok";

  // --- Marque ---
  const statutMarque: StatutZone =
    d.marque === null
      ? "inactif"
      : d.marque.notoriete < 20
        ? "alerte"
        : "ok";

  return [
    {
      id: "tresorerie",
      libelle: "Trésorerie",
      statut: statutTreso,
      chiffre: `${formaterEuros(d.tresorerie_centimes)} €`,
      detail:
        statutTreso === "rupture"
          ? "Niveau critique — moins de 10 000 €"
          : statutTreso === "alerte"
            ? "Faible — moins de 50 000 €"
            : "Niveau sain",
    },
    {
      id: "approvisionnement",
      libelle: "Approvisionnement",
      statut: statutAppro,
      chiffre:
        d.commandes_matieres_en_cours > 0
          ? `${d.commandes_matieres_en_cours} commande${d.commandes_matieres_en_cours > 1 ? "s" : ""} en route`
          : "Rien en cours",
      detail:
        d.commandes_matieres_en_cours > 0
          ? "Matières en transit vers votre atelier"
          : "Aucune commande de matière en cours",
    },
    {
      id: "atelier",
      libelle: "Atelier",
      statut: statutAtelier,
      chiffre: d.atelier
        ? `${d.atelier.nombre_machines} machine${d.atelier.nombre_machines > 1 ? "s" : ""}`
        : "Non loué",
      detail: d.atelier
        ? `${d.atelier.surface_m2} m² · ${d.atelier.nombre_machines} machine${d.atelier.nombre_machines > 1 ? "s" : ""}`
        : "Vous n'avez pas encore d'atelier propre",
    },
    {
      id: "production",
      libelle: "Production",
      statut: statutProd,
      chiffre:
        d.productions_en_cours > 0
          ? `${d.productions_en_cours} ordre${d.productions_en_cours > 1 ? "s" : ""} en cours`
          : "Aucune",
      detail:
        d.productions_en_cours > 0
          ? `${d.productions_en_cours} ordre${d.productions_en_cours > 1 ? "s" : ""} de production actif${d.productions_en_cours > 1 ? "s" : ""}`
          : "Pas de production en cours ce mois",
    },
    {
      id: "stock_finis",
      libelle: "Stock produits finis",
      statut: statutStock,
      chiffre:
        d.stock_finis_total_pieces === 0
          ? "0 pièce"
          : `${d.stock_finis_total_pieces} pièce${d.stock_finis_total_pieces > 1 ? "s" : ""}`,
      detail:
        d.stock_finis_total_pieces === 0
          ? "Stock épuisé — aucune vente possible"
          : d.stock_finis_total_pieces < 10
            ? "Stock faible"
            : "Stock disponible",
    },
    {
      id: "equipe",
      libelle: "Équipe",
      statut: statutEquipe,
      chiffre:
        d.nb_employes === 0
          ? "Solo"
          : `${d.nb_employes} salarié${d.nb_employes > 1 ? "s" : ""}`,
      detail:
        d.nb_employes === 0
          ? "Aucun salarié — vous travaillez seul"
          : `${d.nb_employes} salarié${d.nb_employes > 1 ? "s" : ""} actif${d.nb_employes > 1 ? "s" : ""}`,
    },
    {
      id: "marque",
      libelle: "Marque",
      statut: statutMarque,
      chiffre:
        d.marque === null
          ? "—"
          : `Notoriété ${Math.round(d.marque.notoriete)} · Désirabilité ${Math.round(d.marque.desirabilite)} (sur 100)`,
      detail:
        d.marque === null
          ? "Aucune action marketing lancée"
          : d.marque.notoriete < 20
            ? "Marque peu connue"
            : "Marque établie",
    },
  ];
}
