import { chargerBatimentsV1, chargerParametresV1, type Parametres } from "@kapital/content";
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
import { BandeauEtape, Carte, EncadreNotion, EnTete, Etapes, Faits, FilRouge, Puce } from "../../../components/ui";
import { apercuBail } from "../../../lib/apercu-lot4";
import { formaterEuros } from "../../../lib/formatage";
import { creerClientServeur } from "../../../lib/supabase/server";
import { lireEstrAnnuel } from "../_partage/estr";
import { lireVerrou } from "../_partage/verrou";
import { BoutonConge, CarteOffre, type OffreLocal } from "./ActionsLocaux";

// Locaux (design V2, docs/maquette V.locaux) : louer ou acheter un local, avec pour chaque
// offre l'écriture que le serveur passera, calculée par le moteur.

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

/** Seuls les paramètres d'achat et de prêt partent au navigateur (aperçu de acheterLocal). */
function parametresAchat(params: Parametres): Parametres {
  return Object.fromEntries(Object.entries(params).filter(([k]) => k.startsWith("achat_") || k.startsWith("pret_")));
}

export default async function PageLocaux() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase.from("companies").select("id, tresorerie_centimes").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;
  const tresorerie = Number(entreprise.tresorerie_centimes);

  const params = chargerParametresV1();
  const bail = parametresBailDepuis(params);
  const achat = parametresAchatDepuis(params);
  const regles = reglesPretV1();
  const estr = await lireEstrAnnuel(supabase, regles.estrDeSecoursAnnuel);
  const tauxImmo = tauxPret("immobilier", estr, regles);
  const [{ verrou, etape }, { verrou: verrouAchat }] = await Promise.all([
    lireVerrou(supabase, entreprise.id, "louer_atelier"),
    lireVerrou(supabase, entreprise.id, "achat_local"),
  ]);

  const [{ data: ligne }, { data: monde }, { data: pretsActifs }] = await Promise.all([
    supabase
      .from("workshops")
      .select(
        "batiment_id, surface_m2, loyer_mensuel_centimes, charges_mensuelles_centimes, depot_garantie_centimes, nombre_machines, mode_detention, mois_conge, mois_fin, prix_achat_centimes, apport_centimes, duree_amortissement_mois",
      )
      .eq("company_id", entreprise.id)
      .maybeSingle(),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
    supabase.from("loans").select("id, objet, capital_restant_centimes").eq("company_id", entreprise.id).eq("statut", "actif"),
  ]);
  const local = ligne as Local | null;
  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);
  const prets = (pretsActifs ?? []) as Array<{ id: string; objet: string | null; capital_restant_centimes: number }>;
  const detteEnCours = prets.reduce((s, p) => s + Number(p.capital_restant_centimes), 0);
  const catalogue = chargerBatimentsV1().filter((b) => b.categorie === "atelier");
  const nomLocal = catalogue.find((b) => b.id === local?.batiment_id)?.nom ?? "Local";

  // Détail du crédit d'un local acheté : dette et prochaine mensualité.
  const pretsImmo = prets.filter((p) => p.objet === "immobilier");
  const detteCredit = pretsImmo.reduce((s, p) => s + Number(p.capital_restant_centimes), 0);
  let mensualiteCredit: number | null = null;
  if (local && local.mode_detention !== "bail" && pretsImmo.length > 0) {
    const { data: ech } = await supabase
      .from("loan_schedules")
      .select("mensualite_centimes")
      .in("loan_id", pretsImmo.map((p) => p.id))
      .eq("statut", "a_venir")
      .order("instant_prevu", { ascending: true })
      .limit(1)
      .maybeSingle();
    mensualiteCredit = ech ? Number((ech as { mensualite_centimes: number }).mensualite_centimes) : null;
  }

  const offres: OffreLocal[] = catalogue.map((b) => {
    const prix = centimes(b.prix_achat_centimes);
    const apportMin = apportMinimal(prix, achat);
    const loyer = b.loyer_mensuel_centimes;
    const charges = b.charges_mensuelles_centimes;
    const pret = prix - apportMin;
    let comparatif: OffreLocal["comparatif"] = null;
    if (pret > 0) {
      const ech = genererEcheancier(centimes(pret), tauxImmo, achat.dureePretMois);
      const n = Math.min(HORIZON_COMPARATIF_MOIS, ech.length);
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
      prix,
      apportMinimal: apportMin,
      etapeDebloquee: b.etape_debloquee,
      verrouEtape: b.etape_debloquee > etape,
      bail: apercuBail({ loyer, charges, mois: moisCourant, params, tresorerie }),
      comparatif,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Immobilier d'entreprise" titre="Locaux">
        Louer garde ta trésorerie libre. Acheter te rend propriétaire, mais immobilise de l&apos;argent et
        alourdit ta dette.
      </EnTete>

      {!local ? (
        <Carte surTitre="Aujourd'hui" titre="Pas encore de local">
          <div className="grid gap-4 md:grid-cols-2">
            <p className="text-[0.9rem]">
              Tu fais fabriquer chez des façonniers : pas de loyer, mais chaque pièce coûte plus cher. Avec ton
              propre atelier, tu installes des machines et tu embauches des artisans.
            </p>
            <Etapes
              etapes={[
                "Compare louer et acheter sur une offre ci-dessous.",
                `Vérifie l'écriture et l'effet sur ta trésorerie (${formaterEuros(tresorerie)} € aujourd'hui).`,
                "Signe : l'atelier apparaît dans le village.",
              ]}
            />
          </div>
        </Carte>
      ) : local.mode_detention === "bail" ? (
        <Carte surTitre="Aujourd'hui" titre={nomLocal} action={<Puce ton="accent">Locataire</Puce>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Faits
              lignes={[
                ["Surface", `${local.surface_m2} m²`],
                ["Statut", "Locataire, bail commercial"],
                ["Loyer (613)", `${formaterEuros(local.loyer_mensuel_centimes)} € / mois`],
                ["Charges (614)", `${formaterEuros(local.charges_mensuelles_centimes)} € / mois`],
                ["Dépôt de garantie (275)", `${formaterEuros(local.depot_garantie_centimes)} €`],
                ["Postes de travail", local.nombre_machines],
              ]}
            />
            <div>
              {local.mois_fin !== null ? (
                <p className="text-[0.9rem]">
                  Congé donné : le bail prend fin au mois de jeu {local.mois_fin}
                  {local.mois_fin > moisCourant ? ` (dans ${local.mois_fin - moisCourant} mois)` : ""}. Le loyer reste
                  dû jusque-là, puis le dépôt de garantie t&apos;est rendu.
                </p>
              ) : (
                <BoutonConge preavisMois={bail.preavisMois} />
              )}
            </div>
          </div>
        </Carte>
      ) : (
        <Carte surTitre="Aujourd'hui" titre={nomLocal} action={<Puce ton="bon">Propriétaire</Puce>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Faits
              lignes={[
                ["Surface", `${local.surface_m2} m²`],
                ["Prix payé (213)", `${formaterEuros(local.prix_achat_centimes)} €`],
                ["Apport versé", `${formaterEuros(local.apport_centimes)} €`],
                ["Dette immobilière (164)", `${formaterEuros(detteCredit)} €`],
                ["Mensualité du crédit", mensualiteCredit === null ? "aucune" : `${formaterEuros(mensualiteCredit)} € / mois`],
                ["Charges d'entretien (614)", `${formaterEuros(local.charges_mensuelles_centimes)} € / mois`],
                [
                  "Amortissement",
                  local.duree_amortissement_mois
                    ? `${formaterEuros(Math.round(local.prix_achat_centimes / local.duree_amortissement_mois))} € / mois sur ${local.duree_amortissement_mois} mois`
                    : "non défini",
                ],
              ]}
            />
            <p className="text-[0.84rem] text-muted">
              Propriétaire, tu ne paies plus de loyer. L&apos;amortissement répartit le prix du bâtiment sur sa durée
              de vie : c&apos;est une charge comptable, pas une sortie d&apos;argent.
            </p>
          </div>
        </Carte>
      )}

      {!local && (
        <>
          {verrou && <BandeauEtape verrou={verrou} action="La location d'un local" />}
          {verrouAchat && !verrou && <BandeauEtape verrou={verrouAchat} action="L'achat d'un local" />}
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {offres.map((o) => (
              <CarteOffre
                key={o.id}
                offre={o}
                peutLouer={verrou === null}
                peutAcheter={verrouAchat === null}
                contexte={{
                  tauxAnnuel: tauxImmo,
                  estrAnnuel: estr,
                  dureeMin: regles.parObjet.immobilier.dureeMinMois,
                  dureeMax: regles.parObjet.immobilier.dureeMaxMois,
                  dureeDefaut: achat.dureePretMois,
                  tresorerie,
                  detteEnCours,
                  moisCourant,
                  params: parametresAchat(params),
                }}
              />
            ))}
          </div>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <EncadreNotion titre="Louer ou acheter ?">
          Le loyer est une charge, rien n&apos;apparaît au bilan sauf le dépôt de garantie, qui reste à toi
          (compte 275). L&apos;achat crée une immobilisation à l&apos;actif (213) et une dette au passif (164). Tu ne
          paies plus de loyer, mais des intérêts et un amortissement.
        </EncadreNotion>
        <EncadreNotion titre="Le préavis">
          Un bail ne s&apos;arrête pas du jour au lendemain : après le congé, tu paies encore {bail.preavisMois} mois de
          loyer. Le dépôt de garantie, {bail.depotMoisDeLoyer} mois de loyer, revient en banque à la fin du bail.
        </EncadreNotion>
      </div>
      <FilRouge ecran="locaux" />
    </div>
  );
}
