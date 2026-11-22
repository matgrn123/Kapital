import { redirect } from "next/navigation";
import { creerClientServeur } from "../../../lib/supabase/server";
import { BoutonAvancerMonde } from "./BoutonAvancerMonde";

export default async function PageAdmin() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profil?.role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold">Accès réservé</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Cette page est réservée aux administrateurs.
        </p>
      </div>
    );
  }

  const { data: mondes } = await supabase
    .from("worlds")
    .select("id, mois_courant, etat")
    .limit(1);
  const monde = mondes?.[0];

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Pilotage du monde</h1>
      </header>

      <section className="mt-8 rounded-md border border-[color:var(--color-g-200)] p-6">
        <h2 className="text-sm font-semibold">État</h2>
        <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-[color:var(--color-g-500)]">Mois courant</dt>
            <dd className="chiffre text-lg font-medium">{monde?.mois_courant ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-g-500)]">État</dt>
            <dd className="font-medium">{monde?.etat ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-md border border-[color:var(--color-g-200)] p-6">
        <h2 className="text-sm font-semibold">Avancer le monde manuellement</h2>
        <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
          Déclenche une avancée d'un mois jeu : calcule les ventes du mois sur
          la base des prix et des marques actuels, écrit les écritures
          comptables correspondantes et met à jour le mois courant. Le même
          traitement tourne automatiquement toutes les 30 minutes via le cron.
        </p>
        <div className="mt-4">
          <BoutonAvancerMonde />
        </div>
      </section>
    </div>
  );
}
