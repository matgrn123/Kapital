import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import {
  apportMinimal,
  centimes,
  depotDeGarantie,
  genererEcheancier,
  parametresAchatDepuis,
  parametresBailDepuis,
  tauxPret,
} from "@kapital/engine";
import { reglesPretV1 } from "@kapital/server";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros } from "../../../lib/formatage";
import { BandeauVerrou } from "../_partage/BandeauVerrou";
import { lireEstrAnnuel } from "../_partage/estr";
import { lireVerrou } from "../_partage/verrou";
import { BoutonConge, CarteOffre, type OffreLocal } from "./ActionsLocaux";

// Durée sur laquelle on compare louer et acheter : un choix d'affichage, pas une règle du moteur.
const HORIZON_COMPARATIF_MOIS = 24;

type Local = {
  batiment_id: string | null;
  surface_m2: number;
  loyer_mensuel_centimes: number;
  charges_mensuelles_centimes: number;
  depot_garantie_centimes: number;
  nombre_machines: number;
  mode_detention: "bail" | "achat" | "credit";
  mois_conge: number | null;
  mois_fin: number | null;
  prix_achat_centimes: number;
  apport_centimes: number;
  duree_amortissement_mois: number | null;
};

export default async function PageLocaux() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const params = chargerParametresV1();
  const bail = parametresBailDepuis(params);
  const achat = parametresAchatDepuis(params);
  const regles = reglesPretV1();
  const estr = await lireEstrAnnuel(supabase, regles.estrDeSecoursAnnuel);
  const tauxImmo = tauxPret("immobilier", estr, regles);
  const { verrou, etape } = await lireVerrou(supabase, entreprise.id, "louer_atelier");

  const [{ data: ligne }, { data: monde }, { data: pretsImmo }] = await Promise.all([
    supabase
      .from("workshops")
      .select(
        "batiment_id, surface_m2, loyer_mensuel_centimes, charges_mensuelles_centimes, depot_garantie_centimes, nombre_machines, mode_detention, mois_conge, mois_fin, prix_achat_centimes, apport_centimes, duree_amortissement_mois",
      )
      .eq("company_id", entreprise.id)
      .maybeSingle(),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
    supabase
      .from("loans")
      .select("id, capital_restant_centimes")
      .eq("company_id", entreprise.id)
      .eq("objet", "immobilier")
      .eq("statut", "actif"),
  ]);
  const local = ligne as Local | null;
  const moisCourant = monde ? Number((monde as { mois_courant: number }).mois_courant) : null;
  const catalogue = chargerBatimentsV1().filter((b) => b.categorie === "atelier");
  const nomLocal = catalogue.find((b) => b.id === local?.batiment_id)?.nom ?? "Local";

  // Détail du crédit d'un local acheté : dette et prochaine mensualité.
  let detteCredit = 0;
  let mensualiteCredit: number | null = null;
  if (local && local.mode_detention !== "bail") {
    const prets = (pretsImmo ?? []) as Array<{ id: string; capital_restant_centimes: number }>;
    detteCredit = prets.reduce((s, p) => s + Number(p.capital_restant_centimes), 0);
    if (prets.length > 0) {
      const { data: ech } = await supabase
        .from("loan_schedules")
        .select("mensualite_centimes")
        .in("loan_id", prets.map((p) => p.id))
        .eq("statut", "a_venir")
        .order("instant_prevu", { ascending: true })
        .limit(1)
        .maybeSingle();
      mensualiteCredit = ech ? Number((ech as { mensualite_centimes: number }).mensualite_centimes) : null;
    }
  }

  const offres: OffreLocal[] = catalogue.map((b) => {
    const prix = centimes(b.prix_achat_centimes);
    const apportMin = apportMinimal(prix, achat);
    const loyer = b.loyer_mensuel_centimes;
    const charges = b.charges_mensuelles_centimes;
    const pret = prix - apportMin;
    const duree = achat.dureePretMois;
    const mois = HORIZON_COMPARATIF_MOIS;
    let comparatif: OffreLocal["comparatif"] = null;
    if (pret > 0) {
      const ech = genererEcheancier(centimes(pret), tauxImmo, duree);
      const n = Math.min(mois, ech.length);
      const echeances = ech.slice(0, n);
      const interets = echeances.reduce((s, e) => s + e.interets, 0);
      const mensualites = echeances.reduce((s, e) => s + e.montant, 0);
      const amortissement = Math.round((prix * n) / achat.dureeAmortissementMois);
      comparatif = {
        mois: n,
        coutLouer: n * (loyer + charges),
        coutAcheter: interets + amortissement + n * charges,
        sortiesLouer: depotDeGarantie(centimes(loyer), bail) + n * (loyer + charges),
        sortiesAcheter: apportMin + mensualites + n * charges,
        valeurRestante: prix - amortissement,
        detteRestante: echeances[n - 1]?.capitalRestantApres ?? 0,
      };
    }
    return {
      id: b.id,
      nom: b.nom,
      surfaceM2: b.surface_m2,
      loyer,
      charges,
      depot: depotDeGarantie(centimes(loyer), bail),
      prix,
      apportMinimal: apportMin,
      etapeDebloquee: b.etape_debloquee,
      verrouEtape: b.etape_debloquee > etape,
      comparatif,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">Immobilier</p>
        <h1 className="text-3xl font-semibold tracking-tight">Locaux</h1>
        <p className="mt-1 text-sm text-[color:var(--color-g-500)]">
          Un local abrite votre atelier. Vous pouvez le louer (un dépôt de garantie, un loyer chaque mois)
          ou l'acheter en payant un apport et en empruntant le reste.
        </p>
      </header>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Votre local actuel</h2>
        {!local ? (
          <p className="rounded-md border border-dashed border-[color:var(--color-g-300)] px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
            Vous n'avez pas de local. Vous pouvez faire fabriquer chez des façonniers, ou louer ou acheter
            un local ci-dessous.
          </p>
        ) : local.mode_detention === "bail" ? (
          <div className="space-y-4">
            <p className="text-sm font-medium">{nomLocal} (loué)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Carte libelle="Loyer"><span className="chiffre">{formaterEuros(local.loyer_mensuel_centimes)}</span> € / mois</Carte>
              <Carte libelle="Charges"><span className="chiffre">{formaterEuros(local.charges_mensuelles_centimes)}</span> € / mois</Carte>
              <Carte libelle="Dépôt de garantie"><span className="chiffre">{formaterEuros(local.depot_garantie_centimes)}</span> €</Carte>
              <Carte libelle="Préavis"><span className="chiffre">{bail.preavisMois}</span> mois</Carte>
            </div>
            {local.mois_fin !== null ? (
              <p className="text-sm text-[color:var(--color-g-700)]">
                Congé donné : le bail prend fin au mois de jeu <span className="chiffre">{local.mois_fin}</span>
                {moisCourant !== null && local.mois_fin > moisCourant
                  ? ` (dans ${local.mois_fin - moisCourant} mois)`
                  : ""}
                . Le loyer reste dû jusque-là, puis le dépôt de garantie vous est rendu.
              </p>
            ) : (
              <BoutonConge preavisMois={bail.preavisMois} />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium">{nomLocal} (acheté à crédit)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Carte libelle="Prix payé"><span className="chiffre">{formaterEuros(local.prix_achat_centimes)}</span> €</Carte>
              <Carte libelle="Apport versé"><span className="chiffre">{formaterEuros(local.apport_centimes)}</span> €</Carte>
              <Carte libelle="Dette restante"><span className="chiffre">{formaterEuros(detteCredit)}</span> €</Carte>
              <Carte libelle="Mensualité du crédit">
                {mensualiteCredit === null ? "Aucune" : <><span className="chiffre">{formaterEuros(mensualiteCredit)}</span> € / mois</>}
              </Carte>
              <Carte libelle="Charges d'entretien"><span className="chiffre">{formaterEuros(local.charges_mensuelles_centimes)}</span> € / mois</Carte>
              <Carte libelle="Amortissement">
                {local.duree_amortissement_mois ? (
                  <><span className="chiffre">{formaterEuros(Math.round(local.prix_achat_centimes / local.duree_amortissement_mois))}</span> € / mois</>
                ) : "Non défini"}
              </Carte>
            </div>
            <p className="text-xs text-[color:var(--color-g-500)]">
              Propriétaire, vous ne payez plus de loyer. L'amortissement répartit le prix du bâtiment sur sa
              durée de vie : c'est une charge comptable, pas une sortie d'argent.
            </p>
          </div>
        )}
      </section>

      {!local && (
        <section className="mt-10 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Louer ou acheter un local</h2>
          {verrou && <BandeauVerrou verrou={verrou} action="La location ou l'achat d'un local" />}
          <div className="space-y-4">
            {offres.map((o) => (
              <CarteOffre
                key={o.id}
                offre={o}
                peutAgir={verrou === null}
                achat={{
                  tauxAnnuel: tauxImmo,
                  dureeMin: regles.parObjet.immobilier.dureeMinMois,
                  dureeMax: regles.parObjet.immobilier.dureeMaxMois,
                  dureeDefaut: achat.dureePretMois,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Carte({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">{libelle}</p>
      <p className="mt-2 text-xl font-medium">{children}</p>
    </div>
  );
}
