import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDate } from "../../../lib/formatage";
import { FormulairePret } from "./FormulairePret";

type Loan = {
  id: string;
  capital_initial_centimes: number;
  capital_restant_centimes: number;
  taux_annuel: number;
  duree_mois: number;
  instant_debut: string;
  statut: string;
};

type Echeance = {
  loan_id: string;
  numero: number;
  mensualite_centimes: number;
  interets_centimes: number;
  amortissement_centimes: number;
  instant_prevu: string;
  statut: string;
};

export default async function PageBanque() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, tresorerie_centimes")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { data: prets } = await supabase
    .from("loans")
    .select("id, capital_initial_centimes, capital_restant_centimes, taux_annuel, duree_mois, instant_debut, statut")
    .eq("company_id", entreprise.id)
    .order("instant_debut", { ascending: false });

  const pretsTab = (prets ?? []) as Loan[];
  const pretActifs = pretsTab.filter((p) => p.statut === "actif");

  const idsActifs = pretActifs.map((p) => p.id);
  let echeances: Echeance[] = [];
  if (idsActifs.length > 0) {
    const { data } = await supabase
      .from("loan_schedules")
      .select("loan_id, numero, mensualite_centimes, interets_centimes, amortissement_centimes, instant_prevu, statut")
      .in("loan_id", idsActifs)
      .eq("statut", "a_venir")
      .order("instant_prevu", { ascending: true })
      .limit(10);
    echeances = (data ?? []) as Echeance[];
  }

  const detteTotale = pretActifs.reduce((s, p) => s + p.capital_restant_centimes, 0);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Financement
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Banque</h1>
      </header>

      <section className="mt-10 grid grid-cols-3 gap-4">
        <Carte libelle="Trésorerie">
          <span className="chiffre">{formaterEuros(entreprise.tresorerie_centimes)}</span> €
        </Carte>
        <Carte libelle="Dette en cours">
          <span className="chiffre">{formaterEuros(detteTotale)}</span> €
        </Carte>
        <Carte libelle="Prêts actifs">
          <span className="chiffre">{pretActifs.length}</span>
        </Carte>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Prêts actifs</h2>
        {pretActifs.length === 0 ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-g-300)] px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
            Pas de prêt actif.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-[color:var(--color-g-200)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">Capital initial</th>
                  <th className="px-4 py-2 text-right font-medium">Capital restant</th>
                  <th className="px-4 py-2 text-right font-medium">Taux annuel</th>
                  <th className="px-4 py-2 text-right font-medium">Durée</th>
                  <th className="px-4 py-2 text-left font-medium">Début</th>
                </tr>
              </thead>
              <tbody>
                {pretActifs.map((p) => (
                  <tr key={p.id} className="border-t border-[color:var(--color-g-200)]">
                    <td className="chiffre px-4 py-2 text-right">{formaterEuros(p.capital_initial_centimes)} €</td>
                    <td className="chiffre px-4 py-2 text-right">{formaterEuros(p.capital_restant_centimes)} €</td>
                    <td className="chiffre px-4 py-2 text-right">{(p.taux_annuel * 100).toFixed(2)} %</td>
                    <td className="chiffre px-4 py-2 text-right">{p.duree_mois} mois</td>
                    <td className="chiffre px-4 py-2 text-xs text-[color:var(--color-g-700)]">{formaterDate(p.instant_debut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {echeances.length > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">10 prochaines échéances</h2>
          <div className="overflow-hidden rounded-md border border-[color:var(--color-g-200)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">N°</th>
                  <th className="px-4 py-2 text-right font-medium">Mensualité</th>
                  <th className="px-4 py-2 text-right font-medium">Intérêts</th>
                  <th className="px-4 py-2 text-right font-medium">Amort.</th>
                  <th className="px-4 py-2 text-left font-medium">Date prévue</th>
                </tr>
              </thead>
              <tbody>
                {echeances.map((e) => (
                  <tr key={`${e.loan_id}_${e.numero}`} className="border-t border-[color:var(--color-g-200)]">
                    <td className="chiffre px-4 py-2 text-right">{e.numero}</td>
                    <td className="chiffre px-4 py-2 text-right">{formaterEuros(e.mensualite_centimes)} €</td>
                    <td className="chiffre px-4 py-2 text-right text-[color:var(--color-g-500)]">{formaterEuros(e.interets_centimes)} €</td>
                    <td className="chiffre px-4 py-2 text-right">{formaterEuros(e.amortissement_centimes)} €</td>
                    <td className="chiffre px-4 py-2 text-xs text-[color:var(--color-g-700)]">{formaterDate(e.instant_prevu)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Demander un prêt</h2>
        <FormulairePret
          tresorerieActuelle={entreprise.tresorerie_centimes}
          detteActuelle={detteTotale}
        />
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
