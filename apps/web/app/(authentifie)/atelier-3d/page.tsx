import { chargerBatimentsV1, chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { BoutonLien, Carte, EnTete, Etapes } from "../../../components/ui";
import { postesFournisDepuisParametres, valeurNetteMaterielEnService } from "../../../lib/amenagement";
import { postesPoses } from "../../../lib/api-helpers";
import { versQuand } from "../../../lib/cadre";
import { localAffiche, salariesDuLocal } from "../../../lib/locaux";
import { creerClientServeur } from "../../../lib/supabase/server";
import { EcranAtelier } from "./EcranAtelier";
import type { ModulePlace } from "./plan";
import { experienceJoursDepuis, type SalarieFiche } from "./salaries";

// Écran « L'atelier » (design V2, maquette V.atelier), dessiné en SVG isométrique.
// placed_modules.x / y comptent les cases à partir de 1 (convention de validerPlanEtage).
// 3D-5 : placed_modules.statut sépare le plan en service ('actif') du plan prévu ('prevu').
// T3 (horloge réelle) : le plan prévu entre en service à workshops.plan_prevu_le, 2 h après sa
// sauvegarde (migration 0045) ; sans cette heure (plan d'avant 0045), à la clôture du mois.
// 3D-7 : une société peut avoir plusieurs locaux ; ?local=<id> choisit celui qu'on aménage
// (par défaut le plus ancien), et un sélecteur passe de l'un à l'autre.

type Employe = {
  id: string;
  poste: "artisan" | "encadrement";
  salaire_brut_mensuel_centimes: number;
  cree_le: string;
  anciennete_mois_debut: number;
  experience_mois_debut: number;
  mois_jeu_debut: number | null;
};

type Workshop = {
  id: string; batiment_id: string | null; surface_m2: number; largeur_grille: number; hauteur_grille: number;
  entree_x: number; entree_y: number; plan_prevu_mois: number | null; plan_prevu_cout_centimes: number | null;
  /** T3 (0045) : absent avant la migration. */
  plan_prevu_le?: string | null;
  placed_modules: { module_type_id: string; x: number; y: number; pivote: boolean | null; statut: string | null }[] | null;
};

export default async function PageAtelier({ searchParams }: { searchParams: Promise<{ local?: string | string[] }> }) {
  const { local: localDemande } = await searchParams;
  const supabase = await creerClientServeur();
  const { data: entreprises } = await supabase.from("companies").select("id, nom, tresorerie_centimes").limit(1);
  const entreprise = entreprises?.[0] as { id: string; nom: string; tresorerie_centimes: number } | undefined;
  if (!entreprise) return null;

  const [{ data: workshops }, { data: employes }, { data: monde }] = await Promise.all([
    supabase
      .from("workshops")
      // « * » : plan_prevu_le (migration 0045) est lu quand la colonne existe.
      .select("*, placed_modules(module_type_id, x, y, pivote, statut)")
      .eq("company_id", entreprise.id)
      .order("cree_le"),
    supabase
      .from("employees")
      .select("id, poste, salaire_brut_mensuel_centimes, cree_le, anciennete_mois_debut, experience_mois_debut, mois_jeu_debut")
      .eq("company_id", entreprise.id)
      .eq("statut", "actif")
      .order("cree_le"),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
  ]);

  const locaux = (workshops ?? []) as Workshop[];
  const workshop = localAffiche(locaux, typeof localDemande === "string" ? localDemande : null);
  if (!workshop) {
    return (
      <div className="flex flex-col gap-4">
        <EnTete surTitre={entreprise.nom} titre="L'atelier" action={<BoutonLien href="/vue-3d">← Retour au village</BoutonLien>} />
        <Carte titre="Tu n'as pas encore d'atelier">
          <div className="flex flex-col gap-3">
            <p className="text-muted">Pour produire toi-même, il te faut un local, des machines et des artisans.</p>
            <Etapes etapes={["Loue un local", "Place tes machines", "Embauche"]} />
            <div>
              <BoutonLien href="/locaux" variante="principal">Voir les locaux</BoutonLien>
            </div>
          </div>
        </Carte>
      </div>
    );
  }

  const w = workshop;
  const indexLocal = locaux.indexOf(w);
  const catalogueBatiments = chargerBatimentsV1();
  const nomLocal = (l: Workshop) => catalogueBatiments.find((b) => b.id === l.batiment_id)?.nom ?? "Local";
  const [{ data: places }, { data: materiel }] = await Promise.all([
    supabase
      .from("placed_modules")
      .select("module_type_id, x, y, pivote, statut")
      .eq("workshop_id", w.id)
      .order("cree_le"),
    supabase
      .from("ledger_entries")
      .select("compte, sens, montant_centimes")
      .eq("company_id", entreprise.id)
      .in("compte", ["2154", "2815"]),
  ]);
  const lignes = (places ?? []) as (ModulePlace & { statut: string | null })[];
  const versPlan = (statut: string) =>
    lignes
      .filter((m) => (m.statut ?? "actif") === statut)
      .map((m) => ({ module_type_id: m.module_type_id, x: m.x, y: m.y, pivote: !!m.pivote }));
  const planActif = versPlan("actif");
  const aPlanPrevu = w.plan_prevu_mois !== null && w.plan_prevu_mois !== undefined;
  const coutPlanPrevu = aPlanPrevu ? Number(w.plan_prevu_cout_centimes ?? 0) : 0;
  // Heure de mise en service du plan prévu, lisible : « vers 12 h 21 (dans 2 h) ».
  const planPrevuQuand = aPlanPrevu && w.plan_prevu_le ? versQuand(w.plan_prevu_le, Date.now()) : null;
  const parametres = chargerParametresV1();

  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);
  const maintenantMs = Date.now();
  const tous: SalarieFiche[] = ((employes ?? []) as Employe[]).map((e) => {
    // Même calcul que la page des salariés : valeur de départ + mois passés dans l'entreprise.
    const service = Math.max(0, moisCourant - (e.mois_jeu_debut ?? 0));
    return {
      id: e.id,
      poste: e.poste,
      experienceMois: e.experience_mois_debut + service,
      experienceJours: experienceJoursDepuis(e.cree_le, maintenantMs),
      ancienneteMois: e.anciennete_mois_debut + service,
      depuis: e.cree_le,
      salaireBrutCentimes: e.salaire_brut_mensuel_centimes,
    };
  });
  // 3D-7 : chaque local montre les artisans de ses propres postes (le moteur, lui, additionne tout).
  const salaries = salariesDuLocal(tous, locaux.map((l) => postesPoses(l)), indexLocal);

  const ecran = (
    <EcranAtelier
      key={w.id}
      societe={entreprise.nom}
      local={locaux.length > 1 ? `${nomLocal(w)} (local ${indexLocal + 1} sur ${locaux.length})` : nomLocal(w)}
      surfaceM2={w.surface_m2}
      workshopId={w.id}
      atelier={{ largeur: w.largeur_grille, hauteur: w.hauteur_grille, entree_x: w.entree_x, entree_y: w.entree_y }}
      planActif={planActif}
      planPrevu={aPlanPrevu ? versPlan("prevu") : null}
      coutPlanPrevu={coutPlanPrevu}
      planPrevuQuand={planPrevuQuand}
      tresorerie={Number(entreprise.tresorerie_centimes)}
      postesFournis={postesFournisDepuisParametres(parametres)}
      valeurNetteMateriel={valeurNetteMaterielEnService(
        (materiel ?? []) as { compte: string; sens: string; montant_centimes: number }[],
        coutPlanPrevu,
      )}
      salaries={salaries}
      catalogue={chargerModulesV1()}
      parametres={parametres}
    />
  );
  if (locaux.length <= 1) return ecran;

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Choisir le local" className="flex flex-wrap items-center gap-2">
        <span className="text-[0.84rem] text-muted">Tes locaux :</span>
        {locaux.map((l, i) => (
          <BoutonLien key={l.id} href={`/atelier-3d?local=${l.id}`} petit variante={l.id === w.id ? "principal" : "secondaire"}>
            {`${i + 1}. ${nomLocal(l)} · ${postesPoses(l)} poste${postesPoses(l) > 1 ? "s" : ""}`}
          </BoutonLien>
        ))}
      </nav>
      {ecran}
    </div>
  );
}
