import { chargerParametresV1 } from "@kapital/content";
import { coefficientsMarketingDepuisParametres } from "@kapital/engine";
import { Carte, EncadreNotion, Jauge } from "../../../components/ui";
import { EnTete, Tableau, Vide } from "../../../components/apercu/elements";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { ActionsMarketing } from "./ActionsMarketing";
import { ACTIONS } from "./actions";

type Marque = { notoriete: number; desirabilite: number };

type Action = { id: string; type: string; montant_centimes: number; instant: string };

function pourcent(x: number): string {
  return `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export default async function PageMarketing() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id, tresorerie_centimes").limit(1);
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

  const params = chargerParametresV1();
  const coefficients = coefficientsMarketingDepuisParametres(params);
  const marque = (brand ?? { notoriete: 0, desirabilite: 0 }) as Marque;
  const actionsTab = (actions ?? []) as Action[];
  const libelle = (t: string) => ACTIONS.find((a) => a.type === t)?.libelle ?? "Action";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
      <EnTete surTitre="Marque" titre="Publicité">
        Ta marque a deux jauges. La notoriété fait venir des clients, la désirabilité leur fait accepter un prix plus
        élevé.
      </EnTete>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Carte titre="Ta marque aujourd'hui">
            <div className="grid gap-4 sm:grid-cols-2">
              <Jauge libelle="Notoriété" valeur={marque.notoriete} max={100} texte={`${Math.round(marque.notoriete)} / 100`} />
              <Jauge libelle="Désirabilité" valeur={marque.desirabilite} max={100} ton="or" texte={`${Math.round(marque.desirabilite)} / 100`} />
            </div>
          </Carte>

          <Carte titre="Choisis une action">
            <ActionsMarketing tresorerie={entreprise.tresorerie_centimes} marque={marque} coefficients={coefficients} />
          </Carte>

          <Carte titre="Dernières actions">
            {actionsTab.length === 0 ? (
              <Vide>Aucune action pour l&apos;instant. Une première publicité fait connaître ta marque.</Vide>
            ) : (
              <Tableau entetes={[{ texte: "Action" }, { texte: "Montant", droite: true }, { texte: "Date" }]}>
                {actionsTab.map((a) => (
                  <tr key={a.id}>
                    <td>{libelle(a.type)}</td>
                    <td className="text-right tabular-nums">{formaterEuros(a.montant_centimes)} €</td>
                    <td className="text-muted">{formaterDateHeure(a.instant)}</td>
                  </tr>
                ))}
              </Tableau>
            )}
          </Carte>
        </div>

        <div className="flex flex-col gap-4">
          <EncadreNotion titre="La publicité est une charge">
            Elle réduit le résultat du mois où tu la paies, même si son effet dure plus longtemps. C&apos;est un pari : elle
            doit rapporter plus de marge qu&apos;elle ne coûte.
          </EncadreNotion>
          <EncadreNotion titre="Les rendements décroissants">
            Doubler le budget ne double pas l&apos;effet : chaque euro de plus rapporte un peu moins que le précédent.
            Plusieurs petites actions valent souvent mieux qu&apos;une grosse.
          </EncadreNotion>
          <EncadreNotion titre="Une marque s'entretient">
            Sans dépense, les jauges baissent chaque mois : la notoriété d&apos;environ {pourcent(coefficients.decroissanceNotoriete)},
            la désirabilité d&apos;environ {pourcent(coefficients.decroissanceDesirabilite)}. Une promotion fait venir du monde
            mais abîme l&apos;image.
          </EncadreNotion>
        </div>
      </div>
    </div>
  );
}
