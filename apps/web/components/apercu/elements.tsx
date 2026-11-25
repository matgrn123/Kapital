// Petits éléments de formulaire du lot 4 (vente, production, achats, publicité).
// Affichage seulement : aucun calcul métier ici.

import type { ReactNode } from "react";
import { SurTitre } from "../ui";

function classes(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

export function EnTete({ surTitre, titre, children }: { surTitre: string; titre: string; children?: ReactNode }) {
  return (
    <header>
      <SurTitre>{surTitre}</SurTitre>
      <h1 className="text-[1.75rem] font-extrabold">{titre}</h1>
      {children && <p className="mt-1 max-w-[62ch] text-muted">{children}</p>}
    </header>
  );
}

export function Champ({
  libelle,
  aide,
  children,
}: {
  libelle: ReactNode;
  aide?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[0.82rem] font-semibold">{libelle}</span>
      {children}
      {aide && <span className="text-[0.76rem] text-muted">{aide}</span>}
    </label>
  );
}

export const CLASSE_SAISIE =
  "w-full rounded-[9px] border border-line bg-surface px-3 py-2 tabular-nums text-ink outline-none focus:border-accent";

/** Bouton de choix (« Quoi ? », « Où ? ») : une carte cliquable, mise en avant quand elle est choisie. */
export function Choix({
  actif,
  onClick,
  titre,
  children,
  desactive,
}: {
  actif: boolean;
  onClick: () => void;
  titre: ReactNode;
  children?: ReactNode;
  desactive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      aria-pressed={actif}
      className={classes(
        "flex min-w-0 flex-col items-start gap-0.5 rounded-[10px] border px-3.5 py-3 text-left transition",
        "disabled:cursor-not-allowed disabled:opacity-45",
        actif ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent",
      )}
    >
      <b className="text-[0.92rem]">{titre}</b>
      {children && <span className="text-[0.8rem] text-muted">{children}</span>}
    </button>
  );
}

/** Une ligne « libellé … valeur » des simulations. */
export function Ligne({
  libelle,
  children,
  ton,
}: {
  libelle: ReactNode;
  children: ReactNode;
  ton?: "bon" | "critique";
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-line py-1.5 text-[0.86rem]">
      <span>{libelle}</span>
      <b className={classes("whitespace-nowrap text-right tabular-nums", ton === "bon" && "text-good", ton === "critique" && "text-bad")}>
        {children}
      </b>
    </div>
  );
}

export function Refus({ children, details }: { children: ReactNode; details?: readonly string[] }) {
  return (
    <div role="alert" className="rounded-[9px] bg-bad-soft px-3 py-2 text-[0.86rem] text-bad">
      <p>{children}</p>
      {details && details.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-[0.8rem]">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Succes({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-[9px] bg-good-soft px-3 py-2 text-[0.86rem] text-good">
      {children}
    </p>
  );
}

/** Explication placée au-dessus d'une écriture : quand elle est passée. */
export function NoteEcriture({ children }: { children: ReactNode }) {
  return <p className="text-[0.8rem] text-muted">{children}</p>;
}

/** État vide : ce qu'il faut faire ensuite. */
export function Vide({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line px-4 py-5 text-center text-[0.88rem] text-muted">
      {children}
    </div>
  );
}

/** Tableau simple aux couleurs du thème. */
export function Tableau({ entetes, children }: { entetes: readonly { texte: string; droite?: boolean }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full border-collapse text-[0.86rem]">
        <thead className="bg-surface-2 text-[0.72rem] uppercase tracking-[0.06em] text-muted">
          <tr>
            {entetes.map((e) => (
              <th key={e.texte} className={classes("px-3 py-2 font-semibold", e.droite ? "text-right" : "text-left")}>
                {e.texte}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-3 [&_td]:py-2">{children}</tbody>
      </table>
    </div>
  );
}
