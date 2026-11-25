import { chargerModulesV1, type TypeBatiment, type TypeModule } from "@kapital/content";
import { centimes, resoudreModules, type Atelier, type Bail } from "@kapital/engine";

// Le seul endroit du banc qui construit l'Atelier du moteur.
//
// Depuis 3D-3, le moteur lit la liste des modules posés (Atelier.modules) : postes équipés,
// énergie et amortissement du matériel en découlent. Le banc ne suit que le type de chaque
// module ; leur position n'influe pas sur la production, on les range donc sur une ligne.

/** Un module posé dans l'atelier, tel que le banc le suit (type de module seulement). */
export type ModulePose = { readonly id_type: string };

/** Modules dont l'effet est un poste de travail d'artisan. */
export function estPosteArtisan(idType: string, catalogue: readonly TypeModule[] = chargerModulesV1()): boolean {
  const type = catalogue.find((m) => m.id === idType)?.effet.type;
  return type === "poste_artisan" || type === "poste_artisan_specialise";
}

export function nombrePostes(modules: readonly ModulePose[]): number {
  const catalogue = chargerModulesV1();
  return modules.filter((m) => estPosteArtisan(m.id_type, catalogue)).length;
}

/** Atelier loué : loyer et surface du catalogue des bâtiments, bail signé, postes posés. */
export function construireAtelier(e: {
  /** 3D-7 : identifiant du local (il suffixe ses écritures, comme workshops.id côté serveur). */
  readonly id: string;
  readonly batiment: TypeBatiment;
  readonly bail: Bail;
  readonly modulesPoses: readonly ModulePose[];
}): Atelier {
  return {
    id: e.id,
    surfaceM2: e.batiment.surface_m2,
    loyerMensuel: centimes(e.batiment.loyer_mensuel_centimes),
    modules: resoudreModules(
      e.modulesPoses.map((m, i) => ({ id_type: m.id_type, x: i + 1, y: 1, pivote: false })),
      chargerModulesV1(),
    ),
    bail: e.bail,
  };
}
