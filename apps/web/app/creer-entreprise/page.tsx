"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { creerClientNavigateur } from "../../lib/supabase/client";

type Gamme = "entree" | "milieu" | "haut";

export default function PageCreerEntreprise() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [gamme, setGamme] = useState<Gamme>("milieu");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [verif, setVerif] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/connexion");
        return;
      }
      const { data: entreprises } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_profile_id", user.id);
      if (entreprises && entreprises.length > 0) {
        router.replace("/jeu");
        return;
      }
      setVerif(false);
    })();
  }, [router]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch("/api/actions/creer-entreprise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: nom.trim(), gamme }),
      });
      const data = (await reponse.json()) as { error?: string };
      if (data.error) {
        setErreur(data.error);
        return;
      }
      router.push("/jeu");
    } catch (ex) {
      setErreur(ex instanceof Error ? ex.message : "Erreur inconnue");
    } finally {
      setEnCours(false);
    }
  }

  if (verif) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="text-sm text-[color:var(--color-g-500)]">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Créer votre entreprise</h1>
          <p className="text-sm text-[color:var(--color-g-500)]">
            Vous commencez avec{" "}
            <span className="chiffre">20 000 €</span> d'apport en banque.
          </p>
        </header>

        <form onSubmit={soumettre} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="nom" className="block text-sm font-medium">Nom de la marque</label>
            <input
              id="nom"
              name="nom"
              type="text"
              required
              minLength={2}
              maxLength={60}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full rounded-md border border-[color:var(--color-g-300)] bg-[color:var(--color-blanc)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
            />
          </div>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Gamme visée</span>
            <div className="grid grid-cols-3 gap-2">
              {(["entree", "milieu", "haut"] as const).map((g) => (
                <label
                  key={g}
                  className={`cursor-pointer rounded-md border px-3 py-2.5 text-center text-sm transition ${
                    gamme === g
                      ? "border-[color:var(--color-noir)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
                      : "border-[color:var(--color-g-300)] hover:bg-[color:var(--color-g-100)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="gamme"
                    value={g}
                    checked={gamme === g}
                    onChange={() => setGamme(g)}
                    className="sr-only"
                  />
                  {g === "entree" ? "Entrée" : g === "milieu" ? "Milieu" : "Haut"}
                </label>
              ))}
            </div>
          </div>

          {erreur && (
            <p role="alert" className="text-sm text-[color:var(--color-erreur)]">{erreur}</p>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="w-full rounded-md bg-[color:var(--color-noir)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
          >
            {enCours ? "Création..." : "Démarrer l'aventure"}
          </button>
        </form>
      </div>
    </main>
  );
}
