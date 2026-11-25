export {
  validateParametres,
  ValidationError,
} from "./validate.js";
export type { Parametres, ParametreValue } from "./validate.js";
export { chargerParametresV1 } from "./charger.js";

export { LICENCE_DESSIN_SVG, validerBatiments, validerModules } from "./valider-catalogues.js";
export { chargerBatimentsV1, chargerModulesV1 } from "./charger-catalogues.js";
export type {
  CategorieBatiment,
  EffetBatiment,
  EffetModule,
  GrilleBatiment,
  TypeBatiment,
  TypeModule,
} from "./catalogues.js";

export { chargerFilRougeLV, validerFilRouge, ECRANS_FIL_ROUGE } from "./fil-rouge.js";
export type { EcranFilRouge, TexteFilRouge } from "./fil-rouge.js";
