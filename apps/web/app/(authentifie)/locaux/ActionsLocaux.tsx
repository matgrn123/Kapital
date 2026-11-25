"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { centimes, mensualite } from "@kapital/engine";
import { formaterEuros } from "../../../lib/formatage";
import { appelerAction } from "../_partage/reponses";

const bouton =
  "rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50";
const etiquette = "block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]";
const champ =
  "chiffre w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]";

export type OffreLocal = {
  id: string;
  nom: string;
  surfaceM2: number;
  loyer: number;
  charges: number;
  depot: number;
  prix: number;
  apportMinimal: number;
  etapeDebloquee: number;
  /** Étape de l'entreprise inférieure à celle du local. */
  verrouEtape: boolean;
  /** Comparatif louer ou acheter sur la durée comparée. */
  comparatif: {
    mois: number;
    coutLouer: number;
    coutAcheter: number;
    sortiesLouer: number;
    sortiesAcheter: number;
    valeurRestante: number;
    detteRestante: number;
  } | null;
};

export type ReglesAchatAffichees = {
  tauxAnnuel: number;
  dureeMin: number;
  dureeMax: number;
  dureeDefaut: number;
};

export function CarteOffre({
  offre,
  achat,
  peutAgir,
}: {
  offre: OffreLocal;
  achat: ReglesAchatAffichees;
  /** Faux si l'entreprise a déjà un local. */
  peutAgir: boolean;
}) {
  const router = useRouter();
  const [apport, setApport] = useState((offre.apportMinimal / 100).toFixed(2));
  const [duree, setDuree] = useState(String(achat.dureeDefaut));
  const [enCours, setEnCours] = useState<"louer" | "acheter" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const apportCentimes = Math.round(parseFloat(apport.replace(",", ".")) * 100);
  const dureeN = parseInt(duree, 10);
  const estimation = useMemo(() => {
    if (!Number.isFinite(apportCentimes) || apportCentimes <= 0 || apportCentimes > offre.prix) return null;
    if (!Number.isFinite(dureeN) || dureeN < achat.dureeMin || dureeN > achat.dureeMax) return null;
    const pret = offre.prix - apportCentimes;
    if (pret <= 0) return { pret: 0, mens: 0, cout: 0 };
    const mens = mensualite(centimes(pret), achat.tauxAnnuel, dureeN);
    return { pret, mens, cout: mens * dureeN - pret };
  }, [apportCentimes, dureeN, offre.prix, achat]);

  async function louer() {
    setErreur(null);
    setSucces(null);
    setEnCours("louer");
    const r = await appelerAction("/api/actions/louer-atelier", { batimentId: offre.id });
    setEnCours(null);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    setSucces("Bail signé.");
    router.refresh();
  }

  async function acheter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    if (!estimation) {
      setErreur(
        `Indiquez un apport entre 1 € et le prix du local, et une durée de ${achat.dureeMin} à ${achat.dureeMax} mois.`,
      );
      return;
    }
    setEnCours("acheter");
    const r = await appelerAction("/api/actions/acheter-local", {
      batimentId: offre.id,
      apportCentimes,
      dureeMois: dureeN,
    });
    setEnCours(null);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    setSucces("Local acheté.");
    router.refresh();
  }

  const c = offre.comparatif;
  return (
    <article className="rounded-md border border-[color:var(--color-g-200)] p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{offre.nom}</h3>
        <p className="text-xs text-[color:var(--color-g-500)]">
          <span className="chiffre">{offre.surfaceM2}</span> m²
          {offre.etapeDebloquee > 0 ? ` · étape ${offre.etapeDebloquee} minimum` : ""}
        </p>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className={etiquette}>Loyer</dt>
          <dd className="chiffre mt-1">{formaterEuros(offre.loyer)} € / mois</dd>
        </div>
        <div>
          <dt className={etiquette}>Charges</dt>
          <dd className="chiffre mt-1">{formaterEuros(offre.charges)} € / mois</dd>
        </div>
        <div>
          <dt className={etiquette}>Dépôt de garantie</dt>
          <dd className="chiffre mt-1">{formaterEuros(offre.depot)} €</dd>
        </div>
        <div>
          <dt className={etiquette}>Prix d'achat</dt>
          <dd className="chiffre mt-1">{formaterEuros(offre.prix)} €</dd>
        </div>
      </dl>

      {c && (
        <div className="mt-4 rounded-md bg-[color:var(--color-g-100)] p-4 text-sm">
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Louer ou acheter : comparaison sur {c.mois} mois
          </p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-medium">Louer</p>
              <p className="chiffre">Coût : {formaterEuros(c.coutLouer)} €</p>
              <p className="chiffre text-xs text-[color:var(--color-g-500)]">
                Argent sorti : {formaterEuros(c.sortiesLouer)} € (dont {formaterEuros(offre.depot)} € de dépôt rendu à la fin du bail)
              </p>
            </div>
            <div>
              <p className="font-medium">Acheter à crédit</p>
              <p className="chiffre">Coût : {formaterEuros(c.coutAcheter)} €</p>
              <p className="chiffre text-xs text-[color:var(--color-g-500)]">
                Argent sorti : {formaterEuros(c.sortiesAcheter)} € ; il vous reste un local valant {formaterEuros(c.valeurRestante)} € et {formaterEuros(c.detteRestante)} € de dette
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-g-500)]">
            Le coût compte ce qui est vraiment perdu : le loyer et les charges si vous louez ; les intérêts,
            l'usure du bâtiment (amortissement) et les charges si vous achetez.
          </p>
        </div>
      )}

      {peutAgir && !offre.verrouEtape && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={louer} disabled={enCours !== null} className={bouton}>
              {enCours === "louer" ? "Signature..." : `Louer (dépôt de ${formaterEuros(offre.depot)} €)`}
            </button>
          </div>

          <form onSubmit={acheter} className="grid gap-3 border-t border-[color:var(--color-g-200)] pt-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor={`apport-${offre.id}`} className={etiquette}>Apport (€)</label>
              <input id={`apport-${offre.id}`} type="text" inputMode="decimal" value={apport} onChange={(e) => setApport(e.target.value)} className={champ} />
              <p className="text-xs text-[color:var(--color-g-500)]">Minimum : {formaterEuros(offre.apportMinimal)} €</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`duree-${offre.id}`} className={etiquette}>Durée du prêt (mois)</label>
              <input id={`duree-${offre.id}`} type="text" inputMode="numeric" value={duree} onChange={(e) => setDuree(e.target.value)} className={champ} />
              <p className="text-xs text-[color:var(--color-g-500)]">De {achat.dureeMin} à {achat.dureeMax} mois</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <span className={etiquette}>Estimation</span>
              {estimation ? (
                <p className="chiffre pt-1 text-sm">
                  Prêt {formaterEuros(estimation.pret)} € · {formaterEuros(estimation.mens)} € par mois · coût du crédit {formaterEuros(estimation.cout)} €
                  <span className="block text-xs text-[color:var(--color-g-500)]">
                    Taux {(achat.tauxAnnuel * 100).toFixed(2).replace(".", ",")} %
                  </span>
                </p>
              ) : (
                <p className="pt-1 text-xs text-[color:var(--color-g-500)]">Renseignez un apport et une durée valables.</p>
              )}
            </div>
            <div className="sm:col-span-4">
              <button type="submit" disabled={enCours !== null} className={bouton}>
                {enCours === "acheter" ? "Achat..." : "Acheter à crédit"}
              </button>
            </div>
          </form>
        </div>
      )}
      {peutAgir && offre.verrouEtape && (
        <p className="mt-4 text-sm text-[color:var(--color-g-500)]">
          Ce local se débloque à l'étape {offre.etapeDebloquee}.
        </p>
      )}

      {erreur && (
        <p role="alert" className="mt-3 text-sm text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}
      {succes && (
        <p role="status" className="mt-3 text-sm text-[color:var(--color-succes)]">
          {succes}
        </p>
      )}
    </article>
  );
}

export function BoutonConge({ preavisMois }: { preavisMois: number }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function donner() {
    if (
      !confirm(
        `Donner congé ? Le bail se termine dans ${preavisMois} mois et le loyer reste dû jusque-là. Le dépôt de garantie vous est rendu à la fin.`,
      )
    )
      return;
    setErreur(null);
    setEnCours(true);
    const r = await appelerAction("/api/actions/donner-conge-atelier");
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={donner} disabled={enCours} className={bouton}>
        {enCours ? "Envoi..." : `Donner congé (préavis de ${preavisMois} mois)`}
      </button>
      {erreur && (
        <p role="alert" className="mt-2 text-sm text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}
    </div>
  );
}
