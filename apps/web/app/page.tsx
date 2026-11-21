import Link from "next/link";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <div className="space-y-12">
        <header className="space-y-2">
          <h1 className="text-5xl font-semibold tracking-tight">Kapital</h1>
          <p className="text-lg text-[color:var(--color-g-500)]">
            Jeu de gestion d'entreprise, en français, à votre rythme.
          </p>
        </header>

        <section className="space-y-4 text-sm leading-relaxed">
          <p>
            Vous créez une marque de textile. Vous décidez des prix, des
            commandes, des embauches. Votre monde avance en continu — un jour
            réel compte pour un mois de jeu. Vous apprenez le coût de revient,
            la trésorerie, et le besoin en fonds de roulement en jouant.
          </p>
          <p className="text-[color:var(--color-g-500)]">
            V1, module Entrepreneur textile — étapes 0 à 2.
          </p>
        </section>

        <nav className="flex gap-3">
          <Link
            href="/inscription"
            className="rounded-md bg-[color:var(--color-noir)] px-5 py-2.5 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)]"
          >
            Créer un compte
          </Link>
          <Link
            href="/connexion"
            className="rounded-md border border-[color:var(--color-g-300)] px-5 py-2.5 text-sm font-medium transition hover:bg-[color:var(--color-g-100)]"
          >
            Se connecter
          </Link>
        </nav>
      </div>
    </main>
  );
}
