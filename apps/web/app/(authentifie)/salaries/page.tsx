import { chargerParametresV1 } from "@kapital/content";
import {
  centimes,
  coefficientsSalairesDepuisParametres,
  coutEmployeur,
  idSalarie,
  indemniteLicenciement,
  parametresLicenciementDepuis,
} from "@kapital/engine";
import { BandeauEtape, Carte, EcritureComptable, EncadreNotion, EnTete, FilRouge, Tableau } from "../../../components/ui";
import { apercuLicenciement, apercuPaieEquipe } from "../../../lib/apercu-lot4";
import { formaterDate, formaterEuros } from "../../../lib/formatage";
import { creerClientServeur } from "../../../lib/supabase/server";
import { lireVerrou } from "../_partage/verrou";
import { BoutonLicencier, FormulaireEmbauche } from "./FormulaireEmbauche";

// Embauche et salariés (design V2, docs/maquette V.embauche). Les coûts viennent du moteur
// (coutEmployeur, enregistrerPaieMensuelle, ecritureLicenciement) et des paramètres.

type Employee = {
  id: string;
  poste: "artisan" | "encadrement";
  salaire_brut_mensuel_centimes: number;
  cree_le: string;
  anciennete_mois_debut: number;
  experience_mois_debut: number;
  mois_jeu_debut: number | null;
};

const pourcent = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const POSTES = { artisan: "Artisan", encadrement: "Encadrement" } as const;

export default async function PageSalaries() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id, tresorerie_centimes").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: employes }, { data: monde }, { verrou }, { data: atelier }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, poste, salaire_brut_mensuel_centimes, cree_le, anciennete_mois_debut, experience_mois_debut, mois_jeu_debut")
      .eq("company_id", entreprise.id)
      .eq("statut", "actif")
      .order("cree_le"),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
    lireVerrou(supabase, entreprise.id, "embauche"),
    supabase.from("workshops").select("nombre_machines").eq("company_id", entreprise.id).maybeSingle(),
  ]);

  const params = chargerParametresV1();
  const coefficients = coefficientsSalairesDepuisParametres(params);
  const paramsLicenciement = parametresLicenciementDepuis(params);
  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);
  const postes = Number((atelier as { nombre_machines?: number } | null)?.nombre_machines ?? 0);

  const employesTab = (employes ?? []) as Employee[];
  const artisans = employesTab.filter((e) => e.poste === "artisan").length;
  const cout = (e: Employee) =>
    coutEmployeur({ ...coefficients, salaireBrutMensuel: centimes(e.salaire_brut_mensuel_centimes) });
  const paieEquipe = apercuPaieEquipe({
    salairesBruts: employesTab.map((e) => e.salaire_brut_mensuel_centimes),
    coefficients,
    mois: moisCourant,
  });
  const totalCharge = employesTab.reduce((s, e) => s + cout(e), 0);
  // Même calcul que la route de licenciement : ancienneté de départ + mois passés dans l'entreprise.
  const indemnite = (e: Employee): number => {
    const service = Math.max(0, moisCourant - (e.mois_jeu_debut ?? 0));
    return indemniteLicenciement(
      {
        id: idSalarie(e.id),
        poste: e.poste,
        salaireBrutMensuel: centimes(e.salaire_brut_mensuel_centimes),
        ancienneteMois: e.anciennete_mois_debut + service,
        experienceMois: e.experience_mois_debut + service,
      },
      paramsLicenciement,
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Bureau de l'emploi" titre="Embauche et salariés">
        Chaque salarié augmente ta capacité, mais ajoute un coût fixe chaque mois, que tu vendes ou non.
      </EnTete>

      {verrou && <BandeauEtape verrou={verrou} action="L'embauche" />}
      <FormulaireEmbauche
        coefficients={coefficients}
        moisCourant={moisCourant}
        tresorerie={Number(entreprise.tresorerie_centimes)}
        postesLibres={Math.max(0, postes - artisans)}
        verrouille={verrou !== null}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Carte titre="Ton équipe">
            {employesTab.length === 0 ? (
              <p className="text-[0.88rem] text-muted">
                Personne pour l&apos;instant.{" "}
                {postes === 0
                  ? "Un artisan a besoin d'un poste de travail pour produire : loue d'abord un local dans Locaux."
                  : `Tu as ${postes} poste(s) libre(s) : embauche un artisan pour produire toi-même.`}
              </p>
            ) : (
              <>
                <Tableau
                  entetes={[
                    { texte: "Poste" },
                    { texte: "Depuis" },
                    { texte: "Brut", droite: true },
                    { texte: "Coût employeur", droite: true },
                    { texte: "" },
                  ]}
                >
                  {employesTab.map((e) => {
                    const ind = indemnite(e);
                    return (
                      <tr key={e.id} className="align-top">
                        <td>{POSTES[e.poste]}</td>
                        <td className="text-muted">{formaterDate(e.cree_le)}</td>
                        <td className="text-right">{formaterEuros(e.salaire_brut_mensuel_centimes)} €</td>
                        <td className="text-right">{formaterEuros(cout(e))} €</td>
                        <td className="text-right">
                          <BoutonLicencier
                            id={e.id}
                            indemniteCentimes={ind}
                            ecriture={apercuLicenciement({ indemnite: ind, mois: moisCourant, idSalarie: e.id })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-bold">
                    <td colSpan={3}>Masse salariale chargée · {artisans} artisan(s) pour {postes} poste(s)</td>
                    <td className="text-right">{formaterEuros(totalCharge)} € / mois</td>
                    <td />
                  </tr>
                </Tableau>
                {paieEquipe && (
                  <div className="mt-3">
                    <EcritureComptable libelle="Paie du mois" etiquette="à la clôture" lignes={paieEquipe.paie.lignes} />
                  </div>
                )}
              </>
            )}
          </Carte>
        </div>

        <div className="flex flex-col gap-4">
          <EncadreNotion titre="Brut, net, coût employeur">
            Le salarié touche le net : son brut moins ses propres cotisations. L&apos;entreprise paie le brut
            (compte 641) plus les cotisations patronales versées à l&apos;Urssaf (645). Au SMIC, ces cotisations
            valent {pourcent(coefficients.tauxCotisationsSmic)} du brut grâce aux réductions ; elles montent
            jusqu&apos;à {pourcent(coefficients.tauxCotisationsPleines)} à partir de{" "}
            {coefficients.seuilCotisationsPleinesEnSmic.toLocaleString("fr-FR")} SMIC.
          </EncadreNotion>
          <EncadreNotion titre="Un salarié sans poste ne produit pas">
            Un artisan travaille sur une machine. S&apos;il n&apos;y a pas de poste libre, il est payé quand même,
            mais ne fabrique rien. Embaucher avant d&apos;avoir la place, c&apos;est payer pour attendre.
          </EncadreNotion>
          <EncadreNotion titre="Se séparer d'un salarié coûte">
            Après {paramsLicenciement.ancienneteMinimaleMois} mois d&apos;ancienneté, un licenciement donne droit à une
            indemnité légale, payée tout de suite par la banque. C&apos;est une charge de personnel (641).
          </EncadreNotion>
          <FilRouge ecran="embauche" />
        </div>
      </div>
    </div>
  );
}
