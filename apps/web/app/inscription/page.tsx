"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { creerClientNavigateur } from "../../lib/supabase/client";

export default function PageInscription() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const supabase = creerClientNavigateur();
      const { data, error } = await supabase.auth.signUp({
        email,
        password: motDePasse,
        options: { data: { pseudo: pseudo.trim() } },
      });
      if (error) {
        setErreur(error.message);
        return;
      }
      if (!data.session) {
        setErreur(
          "Compte créé. Vérifiez votre email pour confirmer votre inscription, puis connectez-vous.",
        );
        return;
      }
      router.push("/creer-entreprise");
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
          <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
          <p className="text-sm text-[color:var(--color-g-500)]">
            Gratuit. Pseudo visible par les autres joueurs.
          </p>
        </header>

        <form onSubmit={soumettre} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="pseudo" className="block text-sm font-medium">Pseudo</label>
            <input
              id="pseudo"
              name="pseudo"
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              className="w-full rounded-md border border-[color:var(--color-g-300)] bg-[color:var(--color-blanc)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
            />
          </div>
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
              minLength={8}
              autoComplete="new-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="w-full rounded-md border border-[color:var(--color-g-300)] bg-[color:var(--color-blanc)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
            />
            <p className="text-xs text-[color:var(--color-g-500)]">Au moins 8 caractères.</p>
          </div>

          {erreur && (
            <p role="alert" className="text-sm text-[color:var(--color-erreur)]">{erreur}</p>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="w-full rounded-md bg-[color:var(--color-noir)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
          >
            {enCours ? "Création..." : "Créer mon compte"}
          </button>
        </form>

        <p className="text-sm text-[color:var(--color-g-500)]">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-medium text-[color:var(--color-noir)] underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
