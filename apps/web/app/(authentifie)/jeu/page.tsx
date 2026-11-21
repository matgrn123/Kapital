import Link from "next/link";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { chargerProgressionMissions } from "../../../lib/missions";
import { DEFINITIONS_MISSIONS } from "@kapital/engine";

type Ecriture = {
  id: string;
  mois_jeu: number;
  libelle: string;
  compte: string;
  sens: "debit" | "credit";
  montant_centimes: number;
  cree_le: string;
};

export default async function PageJeu() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, nom, gamme, etape, statut, tresorerie_centimes, cree_le")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { data: ecritures } = await supabase
    .from("ledger_entries")
    .select("id, mois_jeu, libelle, compte, sens, montant_centimes, cree_le")
    .eq("company_id", entreprise.id)
    .order("cree_le", { ascending: false })
    .limit(10);

  const dernieres = (ecritures ?? []) as Ecriture[];

  const progressions = (await chargerProgressionMissions(supabase, entreprise.id)) ?? [];
  const missionACourante =
    progressions.find((p) => p.etat !== "validee") ?? progressions[0];
  const defACourante = DEFINITIONS_MISSIONS.find(
    (d) => d.id === missionACourante?.id,
  );

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="flex items-end justify-between border-b border-[color:var(--color-g-200)] pb-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Tableau de bord
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {entreprise.nom}
          </h1>
        </div>
        <div className="text-right text-xs text-[color:var(--color-g-500)]">
          <p>Gamme <span className="font-medium text-[color:var(--color-noir)] capitalize">{entreprise.gamme}</span></p>
          <p>Étape <span className="chiffre font-medium text-[color:var(--color-noir)]">{entreprise.etape}</span></p>
          <p>Statut <span className="font-medium text-[color:var(--color-noir)]">{entreprise.statut}</span></p>
        </div>
      </header>

      <section className="mt-10 grid grid-cols-4 gap-4">
        <Carte libelle="Trésorerie">
          <span className="chiffre">{formaterEuros(entreprise.tresorerie_centimes)} €</span>
        </Carte>
        <Carte libelle="Chiffre d'affaires">
          <span className="chiffre">{formaterEuros(0)} €</span>
          <span className="block text-xs text-[color:var(--color-g-500)]">mois en cours</span>
        </Carte>
        <Carte libelle="Marge brute">
          <span className="chiffre">{formaterEuros(0)} €</span>
          <span className="block text-xs text-[color:var(--color-g-500)]">mois en cours</span>
        </Carte>
        <Carte libelle="Résultat net">
          <span className="chiffre">{formaterEuros(0)} €</span>
          <span className="block text-xs text-[color:var(--color-g-500)]">mois en cours</span>
        </Carte>
      </section>

      <section className="mt-10 grid grid-cols-5 gap-6">
        <div className="col-span-3 rounded-md border border-[color:var(--color-g-200)]">
          <header className="flex items-center justify-between border-b border-[color:var(--color-g-200)] px-5 py-3">
            <h2 className="text-sm font-semibold">Dernières écritures</h2>
            <p className="text-xs text-[color:var(--color-g-500)]">
              {dernieres.length === 0 ? "aucune" : dernieres.length}
            </p>
          </header>
          {dernieres.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[color:var(--color-g-500)]">
              Aucune activité encore. Commencez par passer une commande de
              matière ou embaucher un artisan.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Libellé</th>
                  <th className="px-5 py-2 text-left font-medium">Compte</th>
                  <th className="px-5 py-2 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {dernieres.map((e) => (
                  <tr key={e.id} className="border-t border-[color:var(--color-g-200)]">
                    <td className="px-5 py-2">
                      <p>{e.libelle}</p>
                      <p className="text-xs text-[color:var(--color-g-500)]">
                        {formaterDateHeure(e.cree_le)}
                      </p>
                    </td>
                    <td className="chiffre px-5 py-2 text-[color:var(--color-g-700)]">{e.compte}</td>
                    <td className="chiffre px-5 py-2 text-right">
                      <span className={e.sens === "debit" ? "" : "text-[color:var(--color-g-500)]"}>
                        {e.sens === "debit" ? "" : "-"}
                        {formaterEuros(e.montant_centimes)} €
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="col-span-2 space-y-4">
          <div className="rounded-md border border-[color:var(--color-g-200)] p-5">
            <h3 className="text-sm font-semibold">Alertes</h3>
            <p className="mt-2 text-sm text-[color:var(--color-g-500)]">Aucune alerte pour l'instant.</p>
          </div>
          <div className="rounded-md border border-[color:var(--color-g-200)] p-5">
            <h3 className="text-sm font-semibold">Prochain événement</h3>
            <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
              Pas de livraison ni d'échéance planifiée.
            </p>
          </div>
          {defACourante && missionACourante && (
            <Link
              href="/missions"
              className="block rounded-md border border-dashed border-[color:var(--color-g-300)] p-5 transition hover:border-[color:var(--color-g-500)] hover:bg-[color:var(--color-g-100)]"
            >
              <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                Mission {defACourante.numero}
                {missionACourante.etat === "validee" ? " — validée" : ""}
              </p>
              <h3 className="mt-1 text-sm font-semibold">{defACourante.titre}</h3>
              <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
                {defACourante.objectif}
              </p>
              <p className="chiffre mt-3 text-xs text-[color:var(--color-g-500)]">
                {missionACourante.cible > 0
                  ? `${missionACourante.actuel} / ${missionACourante.cible}`
                  : "voir le détail →"}
              </p>
            </Link>
          )}
        </aside>
      </section>
    </div>
  );
}

function Carte({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
        {libelle}
      </p>
      <p className="mt-2 text-xl font-medium">{children}</p>
    </div>
  );
}
