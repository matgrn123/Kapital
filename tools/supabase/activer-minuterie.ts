// Active (ou désactive) la minuterie qui fait avancer le monde toutes les minutes.
//
// À lancer UNE FOIS, après le déploiement du serveur et la migration 0021 :
//
//   CRON_SECRET=... npm run activer-minuterie -w @kapital/tool-supabase -- https://mon-site.vercel.app
//   npm run activer-minuterie -w @kapital/tool-supabase -- --desactiver
//
// CRON_SECRET doit être la même valeur que dans les variables d'environnement Vercel :
// c'est elle que la route /api/admin/monde/avancer vérifie. Elle est rangée dans le
// coffre Supabase (Vault), jamais dans le dépôt.
//
// Tant que l'adresse et le secret ne sont pas dans le coffre, la minuterie ne fait rien.

import { Client } from "pg";

function connectionString(): string {
  const direct = process.env["SUPABASE_DB_URL"];
  if (direct && direct.length > 0) return direct;
  const url = process.env["SUPABASE_URL"];
  const pwd = process.env["SUPABASE_DB_PASSWORD"];
  if (!url || !pwd) {
    throw new Error("Fournir SUPABASE_DB_URL, ou SUPABASE_URL + SUPABASE_DB_PASSWORD dans .env.local.");
  }
  const ref = url.replace(/^https:\/\//, "").split(".")[0]!;
  return `postgresql://postgres:${encodeURIComponent(pwd)}@db.${ref}.supabase.co:5432/postgres`;
}

const NOM_URL = "kapital_avance_url";
const NOM_SECRET = "kapital_cron_secret";

async function enregistrerSecret(c: Client, nom: string, valeur: string): Promise<void> {
  const existant = await c.query("select id from vault.secrets where name = $1", [nom]);
  if (existant.rowCount && existant.rowCount > 0) {
    await c.query("select vault.update_secret($1::uuid, $2::text)", [existant.rows[0].id, valeur]);
  } else {
    await c.query("select vault.create_secret($1::text, $2::text)", [valeur, nom]);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const desactiver = args.includes("--desactiver");
  const adresse = args.find((a) => !a.startsWith("--"));

  const c = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const job = await c.query("select schedule, active from cron.job where jobname = 'kapital-avance-monde'");
    if (job.rowCount === 0) {
      throw new Error(
        "La tâche « kapital-avance-monde » n'existe pas : appliquer d'abord la migration 0021 (pg_cron et pg_net doivent être actives).",
      );
    }

    if (desactiver) {
      await c.query("delete from vault.secrets where name = any($1::text[])", [[NOM_URL, NOM_SECRET]]);
      console.log("Minuterie désactivée : adresse et secret retirés du coffre. Le monde n'avance plus seul.");
      return;
    }

    const secret = process.env["CRON_SECRET"];
    if (!adresse || !/^https:\/\//.test(adresse)) {
      throw new Error("Donner l'adresse du site en https, par exemple : https://mon-site.vercel.app");
    }
    if (!secret) {
      throw new Error("Il manque CRON_SECRET (même valeur que dans les variables d'environnement Vercel).");
    }
    const urlRoute = `${adresse.replace(/\/+$/, "")}/api/admin/monde/avancer`;

    await enregistrerSecret(c, NOM_URL, urlRoute);
    await enregistrerSecret(c, NOM_SECRET, secret);
    console.log(`Minuterie activée : ${urlRoute} sera appelée toutes les minutes (${job.rows[0].schedule}).`);
    console.log("Vérification : select status_code, created from net._http_response order by created desc limit 5;");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
