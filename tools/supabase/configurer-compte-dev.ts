// Prépare le compte partagé pendant la phase de développement.
//
// Trouve le compte joueur dont l'entreprise est nommée KAPITAL_DEV_COMPANY
// (défaut : "LVMH"), reset son mot de passe à une valeur aléatoire forte,
// promeut son profil en admin, et affiche les credentials à copier dans Vercel
// et .env.local sous KAPITAL_DEV_EMAIL / KAPITAL_DEV_PASSWORD.
//
// Le middleware (apps/web/lib/supabase/middleware.ts) utilisera ces
// credentials pour auto-connecter chaque visiteur sur ce compte.
//
// Usage : npm run configurer-compte-dev -w tools/supabase

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

function env(cle: string): string {
  const v = process.env[cle];
  if (!v) throw new Error(`Variable d'environnement manquante : ${cle}`);
  return v;
}

function genererMotDePasse(): string {
  // 32 caractères alphanumériques, suffisant pour supabase (min 6)
  return randomBytes(24).toString("base64url");
}

async function main() {
  const nomCompany = process.env.KAPITAL_DEV_COMPANY ?? "LVMH";
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  // 1. Trouver l'entreprise cible
  const { data: company, error: errComp } = await admin
    .from("companies")
    .select("id, owner_profile_id, nom")
    .eq("nom", nomCompany)
    .maybeSingle();
  if (errComp) throw new Error(`Lecture company : ${errComp.message}`);
  if (!company) {
    throw new Error(
      `Aucune entreprise "${nomCompany}" en base. Définis KAPITAL_DEV_COMPANY sur le nom exact d'une entreprise joueur existante.`,
    );
  }
  if (!company.owner_profile_id) {
    throw new Error(
      `L'entreprise "${nomCompany}" n'a pas de propriétaire (probablement un PNJ). Choisis une autre entreprise.`,
    );
  }

  // 2. Récupérer l'email de ce user
  const { data: userResp, error: errUser } = await admin.auth.admin.getUserById(
    company.owner_profile_id,
  );
  if (errUser || !userResp.user) {
    throw new Error(`auth.users ${company.owner_profile_id} introuvable : ${errUser?.message}`);
  }
  const email = userResp.user.email;
  if (!email) {
    throw new Error("L'utilisateur n'a pas d'email.");
  }

  // 3. Reset son password à une valeur connue
  const motDePasse = genererMotDePasse();
  const { error: errPwd } = await admin.auth.admin.updateUserById(
    company.owner_profile_id,
    { password: motDePasse },
  );
  if (errPwd) throw new Error(`Reset password : ${errPwd.message}`);

  // 4. Promouvoir son profil en admin
  const { error: errRole } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", company.owner_profile_id);
  if (errRole) throw new Error(`Promouvoir admin : ${errRole.message}`);

  console.log("");
  console.log("Compte partagé configuré :");
  console.log(`  Entreprise : ${company.nom}`);
  console.log(`  Rôle       : admin`);
  console.log("");
  console.log("Variables à définir dans Vercel (Production + Preview + Development)");
  console.log("ET dans apps/web/.env.local pour le dev local :");
  console.log("");
  console.log(`KAPITAL_DEV_EMAIL=${email}`);
  console.log(`KAPITAL_DEV_PASSWORD=${motDePasse}`);
  console.log("");
  console.log("Après avoir défini ces variables, le site auto-connecte chaque");
  console.log("visiteur sur ce compte. Pour revenir à une vraie auth avant");
  console.log("l'ouverture publique, retire ces variables de Vercel.");
}

main().catch((err) => {
  console.error("Échec :", err.message);
  process.exit(1);
});
