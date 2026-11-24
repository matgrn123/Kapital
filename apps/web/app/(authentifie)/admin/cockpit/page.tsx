import Link from "next/link";
import { creerClientServeur } from "../../../../lib/supabase/server";
import { Cockpit } from "./Cockpit";

export default async function PageCockpit() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profil } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

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

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Administration · outil de développement
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Cockpit du monde</h1>
        <p className="mt-2 text-sm">
          <Link href="/admin" className="underline">
            ← Pilotage du monde
          </Link>
        </p>
      </header>
      <Cockpit />
    </div>
  );
}
