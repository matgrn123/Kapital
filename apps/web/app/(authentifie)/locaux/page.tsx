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
import { BandeauEtape, BoutonLien, Carte, EncadreNotion, EnTete, Etapes, Faits, FilRouge, Puce, Succes } from "../../../components/ui";
import { messageSignature, PARAM_SIGNATURE } from "../../../lib/locaux";
import { apercuBail } from "../../../lib/apercu-lot4";
import { enMois, estIndexCalendaire, finDuMoisLisible } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import { creerClientServeur } from "../../../lib/supabase/server";
import { COLONNES_MODULES_POSES, postesPoses, type AvecModulesPoses } from "../../../lib/api-helpers";
import { lireEstrAnnuel } from "../_partage/estr";
import { lireVerrou } from "../_partage/verrou";
import { BoutonConge, CarteOffre, type OffreLocal } from "./ActionsLocaux";

// Locaux (design V2, docs/maquette V.locaux) : louer ou acheter un local, avec pour chaque
// offre l'écriture que le serveur passera, calculée par le moteur.
// 3D-7 : une société peut avoir plusieurs locaux : chacun a sa carte (et son congé), et les offres
// restent proposées pour louer ou acheter un autre local.

// Durée sur laquelle on compare louer et acheter : un choix d'affichage, pas une règle du moteur.
const HORIZON_COMPARATIF_MOIS = 24;

