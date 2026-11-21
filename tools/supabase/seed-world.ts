// Crée un "Monde principal" actif s'il n'en existe pas.
// À exécuter une fois pour permettre aux joueurs de créer leur entreprise.

import { createClient } from "@supabase/supabase-js";

function env(cle: string): string {
  const v = process.env[cle];
  if (!v) throw new Error(`Variable d'environnement manquante : ${cle}`);
  return v;
}

export async function seederMonde(): Promise<string> {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const { data, error } = await client
    .from("worlds")
    .select("id, nom")
    .eq("etat", "actif")
    .limit(1);
  if (error) throw new Error(`Lecture : ${error.message}`);
  if (data && data.length > 0) {
    const w = data[0]!;
    console.log(`Monde actif déjà présent : "${w.nom}" (${w.id})`);
    return w.id as string;
  }
  const { data: cree, error: errIns } = await client
    .from("worlds")
    .insert({ nom: "Monde principal", etat: "actif", mois_courant: 0 })
    .select("id")
    .single();
  if (errIns || !cree) throw new Error(`Insertion : ${errIns?.message}`);
  console.log(`Monde créé : "Monde principal" (${cree.id})`);
  return cree.id as string;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seederMonde().catch((err) => {
    console.error("Échec seed monde :", err.message);
    process.exit(1);
  });
}
