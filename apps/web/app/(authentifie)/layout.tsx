import Link from "next/link";
import { chargerParametresV1 } from "@kapital/content";
import { capitalDeDepart, quantiteSerieLancement } from "@kapital/engine";
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
          Nous n'avons pas pu ouvrir ta session. Recharge la page dans un instant ; si le
          problème continue, signale-le à l'équipe.
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
    .select("id, nom, tresorerie_centimes, etape, cree_le")
    .eq("owner_profile_id", user.id)
    .limit(1);
  if (!entreprises || entreprises.length === 0) {
    const params = chargerParametresV1();
    const capital = capitalDeDepart(params);
    return (
      <div className="mx-auto max-w-3xl px-8 py-16">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">Bienvenue</p>
        <h1 className="text-3xl font-semibold tracking-tight">Créer ma société</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Tu vas lancer ta marque de textile. Choisis son nom et sa gamme : c'est le point de départ
          de ton entreprise.
        </p>
        <FormulaireSociete
          capitalAffiche={formaterEuros(capital)}
          serieLancementPieces={quantiteSerieLancement(params)}
        />
      </div>
    );
  }
  const entreprise = entreprises[0]!;

  // Ossature de la maquette (.shell) : barre collée en haut, rail de 200 px
  // collé sous la barre, contenu en pleine largeur ; c'est la page qui défile.
  return (
    <div className="min-h-screen bg-bg px-4 pb-8">
      <BarreJeu
        companyId={entreprise.id}
        nomEntreprise={entreprise.nom}
        tresorerieInitiale={entreprise.tresorerie_centimes}
        etapeInitiale={entreprise.etape}
        creeLe={(entreprise.cree_le as string | null | undefined) ?? null}
      />
      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-6 pt-5 max-[900px]:grid-cols-1 max-[900px]:gap-3.5">
        <aside className="sticky top-[84px] flex flex-col gap-4 self-start max-[900px]:static">
          <NavLaterale />
          <div className="border-t border-line px-2.5 pt-3 text-xs text-muted max-[900px]:hidden">
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
        <main className="flex min-w-0 flex-col gap-5">{children}</main>
      </div>
    </div>
  );
}
