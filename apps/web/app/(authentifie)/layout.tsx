import Link from "next/link";
import { redirect } from "next/navigation";
import { creerClientServeur } from "../../lib/supabase/server";
import { NavLaterale } from "./NavLaterale";
import { FormulaireDeconnexion } from "./FormulaireDeconnexion";

export default async function LayoutAuthentifie({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

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
  if (!entreprises || entreprises.length === 0) redirect("/creer-entreprise");
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
          <FormulaireDeconnexion />
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
