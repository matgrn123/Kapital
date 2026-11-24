"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LIENS = [
  { href: "/jeu", libelle: "Tableau de bord" },
  { href: "/vue-3d", libelle: "Vue 3D" },
  { href: "/produits", libelle: "Produits et prix" },
  { href: "/achats", libelle: "Achats" },
  { href: "/atelier", libelle: "Atelier" },
  { href: "/atelier-3d", libelle: "Atelier 3D" },
  { href: "/locaux", libelle: "Locaux" },
  { href: "/salaries", libelle: "Salariés" },
  { href: "/marketing", libelle: "Marketing" },
  { href: "/banque", libelle: "Banque" },
  { href: "/finances", libelle: "Finances" },
  { href: "/indicateurs", libelle: "Indicateurs" },
  { href: "/missions", libelle: "Missions" },
  { href: "/marche", libelle: "Marché" },
  { href: "/classement", libelle: "Classement" },
] as const;

export function NavLaterale() {
  const chemin = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      <ul className="space-y-0.5">
        {LIENS.map((l) => {
          const actif = chemin === l.href;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`block rounded-md px-3 py-2 text-sm transition ${
                  actif
                    ? "bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
                    : "text-[color:var(--color-g-700)] hover:bg-[color:var(--color-g-200)]"
                }`}
              >
                {l.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
