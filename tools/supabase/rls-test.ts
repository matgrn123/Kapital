import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

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
  const dbDirect = process.env["SUPABASE_DB_URL"];
  const dbPwd = process.env["SUPABASE_DB_PASSWORD"];
  if (!url || !svc || !anon) {
    throw new Error("Il manque SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  }
  let dbUrl: string;
  if (dbDirect && dbDirect.length > 0) {
    dbUrl = dbDirect;
  } else {
    if (!dbPwd) {
      throw new Error("Il manque SUPABASE_DB_URL ou SUPABASE_DB_PASSWORD");
    }
    const ref = url.replace(/^https:\/\//, "").split(".")[0]!;
    dbUrl = `postgresql://postgres:${encodeURIComponent(dbPwd)}@db.${ref}.supabase.co:5432/postgres`;
  }
  return {
    url,
    serviceRoleKey: svc,
    anonKey: anon,
    dbConnectionString: dbUrl,
  };
}

type UtilisateurTest = {
  readonly email: string;
  readonly motDePasse: string;
  readonly id: string;
  readonly pseudo: string;
};

async function creerUtilisateur(
  admin: SupabaseClient,
  email: string,
  motDePasse: string,
  pseudo: string,
): Promise<UtilisateurTest> {
  // Supprime un éventuel user résiduel avec le même mail
  const existing = await admin.auth.admin.listUsers();
  for (const u of existing.data.users) {
    if (u.email === email) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Création user ${email} : ${error?.message}`);
  return { email, motDePasse, id: data.user.id, pseudo };
}

async function supprimerUtilisateur(admin: SupabaseClient, id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id).catch(() => undefined);
}

async function clientAuthentifie(
  env: Env,
  email: string,
  motDePasse: string,
): Promise<SupabaseClient> {
  const c = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: motDePasse });
  if (error || !data.session) throw new Error(`Login ${email} : ${error?.message}`);
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

  const emailA = `a-${Date.now()}@kapital-test.local`;
  const emailB = `b-${Date.now()}@kapital-test.local`;
  const pwd = "motDePasseTestSuffisant123!";

  console.log("1/6 Création des deux utilisateurs...");
  const userA = await creerUtilisateur(admin, emailA, pwd, "joueurA");
  const userB = await creerUtilisateur(admin, emailB, pwd, "joueurB");
  succes(`user A id ${userA.id}`);
  succes(`user B id ${userB.id}`);

  // On utilise le service_role pour poser les profils et un monde, puis chaque user crée sa boîte.
  const pg = new Client({
    connectionString: env.dbConnectionString,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  try {
    await pg.query(
      "insert into public.profiles (id, pseudo) values ($1, $2) on conflict (id) do nothing",
      [userA.id, userA.pseudo],
    );
    await pg.query(
      "insert into public.profiles (id, pseudo) values ($1, $2) on conflict (id) do nothing",
      [userB.id, userB.pseudo],
    );
    const worldRes = await pg.query(
      "insert into public.worlds (nom) values ('monde_test_rls') returning id",
    );
    const worldId = worldRes.rows[0]!.id as string;
    succes(`monde créé ${worldId}`);

    try {
      console.log("2/6 User A crée son entreprise (via session Supabase)...");
      const clientA = await clientAuthentifie(env, userA.email, userA.motDePasse);
      const { data: entA, error: errA } = await clientA
        .from("companies")
        .insert({
          world_id: worldId,
          owner_profile_id: userA.id,
          nom: "Marque A",
          gamme: "milieu",
          tresorerie_centimes: 2_000_000,
        })
        .select()
        .single();
      if (errA || !entA) echec(`création entreprise A : ${errA?.message}`);
      succes(`entreprise A ${entA.id}`);

      console.log("3/6 User B crée son entreprise...");
      const clientB = await clientAuthentifie(env, userB.email, userB.motDePasse);
      const { data: entB, error: errB } = await clientB
        .from("companies")
        .insert({
          world_id: worldId,
          owner_profile_id: userB.id,
          nom: "Marque B",
          gamme: "entree",
          tresorerie_centimes: 2_000_000,
        })
        .select()
        .single();
      if (errB || !entB) echec(`création entreprise B : ${errB?.message}`);
      succes(`entreprise B ${entB.id}`);

      console.log("4/6 Critère : user A ne doit PAS voir l'entreprise B dans companies...");
      const { data: visibleParA, error: errSel } = await clientA
        .from("companies")
        .select("id, nom")
        .eq("id", entB.id);
      if (errSel) echec(`select pour A : ${errSel.message}`);
      if (!visibleParA || visibleParA.length !== 0) {
        echec(`FUITE : A voit ${visibleParA?.length} ligne(s) de B dans companies`);
      }
      succes("A ne voit pas l'entreprise B dans companies (RLS OK)");

      console.log("5/6 User A voit sa propre entreprise...");
      const { data: visibleAself, error: errSelf } = await clientA
        .from("companies")
        .select("id, nom")
        .eq("id", entA.id);
      if (errSelf || !visibleAself || visibleAself.length !== 1) {
        echec("A ne voit pas sa propre entreprise !");
      }
      succes("A voit sa propre entreprise");

      console.log("6/6 User A voit les deux entreprises dans la vue publique...");
      const { data: publique, error: errVue } = await clientA
        .from("companies_publiques")
        .select("id, nom, gamme, etape")
        .eq("world_id", worldId);
      if (errVue) echec(`vue publique : ${errVue.message}`);
      if (!publique || publique.length !== 2) {
        echec(`vue publique rend ${publique?.length} lignes au lieu de 2`);
      }
      const colonnes = Object.keys(publique[0] ?? {});
      const colonnesAttendues = ["id", "nom", "gamme", "etape"];
      for (const c of colonnesAttendues) {
        if (!colonnes.includes(c)) echec(`vue publique : colonne ${c} manquante`);
      }
      // On ne doit pas pouvoir atteindre tresorerie_centimes via la vue
      // (la vue ne l'expose pas, donc la requête devrait refuser cette colonne)
      const { error: errSensible } = await clientA
        .from("companies_publiques")
        .select("tresorerie_centimes");
      if (!errSensible) {
        echec("La vue publique expose la trésorerie !");
      }
      succes("la vue publique rend nom/gamme/etape pour les 2 entreprises, pas la trésorerie");

      console.log("\nTOUS LES TESTS RLS PASSENT");
    } finally {
      await pg.query("delete from public.worlds where id = $1", [worldId]);
    }
  } finally {
    await pg.end();
    await supprimerUtilisateur(admin, userA.id);
    await supprimerUtilisateur(admin, userB.id);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  lancerTest().catch((err) => {
    console.error("Échec test RLS :", err);
    process.exit(1);
  });
}
