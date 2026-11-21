import { redirect } from "next/navigation";
import { creerClientServeur } from "../../lib/supabase/server";
import { FormulaireDeconnexion } from "./FormulaireDeconnexion";

export default async function PageJeu() {
  const supabase = await creerClientServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion");
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("pseudo")
    .eq("id", user.id)
    .maybeSingle();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, nom, gamme, etape, tresorerie_centimes, cree_le")
    .eq("owner_profile_id", user.id);

  if (!entreprises || entreprises.length === 0) {
    redirect("/creer-entreprise");
  }

  const entreprise = entreprises[0]!;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
      <header className="flex items-center justify-between border-b border-[color:var(--color-g-200)] pb-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Kapital
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {entreprise.nom}
          </h1>
        </div>
        <div className="text-right text-sm text-[color:var(--color-g-500)]">
          <p>{profil?.pseudo ?? user.email}</p>
          <FormulaireDeconnexion />
        </div>
      </header>

      <section className="mt-10 space-y-8">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
            <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
              Trésorerie
            </p>
            <p className="chiffre mt-2 text-2xl font-medium">
              {(entreprise.tresorerie_centimes / 100).toLocaleString("fr-FR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              €
            </p>
          </div>
          <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
            <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
              Gamme
            </p>
            <p className="mt-2 text-2xl font-medium capitalize">{entreprise.gamme}</p>
          </div>
          <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
            <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
              Étape
            </p>
            <p className="chiffre mt-2 text-2xl font-medium">{entreprise.etape}</p>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-[color:var(--color-g-300)] p-6">
          <p className="text-sm text-[color:var(--color-g-700)]">
            Votre entreprise est créée. Le tableau de bord complet (produits,
            commandes, marketing, finances) arrivera avec le prochain ticket.
          </p>
          <p className="chiffre mt-2 text-xs text-[color:var(--color-g-500)]">
            T19 → T20
          </p>
        </div>
      </section>
    </main>
  );
}
