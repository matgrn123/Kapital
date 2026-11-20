import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ici = dirname(fileURLToPath(import.meta.url));
const racineDepot = resolve(ici, "..", "..");
const dossierMigrations = join(racineDepot, "supabase", "migrations");

function connectionStringDepuisEnv(): string {
  const direct = process.env["SUPABASE_DB_URL"];
  if (direct && direct.length > 0) return direct;

  const url = process.env["SUPABASE_URL"];
  const motDePasse = process.env["SUPABASE_DB_PASSWORD"];
  if (!url || !motDePasse) {
    throw new Error(
      "Fournir SUPABASE_DB_URL, ou SUPABASE_URL + SUPABASE_DB_PASSWORD dans .env.local.",
    );
  }
  const base = url.replace(/^https:\/\//, "").replace(/\/.*$/, "");
  const parts = base.split(".");
  if (parts.length < 2 || !parts[0]) {
    throw new Error(`SUPABASE_URL inattendu : ${url}`);
  }
  const ref = parts[0];
  const encodedPwd = encodeURIComponent(motDePasse);
  return `postgresql://postgres:${encodedPwd}@db.${ref}.supabase.co:5432/postgres`;
}

export async function appliquerMigrations(): Promise<void> {
  const fichiers = readdirSync(dossierMigrations)
    .filter((n) => n.endsWith(".sql"))
    .sort();

  if (fichiers.length === 0) {
    console.log("Aucun fichier .sql dans supabase/migrations/");
    return;
  }

  const connectionString = connectionStringDepuisEnv();
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    for (const fichier of fichiers) {
      const chemin = join(dossierMigrations, fichier);
      const sql = readFileSync(chemin, "utf-8");
      process.stdout.write(`Application de ${fichier}... `);
      await client.query(sql);
      console.log("ok");
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  appliquerMigrations().catch((err) => {
    console.error("Échec migration :", err);
    process.exit(1);
  });
}
