// Test d'intégration pour T18 :
// 1. Un admin peut écrire dans market_data, chaque écriture va dans audit_log
// 2. Un joueur ne peut PAS écrire mais peut lire
// 3. lireValeurAvecFallback trouve la dernière valeur avant une date donnée
// 4. lireValeurAvecFallback tombe sur le fallback JSON si la donnée n'est pas en base

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Parametres } from "@kapital/content";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { lireValeurAvecFallback } from "./reader.js";

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

type Env = {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly anonKey: string;
  readonly dbConnectionString: string;
};

function lireEnv(): Env {
  const url = process.env["SUPABASE_URL"];
  const svc = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const dbPwd = process.env["SUPABASE_DB_PASSWORD"];
  if (!url || !svc || !anon || !dbPwd) {
    throw new Error("Variables manquantes (voir .env.local).");
  }
  const ref = url.replace(/^https:\/\//, "").split(".")[0]!;
  return {
    url,
    serviceRoleKey: svc,
    anonKey: anon,
    dbConnectionString: `postgresql://postgres:${encodeURIComponent(dbPwd)}@db.${ref}.supabase.co:5432/postgres`,
  };
}

async function supprimerUsersResiduels(admin: SupabaseClient, emails: readonly string[]): Promise<void> {
  const existing = await admin.auth.admin.listUsers();
  for (const u of existing.data.users) {
    if (u.email && emails.includes(u.email)) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

async function creerUser(admin: SupabaseClient, email: string, mdp: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: mdp,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Création ${email} : ${error?.message}`);
  return data.user.id;
}

async function clientAuth(env: Env, email: string, mdp: string): Promise<SupabaseClient> {
  const c = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`Login ${email} : ${error.message}`);
  return c;
}

function echec(message: string): never {
  console.error("ÉCHEC :", message);
  process.exit(1);
}

function succes(message: string): void {
  console.log("  OK   " + message);
}

export async function lancerTest(): Promise<void> {
  const env = lireEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const params = chargerParametresV1();

  const emailAdmin = `admin-${Date.now()}@kapital-test.local`;
  const emailJoueur = `joueur-${Date.now()}@kapital-test.local`;
  const mdp = "motDePasseTest123!";

  console.log("1/7 Préparation des utilisateurs test...");
  await supprimerUsersResiduels(admin, [emailAdmin, emailJoueur]);
  const idAdmin = await creerUser(admin, emailAdmin, mdp);
  const idJoueur = await creerUser(admin, emailJoueur, mdp);
  succes(`admin ${idAdmin}, joueur ${idJoueur}`);

  const pg = new Client({
    connectionString: env.dbConnectionString,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  try {
    await pg.query(
      "insert into public.profiles (id, pseudo, role) values ($1, $2, 'admin') on conflict (id) do update set role = 'admin'",
      [idAdmin, "adminTest"],
    );
    await pg.query(
      "insert into public.profiles (id, pseudo, role) values ($1, $2, 'joueur') on conflict (id) do update set role = 'joueur'",
      [idJoueur, "joueurTest"],
    );
    succes("profils créés (admin + joueur)");

    // Compte audit_log avant
    const audAvant = await pg.query("select count(*) from public.audit_log");
    const avantN = Number(audAvant.rows[0].count);

    console.log("2/7 Admin écrit une valeur €STR...");
    const clientAdmin = await clientAuth(env, emailAdmin, mdp);
    const insert = await clientAdmin.from("market_data").insert({
      donnee: "estr_annuel",
      valeur: 0.0342,
      source: "Test manuel",
      date_effet: "2026-11-19",
    }).select();
    if (insert.error) echec(`admin insert refusé : ${insert.error.message}`);
    succes("admin a pu écrire");

    console.log("3/7 L'audit_log a bien reçu l'écriture...");
    const audApres = await pg.query("select count(*) from public.audit_log");
    const apresN = Number(audApres.rows[0].count);
    if (apresN !== avantN + 1) {
      echec(`audit_log : ${avantN} → ${apresN}, attendu +1`);
    }
    succes(`audit_log a +1 entrée (${avantN} → ${apresN})`);

    console.log("4/7 Joueur ne doit PAS pouvoir écrire...");
    const clientJoueur = await clientAuth(env, emailJoueur, mdp);
    const joueurInsert = await clientJoueur.from("market_data").insert({
      donnee: "estr_annuel",
      valeur: 0.9,
      source: "Attaque",
      date_effet: "2026-11-20",
    });
    if (!joueurInsert.error) echec("joueur a réussi à écrire (RLS cassée)");
    succes("joueur refusé en écriture (RLS OK)");

    console.log("5/7 Joueur peut lire la valeur insérée...");
    const { data: lect, error: lectErr } = await clientJoueur
      .from("market_data")
      .select("donnee, valeur, date_effet")
      .eq("donnee", "estr_annuel");
    if (lectErr) echec(`joueur lecture : ${lectErr.message}`);
    if (!lect || lect.length === 0) echec("joueur n'a rien lu");
    succes(`joueur lit ${lect!.length} ligne(s)`);

    console.log("6/7 lireValeurAvecFallback trouve la valeur en base...");
    const v1 = await lireValeurAvecFallback(clientJoueur, params, "estr_annuel", "2026-11-19");
    if (!v1) echec("lireValeurAvecFallback null alors que la valeur existe");
    if (v1.valeur !== 0.0342) echec(`valeur inattendue : ${JSON.stringify(v1.valeur)}`);
    succes(`valeur €STR lue depuis la base : ${v1.valeur}`);

    console.log("7/7 lireValeurAvecFallback tombe sur le fallback JSON...");
    // Utilise une donnée qui est dans parametres-v1.json mais PAS encore en base
    const v2 = await lireValeurAvecFallback(
      clientJoueur,
      params,
      "cout_traitement_retour",
      "2026-11-19",
    );
    if (!v2) echec("fallback a rendu null, attendu : valeur du JSON");
    if (v2.valeur !== 1750) echec(`fallback valeur inattendue : ${v2.valeur}`);
    if (!v2.source.includes("campioni")) echec(`fallback source inattendue : ${v2.source}`);
    succes(`fallback JSON fonctionne (valeur ${v2.valeur}, source "${v2.source.slice(0, 30)}...")`);

    // Cleanup de la valeur insérée
    await pg.query("delete from public.market_data where donnee = 'estr_annuel' and date_effet = '2026-11-19'");

    console.log("\nTOUS LES TESTS T18 PASSENT");
  } finally {
    await pg.end();
    await admin.auth.admin.deleteUser(idAdmin).catch(() => undefined);
    await admin.auth.admin.deleteUser(idJoueur).catch(() => undefined);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  lancerTest().catch((err) => {
    console.error("Échec test T18 :", err);
    process.exit(1);
  });
}
