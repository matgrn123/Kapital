"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { creerClientNavigateur } from "../../lib/supabase/client";

export default function PageConnexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
      if (error) {
        setErreur(error.message);
        return;
      }
      router.push("/jeu");
    } catch (ex) {
      setErreur(ex instanceof Error ? ex.message : "Erreur inconnue");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Se connecter</h1>
          <p className="text-sm text-[color:var(--color-g-500)]">
            Retrouvez votre entreprise.
          </p>
        </header>

        <form onSubmit={soumettre} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[color:var(--color-g-300)] bg-[color:var(--color-blanc)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="mdp" className="block text-sm font-medium">Mot de passe</label>
            <input
              id="mdp"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="w-full rounded-md border border-[color:var(--color-g-300)] bg-[color:var(--color-blanc)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
            />
          </div>

          {erreur && (
            <p role="alert" className="text-sm text-[color:var(--color-erreur)]">{erreur}</p>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="w-full rounded-md bg-[color:var(--color-noir)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
          >
            {enCours ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="text-sm text-[color:var(--color-g-500)]">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-[color:var(--color-noir)] underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </main>
  );
}
