import parametresBruts from "../parametres-v1.json" with { type: "json" };
import { validateParametres, type Parametres } from "./validate.js";

// Import ESM du JSON : le bundler (Next/Vercel) l'embarque dans le code
// serverless. Avant on utilisait readFileSync + resolve() avec import.meta.url,
// ce qui marche en dev mais échoue sur Vercel où le JSON n'est pas trace par
// next-file-tracing.

export function chargerParametresV1(): Parametres {
  return validateParametres(parametresBruts);
}
