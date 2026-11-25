import { DEFINITIONS_MISSIONS, ordonnerClassement, type EtatMission } from "@kapital/engine";
import { BoutonLien, Carte, EncadreNotion, EnTete, Jauge, Puce, TableauRang, Vide } from "../../../components/ui";
import { creerClientServeur } from "../../../lib/supabase/server";
import { chargerProgressionMissions } from "../../../lib/missions";
import { formaterDateHeure, formaterEuros } from "../../../lib/formatage";

type LigneClassement = {
  company_id: string;
  nom: string;
  gamme: string;
  pseudo: string;
  valeur_centimes: number;
  calcule_le: string | null;
};

const LIBELLE_GAMME: Record<string, string> = { entree: "Entrée", milieu: "Milieu", haut: "Haut" };

const ETATS: Record<EtatMission, { texte: string; ton: "neutre" | "alerte" | "bon" }> = {
  a_faire: { texte: "À faire", ton: "neutre" },
  en_cours: { texte: "En cours", ton: "alerte" },
  validee: { texte: "Réussie", ton: "bon" },
};

/** Où aller pour faire avancer chaque mission. */
const OU_AGIR: Record<string, { href: string; texte: string }> = {
  mission1: { href: "/produits", texte: "Fixer mes prix" },
  mission2: { href: "/banque", texte: "Voir ma trésorerie" },
  mission3: { href: "/atelier", texte: "Produire plus" },
};

export default async function PageMissions() {
  const supabase = await creerClientServeur();
  const { data: entreprises } = await supabase.from("companies").select("id").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [progressionsBrutes, { data: classementBrut }] = await Promise.all([
    chargerProgressionMissions(supabase, entreprise.id),
    supabase.from("classement_publique").select("company_id, nom, gamme, pseudo, valeur_centimes, calcule_le"),
  ]);
  const progressions = progressionsBrutes ?? [];
  const reussies = progressions.filter((p) => p.etat === "validee").length;

  const brut = (classementBrut ?? []) as LigneClassement[];
  const classement = ordonnerClassement(
    brut.map((l) => ({
      company_id: l.company_id,
      nom: l.nom,
      pseudo: l.pseudo,
      gamme: l.gamme,
      valeur_centimes: l.valeur_centimes,
    })),
  );
  const dernierCalcul = brut
    .map((l) => l.calcule_le)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Progression" titre="Missions et classement">
        Trois missions pour apprendre les notions clés du jeu. Elles avancent toutes seules pendant que tu joues. Le
        classement compare la valeur des entreprises du village.
      </EnTete>

      <Carte>
        <Jauge
          libelle="Missions réussies"
          valeur={reussies}
          max={DEFINITIONS_MISSIONS.length}
          ton={reussies === DEFINITIONS_MISSIONS.length ? "bon" : "accent"}
        />
      </Carte>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {DEFINITIONS_MISSIONS.map((d) => {
          const p = progressions.find((x) => x.id === d.id);
          const etat: EtatMission = p?.etat ?? "a_faire";
          const actuel = p?.actuel ?? 0;
          const cible = p?.cible ?? 0;
          const format = d.id === "mission3" ? (v: number) => `${formaterEuros(v)} €` : (v: number) => String(v);
          const agir = OU_AGIR[d.id];
          return (
            <Carte
              key={d.id}
              className="flex h-full flex-col"
              surTitre={`Mission ${d.numero}`}
              titre={d.titre}
              action={<Puce ton={ETATS[etat].ton}>{ETATS[etat].texte}</Puce>}
            >
              <div className="flex flex-1 flex-col gap-3">
                <p className="text-[0.86rem] text-muted">{d.objectif}</p>
                <Jauge
                  libelle="Avancement"
                  valeur={etat === "validee" ? Math.max(actuel, cible) : actuel}
                  max={cible > 0 ? cible : 1}
                  ton={etat === "validee" ? "bon" : "accent"}
                  texte={cible > 0 ? `${format(actuel)} / ${format(cible)}` : etat === "validee" ? "Fait" : "Pas encore"}
                />
                <details className="group">
                  <summary className="cursor-pointer text-[0.84rem] font-semibold text-accent">
                    Ce que tu apprends : {d.notion}
                  </summary>
                  <div className="mt-2">
                    <EncadreNotion titre={d.notion}>{d.explication}</EncadreNotion>
                  </div>
                </details>
                {etat !== "validee" && agir && (
                  <div className="mt-auto">
                    <BoutonLien href={agir.href} petit>
                      {agir.texte}
                    </BoutonLien>
                  </div>
                )}
              </div>
            </Carte>
          );
        })}
      </div>

      <Carte
        titre="Classement du village"
        action={dernierCalcul ? <Puce>Calculé le {formaterDateHeure(dernierCalcul)}</Puce> : undefined}
      >
        {classement.length === 0 ? (
          <Vide>Aucune entreprise active pour l&apos;instant.</Vide>
        ) : (
          <TableauRang
            entetes={[
              { texte: "Rang" },
              { texte: "Société" },
              { texte: "Joueur" },
              { texte: "Gamme" },
              { texte: "Valeur", droite: true },
            ]}
            lignes={classement.map((l) => {
              const moi = l.company_id === entreprise.id;
              return {
                cle: l.company_id,
                moi,
                cellules: [
                  l.rang,
                  l.nom,
                  moi ? "Toi" : l.pseudo,
                  LIBELLE_GAMME[l.gamme] ?? "—",
                  <span key="v" className="tabular-nums">
                    {formaterEuros(l.valeur_centimes)} €
                  </span>,
                ],
              };
            })}
          />
        )}
      </Carte>

      <EncadreNotion titre="La valeur d'une entreprise">
        Le classement retient ce que possède ton entreprise (trésorerie, stocks, machines…) moins ce qu&apos;elle doit à
        l&apos;extérieur (banque, fournisseurs). Vendre beaucoup ne suffit pas : il faut garder de la marge et ne pas trop
        s&apos;endetter.
      </EncadreNotion>
    </div>
  );
}
