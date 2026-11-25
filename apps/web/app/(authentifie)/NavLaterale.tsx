"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Menu regroupé par ce que le joueur cherche à faire, plutôt qu'une liste
// plate de quinze écrans. Les icônes sont de simples tracés, sans dépendance.

type Lien = { readonly href: string; readonly libelle: string; readonly icone: string };

const GROUPES: ReadonlyArray<{ readonly titre: string; readonly liens: ReadonlyArray<Lien> }> = [
  {
    titre: "Piloter",
    liens: [
      { href: "/jeu", libelle: "Tableau de bord", icone: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
      { href: "/vue-3d", libelle: "Vue 3D", icone: "M12 3l9 5v8l-9 5-9-5V8l9-5zM12 12l9-4M12 12v9M12 12L3 8" },
      { href: "/indicateurs", libelle: "Indicateurs", icone: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
      { href: "/missions", libelle: "Missions", icone: "M5 21V4h11l-2 4 2 4H5" },
    ],
  },
  {
    titre: "Produire",
    liens: [
      { href: "/produits", libelle: "Produits et prix", icone: "M8 4l4 2 4-2 5 4-3 3-2-1v10H8V10l-2 1-3-3 5-4z" },
      { href: "/achats", libelle: "Achats", icone: "M3 5h3l2 11h10l2-8H7M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z" },
      { href: "/atelier", libelle: "Atelier", icone: "M3 21V10l6 4v-4l6 4V5h6v16H3z" },
      { href: "/atelier-3d", libelle: "Atelier 3D", icone: "M4 4h16v16H4zM4 10h16M10 10v10" },
      { href: "/locaux", libelle: "Locaux", icone: "M4 21V5l8-2v18M12 9l8 2v10M2 21h20M7 8v1M7 12v1M7 16v1M16 14v1M16 17v1" },
      { href: "/salaries", libelle: "Salariés", icone: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 010 7M22 21c0-3-1-5-4-6" },
    ],
  },
  {
    titre: "Vendre",
    liens: [
      { href: "/marketing", libelle: "Marketing", icone: "M3 10v4h3l8 5V5L6 10H3zM18 9a4 4 0 010 6" },
      { href: "/marche", libelle: "Marché", icone: "M3 9l2-5h14l2 5M4 9v11h16V9M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M9 20v-6h6v6" },
    ],
  },
  {
    titre: "Financer",
    liens: [
      { href: "/banque", libelle: "Banque", icone: "M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" },
      { href: "/finances", libelle: "Finances", icone: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" },
    ],
  },
  {
    titre: "Le monde",
    liens: [
      { href: "/classement", libelle: "Classement", icone: "M8 4h8v5a4 4 0 01-8 0V4zM8 6H4c0 3 1.5 4.500 4 5M16 6h4c0 3-1.500 4.500-4 5M12 13v4M8 21h8M10 17h4" },
    ],
  },
];

export function NavLaterale() {
  const chemin = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menu du jeu">
      {GROUPES.map((g) => (
        <div key={g.titre} className="mb-4">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--color-nav-discret)]">
            {g.titre}
          </p>
          <ul className="space-y-0.5">
            {g.liens.map((l) => {
              const actif = chemin === l.href;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={actif ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition ${
                      actif
                        ? "bg-[color:var(--color-accent)] font-medium text-white"
                        : "text-[color:var(--color-nav-texte)] hover:bg-white/10 hover:text-white"
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
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
