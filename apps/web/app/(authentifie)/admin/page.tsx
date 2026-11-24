import Link from "next/link";
import { creerClientServeur } from "../../../lib/supabase/server";
import { BoutonAvancerMonde } from "./BoutonAvancerMonde";
import { BoutonApprovisionnerAdmin } from "./BoutonApprovisionnerAdmin";

export default async function PageAdmin() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold">Non authentifié</h1>
      </div>
    );
  }

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

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, nom, gamme")
    .order("nom");
  const { data: produitsRef } = await supabase
    .from("products")
    .select("id, nom")
    .order("nom");

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
        <h2 className="text-sm font-semibold">Mettre le monde à jour</h2>
        <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
          Le monde avance tout seul, au rythme d'un pas par minute réelle (un mois de
          jeu par jour réel), pour tous les joueurs. Ce bouton fait rattraper
          immédiatement les pas manquants à toutes les entreprises ; il ne change
          pas l'heure du jeu. Pour suivre le monde en direct, ouvrir le{" "}
          <Link href="/admin/cockpit" className="underline">
            cockpit
          </Link>
          .
        </p>
        <div className="mt-4">
          <BoutonAvancerMonde />
        </div>
      </section>

      <section className="mt-6 rounded-md border border-[color:var(--color-g-200)] p-6">
        <h2 className="text-sm font-semibold">Approvisionner un stock (recette)</h2>
        <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
          Ajoute des pièces au stock d'une entreprise au coût de revient estimé.
          Débite la trésorerie et écrit 35 débit / 512 crédit. Utile pour les
          testeurs en attendant le vrai flux atelier/façonnier (T27/T28).
        </p>
        <div className="mt-4">
          <BoutonApprovisionnerAdmin
            entreprises={((entreprises ?? []) as Array<{
              id: string;
              nom: string;
              gamme: string;
            }>).map((e) => ({ id: e.id, nom: e.nom, gamme: e.gamme }))}
            produits={((produitsRef ?? []) as Array<{ id: string; nom: string }>).map(
              (p) => ({ id: p.id, nom: p.nom }),
            )}
          />
        </div>
      </section>
    </div>
  );
}