type Local = AvecModulesPoses & {
  id: string;
  batiment_id: string | null;
  surface_m2: number;
  loyer_mensuel_centimes: number;
  charges_mensuelles_centimes: number;
  depot_garantie_centimes: number;
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

const surTitreLocal = (i: number) => (i === 0 ? "Aujourd'hui" : `Local ${i + 1}`);

export default async function PageLocaux({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Après une signature, le message de réussite s'affiche ici, en haut, et non au pied de l'offre.
  const signature = messageSignature((await searchParams)[PARAM_SIGNATURE]);
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

  const [{ data: lignes }, { data: monde }, { data: pretsActifs }] = await Promise.all([
    supabase
      .from("workshops")
      .select(
        `id, batiment_id, surface_m2, loyer_mensuel_centimes, charges_mensuelles_centimes, depot_garantie_centimes, mode_detention, mois_conge, mois_fin, prix_achat_centimes, apport_centimes, duree_amortissement_mois, ${COLONNES_MODULES_POSES}`,
      )
      .eq("company_id", entreprise.id)
      .order("cree_le"),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
    supabase.from("loans").select("id, objet, capital_restant_centimes").eq("company_id", entreprise.id).eq("statut", "actif"),
  ]);
  const locaux = (lignes ?? []) as Local[];
  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);
  const maintenant = Date.now();
  const prets = (pretsActifs ?? []) as Array<{ id: string; objet: string | null; capital_restant_centimes: number }>;
  const detteEnCours = prets.reduce((s, p) => s + Number(p.capital_restant_centimes), 0);
  const catalogue = chargerBatimentsV1().filter((b) => b.categorie === "atelier");
  const nomLocal = (l: Local) => catalogue.find((b) => b.id === l.batiment_id)?.nom ?? "Local";
  const possedes = locaux.filter((l) => l.mode_detention !== "bail");
  const titreLocal = (l: Local, i: number) => (locaux.length > 1 ? `${i + 1}. ${nomLocal(l)}` : nomLocal(l));

  // Détail du crédit d'un local acheté : dette et prochaine mensualité.
  const pretsImmo = prets.filter((p) => p.objet === "immobilier");
  const detteCredit = pretsImmo.reduce((s, p) => s + Number(p.capital_restant_centimes), 0);
  let mensualiteCredit: number | null = null;
  if (possedes.length > 0 && pretsImmo.length > 0) {
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
      <EnTete
        surTitre="Immobilier d'entreprise"
        titre={locaux.length > 1 ? `Locaux (${locaux.length})` : "Locaux"}
        action={
          locaux.length > 0 ? (
            <BoutonLien href="#autre-local" variante="principal">
              Louer un autre local
            </BoutonLien>
          ) : undefined
        }
      >
        Louer garde ta trésorerie libre. Acheter te rend propriétaire, mais immobilise de l&apos;argent et
        alourdit ta dette.
      </EnTete>

      {signature && (
        <Succes>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{signature}</span>
            <BoutonLien href="/salaries" petit>
              Embaucher
            </BoutonLien>
          </span>
        </Succes>
      )}

      {locaux.length === 0 ? (
        <Carte surTitre="Aujourd'hui" titre="Pas encore de local">
          <div className="grid gap-4 md:grid-cols-2">
            <p className="text-[0.9rem]">
              Tu fais fabriquer chez des façonniers : pas de loyer, mais chaque pièce coûte plus cher. Avec ton
              propre atelier, livré avec {bail.machinesALaSignature} postes de couture déjà posés, tu embauches des
              artisans (un par poste) et tu ajoutes des machines dans l&apos;écran Atelier.
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
      ) : (
        locaux.map((local, i) =>
          local.mode_detention === "bail" ? (
            <Carte key={local.id} surTitre={surTitreLocal(i)} titre={titreLocal(local, i)} action={<Puce ton="accent">Locataire</Puce>}>
              <div className="grid gap-4 md:grid-cols-2">
                <Faits
                  lignes={[
                    ["Surface", `${local.surface_m2} m²`],
                    ["Statut", "Locataire, bail commercial"],
                    ["Loyer (613)", `${formaterEuros(local.loyer_mensuel_centimes)} € / mois`],
                    ["Charges (614)", `${formaterEuros(local.charges_mensuelles_centimes)} € / mois`],
                    ["Dépôt de garantie (275)", `${formaterEuros(local.depot_garantie_centimes)} €`],
                    ["Postes de travail (posés)", postesPoses(local)],
                  ]}
                />
                <div>
                  {local.mois_fin !== null ? (
                    <p className="text-[0.9rem]">
                      Congé donné : le bail prend fin{" "}
                      {estIndexCalendaire(local.mois_fin)
                        ? `le ${finDuMoisLisible(local.mois_fin, maintenant)}`
                        : enMois(local.mois_fin)}
                      . Le loyer reste dû jusque-là, puis le dépôt de garantie t&apos;est rendu.
                    </p>
                  ) : (
                    <BoutonConge
                      preavisMois={bail.preavisMois}
                      workshopId={local.id}
                      finSiConge={
                        estIndexCalendaire(moisCourant) ? finDuMoisLisible(moisCourant + bail.preavisMois, maintenant) : null
                      }
                    />
                  )}
                </div>
              </div>
            </Carte>
          ) : (
            <Carte key={local.id} surTitre={surTitreLocal(i)} titre={titreLocal(local, i)} action={<Puce ton="bon">Propriétaire</Puce>}>
              <div className="grid gap-4 md:grid-cols-2">
                <Faits
                  lignes={[
                    ["Surface", `${local.surface_m2} m²`],
                    ["Prix payé (213)", `${formaterEuros(local.prix_achat_centimes)} €`],
                    ["Apport versé", `${formaterEuros(local.apport_centimes)} €`],
                    [possedes.length > 1 ? "Dette immobilière (164, tous locaux)" : "Dette immobilière (164)", `${formaterEuros(detteCredit)} €`],
                    [possedes.length > 1 ? "Prochaine mensualité (tous locaux)" : "Mensualité du crédit", mensualiteCredit === null ? "aucune" : `${formaterEuros(mensualiteCredit)} € / mois`],
                    ["Charges d'entretien (614)", `${formaterEuros(local.charges_mensuelles_centimes)} € / mois`],
                    ["Postes de travail (posés)", postesPoses(local)],
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
          ),
        )
      )}

      <>
          {locaux.length > 0 && (
            <h2 id="autre-local" className="text-[1.05rem] font-semibold">
              Louer ou acheter un autre local
            </h2>
          )}
          {locaux.length > 0 && (
            <p className="-mt-3 text-[0.88rem] text-muted">
              Chaque local a son loyer (ou son crédit), ses {bail.machinesALaSignature} postes de départ et son dépôt de
              garantie. Les postes de tous tes locaux s&apos;additionnent : plus de postes, plus d&apos;artisans au travail.
            </p>
          )}
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

      <div className="grid gap-4 md:grid-cols-2">
        <EncadreNotion titre="Louer ou acheter ?">
          Le loyer est une charge, rien n&apos;apparaît au bilan sauf le dépôt de garantie, qui reste à toi
          (compte 275). L&apos;achat crée une immobilisation à l&apos;actif (213) et une dette au passif (164). Tu ne
          paies plus de loyer, mais des intérêts et un amortissement.
        </EncadreNotion>
        <EncadreNotion titre="Le préavis">
          Un bail ne s&apos;arrête pas du jour au lendemain : après le congé, tu paies encore le loyer jusqu&apos;à la fin
          du {bail.preavisMois === 1 ? "mois suivant" : `${bail.preavisMois}e mois qui suit`} (préavis de {bail.preavisMois} mois).
          Le dépôt de garantie, {bail.depotMoisDeLoyer} mois de loyer, revient en banque à la fin du bail.
        </EncadreNotion>
      </div>
      <FilRouge ecran="locaux" />
    </div>
  );
}
