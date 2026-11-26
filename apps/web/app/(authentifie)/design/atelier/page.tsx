import { chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { Alerte } from "../../../../components/ui";
import { EcranAtelier } from "../../atelier-3d/EcranAtelier";
import type { ModulePlace } from "../../atelier-3d/plan";

// Démonstration hors menu de l'écran « L'atelier » (adresse /design/atelier).
// DONNÉES D'EXEMPLE : aucune lecture en base, rien n'est enregistré. Les prix et effets viennent
// du catalogue réel ; la société, le plan et les salariés sont inventés pour l'affichage.

const PLAN: ModulePlace[] = [
  { module_type_id: "poste_couture_base", x: 3, y: 1, pivote: false },
  { module_type_id: "poste_couture_base", x: 5, y: 1, pivote: false },
  { module_type_id: "poste_couture_surjeteuse", x: 7, y: 1, pivote: false },
  { module_type_id: "table_coupe_simple", x: 3, y: 4, pivote: true },
  { module_type_id: "zone_stockage_etageres", x: 10, y: 1, pivote: false },
];

export default function PageDemoAtelier() {
  const catalogue = chargerModulesV1();
  const plan = PLAN.filter((m) => catalogue.some((c) => c.id === m.module_type_id));
  const parametres = chargerParametresV1();
  // Salaire d'exemple : le SMIC des paramètres (centimes).
  const smic = parametres["smic_mensuel_brut"]?.valeur ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <Alerte ton="alerte">Page de démonstration : données d&apos;exemple, pas celles de ta partie.</Alerte>
      <EcranAtelier
        societe="Maison Exemple"
        local="Petit atelier"
        surfaceM2={60}
        workshopId={null}
        atelier={{ largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3 }}
        planActif={plan}
        planPrevu={null}
        coutPlanPrevu={0}
        tresorerie={null}
        postesFournis={parametres["bail_machines_a_la_signature"]?.valeur ?? 0}
        valeurNetteMateriel={0}
        salaries={[
          { id: "ex-1", poste: "artisan", experienceMois: 8, experienceJours: 240, ancienneteMois: 8, depuis: "2026-03-02", salaireBrutCentimes: smic },
          { id: "ex-2", poste: "artisan", experienceMois: 1, experienceJours: 52, ancienneteMois: 1, depuis: "2026-10-05", salaireBrutCentimes: smic },
          { id: "ex-3", poste: "artisan", experienceMois: 0, experienceJours: 24, ancienneteMois: 0, depuis: "2026-11-02", salaireBrutCentimes: smic },
          { id: "ex-4", poste: "artisan", experienceMois: 0, experienceJours: 6, ancienneteMois: 0, depuis: "2026-11-20", salaireBrutCentimes: smic },
        ]}
        catalogue={catalogue}
        parametres={parametres}
      />
    </div>
  );
}
