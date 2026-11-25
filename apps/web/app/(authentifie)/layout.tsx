import Link from "next/link";
import { chargerParametresV1 } from "@kapital/content";
import { capitalDeDepart } from "@kapital/engine";
import { creerClientServeur } from "../../lib/supabase/server";
import { formaterEuros } from "../../lib/formatage";
import { FormulaireSociete } from "./FormulaireSociete";
import { BarreJeu } from "./BarreJeu";
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

  // Le middleware connecte normalement le visiteur tout seul ; sinon, on l'explique sobrement.
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold">Connexion impossible pour le moment</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Nous n'avons pas pu ouvrir votre session. Rechargez la page dans un instant ; si le
          problème continue, signalez-le à l'équipe.
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
    .select("id, nom, tresorerie_centimes, etape")
    .eq("owner_profile_id", user.id)
    .limit(1);
  if (!entreprises || entreprises.length === 0) {
    const capital = capitalDeDepart(chargerParametresV1());
    return (
      <div className="mx-auto max-w-3xl px-8 py-16">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">Bienvenue</p>
        <h1 className="text-3xl font-semibold tracking-tight">Créer ma société</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Vous allez lancer votre marque de textile. Choisissez son nom et sa gamme : c'est le point
          de départ de votre entreprise.
        </p>
        <FormulaireSociete capitalAffiche={formaterEuros(capital)} />
      </div>
    );
  }
  const entreprise = entreprises[0]!;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <BarreJeu
        companyId={entreprise.id}
        nomEntreprise={entreprise.nom}
        tresorerieInitiale={entreprise.tresorerie_centimes}
        etapeInitiale={entreprise.etape}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[216px] shrink-0 flex-col overflow-y-auto px-3 pt-5">
          <NavLaterale />
          <div className="mt-auto border-t border-line px-2.5 py-3 text-xs text-muted">
            <p className="truncate">{profil?.pseudo ?? user.email}</p>
            {profil?.role === "admin" && (
              <Link href="/admin" className="mt-2 block underline hover:text-ink">
                Administration
              </Link>
            )}
            {process.env.NEXT_PUBLIC_RETOUR_URL && (
              <a
                href={process.env.NEXT_PUBLIC_RETOUR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block underline hover:text-ink"
              >
                Signaler un problème
              </a>
            )}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
