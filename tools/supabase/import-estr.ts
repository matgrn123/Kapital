// Importe le taux €STR (Euro Short-Term Rate) depuis l'API BCE et l'écrit dans market_data.
//
// API BCE : https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT
// Format CSV plus simple à parser que SDMX JSON.
//
// Exécution :
//   node --env-file=../../.env.local --experimental-strip-types import-estr.ts
//   node --env-file=../../.env.local --experimental-strip-types import-estr.ts 2026-11-01 2026-11-30

import { createClient } from "@supabase/supabase-js";

const ECB_URL = "https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT";

function env(cle: string): string {
  const v = process.env[cle];
  if (!v) throw new Error(`Variable d'environnement manquante : ${cle}`);
  return v;
}

type ObservationEstr = {
  readonly date: string;
  readonly tauxPct: number;
};

async function recupererEstr(
  dateDebut: string,
  dateFin: string,
): Promise<readonly ObservationEstr[]> {
  const url = `${ECB_URL}?startPeriod=${dateDebut}&endPeriod=${dateFin}&format=csvdata`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`BCE : ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();
  const lignes = csv.trim().split("\n");
  if (lignes.length < 2) return [];
  const entete = lignes[0]!.split(",");
  const iTime = entete.indexOf("TIME_PERIOD");
  const iVal = entete.indexOf("OBS_VALUE");
  if (iTime < 0 || iVal < 0) {
    throw new Error("Colonnes TIME_PERIOD / OBS_VALUE absentes du CSV BCE.");
  }
  const obs: ObservationEstr[] = [];
  for (let i = 1; i < lignes.length; i++) {
    const cols = lignes[i]!.split(",");
    const t = cols[iTime];
    const v = cols[iVal];
    if (!t || !v) continue;
    const taux = Number(v);
    if (!Number.isFinite(taux)) continue;
    obs.push({ date: t, tauxPct: taux });
  }
  return obs;
}

async function pousserDansMarketData(
  observations: readonly ObservationEstr[],
): Promise<void> {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  for (const o of observations) {
    // €STR est publié en pourcentage annuel. On stocke en ratio (0.035 pour 3,5 %).
    const valeur = o.tauxPct / 100;
    const { error } = await client.from("market_data").upsert(
      {
        donnee: "estr_annuel",
        valeur,
        source: "Banque centrale européenne (ECB SDW, série EST.B.EU000A2X2A25.WT)",
        date_effet: o.date,
      },
      { onConflict: "donnee,date_effet" },
    );
    if (error) {
      throw new Error(`Upsert ${o.date} : ${error.message}`);
    }
  }
}

function dateIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const j = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

export async function importerEstr(
  dateDebut?: string,
  dateFin?: string,
): Promise<number> {
  const maintenant = new Date();
  const il_y_a_30j = new Date(maintenant.getTime() - 30 * 24 * 60 * 60 * 1000);
  const debut = dateDebut ?? dateIso(il_y_a_30j);
  const fin = dateFin ?? dateIso(maintenant);

  console.log(`Fetch €STR BCE de ${debut} à ${fin}...`);
  const obs = await recupererEstr(debut, fin);
  console.log(`  ${obs.length} observations récupérées.`);
  if (obs.length === 0) return 0;
  await pousserDansMarketData(obs);
  console.log(`  ${obs.length} observations écrites dans market_data.`);
  return obs.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , dateDebut, dateFin] = process.argv;
  importerEstr(dateDebut, dateFin).catch((err) => {
    console.error("Échec import €STR :", err.message);
    process.exit(1);
  });
}
