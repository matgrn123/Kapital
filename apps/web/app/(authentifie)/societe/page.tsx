import { chargerParametresV1 } from "@kapital/content";
import { seuilsEtapesDepuis, type EtapeEntreprise } from "@kapital/engine";
import { Carte, EcritureComptable, EncadreNotion, FilRouge, Puce } from "../../../components/ui";
import { EnTete, Etapes, Faits, Vide } from "../../../components/ui/formulaire";
import { formaterDate, formaterEuros } from "../../../lib/formatage";
import { libelleGamme } from "../../../lib/lisible";
import { creerClientServeur } from "../../../lib/supabase/server";
import { capitalSocial, ecritureOuverture, etapesDuJeu, INTITULES_ETAPES } from "./donnees";

// Société (maquette V2, V.societe), en lecture seule : en V1, une seule
// société par joueur, une SAS (docs/plan-architecture-entreprise.md §0).

export const dynamic = "force-dynamic";

export default async function PageSociete() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, nom, gamme, etape, cree_le")
    .eq("owner_profile_id", user?.id ?? "")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { data: grandLivre } = await supabase
    .from("ledger_entries")
    .select("ecriture_id, compte, sens, montant_centimes, libelle")
    .eq("company_id", entreprise.id);
  const lignes = (grandLivre ?? []) as Array<{
    ecriture_id: string;
    compte: string;
    sens: "debit" | "credit";
    montant_centimes: number;
    libelle: string;
  }>;

  const capital = capitalSocial(lignes);
  const ouverture = ecritureOuverture(lignes);
  const etape = entreprise.etape as EtapeEntreprise;
  const etapes = etapesDuJeu(seuilsEtapesDepuis(chargerParametresV1()));

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Greffe du tribunal de commerce" titre="Société">
        Ta société existe déjà : c&apos;est elle qui achète, produit, vend et tient ses comptes. En V1, chaque joueur a
        une seule société.
      </EnTete>

      <div className="grid gap-4 md:grid-cols-2">
        <Carte surTitre="Ta société" titre={<span className="flex items-center gap-2">{entreprise.nom} <Puce ton="accent">SAS</Puce></span>}>
          <Faits
            lignes={[
              ["Forme", "Société par actions simplifiée (SAS)"],
              ["Capital", capital === null ? "Pas encore d'écriture" : `${formaterEuros(capital)} €`],
              ["Activité", "Création et vente de vêtements"],
              ["Gamme", libelleGamme(entreprise.gamme)],
              ["Étape", `${etape} · ${INTITULES_ETAPES[etape]}`],
              ["Créée le", formaterDate(entreprise.cree_le)],
            ]}
          />
        </Carte>
        <Carte surTitre="Grand livre" titre="L'écriture d'ouverture">
          {ouverture ? (
            <EcritureComptable libelle={ouverture.libelle} etiquette="mois 0" lignes={ouverture.lignes} />
          ) : (
            <Vide>L&apos;apport de capital n&apos;apparaît pas encore dans ton grand livre.</Vide>
          )}
          <p className="mt-2 text-[0.84rem] text-muted">
            Ton apport arrive en banque (512, au débit) et devient le capital de la société (101, au crédit) : ce que
            la société doit à ses associés.
          </p>
        </Carte>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Carte titre="Les étapes, comme en vrai">
          <Etapes
            etapes={[
              "Rédiger les statuts : le nom, l'activité, le capital, le président.",
              "Déposer le capital sur un compte bloqué au nom de la société en formation.",
              "Publier une annonce légale de création.",
              "Déclarer la société au guichet unique : elle est immatriculée au registre du commerce (extrait Kbis).",
              "Le capital est débloqué sur le compte de la société : elle peut commencer à acheter et vendre.",
            ]}
          />
          <p className="mt-2 text-[0.84rem] text-muted">Dans le jeu, tout cela se fait en un instant, à ta première connexion.</p>
        </Carte>
        <Carte titre="Les étapes du jeu">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {etapes.map((e) => (
              <li key={e.etape} className="flex flex-col gap-0.5 text-[0.86rem]">
                <span className="flex items-center gap-2 font-semibold">
                  Étape {e.etape} · {e.intitule}
                  {e.etape === etape && <Puce ton="accent">Tu es ici</Puce>}
                  {e.etape < etape && <Puce ton="bon">Atteinte</Puce>}
                </span>
                <span className="text-muted">{e.condition}</span>
                <span>Débloque : {e.debloque.join(", ")}.</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[0.84rem] text-muted">L&apos;étape est constatée à la fin de chaque mois de jeu ; elle ne redescend jamais.</p>
        </Carte>
      </div>

      <EncadreNotion titre="Le capital social">
        Le capital, c&apos;est l&apos;argent que les associés apportent à la société. Il n&apos;est pas un revenu : il reste
        inscrit au passif, comme une dette de la société envers ses associés. Dans une SAS, chaque associé ne risque
        que ce qu&apos;il a apporté.
      </EncadreNotion>
      <FilRouge ecran="societe" />
    </div>
  );
}
