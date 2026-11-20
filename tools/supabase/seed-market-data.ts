// Seed : copie chaque entrée de parametres-v1.json dans market_data.
// Utilisé pour avoir des valeurs de départ en base avant tout import automatique.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parametres } from "@kapital/content";
import { createClient } from "@supabase/supabase-js";

const ici = dirname(fileURLToPath(import.meta.url));
const paramsJsonPath = resolve(
  ici,
  "..",
  "..",
  "packages",
  "content",
  "parametres-v1.json",
);
function chargerParametresV1(): Parametres {
  return JSON.parse(readFileSync(paramsJsonPath, "utf-8")) as Parametres;
}

function env(cle: string): string {
  const v = process.env[cle];
  if (!v) throw new Error(`Variable d'environnement manquante : ${cle}`);
  return v;
}

export async function seederMarketData(): Promise<number> {
  const params = chargerParametresV1();
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  let inserees = 0;
  for (const [cle, val] of Object.entries(params)) {
    const { error } = await client.from("market_data").upsert(
      {
        donnee: cle,
        valeur: val.valeur,
        source: val.source,
        date_effet: val.date,
      },
      { onConflict: "donnee,date_effet" },
    );
    if (error) {
      throw new Error(`Seed ${cle} : ${error.message}`);
    }
    inserees++;
  }
  console.log(`${inserees} paramètres seedés dans market_data.`);
  return inserees;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seederMarketData().catch((err) => {
    console.error("Échec seed :", err.message);
    process.exit(1);
  });
}
