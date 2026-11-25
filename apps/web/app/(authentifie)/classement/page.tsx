import { ordonnerClassement } from "@kapital/engine";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";

type LigneDb = {
  company_id: string;
  nom: string;
  gamme: string;
  pseudo: string;
  valeur_centimes: number;
  calcule_le: string | null;
};

const LIBELLE_GAMME: Record<string, string> = {
  entree: "Entrée",
  milieu: "Milieu",
  haut: "Haut",
};

export default async function PageClassement() {
  const supabase = await creerClientServeur();
  const { data } = await supabase
    .from("classement_publique")
    .select("company_id, nom, gamme, pseudo, valeur_centimes, calcule_le");

  const brut = (data ?? []) as LigneDb[];
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
      <header className="flex items-end justify-between border-b border-[color:var(--color-g-200)] pb-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Monde
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Classement</h1>
          <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
            Classement par valeur d'entreprise : actifs moins dettes externes.
            Recalculé toutes les 30 minutes.
          </p>
        </div>
        <div className="text-right text-xs text-[color:var(--color-g-500)]">
          {dernierCalcul && (
            <>
              <p>Dernier calcul</p>
              <p className="chiffre font-medium text-[color:var(--color-noir)]">
                {formaterDateHeure(dernierCalcul)}
              </p>
            </>
          )}
        </div>
      </header>

      <section className="mt-8 rounded-md border border-[color:var(--color-g-200)]">
        {classement.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[color:var(--color-g-500)]">
            Aucune entreprise active pour l'instant.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Rang</th>
                <th className="px-5 py-2 text-left font-medium">Entreprise</th>
                <th className="px-5 py-2 text-left font-medium">Joueur</th>
                <th className="px-5 py-2 text-left font-medium">Gamme</th>
                <th className="px-5 py-2 text-right font-medium">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {classement.map((l) => (
                <tr
                  key={l.company_id}
                  className="border-t border-[color:var(--color-g-200)]"
                >
                  <td className="chiffre px-5 py-2 text-[color:var(--color-g-500)]">
                    {l.rang}
                  </td>
                  <td className="px-5 py-2 font-medium">{l.nom}</td>
                  <td className="px-5 py-2 text-[color:var(--color-g-700)]">
                    {l.pseudo}
                  </td>
                  <td className="px-5 py-2 text-[color:var(--color-g-700)]">
                    {LIBELLE_GAMME[l.gamme] ?? l.gamme}
                  </td>
                  <td className="chiffre px-5 py-2 text-right">
                    {formaterEuros(l.valeur_centimes)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
