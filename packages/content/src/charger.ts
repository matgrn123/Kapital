import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateParametres, type Parametres } from "./validate.js";

const ici = dirname(fileURLToPath(import.meta.url));
const cheminParametres = resolve(ici, "..", "parametres-v1.json");

export function chargerParametresV1(): Parametres {
  const brut = JSON.parse(readFileSync(cheminParametres, "utf-8"));
  return validateParametres(brut);
}
