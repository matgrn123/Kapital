export {
  validateParametres,
  ValidationError,
} from "./validate.js";
export type { Parametres, ParametreValue } from "./validate.js";
export { chargerParametresV1 } from "./charger.js";

export { validerBatiments, validerModules } from "./valider-catalogues.js";
export { chargerBatimentsV1, chargerModulesV1 } from "./charger-catalogues.js";
export type {
  CategorieBatiment,
  EffetModule,
  TypeBatiment,
  TypeModule,
} from "./catalogues.js";

export { chargerFilRougeLV, validerFilRouge, ECRANS_FIL_ROUGE } from "./fil-rouge.js";
export type { EcranFilRouge, TexteFilRouge } from "./fil-rouge.js";
