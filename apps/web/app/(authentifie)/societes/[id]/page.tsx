import { notFound } from "next/navigation";
import { chargerBatimentsV1 } from "@kapital/content";
import { ordonnerClassement } from "@kapital/engine";
import { BoutonLien, Carte, EncadreNotion, Kpi, Puce } from "../../../../components/ui";
import { EnTete, Faits, Vide } from "../../../../components/ui/formulaire";
import {
  estIdentifiantSociete,
  LIBELLE_CATEGORIE,
  lireComptesPublics,
  moisDuProchainDepot,
  SELECT_COMPTES_PUBLICS,
  type LigneComptesPublics,
} from "../../../../lib/empire";
import { enMois, estIndexCalendaire, periodeMois } from "../../../../lib/cadre";
import { formaterEuros } from "../../../../lib/formatage";
import { creerClientServeur } from "../../../../lib/supabase/server";
import { nomLisibleSociete } from "../../../../lib/lisible";
import { VignetteBatiment } from "../../empire/VignetteBatiment";

// 3D-8 : profil public d'une société, lisible par tous les joueurs connectés.
// Tout vient de vues publiques : comptes_publics (migration 0035, liste blanche) et
// classement_publique. Aucune lecture des tables privées d'une autre société.

const LIBELLE_GAMME: Record<string, string> = { entree: "Entrée de gamme", milieu: "Milieu de gamme", haut: "Haut de gamme" };

export default async function PageSociete({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!estIdentifiantSociete(id)) notFound();

  const supabase = await creerClientServeur();
  const [{ data: ligne }, { data: classementBrut }, { data: miennes }, { data: monde }] = await Promise.all([
    supabase.from("comptes_publics").select(SELECT_COMPTES_PUBLICS).eq("company_id", id).maybeSingle(),
    supabase.from("classement_publique").select("company_id, nom, gamme, pseudo, valeur_centimes"),
    supabase.from("companies").select("id").limit(1),
    supabase.from("worlds").select("mois_courant").eq("etat", "actif").limit(1).maybeSingle(),
  ]);
  if (!ligne) notFound();

  const societe = lireComptesPublics(ligne as unknown as LigneComptesPublics);
  const nom = nomLisibleSociete(societe.nom);
  const estMoi = miennes?.[0]?.id === id;
  const classement = ordonnerClassement(
    ((classementBrut ?? []) as Array<{ company_id: string; nom: string; gamme: string; pseudo: string; valeur_centimes: number }>).map(
      (l) => ({ ...l, valeur_centimes: Number(l.valeur_centimes) }),
    ),
  );
  const place = classement.find((l) => l.company_id === id);
  const batiment = societe.batimentId ? chargerBatimentsV1().find((b) => b.id === societe.batimentId) : undefined;
  const moisCourant = Number((monde as { mois_courant?: number } | null)?.mois_courant ?? 0);
  const ex = societe.exercice;

  return (
    <div className="flex flex-col gap-5">
      <EnTete
        surTitre={estMoi ? "Ton profil public" : "Profil public"}
        titre={nom}
        action={
          <>
            {estMoi && <BoutonLien href="/finances">Mes comptes détaillés</BoutonLien>}
            <BoutonLien href="/missions">← Classement</BoutonLien>
          </>
        }
      >
        {estMoi
          ? "Voici ce que les autres joueurs voient de ta société : son extérieur et ses comptes annuels, rien de plus."
          : "Ce que tout le monde peut savoir de cette société, comme au greffe du tribunal de commerce."}
      </EnTete>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Carte
          surTitre="L'extérieur"
          titre={batiment ? batiment.nom : "Pas de local"}
          action={batiment ? <Puce>{LIBELLE_CATEGORIE[batiment.categorie] ?? batiment.categorie}</Puce> : undefined}
        >
          {batiment ? (
            <VignetteBatiment
              categorie={batiment.categorie}
              nbEtages={batiment.nb_etages}
              surfaceM2={batiment.surface_m2}
              enseigne={nom}
              titre={`Extérieur du bâtiment de ${nom}`}
            />
          ) : (
            <Vide>Cette société n&apos;occupe pas de local : elle fait produire chez des façonniers.</Vide>
          )}
        </Carte>

        <Carte surTitre="Identité" titre="Fiche de la société">
          <Faits
            lignes={[
              ["Dirigeant", estMoi ? "Toi" : (place?.pseudo ?? "—")],
              ["Gamme", LIBELLE_GAMME[societe.gamme] ?? "—"],
              ["Étape", String(societe.etape)],
              ["Rang au classement", place ? `${place.rang} sur ${classement.length}` : "—"],
              ["Valeur au classement", `${formaterEuros(societe.valeurCentimes)} €`],
            ]}
          />
        </Carte>
      </div>

      <Carte
        surTitre="Comptes annuels publics"
        titre={
          ex
            ? `Exercice ${ex.numero + 1} (${periodeMois(ex.moisDebut, ex.moisFin) ?? `mois ${ex.moisDebut + 1} à ${ex.moisFin + 1}`})`
            : "Premier exercice en cours"
        }
      >
        {ex ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi libelle="Chiffre d'affaires HT" valeur={eur(ex.chiffreAffairesHtCentimes)} detail="Ventes de l'exercice, hors TVA." />
            <Kpi
              libelle="Résultat net"
              valeur={eur(ex.resultatCentimes)}
              detail="Produits moins charges de l'exercice."
              ton={ex.resultatCentimes < 0 ? "critique" : "neutre"}
            />
            <Kpi libelle="Total du bilan" valeur={eur(ex.totalBilanCentimes)} detail="Tout ce que la société possède à la clôture." />
          </div>
        ) : (
          <Vide>
            Aucun exercice n&apos;est encore clos. Les comptes de la première année seront publiés{" "}
            {estIndexCalendaire(moisCourant)
              ? enMois(moisDuProchainDepot(moisCourant))
              : `au mois ${moisDuProchainDepot(moisCourant) + 1} du jeu`}
            .
          </Vide>
        )}
      </Carte>

      <Carte surTitre="Confidentialité" titre="Ce qui reste privé">
        <p className="text-[0.86rem] text-muted">
          Trésorerie du jour, écritures comptables, salariés et salaires, prix d&apos;achat, stocks, prêts, loyer,
          intérieur des bâtiments et décisions en cours : seul le dirigeant de la société les voit.
        </p>
      </Carte>

      <EncadreNotion titre="Ce que tu apprends : les comptes annuels publics, ce qu'une entreprise doit publier">
        En France, une société commerciale (SARL, SAS…) dépose chaque année ses comptes annuels au greffe du tribunal de
        commerce, et chacun peut les consulter : clients, fournisseurs, banquiers, concurrents. On y lit la taille de
        l&apos;entreprise (chiffre d&apos;affaires, total du bilan) et si elle gagne de l&apos;argent (résultat). Les plus
        petites peuvent demander que certaines parties restent confidentielles. Ce qui change chaque jour, comme la
        trésorerie, n&apos;est jamais publié.
      </EncadreNotion>
    </div>
  );
}

function eur(centimes: number): string {
  return `${formaterEuros(centimes)} €`;
}
