import Link from "next/link";
import { Alerte, BoutonLien, Carte, Faits } from "../../../components/ui";
import { formaterDateHeure, formaterEuros } from "../../../lib/formatage";
import type { ResumeAbsence } from "../../../lib/journal";

// Carte « Pendant ton absence » (cahier des charges § 3, point 4) : ce qui s'est passé
// depuis la dernière visite, l'alerte la plus urgente et une action conseillée.

const NB_FAITS = 4;

export function CartePendantAbsence({
  resume,
  depuis,
  urgent,
  conseil,
}: {
  resume: ResumeAbsence;
  /** Dernière visite (ISO). */
  depuis: string;
  /** L'alerte la plus urgente du tableau de bord, s'il y en a une. */
  urgent: { texte: string; ton: "alerte" | "critique" } | null;
  conseil: { texte: string; href: string; libelle: string } | null;
}) {
  const lignes: Array<readonly [string, string]> = [["Ventes encaissées (HT)", `${formaterEuros(resume.ventesHt)} €`]];
  if (resume.encaisse > 0) lignes.push(["Payé par les revendeurs", `${formaterEuros(resume.encaisse)} €`]);
  lignes.push(["Livraisons reçues", String(resume.livraisons)]);
  if (resume.moisClos.length > 0) {
    lignes.push([
      resume.moisClos.length > 1 ? `Charges payées (mois ${resume.moisClos.join(", ")})` : `Charges payées (mois ${resume.moisClos[0]})`,
      `${formaterEuros(resume.chargesPayees)} €`,
    ]);
  }
  const reste = resume.faits.length - NB_FAITS;

  return (
    <Carte
      surTitre={`Depuis ta dernière visite, le ${formaterDateHeure(depuis)}`}
      titre="Pendant ton absence"
      action={
        <Link href="/journal" className="text-xs text-accent underline">
          Tout le journal
        </Link>
      }
      className="border-accent"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Faits lignes={lignes} />
        <div className="flex flex-col gap-2">
          {resume.faits.slice(0, NB_FAITS).map((f) => (
            <Alerte key={f.id} ton={f.ton}>
              {f.texte}
            </Alerte>
          ))}
          {reste > 0 && (
            <Link href="/journal" className="text-[0.8rem] text-accent underline">
              … et {reste} autre{reste > 1 ? "s" : ""} événement{reste > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      </div>
      {(urgent || conseil) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2.5">
          <p className="text-[0.86rem]">
            {urgent ? (
              <>
                <b className={urgent.ton === "critique" ? "text-bad" : "text-thread"}>Le plus urgent : </b>
                {urgent.texte}
              </>
            ) : (
              <>
                <b>Conseil : </b>
                {conseil!.texte}
              </>
            )}
          </p>
          {conseil && (
            <BoutonLien href={conseil.href} variante="principal" petit>
              {conseil.libelle} →
            </BoutonLien>
          )}
        </div>
      )}
    </Carte>
  );
}
