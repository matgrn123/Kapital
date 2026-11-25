import { chargerBatimentsV1, chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { BoutonLien, Carte, EnTete, Etapes } from "../../../components/ui";
import { creerClientServeur } from "../../../lib/supabase/server";
import { EcranAtelier } from "./EcranAtelier";
import type { ModulePlace, SalarieAtelier } from "./plan";

// Écran « L'atelier » (design V2, maquette V.atelier), dessiné en SVG isométrique.
// placed_modules.x / y comptent les cases à partir de 1 (convention de validerPlanEtage).

type Employe = { id: string; poste: "artisan" | "encadrement"; experience_mois_debut: number; mois_jeu_debut: number | null };

export default async function PageAtelier() {
  const supabase = await creerClientServeur();
  const { data: entreprises } = await supabase.from("companies").select("id, nom").limit(1);
  const entreprise = entreprises?.[0] as { id: string; nom: string } | undefined;
  if (!entreprise) return null;

  const [{ data: workshop }, { data: employes }, { data: monde }] = await Promise.all([
    supabase
      .from("workshops")
      .select("id, batiment_id, surface_m2, largeur_grille, hauteur_grille, entree_x, entree_y")
      .eq("company_id", entreprise.id)
      .maybeSingle(),
    supabase
      .from("employees")
      .select("id, poste, experience_mois_debut, mois_jeu_debut")
      .eq("company_id", entreprise.id)
      .eq("statut", "actif")
      .order("cree_le"),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
  ]);

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

  const w = workshop as { id: string; batiment_id: string | null; surface_m2: number; largeur_grille: number; hauteur_grille: number; entree_x: number; entree_y: number };
  const { data: places } = await supabase
    .from("placed_modules")
    .select("module_type_id, x, y, pivote")
    .eq("workshop_id", w.id)
    .order("cree_le");

  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);
  const salaries: SalarieAtelier[] = ((employes ?? []) as Employe[]).map((e) => ({
    id: e.id,
    poste: e.poste,
    // Même calcul que la page des salariés : expérience de départ + mois passés dans l'entreprise.
    experienceMois: e.experience_mois_debut + Math.max(0, moisCourant - (e.mois_jeu_debut ?? 0)),
  }));

  return (
    <EcranAtelier
      societe={entreprise.nom}
      local={chargerBatimentsV1().find((b) => b.id === w.batiment_id)?.nom ?? "Local"}
      surfaceM2={w.surface_m2}
      workshopId={w.id}
      atelier={{ largeur: w.largeur_grille, hauteur: w.hauteur_grille, entree_x: w.entree_x, entree_y: w.entree_y }}
      planInitial={((places ?? []) as ModulePlace[]).map((m) => ({ ...m, pivote: !!m.pivote }))}
      salaries={salaries}
      catalogue={chargerModulesV1()}
      parametres={chargerParametresV1()}
    />
  );
}
