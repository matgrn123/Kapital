import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import {
  boutiqueOuverte,
  centimes,
  deblocageTotalActif,
  etapeEffective,
  etapeRequisePour,
  idSalarie,
  moisJeu,
  parametresBoutiqueDepuis,
  pointMortBoutique,
  seuilsEtapesDepuis,
  type EtapeEntreprise,
  type PointDeVente,
  type Salarie,
} from "@kapital/engine";
import { chargerPointsDeVenteSupabase } from "@kapital/server";
import { BoutonLien, Carte, EncadreNotion, FilRouge, Jauge, Kpi, Puce } from "../../../components/ui";
import { EnTete, Ligne, Note } from "../../../components/ui/formulaire";
import { dateHeureLisible, enMois, libelleMois, versQuand } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import { creerClientServeur } from "../../../lib/supabase/server";
import { conditionsBoutique } from "../societe/donnees";
import { ChoixEmplacement, PrixBoutique, TransfertStock, type LignePrixBoutique, type ProduitTransferable } from "./ActionsMagasin";
import { margeMoyenneParPiece, offresEmplacements, ventesBoutiqueDuMois } from "./donnees";

// Magasin physique (AE-11, design V2 d'après la maquette V.magasin). Tous les chiffres viennent
// du catalogue des bâtiments, des paramètres boutique_* / vendeur_* et du moteur
// (apercuOuvertureBoutique, pointMortBoutique) ; l'écran n'en invente aucun.

export const dynamic = "force-dynamic";

const euros = (c: number) => `${formaterEuros(c)} €`;

type LigneStock = { product_id: string; quantite_pieces: number; valeur_totale_centimes: number };
type LigneProduit = { id: string; product_id: string; prix_vente_directe_centimes: number; prix_boutique_centimes?: number | null };

