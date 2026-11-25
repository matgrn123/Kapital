// Petits éléments communs aux écrans Banque, Locaux et Salariés (design V2, lot 4).
// Affichage seulement : aucun chiffre calculé ici.

import type { ReactNode } from "react";
import { phraseCondition } from "../../app/(authentifie)/_partage/reponses";
import type { VerrouAffiche } from "../../app/(authentifie)/_partage/verrou";

export const classeChamp =
  "w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-[0.95rem] tabular-nums text-ink outline-none focus:border-accent";
export const classeEtiquette = "block text-[0.82rem] font-semibold";

/** En-tête d'écran : surtitre, titre, phrase d'accroche. */
export function EnTeteEcran({ surTitre, titre, children }: { surTitre: string; titre: string; children?: ReactNode }) {
  return (
    <header>
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">{surTitre}</span>
      <h1 className="text-[1.75rem] font-extrabold">{titre}</h1>
      {children && <p className="mt-1 max-w-[62ch] text-muted">{children}</p>}
    </header>
  );
}

/** Ligne libellé / valeur, séparée par un pointillé (« kv » de la maquette). */
export function LigneValeur({ libelle, children, fort = false }: { libelle: ReactNode; children: ReactNode; fort?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-1.5 text-[0.9rem] last:border-b-0">
      <span className={fort ? "font-bold" : "text-muted"}>{libelle}</span>
      <b className="text-right tabular-nums">{children}</b>
    </div>
  );
}

/** Grand chiffre de résultat d'une simulation. */
export function Resultat({ libelle, valeur, detail }: { libelle: ReactNode; valeur: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">{libelle}</span>
      <span className="font-display text-[1.45rem] font-extrabold leading-tight tabular-nums">{valeur}</span>
      {detail && <span className="text-[0.78rem] text-muted">{detail}</span>}
    </div>
  );
}

export function Message({ ton, children }: { ton: "erreur" | "succes" | "info"; children: ReactNode }) {
  const c = ton === "erreur" ? "bg-bad-soft text-bad" : ton === "succes" ? "bg-good-soft text-good" : "bg-thread-soft text-thread";
  return (
    <p role={ton === "erreur" ? "alert" : "status"} className={`rounded-[9px] px-3 py-2 text-[0.88rem] ${c}`}>
      {children}
    </p>
  );
}

/** Note sur ce que fait le serveur (la « note moteur » de la maquette). */
export function NoteMoteur({ children }: { children: ReactNode }) {
  return <p className="text-[0.8rem] text-muted">{children}</p>;
}

/** Bandeau « pas encore débloqué », dans les couleurs du design V2. */
export function BandeauEtape({ verrou, action }: { verrou: VerrouAffiche; action: string }) {
  return (
    <div role="note" className="rounded-xl border border-dashed border-thread bg-thread-soft px-4 py-3 text-[0.9rem]">
      <p className="font-semibold text-thread">
        {action} se débloque à l&apos;étape {verrou.etapeRequise} (tu es à l&apos;étape {verrou.etapeActuelle}).
      </p>
      {verrou.conditions.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          {verrou.conditions.map((c) => {
            const p = phraseCondition(c);
            return <li key={c.cle}>{p.charAt(0).toUpperCase() + p.slice(1)}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

/** Choix parmi quelques options (boutons « opt » de la maquette). */
export function Options<T extends string>({
  valeur,
  options,
  onChange,
  libelle,
}: {
  valeur: T;
  options: ReadonlyArray<{ id: T; titre: ReactNode; detail?: ReactNode }>;
  onChange: (v: T) => void;
  libelle: string;
}) {
  return (
    <div role="group" aria-label={libelle} className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={actif}
            onClick={() => onChange(o.id)}
            className={`flex flex-col gap-0.5 rounded-[10px] border px-3 py-2 text-left text-[0.86rem] transition ${
              actif ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent"
            }`}
          >
            <b>{o.titre}</b>
            {o.detail && <span className="text-[0.8rem] text-muted">{o.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}
