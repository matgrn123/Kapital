import { chargerModulesV1, type TypeBatiment, type TypeModule } from "@kapital/content";
import { centimes, type Atelier, type Bail } from "@kapital/engine";

// Le seul endroit du banc qui construit l'Atelier du moteur.
//
// Aujourd'hui, le moteur compte les postes avec `nombreMachines` (un artisan produit s'il
// a une machine). Le ticket 3D-3 remplace ce compteur par la liste des modules posés :
// quand il sera fusionné, seule cette fonction change (passer `modulesPoses` à l'Atelier,
// au lieu de les compter), le reste du banc manipule déjà une liste de modules.

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
  readonly batiment: TypeBatiment;
  readonly bail: Bail;
  readonly modulesPoses: readonly ModulePose[];
}): Atelier {
  return {
    surfaceM2: e.batiment.surface_m2,
    loyerMensuel: centimes(e.batiment.loyer_mensuel_centimes),
    nombreMachines: nombrePostes(e.modulesPoses),
    bail: e.bail,
  };
}
