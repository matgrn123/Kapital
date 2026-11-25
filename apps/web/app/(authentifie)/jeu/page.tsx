import Link from "next/link";
import { DEFINITIONS_MISSIONS, type EtapeEntreprise } from "@kapital/engine";
import { chargerParametresV1 } from "@kapital/content";
import {
  BoutonLien,
  Carte,
  EcritureComptable,
  EncadreNotion,
  Graphique,
  Jauge,
  Kpi,
  Puce,
  SurTitre,
} from "../../../components/ui";
import { formaterDateHeure, formaterEuros } from "../../../lib/formatage";
import { libelleGamme, libelleLisible } from "../../../lib/lisible";
import { chargerProgressionMissions } from "../../../lib/missions";
import { creerClientServeur } from "../../../lib/supabase/server";
import {
  alertes,
  bilanSimplifie,
  caParMois,
  dernieresEcritures,
  type LigneGrandLivre,
} from "../../../lib/tableau";
import { CarteEtape } from "./CarteEtape";

// Tableau de bord (design V2, docs/maquette) : ce que voit un dirigeant chaque
// matin. Tout vient de la base : grand livre, marque, stock, classement.

const euros = (c: number) => `${(c / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;

export default async function PageJeu() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: entreprises } = await supabase
    .from("companies")
    .select(
      "id, nom, gamme, etape, tresorerie_centimes, pieces_vendues_total, chiffre_affaires_cumule_ht_centimes, mois_decouvert_consecutifs",
    )
    .eq("owner_profile_id", user?.id ?? "")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [monde, grandLivre, marque, stocks, catalogue, produits, classement, progressions] = await Promise.all([
    supabase.from("worlds").select("mois_courant").limit(1).maybeSingle(),
    supabase
      .from("ledger_entries")
      .select("ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes, cree_le")
      .eq("company_id", entreprise.id)
      .order("cree_le", { ascending: true }),
    supabase.from("brand_state").select("notoriete, desirabilite").eq("company_id", entreprise.id).maybeSingle(),
    supabase.from("product_stock").select("quantite_pieces").eq("company_id", entreprise.id),
    supabase.from("company_products").select("prix_vente_directe_centimes").eq("company_id", entreprise.id),
    supabase.from("products").select("id, nom"),
    supabase
      .from("classement_publique")
      .select("company_id, nom, valeur_centimes, calcule_le")
      .order("valeur_centimes", { ascending: false }),
    chargerProgressionMissions(supabase, entreprise.id),
  ]);

  const moisCourant = monde.data?.mois_courant ?? 0;
  const lignes = (grandLivre.data ?? []) as LigneGrandLivre[];
  const nomsProduits: Record<string, string> = {};
  for (const p of (produits.data ?? []) as Array<{ id: string; nom: string }>) nomsProduits[p.id] = p.nom;

  const bilan = bilanSimplifie(lignes);
  const historique = caParMois(lignes, moisCourant, 6);
  const caMois = historique.at(-1)?.valeur ?? 0;
  const caMoisPrecedent = historique.at(-2)?.valeur ?? 0;
  const ecritures = dernieresEcritures(lignes, 4);
  const stockPieces = ((stocks.data ?? []) as Array<{ quantite_pieces: number }>).reduce(
    (s, x) => s + x.quantite_pieces,
    0,
  );
  const aUnProduit = ((catalogue.data ?? []) as Array<{ prix_vente_directe_centimes: number }>).length > 0;
  const signaux = alertes({
    tresorerie: Number(entreprise.tresorerie_centimes),
    caMois,
    stockPieces,
    moisDecouvert: Number(entreprise.mois_decouvert_consecutifs ?? 0),
    aUnProduit,
  });
  const notoriete = marque.data?.notoriete ?? null;
  const desirabilite = marque.data?.desirabilite ?? null;

  const rangs = (classement.data ?? []) as Array<{ company_id: string; nom: string; valeur_centimes: number }>;
  const monRang = rangs.findIndex((r) => r.company_id === entreprise.id);
  const premier = rangs[0];

  const seriePieces = chargerParametresV1()["serie_lancement_pieces"]!.valeur;
  const missionEnCours = (progressions ?? []).find((p) => p.etat !== "validee");
  const defMission = DEFINITIONS_MISSIONS.find((d) => d.id === missionEnCours?.id);
  const nouveauJoueur = lignes.every((l) => l.compte !== "707");

  const evolution =
    caMoisPrecedent > 0 ? Math.round(((caMois - caMoisPrecedent) / caMoisPrecedent) * 1000) / 10 : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SurTitre>
            {entreprise.nom} · {libelleGamme(entreprise.gamme)} · mois {moisCourant}
          </SurTitre>
          <h1 className="text-[1.75rem] font-extrabold">Tableau de bord</h1>
          <p className="mt-1 max-w-[62ch] text-muted">
            Ce que voit un dirigeant chaque matin : la trésorerie, les ventes, la marque et le bilan.
          </p>
        </div>
        <BoutonLien href="/vue-3d">← Le village</BoutonLien>
      </header>

      {nouveauJoueur && (
        <Carte titre="Pour démarrer" surTitre="Premiers pas">
          <ol className="flex flex-col gap-1.5">
            {[
              <>
                Ajoute un produit à ton catalogue et fixe son prix (<Link className="text-accent underline" href="/produits">Vente et prix</Link>).
                Tu reçois une série de lancement de {seriePieces} pièces prête à vendre.
              </>,
              <>
                Le monde avance tout seul, d&apos;un pas par minute réelle (un jour réel = un mois de jeu). Les ventes
                arrivent au fil du temps, sans rien à déclencher.
              </>,
              <>
                Avant d&apos;épuiser ton stock, commande une production (<Link className="text-accent underline" href="/atelier">Production</Link>).
              </>,
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[0.86rem]">
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-[0.75rem] font-bold text-accent">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </Carte>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi
          libelle="Trésorerie"
          valeur={euros(Number(entreprise.tresorerie_centimes))}
          detail="Compte 512 Banque"
          ton={Number(entreprise.tresorerie_centimes) < 0 ? "critique" : "neutre"}
        />
        <Kpi
          libelle="Ventes du mois"
          valeur={euros(caMois)}
          detail={
            evolution === null
              ? "Chiffre d'affaires HT, compte 707"
              : `${evolution >= 0 ? "+" : ""}${evolution.toLocaleString("fr-FR")} % par rapport au mois précédent`
          }
        />
        <Carte>
          <div className="flex flex-col gap-1">
            <SurTitre>Notoriété</SurTitre>
            <span className="font-display text-[1.7rem] font-extrabold leading-[1.1] tabular-nums">
              {notoriete === null ? "—" : Math.round(notoriete)} <small className="text-[0.8rem] font-semibold text-muted">/ 100</small>
            </span>
            <Jauge libelle="" valeur={notoriete ?? 0} max={100} texte="" compacte />
            <span className="text-[0.8rem] text-muted">Combien de gens connaissent ta marque. Elle fait le volume.</span>
          </div>
        </Carte>
        <Carte>
          <div className="flex flex-col gap-1">
            <SurTitre>Désirabilité</SurTitre>
            <span className="font-display text-[1.7rem] font-extrabold leading-[1.1] tabular-nums">
              {desirabilite === null ? "—" : Math.round(desirabilite)} <small className="text-[0.8rem] font-semibold text-muted">/ 100</small>
            </span>
            <Jauge libelle="" valeur={desirabilite ?? 0} max={100} texte="" ton="or" compacte />
            <span className="text-[0.8rem] text-muted">Combien ils en ont envie. Elle permet de vendre plus cher.</span>
          </div>
        </Carte>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Carte titre="Chiffre d'affaires par mois de jeu">
          <Graphique
            titre="Chiffre d'affaires hors taxes des six derniers mois"
            barres={historique.map((h) => ({ libelle: `mois ${h.mois}`, valeur: h.valeur }))}
          />
          <p className="mt-2 text-[0.8rem] text-muted">
            {caMois > 0
              ? `Mois ${moisCourant} : ${euros(caMois)} HT de ventes depuis le début du mois.`
              : "Pas encore de vente ce mois-ci : les ventes arrivent au fil du temps tant que tu as du stock et un prix."}
          </p>
        </Carte>

        <Carte titre="Bilan simplifié">
          <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line max-sm:grid-cols-1">
            {[
              { titre: "Actif", sous: "Ce que la société possède", postes: bilan.actif, total: bilan.totalActif },
              { titre: "Passif", sous: "Qui l'a financé", postes: bilan.passif, total: bilan.totalPassif },
            ].map((col, i) => (
              <div key={col.titre} className={`flex flex-col px-3 py-2.5 ${i === 0 ? "border-r border-line max-sm:border-b max-sm:border-r-0" : ""}`}>
                <span className="font-display font-bold">{col.titre}</span>
                <SurTitre className="mb-1">{col.sous}</SurTitre>
                {col.postes.map((p) => (
                  <div key={p.libelle} className="flex justify-between gap-2 py-[3px] text-[0.84rem]">
                    <span>{p.libelle}</span>
                    <b className={`font-semibold tabular-nums ${p.montant < 0 ? "text-bad" : ""}`}>{euros(p.montant)}</b>
                  </div>
                ))}
                <div className="mt-auto flex justify-between gap-2 border-t border-line pt-1.5 text-[0.84rem] font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{euros(col.total)}</span>
                </div>
              </div>
            ))}
          </div>
          <p
            className={`mt-3 rounded-[9px] px-3 py-2 text-[0.84rem] font-medium ${
              bilan.equilibre ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
            }`}
          >
            {bilan.equilibre
              ? "Actif = Passif : le bilan est équilibré. Chaque écriture a toujours un débit et un crédit égaux."
              : "Actif et passif diffèrent : c'est une anomalie à signaler."}
          </p>
        </Carte>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Carte titre="Le moteur te signale">
            <div className="flex flex-col gap-2">
              {signaux.map((a) => (
                <div key={a.texte} className="flex items-start gap-2.5 rounded-[9px] bg-surface-2 px-2.5 py-2 text-[0.86rem]">
                  <i
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      a.ton === "critique" ? "bg-bad" : a.ton === "alerte" ? "bg-thread" : "bg-good"
                    }`}
                  />
                  <span>
                    {a.texte}{" "}
                    {a.lien && (
                      <Link href={a.lien} className="text-accent underline">
                        Y aller
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </Carte>
          <CarteEtape
            etape={entreprise.etape as EtapeEntreprise}
            piecesVendues={Number(entreprise.pieces_vendues_total)}
            chiffreAffairesHt={Number(entreprise.chiffre_affaires_cumule_ht_centimes)}
            tresorerie={Number(entreprise.tresorerie_centimes)}
          />
        </div>

        <Carte titre="Dernières écritures" action={<Link href="/finances" className="text-xs text-accent underline">Tout le grand livre</Link>}>
          {ecritures.length === 0 ? (
            <p className="text-[0.86rem] text-muted">
              Chaque opération de ta société s&apos;écrira ici en partie double : ce qui entre au débit, ce qui sort au crédit.
            </p>
          ) : (
            <div className="flex max-h-[520px] flex-col gap-2 overflow-auto [&>*]:shrink-0">
              {ecritures.map((e) => (
                <EcritureComptable
                  key={e.id}
                  libelle={libelleLisible(e.libelle, nomsProduits)}
                  etiquette={formaterDateHeure(e.cree_le)}
                  lignes={e.lignes}
                />
              ))}
            </div>
          )}
        </Carte>

        <div className="flex flex-col gap-4">
          <Carte>
            <div className="mb-2 flex items-baseline justify-between border-b-2 border-ink pb-1 font-display">
              <span className="text-[1.25rem] font-extrabold">Le Petit Kapital</span>
              <small className="font-sans font-medium text-muted">Revue de presse</small>
            </div>
            {premier ? (
              <>
                <h4 className="text-base font-bold">{premier.nom} en tête du classement</h4>
                <p className="mb-2.5 text-[0.84rem] text-muted">
                  Valeur de l&apos;entreprise : {euros(premier.valeur_centimes)}, sur {rangs.length} sociétés en lice.
                </p>
              </>
            ) : null}
            <h4 className="text-base font-bold">
              {monRang >= 0 ? `${entreprise.nom} pointe à la ${monRang + 1}ᵉ place` : `${entreprise.nom} pas encore classée`}
            </h4>
            <p className="mb-2.5 text-[0.84rem] text-muted">
              {monRang >= 0
                ? `Valeur estimée : ${euros(rangs[monRang]!.valeur_centimes)}.`
                : "Le classement est recalculé régulièrement."}{" "}
              <Link href="/classement" className="text-accent underline">
                Voir le classement
              </Link>
            </p>
            <h4 className="text-base font-bold">
              {caMois > 0 ? `${euros(caMois)} de ventes ce mois-ci` : "Les clients attendent la collection"}
            </h4>
            <p className="text-[0.84rem] text-muted">
              {Number(entreprise.pieces_vendues_total).toLocaleString("fr-FR")} pièces vendues depuis la création.
            </p>
          </Carte>

          {defMission && missionEnCours && (
            <Link href="/missions" className="block">
              <Carte surTitre={`Mission ${defMission.numero}`} titre={defMission.titre}>
                <p className="mb-2 text-[0.86rem] text-muted">{defMission.objectif}</p>
                {missionEnCours.cible > 0 && (
                  <Jauge
                    libelle="Avancement"
                    valeur={missionEnCours.actuel}
                    max={missionEnCours.cible}
                    texte={
                      defMission.id === "mission3"
                        ? `${formaterEuros(missionEnCours.actuel)} € / ${formaterEuros(missionEnCours.cible)} €`
                        : `${missionEnCours.actuel} / ${missionEnCours.cible}`
                    }
                  />
                )}
                <div className="mt-2">
                  <Puce ton="accent">En cours</Puce>
                </div>
              </Carte>
            </Link>
          )}

          <EncadreNotion titre="Trésorerie n'est pas bénéfice">
            Le résultat compare ce que tu as vendu à ce que ça t&apos;a coûté. La trésorerie, c&apos;est l&apos;argent
            réellement sur le compte. Une société rentable peut manquer d&apos;argent si ses clients paient tard ou si son
            stock dort.
          </EncadreNotion>
        </div>
      </div>
    </div>
  );
}
