import Link from "next/link";
import { creerClientServeur } from "../../../lib/supabase/server";
import { etatPourVue3D, type DonneesVue3D } from "../../../lib/vue3d";
import { VueEntreprise } from "./VueEntreprise";

export default async function PageVue3D() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, tresorerie_centimes")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [
    { data: workshop },
    { data: commandesMatieres },
    { data: productions },
    { data: stocks },
    { data: employes },
    { data: marque },
  ] = await Promise.all([
    supabase
      .from("workshops")
      .select("surface_m2, nombre_machines")
      .eq("company_id", entreprise.id)
      .maybeSingle(),
    supabase
      .from("purchase_orders")
      .select("id")
      .eq("company_id", entreprise.id)
      .eq("statut", "en_cours"),
    supabase
      .from("production_orders")
      .select("id")
      .eq("company_id", entreprise.id)
      .eq("statut", "en_cours"),
    supabase
      .from("product_stock")
      .select("quantite_pieces")
      .eq("company_id", entreprise.id),
    supabase
      .from("employees")
      .select("id")
      .eq("company_id", entreprise.id)
      .eq("statut", "actif"),
    supabase
      .from("brand_state")
      .select("notoriete, desirabilite")
      .eq("company_id", entreprise.id)
      .maybeSingle(),
  ]);

  const totalPiecesFinis = (stocks ?? []).reduce(
    (s: number, r: { quantite_pieces: number }) => s + r.quantite_pieces,
    0,
  );

  const donnees: DonneesVue3D = {
    tresorerie_centimes: entreprise.tresorerie_centimes as number,
    commandes_matieres_en_cours: commandesMatieres?.length ?? 0,
    atelier: workshop
      ? {
          surface_m2: (workshop as { surface_m2: number; nombre_machines: number }).surface_m2,
          nombre_machines: (workshop as { surface_m2: number; nombre_machines: number }).nombre_machines,
        }
      : null,
    productions_en_cours: productions?.length ?? 0,
    stock_finis_total_pieces: totalPiecesFinis,
    nb_employes: employes?.length ?? 0,
    marque: marque
      ? {
          notoriete: (marque as { notoriete: number; desirabilite: number }).notoriete,
          desirabilite: (marque as { notoriete: number; desirabilite: number }).desirabilite,
        }
      : null,
  };

  const zones = etatPourVue3D(donnees);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* En-tête avec bascule */}
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
            Vue d'ensemble
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
            Votre entreprise
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
            transition: "background 0.15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          Vue classique
        </Link>
      </div>

      {/* Scène 3D — hauteur explicite pour que le canvas WebGL reçoive des pixels */}
      <div style={{ height: "calc(100dvh - 65px)" }}>
        <VueEntreprise zones={zones} />
      </div>
    </div>
  );
}
