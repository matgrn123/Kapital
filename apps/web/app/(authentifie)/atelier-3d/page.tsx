import Link from "next/link";
import { creerClientServeur } from "../../../lib/supabase/server";
import { chargerModulesV1 } from "@kapital/content";
import { VueAtelier } from "./VueAtelier";
import type { ModulePose, InfoModule } from "./SceneAtelierInterieur";

export default async function PageAtelier3D() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: workshop }, { data: placedModules }] = await Promise.all([
    supabase
      .from("workshops")
      .select("id, surface_m2, largeur_grille, hauteur_grille, entree_x, entree_y")
      .eq("company_id", entreprise.id)
      .maybeSingle(),
    supabase
      .from("placed_modules")
      .select("id, module_type_id, x, y, pivote")
      .order("cree_le"),
  ]);

  const modulesCatalogue = chargerModulesV1();
  const catalogue: InfoModule[] = modulesCatalogue.map((m) => ({
    id: m.id,
    nom: m.nom,
    largeur_grille: m.largeur_grille,
    hauteur_grille: m.hauteur_grille,
    effet_type: m.effet.type,
  }));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid #f3f4f6",
          background: "white",
          flexShrink: 0,
        }}
      >
        <div>
          <p
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#9ca3af",
              margin: 0,
            }}
          >
            Atelier
          </p>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              margin: "2px 0 0",
              color: "#111827",
              letterSpacing: "-0.02em",
            }}
          >
            Plan d'aménagement
          </h1>
        </div>

        <Link
          href="/atelier"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            background: "white",
            fontSize: "12px",
            fontWeight: 500,
            color: "#374151",
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          Vue classique
        </Link>
      </div>

      {workshop ? (
        <div style={{ height: "calc(100dvh - 65px)" }}>
          <VueAtelier
            largeur={(workshop as { largeur_grille: number }).largeur_grille}
            hauteur={(workshop as { hauteur_grille: number }).hauteur_grille}
            entree_x={(workshop as { entree_x: number }).entree_x}
            entree_y={(workshop as { entree_y: number }).entree_y}
            modules={(placedModules ?? []) as ModulePose[]}
            catalogue={catalogue}
          />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            color: "#6b7280",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: "15px" }}>Vous n'avez pas encore d'atelier.</p>
          <Link
            href="/atelier"
            style={{
              padding: "8px 16px",
              background: "#111827",
              color: "white",
              borderRadius: "8px",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            Louer un atelier
          </Link>
        </div>
      )}
    </div>
  );
}
