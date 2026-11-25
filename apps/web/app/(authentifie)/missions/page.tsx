import { DEFINITIONS_MISSIONS, type EtatMission } from "@kapital/engine";
import { BoutonLien, Carte, EncadreNotion, Jauge, Puce } from "../../../components/ui";
import { EnTete } from "../../../components/apercu/elements";
import { creerClientServeur } from "../../../lib/supabase/server";
import { chargerProgressionMissions } from "../../../lib/missions";
import { formaterEuros } from "../../../lib/formatage";

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

  const progressions = (await chargerProgressionMissions(supabase, entreprise.id)) ?? [];
  const reussies = progressions.filter((p) => p.etat === "validee").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
      <EnTete surTitre="Progression" titre="Missions">
        Trois missions pour apprendre les notions clés du jeu : le coût de revient, la trésorerie, le besoin en fonds de
        roulement. Elles avancent toutes seules pendant que tu joues.
      </EnTete>

      <Carte>
        <Jauge
          libelle="Missions réussies"
          valeur={reussies}
          max={DEFINITIONS_MISSIONS.length}
          ton={reussies === DEFINITIONS_MISSIONS.length ? "bon" : "accent"}
        />
      </Carte>

      <div className="grid items-start gap-4 lg:grid-cols-3">
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
              surTitre={`Mission ${d.numero}`}
              titre={d.titre}
              action={<Puce ton={ETATS[etat].ton}>{ETATS[etat].texte}</Puce>}
            >
              <div className="flex flex-col gap-3">
                <p className="text-[0.86rem] text-muted">{d.objectif}</p>
                <Jauge
                  libelle="Avancement"
                  valeur={etat === "validee" ? Math.max(actuel, cible) : actuel}
                  max={cible > 0 ? cible : 1}
                  ton={etat === "validee" ? "bon" : "accent"}
                  texte={cible > 0 ? `${format(actuel)} / ${format(cible)}` : etat === "validee" ? "Fait" : "Pas encore"}
                />
                <EncadreNotion titre={d.notion}>{d.explication}</EncadreNotion>
                {etat !== "validee" && agir && (
                  <div>
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
    </div>
  );
}