export default async function PageMagasin() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, etape, tresorerie_centimes, pieces_vendues_total, chiffre_affaires_cumule_ht_centimes")
    .eq("owner_profile_id", user?.id ?? "")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: marque }, { data: monde }, pointsDeVente, { data: employes }, { data: stocks }, { data: lignesPrix }, { data: produits }] =
    await Promise.all([
      supabase.from("brand_state").select("notoriete").eq("company_id", entreprise.id).maybeSingle(),
      supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
      chargerPointsDeVenteSupabase(supabase, entreprise.id).catch(() => [] as PointDeVente[]),
      supabase
        .from("employees")
        .select("id, poste, salaire_brut_mensuel_centimes")
        .eq("company_id", entreprise.id)
        .eq("statut", "actif"),
      supabase.from("product_stock").select("product_id, quantite_pieces, valeur_totale_centimes").eq("company_id", entreprise.id),
      // « * » : prix_boutique_centimes (0038) est lu quand la colonne existe.
      supabase.from("company_products").select("*").eq("company_id", entreprise.id),
      supabase.from("products").select("id, nom"),
    ]);

  const params = chargerParametresV1();
  // Les instants des boutiques (ouverture_le) sont des instants réels : comparés à l'heure réelle.
  const maintenant = Date.now();
  const seuils = seuilsEtapesDepuis(params);
  const pb = parametresBoutiqueDepuis(params);
  const tva = params["tva_standard"]!.valeur;
  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);
  const etapeReelle = entreprise.etape as EtapeEntreprise;
  const etapeRequise = etapeRequisePour("ouverture_boutique");
  const peutOuvrir = etapeEffective(etapeReelle, params) >= etapeRequise;
  const tresorerie = Number(entreprise.tresorerie_centimes);
  const notoriete = Number((marque as { notoriete?: number } | null)?.notoriete ?? 0);

  const conditions = conditionsBoutique(
    {
      etape: etapeReelle,
      piecesVendues: Number(entreprise.pieces_vendues_total),
      chiffreAffairesHt: Number(entreprise.chiffre_affaires_cumule_ht_centimes),
      tresorerie,
      notoriete,
    },
    seuils,
  );

  const nomProduit = new Map(((produits ?? []) as { id: string; nom: string }[]).map((p) => [p.id, p.nom]));
  const prixParProduit = new Map(
    ((lignesPrix ?? []) as LigneProduit[]).map((l) => [
      l.product_id,
      Number(l.prix_boutique_centimes ?? l.prix_vente_directe_centimes),
    ]),
  );
  const stockAtelier = (stocks ?? []) as LigneStock[];

  const salaries: Salarie[] = ((employes ?? []) as { id: string; poste: Salarie["poste"]; salaire_brut_mensuel_centimes: number }[]).map(
    (e) => ({
      id: idSalarie(e.id),
      poste: e.poste,
      salaireBrutMensuel: centimes(Number(e.salaire_brut_mensuel_centimes)),
      ancienneteMois: 0,
      experienceMois: 0,
    }),
  );
  const nbVendeurs = salaries.filter((s) => s.poste === "vendeur").length;

  const boutique = pointsDeVente[0] ?? null;
  const devActif = deblocageTotalActif(params) && etapeReelle < etapeRequise;

  const enTete = (
    <EnTete surTitre="Pignon sur rue" titre={boutique ? "Ta boutique" : "Ouvrir un magasin physique"}>
      {boutique
        ? "Ta boutique vend tes pièces aux passants. Elle a ses propres charges fixes : il faut vendre assez pour les couvrir."
        : "Le grand pas : une boutique à ton nom. Il faut une marque déjà connue, un chiffre d'affaires solide et de quoi payer l'ouverture sans découvert."}
    </EnTete>
  );

  const notions = (
    <div className="grid gap-4 md:grid-cols-2">
      <EncadreNotion titre="Ce que tu apprends : le bail commercial">
        Une boutique se loue avec un bail commercial, signé pour plusieurs années. À la signature, tu verses un dépôt de
        garantie ({pb.depotMoisDeLoyer.toLocaleString("fr-FR")} mois de loyer ici) : ce n&apos;est pas une charge, il reste à
        l&apos;actif (compte 275) et te sera rendu en partant. Les travaux d&apos;agencement sont une immobilisation (2135),
        amortie sur {pb.amortissementAgencementMois} mois. Le loyer, lui, court dès la signature, même pendant les travaux.
      </EncadreNotion>
      <EncadreNotion titre="Ce que tu apprends : le point mort">
        La boutique ajoute des charges fixes : loyer, charges, salaire du vendeur, amortissement des travaux. Le point mort,
        c&apos;est le nombre de pièces à vendre chaque mois pour que la marge les couvre (charges fixes ÷ marge par pièce).
        En dessous, la boutique perd de l&apos;argent chaque mois. Au-dessus de ce qu&apos;un vendeur peut vendre, il en faut
        un deuxième.
      </EncadreNotion>
    </div>
  );

  // -------------------------------------------------------------------------- Avant l'ouverture
  if (!boutique) {
    const marge = margeMoyenneParPiece(
      stockAtelier.map((s) => ({
        prixBoutiqueTtc: prixParProduit.get(s.product_id) ?? 0,
        pieces: Number(s.quantite_pieces),
        valeur: Number(s.valeur_totale_centimes),
      })),
      tva,
    );
    const offres = offresEmplacements({
      catalogue: chargerBatimentsV1(),
      params,
      mois: moisCourant,
      instantMs: maintenant,
      tresorerie,
      margeParPiece: marge,
    });
    const conditionsRemplies = conditions.every((c) => c.remplie);
    return (
      <div className="flex flex-col gap-5">
        {enTete}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="flex flex-col gap-4">
            <Carte
              titre={`Conditions de l'étape ${etapeRequise}`}
              action={
                etapeReelle >= etapeRequise ? <Puce ton="bon">Atteinte</Puce> : <Puce ton="alerte">Étape {etapeReelle}</Puce>
              }
            >
              <div className="flex flex-col gap-3">
                {conditions.map((c) => (
                  <Jauge
                    key={c.cle}
                    libelle={c.libelle}
                    valeur={c.valeur}
                    max={c.max}
                    texte={c.texte}
                    ton={c.remplie ? "bon" : "or"}
                  />
                ))}
              </div>
              <p className="mt-3 text-[0.84rem] text-muted">
                {etapeReelle >= etapeRequise
                  ? "Étape atteinte : elle ne redescend jamais, même si ta trésorerie ou ta notoriété baissent."
                  : conditionsRemplies
                    ? "Tout est rempli : l'étape sera constatée à la fin du mois."
                    : "Les trois conditions sont vérifiées à la fin de chaque mois, toutes en même temps."}
              </p>
              {devActif && (
                <Note>
                  Réglage de développement actif : la signature est déjà permise, sans attendre l&apos;étape {etapeRequise}.
                </Note>
              )}
            </Carte>
            <Carte titre="Un vendeur, obligatoire">
              <p className="text-[0.88rem]">
                Sans vendeur, la boutique ne vend rien. Chaque vendeur vend jusqu&apos;à{" "}
                <b>{pb.ventesMaxParVendeur.toLocaleString("fr-FR")} pièces par mois</b>. Tu peux l&apos;embaucher dès la
                signature, pendant les travaux.
              </p>
              <div className="mt-3">
                <BoutonLien href="/salaries" petit>
                  Écran Embauche
                </BoutonLien>
              </div>
            </Carte>
          </div>
          <Carte titre="Choisir l'emplacement et simuler l'ouverture">
            {offres.length > 0 ? (
              <ChoixEmplacement
                offres={offres}
                tresorerie={tresorerie}
                maintenantMs={maintenant}
                peutOuvrir={peutOuvrir}
                ventesMaxParVendeur={pb.ventesMaxParVendeur}
              />
            ) : (
              <p className="text-[0.86rem] text-muted">Aucun emplacement de boutique au catalogue des bâtiments.</p>
            )}
          </Carte>
        </div>
        {notions}
        <FilRouge ecran="magasin" />
      </div>
    );
  }

  // -------------------------------------------------------------------------- Boutique signée
  const ouverte = boutiqueOuverte(boutique, moisJeu(moisCourant), maintenant);
  const ouvertureMs = boutique.ouvertureMs;
  const nom = chargerBatimentsV1().find((b) => b.id === boutique.batimentId)?.nom ?? "Ta boutique";
  const stockBoutique = boutique.stock.reduce((s, l) => s + l.quantite, 0);
  const margeBoutique =
    margeMoyenneParPiece(
      boutique.stock.map((s) => ({
        prixBoutiqueTtc: prixParProduit.get(s.produit) ?? 0,
        pieces: s.quantite,
        valeur: s.valeurTotale,
      })),
      tva,
    ) ??
    margeMoyenneParPiece(
      stockAtelier.map((s) => ({
        prixBoutiqueTtc: prixParProduit.get(s.product_id) ?? 0,
        pieces: Number(s.quantite_pieces),
        valeur: Number(s.valeur_totale_centimes),
      })),
      tva,
    );
  const pm = pointMortBoutique({
    pointDeVente: boutique,
    salaries,
    margeParPiece: margeBoutique === null ? null : centimes(margeBoutique),
    params,
  });

  const { data: livre } = await supabase
    .from("ledger_entries")
    .select("ecriture_id, mois_jeu, compte, sens, montant_centimes, libelle")
    .eq("company_id", entreprise.id)
    .eq("mois_jeu", moisCourant)
    .like("libelle", "Vente boutique %");
  const ventes = ventesBoutiqueDuMois(
    (livre ?? []) as Parameters<typeof ventesBoutiqueDuMois>[0],
    moisCourant,
  );

  const produitsTransfert: ProduitTransferable[] = ((lignesPrix ?? []) as LigneProduit[]).map((l) => ({
    id: l.product_id,
    nom: nomProduit.get(l.product_id) ?? l.product_id,
    enAtelier: Number(stockAtelier.find((s) => s.product_id === l.product_id)?.quantite_pieces ?? 0),
    enBoutique: boutique.stock.find((s) => s.produit === l.product_id)?.quantite ?? 0,
  }));
  const lignesPrixBoutique: LignePrixBoutique[] = ((lignesPrix ?? []) as LigneProduit[]).map((l) => ({
    lignePrixId: l.id,
    nom: nomProduit.get(l.product_id) ?? l.product_id,
    prixEnLigne: Number(l.prix_vente_directe_centimes),
    prixBoutique: l.prix_boutique_centimes == null ? null : Number(l.prix_boutique_centimes),
  }));

  return (
    <div className="flex flex-col gap-5">
      {enTete}
      <Carte
        surTitre={`${boutique.surfaceM2} m² · ${boutique.passantsParJour.toLocaleString("fr-FR")} passants / jour`}
        titre={nom}
        action={
          ouverte ? (
            <Puce ton="bon">
              Ouverte depuis {ouvertureMs === undefined ? libelleMois(boutique.moisOuverture) : dateHeureLisible(ouvertureMs)}
            </Puce>
          ) : (
            <Puce ton="alerte">
              En travaux · ouverture {ouvertureMs === undefined ? enMois(boutique.moisOuverture) : versQuand(ouvertureMs, maintenant)}
            </Puce>
          )
        }
      >
        <p className="text-[0.88rem] text-muted">
          {ouverte
            ? "Les passants entrent, les vendeurs vendent ce qu'il y a en rayon. Le loyer, les charges et les salaires tombent à la fin de chaque mois."
            : `Bail signé ${enMois(boutique.moisSignature)}. Pendant les ${pb.dureeTravauxHeures.toLocaleString("fr-FR")} h de travaux, le loyer court mais la boutique ne vend rien : prépare l'ouverture (vendeur, stock).`}
        </p>
        <div className="mt-3">
          <BoutonLien href="/vue-3d" petit>
            Voir dans le village
          </BoutonLien>
        </div>
      </Carte>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          libelle="Ventes du mois en boutique"
          valeur={`${ventes.pieces.toLocaleString("fr-FR")} pièces`}
          detail={`${euros(ventes.chiffreAffairesHt)} de chiffre d'affaires HT · ${libelleMois(moisCourant)}`}
        />
        <Kpi
          libelle="Stock en boutique"
          valeur={`${stockBoutique.toLocaleString("fr-FR")} pièces`}
          detail={stockBoutique === 0 ? "Rayon vide : envoie du stock depuis l'atelier." : "Au coût moyen, dans le compte 35."}
          ton={stockBoutique === 0 ? "critique" : "neutre"}
        />
        <Kpi
          libelle="Capacité des vendeurs"
          valeur={`${pm.capaciteVendeurs.toLocaleString("fr-FR")} pièces / mois`}
          detail={`${nbVendeurs} vendeur${nbVendeurs > 1 ? "s" : ""} × ${pb.ventesMaxParVendeur.toLocaleString("fr-FR")} pièces`}
          ton={nbVendeurs === 0 ? "critique" : "neutre"}
        />
        <Kpi
          libelle="Point mort"
          valeur={pm.piecesPointMort === null ? "—" : `${pm.piecesPointMort.toLocaleString("fr-FR")} pièces / mois`}
          detail={
            pm.piecesPointMort === null
              ? "Marge inconnue ou nulle : vérifie ton prix et ton stock."
              : pm.horsDePortee
                ? "Au-delà de ce que tes vendeurs peuvent vendre."
                : `Charges fixes ${euros(pm.chargesFixes)} ÷ marge ${euros(pm.margeParPiece ?? 0)} par pièce.`
          }
          ton={pm.horsDePortee ? "critique" : "bon"}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Carte titre="Envoyer du stock en boutique">
            <TransfertStock pointDeVenteId={boutique.id} produits={produitsTransfert} />
          </Carte>
          <Carte
            titre="Vendeurs"
            action={
              <BoutonLien href="/salaries" petit>
                Embaucher un vendeur
              </BoutonLien>
            }
          >
            <p className="text-[0.88rem]">
              {nbVendeurs === 0
                ? "Aucun vendeur : la boutique ne vendra rien tant que tu n'en as pas embauché un."
                : `${nbVendeurs} vendeur${nbVendeurs > 1 ? "s" : ""} : jusqu'à ${pm.capaciteVendeurs.toLocaleString("fr-FR")} pièces vendues par mois.`}
            </p>
          </Carte>
        </div>
        <div className="flex flex-col gap-4">
          <Carte titre="Charges fixes du mois">
            <Ligne libelle="Loyer (613)">{euros(pm.loyer)}</Ligne>
            <Ligne libelle="Charges locatives (614)">{euros(pm.charges)}</Ligne>
            <Ligne libelle={`Vendeurs, coût employeur (${pm.nombreVendeurs})`}>{euros(pm.vendeurs)}</Ligne>
            <Ligne libelle="Amortissement des agencements (681)">{euros(pm.amortissement)}</Ligne>
            <Ligne libelle="Total" fort>
              {euros(pm.chargesFixes)}
            </Ligne>
            <Ligne libelle="Dépôt de garantie à l'actif (275)">{euros(boutique.depotGarantie)}</Ligne>
          </Carte>
          <Carte titre="Prix en boutique">
            {lignesPrixBoutique.length > 0 ? (
              <PrixBoutique lignes={lignesPrixBoutique} />
            ) : (
              <p className="text-[0.86rem] text-muted">Aucun produit au catalogue.</p>
            )}
          </Carte>
        </div>
      </div>
      {notions}
      <FilRouge ecran="magasin" />
    </div>
  );
}
