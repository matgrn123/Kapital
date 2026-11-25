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
  return (
    <div className="flex flex-col gap-3">
      <Alerte ton="alerte">Page de démonstration : données d&apos;exemple, pas celles de ta partie.</Alerte>
      <EcranAtelier
        societe="Maison Exemple"
        local="Petit atelier"
        surfaceM2={60}
        workshopId={null}
        atelier={{ largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3 }}
        planInitial={plan}
        salaries={[
          { id: "ex-1", poste: "artisan", experienceMois: 8 },
          { id: "ex-2", poste: "artisan", experienceMois: 1 },
        ]}
        catalogue={catalogue}
        parametres={chargerParametresV1()}
      />
    </div>
  );
}
