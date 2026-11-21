import { DEFINITIONS_MISSIONS, type EtatMission } from "@kapital/engine";
import { creerClientServeur } from "../../../lib/supabase/server";
import { chargerProgressionMissions } from "../../../lib/missions";
import { formaterEuros } from "../../../lib/formatage";

const LIBELLES_ETAT: Record<EtatMission, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  validee: "Validée",
};

export default async function PageMissions() {
  const supabase = await creerClientServeur();
  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, nom")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const progressions = (await chargerProgressionMissions(supabase, entreprise.id)) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Tutoriel
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Missions</h1>
        <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
          Trois étapes pour apprendre les notions clés du jeu : coût de revient,
          trésorerie, besoin en fonds de roulement.
        </p>
      </header>

      <section className="mt-8 space-y-5">
        {DEFINITIONS_MISSIONS.map((d) => {
          const p = progressions.find((x) => x.id === d.id);
          const etat: EtatMission = p?.etat ?? "a_faire";
          const actuel = p?.actuel ?? 0;
          const cible = p?.cible ?? 0;
          const pourcentage =
            cible > 0 ? Math.min(100, Math.round((actuel / cible) * 100)) : 0;
          const formatValeur = d.id === "mission3"
            ? (v: number) => `${formaterEuros(v)} €`
            : (v: number) => String(v);

          return (
            <article
              key={d.id}
              className="rounded-md border border-[color:var(--color-g-200)] p-6"
            >
              <header className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                    Mission {d.numero}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{d.titre}</h2>
                  <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
                    {d.objectif}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-md border px-3 py-1 text-xs font-medium ${
                    etat === "validee"
                      ? "border-[color:var(--color-g-900)] bg-[color:var(--color-noir)] text-[color:var(--color-blanc)]"
                      : etat === "en_cours"
                        ? "border-[color:var(--color-g-500)] text-[color:var(--color-g-700)]"
                        : "border-[color:var(--color-g-300)] text-[color:var(--color-g-500)]"
                  }`}
                >
                  {LIBELLES_ETAT[etat]}
                </span>
              </header>

              <div className="mt-5">
                <div className="flex items-baseline justify-between text-xs text-[color:var(--color-g-500)]">
                  <span>Avancement</span>
                  <span className="chiffre">
                    {formatValeur(actuel)}
                    {cible > 0 && ` / ${formatValeur(cible)}`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[color:var(--color-g-200)]">
                  <div
                    className="h-full rounded-full bg-[color:var(--color-noir)] transition-all"
                    style={{ width: `${pourcentage}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 border-t border-[color:var(--color-g-200)] pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-g-500)]">
                  {d.notion}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-g-700)]">
                  {d.explication}
                </p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
