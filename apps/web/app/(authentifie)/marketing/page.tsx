import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { ActionsMarketing } from "./ActionsMarketing";

type Marque = {
  notoriete: number;
  desirabilite: number;
};

type Action = {
  id: string;
  type: string;
  montant_centimes: number;
  instant: string;
};

const LIBELLE_ACTION: Record<string, string> = {
  publicite: "Publicité",
  image_marque: "Image de marque",
  promotion: "Promotion",
  relations_presse: "Relations presse",
};

export default async function PageMarketing() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, tresorerie_centimes")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: brand }, { data: actions }] = await Promise.all([
    supabase.from("brand_state").select("notoriete, desirabilite").eq("company_id", entreprise.id).maybeSingle(),
    supabase
      .from("marketing_actions")
      .select("id, type, montant_centimes, instant")
      .eq("company_id", entreprise.id)
      .order("instant", { ascending: false })
      .limit(10),
  ]);

  const marque = (brand ?? { notoriete: 0, desirabilite: 0 }) as Marque;
  const actionsTab = (actions ?? []) as Action[];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Marque
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Marketing</h1>
      </header>

      <section className="mt-10 grid grid-cols-2 gap-4">
        <Jauge libelle="Notoriété" valeur={marque.notoriete} />
        <Jauge libelle="Désirabilité" valeur={marque.desirabilite} />
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Lancer une action</h2>
        <ActionsMarketing
          tresorerie={entreprise.tresorerie_centimes}
          marque={marque}
        />
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          Dernières actions
        </h2>
        {actionsTab.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-g-300)] px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
            Pas d'action lancée pour l'instant.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[color:var(--color-g-200)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Action</th>
                  <th className="px-4 py-2 text-right font-medium">Montant</th>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {actionsTab.map((a) => (
                  <tr key={a.id} className="border-t border-[color:var(--color-g-200)]">
                    <td className="px-4 py-2">{LIBELLE_ACTION[a.type] ?? a.type}</td>
                    <td className="chiffre px-4 py-2 text-right">{formaterEuros(a.montant_centimes)} €</td>
                    <td className="chiffre px-4 py-2 text-xs text-[color:var(--color-g-700)]">
                      {formaterDateHeure(a.instant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Jauge({ libelle, valeur }: { libelle: string; valeur: number }) {
  const pct = Math.max(0, Math.min(100, valeur));
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          {libelle}
        </p>
        <p className="chiffre text-xl font-medium">{valeur.toFixed(1)} / 100</p>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-g-200)]">
        <div
          className="h-full bg-[color:var(--color-noir)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
