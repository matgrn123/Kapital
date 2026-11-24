import Link from "next/link";
import { creerClientServeur } from "../../lib/supabase/server";
import { NavLaterale } from "./NavLaterale";

export default async function LayoutAuthentifie({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Phase de développement : le middleware a déjà auto-connecté le visiteur
  // sur le compte partagé. Si l'auto-connexion a échoué (env mal configuré),
  // on affiche un message plutôt que de rediriger vers /connexion (supprimée).
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold">Connexion automatique indisponible</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Les variables KAPITAL_DEV_EMAIL et KAPITAL_DEV_PASSWORD ne sont pas
          configurées côté serveur. Lance{" "}
          <code>npm run configurer-compte-dev -w tools/supabase</code> et copie
          les valeurs affichées dans Vercel.
        </p>
      </div>
    );
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("pseudo, role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, nom")
    .eq("owner_profile_id", user.id)
    .limit(1);
  if (!entreprises || entreprises.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold">Compte sans entreprise</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Le compte partagé n'a pas d'entreprise associée. Vérifie la base.
        </p>
      </div>
    );
  }
  const entreprise = entreprises[0]!;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[color:var(--color-g-200)] bg-[color:var(--color-g-100)]">
        <div className="border-b border-[color:var(--color-g-200)] px-5 py-4">
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Kapital
          </p>
          <p className="truncate text-sm font-semibold">{entreprise.nom}</p>
        </div>
        <NavLaterale />
        <div className="border-t border-[color:var(--color-g-200)] px-5 py-3 text-xs">
          <p className="truncate text-[color:var(--color-g-700)]">
            {profil?.pseudo ?? user.email}
          </p>
          {profil?.role === "admin" && (
            <Link
              href="/admin"
              className="mt-2 block text-[color:var(--color-g-500)] underline hover:text-[color:var(--color-noir)]"
            >
              Administration
            </Link>
          )}
          {process.env.NEXT_PUBLIC_RETOUR_URL && (
            <a
              href={process.env.NEXT_PUBLIC_RETOUR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-[color:var(--color-g-500)] underline hover:text-[color:var(--color-noir)]"
            >
              Signaler un problème
            </a>
          )}
        </div>
      </aside>
      <main className="flex flex-col flex-1 overflow-y-auto bg-[color:var(--color-blanc)]">{children}</main>
    </div>
  );
}
