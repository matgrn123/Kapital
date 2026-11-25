// Prépare le compte du « robot testeur » utilisé par le skill /runcompany.
//
// Le robot joue comme un vrai joueur, mais sur un compte et une société à
// part : il ne touche jamais au compte partagé (LVMH) ni aux autres joueurs.
//
// Ce script :
// 1. crée le compte robot s'il n'existe pas (rôle joueur, jamais admin) ;
// 2. lui donne un nouveau mot de passe aléatoire (jamais affiché) ;
// 3. avec --neuf, supprime la société du robot pour repartir de zéro
//    (uniquement les sociétés dont le robot est propriétaire) ;
// 4. ouvre une session et écrit les cookies de connexion dans
//    .playwright/robot-session.json (dossier ignoré par git), au format
//    attendu par Playwright (context.addCookies).
//
// Usage :
//   npm run compte-robot -w tools/supabase -- --site https://kapital-six.vercel.app
//   npm run compte-robot -w tools/supabase -- --site http://localhost:3000 --neuf

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EMAIL_ROBOT = "robot-testeur@kapital.test";
const PSEUDO_ROBOT = "robot-testeur";

function env(cle: string): string {
  const v = process.env[cle];
  if (!v) throw new Error(`Variable d'environnement manquante : ${cle}`);
  return v;
}

function lireArguments(): { site: string; neuf: boolean } {
  const args = process.argv.slice(2);
  const i = args.indexOf("--site");
  const site = i >= 0 ? args[i + 1] : undefined;
  if (!site || !/^https?:\/\//.test(site)) {
    throw new Error("Indique le site visé : --site https://… (ou http://localhost:3000)");
  }
  return { site: new URL(site).origin, neuf: args.includes("--neuf") };
}

async function trouverRobot(admin: SupabaseClient): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Lecture des comptes : ${error.message}`);
    const trouve = data.users.find((u) => u.email === EMAIL_ROBOT);
    if (trouve) return trouve.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const { site, neuf } = lireArguments();
  const url = env("SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
  const motDePasse = randomBytes(24).toString("base64url");

  // 1 et 2. Compte robot + nouveau mot de passe
  let robotId = await trouverRobot(admin);
  if (robotId) {
    const { error } = await admin.auth.admin.updateUserById(robotId, { password: motDePasse });
    if (error) throw new Error(`Mot de passe du robot : ${error.message}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL_ROBOT,
      password: motDePasse,
      email_confirm: true,
      user_metadata: { pseudo: PSEUDO_ROBOT },
    });
    if (error || !data.user) throw new Error(`Création du robot : ${error?.message}`);
    robotId = data.user.id;
  }

  // Le robot est un joueur ordinaire : on refuse de continuer s'il est admin.
  const { data: profil, error: errProfil } = await admin
    .from("profiles")
    .select("pseudo, role")
    .eq("id", robotId)
    .maybeSingle();
  if (errProfil) throw new Error(`Lecture du profil : ${errProfil.message}`);
  if (!profil) throw new Error("Le profil du robot n'a pas été créé (trigger d'inscription).");
  if (profil.role === "admin") {
    throw new Error("Le compte robot est admin : anormal, on s'arrête.");
  }

  // 3. Remise à zéro : uniquement les sociétés du robot.
  let societesSupprimees = 0;
  if (neuf) {
    const { data, error } = await admin
      .from("companies")
      .delete()
      .eq("owner_profile_id", robotId)
      .select("id");
    if (error) throw new Error(`Suppression de la société du robot : ${error.message}`);
    societesSupprimees = data?.length ?? 0;
  }

  const { data: societes, error: errSoc } = await admin
    .from("companies")
    .select("nom, gamme, etape, tresorerie_centimes")
    .eq("owner_profile_id", robotId)
    .limit(1);
  if (errSoc) throw new Error(`Lecture de la société : ${errSoc.message}`);
  const societe = societes?.[0] ?? null;

  // 4. Session : on laisse @supabase/ssr écrire les cookies exactement comme
  // le site les lira.
  const pot = new Map<string, string>();
  const client = createServerClient(url, env("SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => [...pot].map(([name, value]) => ({ name, value })),
      setAll: (liste: Array<{ name: string; value: string }>) => {
        for (const c of liste) {
          if (c.value) pot.set(c.name, c.value);
          else pot.delete(c.name);
        }
      },
    },
  });
  const { error: errConnexion } = await client.auth.signInWithPassword({
    email: EMAIL_ROBOT,
    password: motDePasse,
  });
  if (errConnexion) throw new Error(`Connexion du robot : ${errConnexion.message}`);
  if (pot.size === 0) throw new Error("Aucun cookie de session produit.");

  const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const fichier = resolve(racine, ".playwright/robot-session.json");
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(
    fichier,
    JSON.stringify(
      { site, cookies: [...pot].map(([name, value]) => ({ name, value, url: site })) },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  console.log(
    JSON.stringify(
      {
        compte: PSEUDO_ROBOT,
        pseudoAffiche: profil.pseudo,
        role: profil.role,
        site,
        societesSupprimees,
        societe,
        fichierSession: fichier,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("Échec :", (err as Error).message);
  process.exit(1);
});
