import { reglesPretV1 } from "@kapital/server";
import { Carte, EncadreNotion, EnTete, FilRouge, Ligne } from "../../../components/ui";
import { formaterDate, formaterEuros } from "../../../lib/formatage";
import { creerClientServeur } from "../../../lib/supabase/server";
import { lireEstrAnnuel } from "../_partage/estr";
import { lireVerrou } from "../_partage/verrou";
import { FormulairePret } from "./FormulairePret";

// Banque (design V2, docs/maquette V.banque) : simuler un prêt, voir l'écriture que le
// serveur passera (512 / 164), suivre ses prêts et ses prochaines échéances.

type Loan = {
  id: string;
  objet: string | null;
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
};

const OBJETS: Record<string, string> = {
  tresorerie: "Prêt de trésorerie",
  equipement: "Prêt d'équipement",
  immobilier: "Prêt immobilier",
};

const pourcent = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

export default async function PageBanque() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id, tresorerie_centimes, mois_decouvert_consecutifs").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;
  const tresorerie = Number(entreprise.tresorerie_centimes);

  const [{ data: prets }, { data: monde }] = await Promise.all([
    supabase
      .from("loans")
      .select("id, objet, capital_initial_centimes, capital_restant_centimes, taux_annuel, duree_mois, instant_debut, statut")
      .eq("company_id", entreprise.id)
      .order("instant_debut", { ascending: false }),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
  ]);
  const pretActifs = ((prets ?? []) as Loan[]).filter((p) => p.statut === "actif");
  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);

  let echeances: Echeance[] = [];
  if (pretActifs.length > 0) {
    const { data } = await supabase
      .from("loan_schedules")
      .select("loan_id, numero, mensualite_centimes, interets_centimes, amortissement_centimes, instant_prevu")
      .in("loan_id", pretActifs.map((p) => p.id))
      .eq("statut", "a_venir")
      .order("instant_prevu", { ascending: true })
      .limit(6);
    echeances = (data ?? []) as Echeance[];
  }

  const detteTotale = pretActifs.reduce((s, p) => s + Number(p.capital_restant_centimes), 0);
  const regles = reglesPretV1();
  const estrAnnuel = await lireEstrAnnuel(supabase, regles.estrDeSecoursAnnuel);
  const { verrou } = await lireVerrou(supabase, entreprise.id, "demande_pret");

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Banque du Quai" titre="Banque et prêt">
        Emprunter permet d&apos;investir sans attendre. La banque regarde l&apos;objet du prêt et ta
        trésorerie : ta dette totale ne peut pas dépasser un multiple de ce que tu as en caisse.
      </EnTete>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <FormulairePret
          tresorerieActuelle={tresorerie}
          moisDecouvert={Number(entreprise.mois_decouvert_consecutifs ?? 0)}
          detteActuelle={detteTotale}
          regles={regles}
          estrAnnuel={estrAnnuel}
          moisCourant={moisCourant}
          verrou={verrou}
        />

        <div className="flex flex-col gap-4">
          <Carte titre="Tes prêts en cours">
            <Ligne libelle="Trésorerie (512)">{formaterEuros(tresorerie)} €</Ligne>
            <Ligne libelle="Dette en cours (164)" fort>
              {formaterEuros(detteTotale)} €
            </Ligne>
            {pretActifs.length === 0 ? (
              <p className="mt-2 text-[0.88rem] text-muted">
                Aucun prêt pour l&apos;instant. Simule un prêt à gauche : tu vois la mensualité et l&apos;écriture
                avant de signer.
              </p>
            ) : (
              pretActifs.map((p) => (
                <Ligne
                  key={p.id}
                  libelle={`${OBJETS[p.objet ?? ""] ?? "Prêt"} de ${formaterEuros(p.capital_initial_centimes)} € sur ${p.duree_mois} mois à ${pourcent(p.taux_annuel)}`}
                >
                  {formaterEuros(p.capital_restant_centimes)} € restants
                </Ligne>
              ))
            )}
          </Carte>

          {echeances.length > 0 && (
            <Carte titre="Prochaines échéances">
              <div className="overflow-x-auto">
                <table className="w-full text-[0.86rem]">
                  <thead className="text-[0.7rem] uppercase tracking-[0.06em] text-muted">
                    <tr>
                      <th className="py-1 text-left font-semibold">Date</th>
                      <th className="py-1 text-right font-semibold">Mensualité</th>
                      <th className="py-1 text-right font-semibold">dont intérêts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {echeances.map((e) => (
                      <tr key={`${e.loan_id}_${e.numero}`} className="border-t border-line">
                        <td className="py-1.5">{formaterDate(e.instant_prevu)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formaterEuros(e.mensualite_centimes)} €</td>
                        <td className="py-1.5 text-right tabular-nums text-muted">{formaterEuros(e.interets_centimes)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Carte>
          )}

          <EncadreNotion titre="L'effet de levier">
            Si ton activité rapporte plus que ce que coûte la dette, emprunter augmente la rentabilité de tes
            capitaux propres : la différence entre ce que rapporte l&apos;argent emprunté et son taux revient aux
            associés. Si l&apos;activité rapporte moins que le taux, le levier joue à l&apos;envers et creuse les pertes.
          </EncadreNotion>
          <EncadreNotion titre="Rembourser n'est pas une charge">
            Seuls les intérêts sont une charge (compte 661). La part de capital remboursée diminue ta dette au
            passif (164) et ta trésorerie à l&apos;actif (512) : le résultat ne bouge pas.
          </EncadreNotion>
          <FilRouge ecran="banque" />
        </div>
      </div>
    </div>
  );
}
