import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDate } from "../../../lib/formatage";
import { FormulaireEmbauche, BoutonLicencier } from "./FormulaireEmbauche";

type Employee = {
  id: string;
  poste: "artisan" | "encadrement";
  salaire_brut_mensuel_centimes: number;
  cree_le: string;
};

export default async function PageSalaries() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, etape")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { data: employes } = await supabase
    .from("employees")
    .select("id, poste, salaire_brut_mensuel_centimes, cree_le")
    .eq("company_id", entreprise.id)
    .eq("statut", "actif")
    .order("cree_le");

  const employesTab = (employes ?? []) as Employee[];
  const totalBrut = employesTab.reduce((s, e) => s + e.salaire_brut_mensuel_centimes, 0);
  const totalCharge = Math.round(totalBrut * 1.42);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Ressources humaines
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Salariés</h1>
        <p className="mt-1 text-sm text-[color:var(--color-g-500)]">
          L'encadrement est débloqué à partir de l'étape 1.
        </p>
      </header>

      <section className="mt-10 grid grid-cols-3 gap-4">
        <Carte libelle="Effectif">
          <span className="chiffre">{employesTab.length}</span>
        </Carte>
        <Carte libelle="Masse salariale brute">
          <span className="chiffre">{formaterEuros(totalBrut)}</span> €
          <span className="block text-xs text-[color:var(--color-g-500)]">par mois</span>
        </Carte>
        <Carte libelle="Coût employeur (approx.)">
          <span className="chiffre">{formaterEuros(totalCharge)}</span> €
          <span className="block text-xs text-[color:var(--color-g-500)]">brut + 42 % charges</span>
        </Carte>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Effectif</h2>
        {employesTab.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-g-300)] px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
            Pas de salarié pour l'instant.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[color:var(--color-g-200)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Poste</th>
                  <th className="px-4 py-2 text-right font-medium">Salaire brut mensuel</th>
                  <th className="px-4 py-2 text-left font-medium">Date d'embauche</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {employesTab.map((e) => (
                  <tr key={e.id} className="border-t border-[color:var(--color-g-200)]">
                    <td className="px-4 py-2 capitalize">{e.poste}</td>
                    <td className="chiffre px-4 py-2 text-right">
                      {formaterEuros(e.salaire_brut_mensuel_centimes)} €
                    </td>
                    <td className="chiffre px-4 py-2 text-xs text-[color:var(--color-g-700)]">
                      {formaterDate(e.cree_le)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <BoutonLicencier id={e.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Embaucher</h2>
        <FormulaireEmbauche etape={entreprise.etape} />
      </section>
    </div>
  );
}

function Carte({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
        {libelle}
      </p>
      <p className="mt-2 text-xl font-medium">{children}</p>
    </div>
  );
}
