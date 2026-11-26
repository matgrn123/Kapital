import { chargerParametresV1 } from "@kapital/content";
import { coefficientsMarketingDepuisParametres, etapeEffective, type EtapeEntreprise } from "@kapital/engine";
import { Carte, EncadreNotion, EnTete, FilRouge, Jauge, Tableau, Vide } from "../../../components/ui";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { ActionsMarketing } from "./ActionsMarketing";
import { ACTIONS } from "./actions";

type Marque = { notoriete: number; desirabilite: number };

// `alea` : migration 0042, rempli pour les influenceurs seulement.
type Action = { id: string; type: string; montant_centimes: number; instant: string; alea?: number | string | null };

function pourcent(x: number): string {
  return `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export default async function PageMarketing() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id, tresorerie_centimes, etape").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: brand }, { data: actions }] = await Promise.all([
    supabase.from("brand_state").select("notoriete, desirabilite").eq("company_id", entreprise.id).maybeSingle(),
    supabase
      .from("marketing_actions")
      // Toutes les colonnes : l'aléa (0042) s'affiche dès que la migration est passée.
      .select("*")
      .eq("company_id", entreprise.id)
      .order("instant", { ascending: false })
      .limit(10),
  ]);

  const params = chargerParametresV1();
  const coefficients = coefficientsMarketingDepuisParametres(params);
  const marque = (brand ?? { notoriete: 0, desirabilite: 0 }) as Marque;
  const actionsTab = (actions ?? []) as Action[];
  const libelle = (t: string) => ACTIONS.find((a) => a.type === t)?.libelle ?? "Action";
  const etape = etapeEffective((entreprise.etape ?? 0) as EtapeEntreprise, params);
  const avecAlea = actionsTab.some((a) => a.alea !== null && a.alea !== undefined);
  const amplitude = (t: "influenceur_nano" | "influenceur_macro") => pourcent(coefficients.actions[t].amplitudeAlea);
  const tauxAgence = pourcent(coefficients.actions.agence_publicite.tauxHonoraires);

  return (
    <div className="flex flex-col gap-5">
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
            <ActionsMarketing
              tresorerie={entreprise.tresorerie_centimes}
              marque={marque}
              coefficients={coefficients}
              etape={etape}
            />
          </Carte>

          <Carte titre="Dernières actions">
            {actionsTab.length === 0 ? (
              <Vide>Aucune action pour l&apos;instant. Une première publicité fait connaître ta marque.</Vide>
            ) : (
              <Tableau
                entetes={[
                  { texte: "Action" },
                  { texte: "Montant", droite: true },
                  ...(avecAlea ? [{ texte: "Résultat", droite: true }] : []),
                  { texte: "Date" },
                ]}
              >
                {actionsTab.map((a) => (
                  <tr key={a.id}>
                    <td>{libelle(a.type)}</td>
                    <td className="text-right tabular-nums">{formaterEuros(a.montant_centimes)} €</td>
                    {avecAlea && (
                      <td className="text-right tabular-nums text-muted">
                        {a.alea === null || a.alea === undefined
                          ? ""
                          : `×${Number(a.alea).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </td>
                    )}
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
          <EncadreNotion titre="Le risque : même prix, résultat incertain">
            Un influenceur, c&apos;est un pari. Tu paies sa publication d&apos;avance, mais son effet peut être plus faible
            ou plus fort que prévu : à ± {amplitude("influenceur_nano")} pour un petit compte, jusqu&apos;à ±{" "}
            {amplitude("influenceur_macro")} pour un gros. La charge, elle, est la même quel que soit le résultat.
          </EncadreNotion>
          <EncadreNotion titre="Payer un intermédiaire">
            Une agence garde des honoraires (environ {tauxAgence} du budget) mais connaît son métier : le reste de
            l&apos;argent travaille mieux. Toute la dépense va au compte 623, honoraires compris.
          </EncadreNotion>
          <EncadreNotion titre="Une marque s'entretient">
            Sans dépense, les jauges baissent chaque mois : la notoriété d&apos;environ {pourcent(coefficients.decroissanceNotoriete)},
            la désirabilité d&apos;environ {pourcent(coefficients.decroissanceDesirabilite)}. Une promotion fait venir du monde
            mais abîme l&apos;image.
          </EncadreNotion>
          <FilRouge ecran="publicite" />
        </div>
      </div>
    </div>
  );
}
