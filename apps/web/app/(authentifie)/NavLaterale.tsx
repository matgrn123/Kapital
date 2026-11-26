"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Menu du design V2 (docs/maquette) : trois groupes, Monde / Pilotage / Gestion,
// dans l'ordre de la maquette. Le classement est réuni avec les missions.

type Lien = { readonly href: string; readonly libelle: string; readonly icone: string };

const GROUPES: ReadonlyArray<{ readonly titre: string; readonly liens: ReadonlyArray<Lien> }> = [
  {
    titre: "Monde",
    liens: [
      { href: "/vue-3d", libelle: "Le village", icone: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" },
      { href: "/atelier-3d", libelle: "L'atelier", icone: "M4 20V9l5 3V9l5 3V6l6 3v11zM8 16h2M14 16h2" },
      { href: "/empire", libelle: "Mon empire", icone: "M3 21h18M4 21V11l4-3 4 3v10M12 21V7l4-3 4 3v14M7 14h2M15 11h2M15 15h2" },
    ],
  },
  {
    titre: "Pilotage",
    liens: [
      { href: "/jeu", libelle: "Tableau de bord", icone: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
      { href: "/journal", libelle: "Journal", icone: "M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10.3 20.5a2 2 0 0 0 3.4 0" },
      { href: "/missions", libelle: "Missions et classement", icone: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" },
      { href: "/indicateurs", libelle: "Indicateurs", icone: "M3 17l6-6 4 4 8-8M15 7h6v6" },
      { href: "/finances", libelle: "Finances", icone: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" },
    ],
  },
  {
    titre: "Gestion",
    liens: [
      { href: "/societe", libelle: "Société", icone: "M4 21V5l8-3 8 3v16M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4" },
      { href: "/atelier", libelle: "Production", icone: "M3 7h18v4H3zM5 11v9h14v-9M9 15h6" },
      { href: "/achats", libelle: "Achats", icone: "M20 7l-8-4-8 4v10l8 4 8-4zM4 7l8 4 8-4M12 11v10" },
      { href: "/marketing", libelle: "Publicité", icone: "M3 11v2l13 5V6zM16 9a3 3 0 0 1 0 6M6 14l1 5h3l-1-4" },
      { href: "/produits", libelle: "Vente", icone: "M3 4h2l2.5 11h11L21 7H7M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01" },
      { href: "/banque", libelle: "Banque et prêt", icone: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18" },
      { href: "/locaux", libelle: "Locaux", icone: "M3 21V9l9-6 9 6v12zM9 21v-7h6v7" },
      { href: "/salaries", libelle: "Embauche", icone: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" },
      { href: "/magasin", libelle: "Magasin physique", icone: "M3 9l2-5h14l2 5M3 9h18v3a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 14v7h14v-7M10 21v-4h4v4" },
      { href: "/marche", libelle: "Marché", icone: "M3 3v18h18M7 14l3-3 3 3 5-6" },
    ],
  },
];

export function NavLaterale() {
  const chemin = usePathname();
  return (
    <nav className="flex flex-col gap-4" aria-label="Menu du jeu">
      {GROUPES.map((g) => (
        <div key={g.titre} className="flex flex-col gap-0.5">
          <span className="px-2.5 pb-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
            {g.titre}
          </span>
          {g.liens.map((l) => {
            const actif = chemin === l.href || (l.href === "/missions" && (chemin === "/classement" || chemin.startsWith("/societes/")));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={actif ? "page" : undefined}
                className={`flex items-center gap-[9px] rounded-lg px-2.5 py-[7px] text-sm transition ${
                  actif ? "bg-accent-soft font-semibold text-accent" : "font-medium text-ink hover:bg-surface"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={l.icone} />
                </svg>
                {l.libelle}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
