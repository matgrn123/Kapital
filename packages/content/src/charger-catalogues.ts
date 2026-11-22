import batimentsBruts from "../batiments-v1.json" with { type: "json" };
import modulesBruts from "../modules-v1.json" with { type: "json" };
import { validerBatiments, validerModules } from "./valider-catalogues.js";
import type { TypeBatiment, TypeModule } from "./catalogues.js";

export function chargerBatimentsV1(): TypeBatiment[] {
  return validerBatiments(batimentsBruts);
}

export function chargerModulesV1(): TypeModule[] {
  return validerModules(modulesBruts);
}
