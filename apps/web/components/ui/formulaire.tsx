// Composants d'écran et de formulaire du design V2, calqués sur les classes de
// la maquette (docs/maquette/kapital-maquette-v2.html) : .head, .opt/.opts,
// .kv, .out, .facts, .steps, .alert, .lock, .cat, .engine, .err/.ok,
// table.rank, spark, input[type=range].
// Affichage seulement : aucun chiffre métier n'est calculé ici.

"use client";

import type { ReactNode } from "react";
import { phraseCondition } from "../../app/(authentifie)/_partage/reponses";
import type { VerrouAffiche } from "../../app/(authentifie)/_partage/verrou";
import { pointsCourbe } from "./calculs";

function classes(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

const SUR_TITRE = "text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted";

/* ------------------------------------------------------------- En-tête */

/** En-tête d'écran (.head) : surtitre, titre, accroche, et une action à droite. */
export function EnTete({
  surTitre,
  titre,
  children,
  action,
}: {
  surTitre: ReactNode;
  titre: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <span className={SUR_TITRE}>{surTitre}</span>
        <h1 className="text-[1.75rem] font-extrabold max-[520px]:text-[1.45rem]">{titre}</h1>
        {children && <p className="mt-1 max-w-[62ch] text-muted">{children}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

/* -------------------------------------------------------------- Saisie */

export const CLASSE_SAISIE =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-2 tabular-nums text-ink outline-none focus:border-accent";

/** Champ étiqueté (label.f de la maquette). */
export function Champ({ libelle, aide, children }: { libelle: ReactNode; aide?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-[5px] text-[0.84rem] font-semibold">
      <span>{libelle}</span>
      {children}
      {aide && <span className="text-[0.76rem] font-normal text-muted">{aide}</span>}
    </label>
  );
}

/** Curseur (input range) avec sa valeur affichée en direct. */
export function Curseur({
  libelle,
  valeur,
  min,
  max,
  pas = 1,
  onChange,
  affichage,
  aide,
}: {
  libelle: ReactNode;
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  onChange: (v: number) => void;
  /** Texte de la valeur ; par défaut le nombre lui-même. */
  affichage?: ReactNode;
  aide?: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-[5px] text-[0.84rem] font-semibold">
      <span className="flex items-baseline justify-between gap-2">
        <span>{libelle}</span>
        <b className="font-display text-[1.05rem] font-extrabold tabular-nums">{affichage ?? valeur}</b>
      </span>
      <input
        type="range"
        className="w-full accent-[var(--accent)]"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {aide && <span className="text-[0.76rem] font-normal text-muted">{aide}</span>}
    </label>
  );
}

/* --------------------------------------------------------------- Choix */

/** Une tuile de choix (.opt) : titre en police d'affichage, détail, prix. */
export function Choix({
  actif,
  onClick,
  titre,
  children,
  prix,
  desactive,
}: {
  actif: boolean;
  onClick: () => void;
  titre: ReactNode;
  children?: ReactNode;
  /** Ligne mise en avant (prix, effet), sous le détail. */
  prix?: ReactNode;
  desactive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      aria-pressed={actif}
      className={classes(
        "flex min-w-0 flex-col items-start gap-1 rounded-xl border-[1.5px] px-3.5 py-3 text-left transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        actif ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent",
      )}
    >
      <b className="font-display text-base font-bold">{titre}</b>
      {children && <span className="text-[0.8rem] text-muted">{children}</span>}
      {prix && <span className="text-[0.8rem] font-semibold tabular-nums text-ink">{prix}</span>}
    </button>
  );
}

/** Groupe de tuiles (.opts) : autant de colonnes que la place le permet. */
export function Options<T extends string>({
  valeur,
  options,
  onChange,
  libelle,
}: {
  valeur: T;
  options: ReadonlyArray<{ id: T; titre: ReactNode; detail?: ReactNode; prix?: ReactNode; desactive?: boolean }>;
  onChange: (v: T) => void;
  libelle: string;
}) {
  return (
    <div role="group" aria-label={libelle} className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
      {options.map((o) => (
        <Choix
          key={o.id}
          actif={o.id === valeur}
          onClick={() => onChange(o.id)}
          titre={o.titre}
          prix={o.prix}
          desactive={o.desactive}
        >
          {o.detail}
        </Choix>
      ))}
    </div>
  );
}

/* ----------------------------------------------------- Lignes et chiffres */

/** Ligne libellé … valeur (.kv). */
export function Ligne({
  libelle,
  children,
  ton,
  fort = false,
}: {
  libelle: ReactNode;
  children: ReactNode;
  ton?: "bon" | "critique";
  fort?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-dashed border-line py-1.5 text-[0.88rem] last:border-b-0">
      <span className={fort ? "font-bold" : ""}>{libelle}</span>
      <b className={classes("text-right tabular-nums", ton === "bon" && "text-good", ton === "critique" && "text-bad")}>
        {children}
      </b>
    </div>
  );
}

/** Grand chiffre de résultat d'une simulation (.out). */
export function Resultat({ libelle, valeur, detail }: { libelle: ReactNode; valeur: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={SUR_TITRE}>{libelle}</span>
      <span className="font-display text-[1.6rem] font-extrabold leading-[1.1] tabular-nums">{valeur}</span>
      {detail && <span className="text-[0.78rem] text-muted">{detail}</span>}
    </div>
  );
}

/** Fiche de faits (.facts) : libellés à gauche, valeurs en gras à droite. */
export function Faits({ lignes }: { lignes: ReadonlyArray<readonly [ReactNode, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[0.86rem]">
      {lignes.map(([a, b], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{a}</dt>
          <dd className="m-0 text-right font-semibold tabular-nums">{b}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Étapes numérotées (.steps). */
export function Etapes({ etapes }: { etapes: readonly ReactNode[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {etapes.map((e, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[0.86rem]">
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-[0.75rem] font-bold text-accent">
            {i + 1}
          </span>
          <span>{e}</span>
        </li>
      ))}
    </ol>
  );
}

/** Une alerte (.alert) : pastille colorée et texte. */
export function Alerte({ ton = "neutre", children }: { ton?: "neutre" | "bon" | "alerte" | "critique"; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[9px] bg-surface-2 px-2.5 py-2 text-[0.86rem]">
      <i
        className={classes(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          ton === "bon" && "bg-good",
          ton === "alerte" && "bg-thread",
          ton === "critique" && "bg-bad",
          ton === "neutre" && "bg-muted",
        )}
      />
      <span>{children}</span>
    </div>
  );
}

/* --------------------------------------------------------- Messages */

export function Message({ ton, children }: { ton: "erreur" | "succes" | "info"; children: ReactNode }) {
  const c = ton === "erreur" ? "bg-bad-soft text-bad" : ton === "succes" ? "bg-good-soft text-good" : "bg-thread-soft text-thread";
  return (
    <div role={ton === "erreur" ? "alert" : "status"} className={`rounded-[9px] px-3 py-2 text-[0.84rem] font-medium ${c}`}>
      {children}
    </div>
  );
}

export function Refus({ children, details }: { children: ReactNode; details?: readonly string[] }) {
  return (
    <Message ton="erreur">
      <p>{children}</p>
      {details && details.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-[0.8rem]">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </Message>
  );
}

export function Succes({ children }: { children: ReactNode }) {
  return <Message ton="succes">{children}</Message>;
}

/** Note sur ce que fait le moteur ou le serveur (.engine). */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[0.76rem] text-muted">
      <span aria-hidden="true" className="text-[0.85rem] leading-[1.2]">
        ⚙
      </span>
      <span>{children}</span>
    </p>
  );
}

/** État vide : ce qu'il faut faire ensuite. */
export function Vide({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line px-4 py-5 text-center text-[0.88rem] text-muted">
      {children}
    </div>
  );
}

/** Bandeau « verrouillé » (.lock) : fond ocre plein. */
export function Verrou({ children, icone = "🔒" }: { children: ReactNode; icone?: ReactNode }) {
  return (
    <div role="note" className="flex items-center gap-3 rounded-xl bg-thread-soft px-3.5 py-3 text-[0.88rem] font-medium text-thread">
      <span aria-hidden="true">{icone}</span>
      <div>{children}</div>
    </div>
  );
}

/** Action pas encore débloquée à l'étape du joueur, avec les conditions manquantes. */
export function BandeauEtape({ verrou, action }: { verrou: VerrouAffiche; action: string }) {
  return (
    <Verrou>
      <p className="font-semibold">
        {action} se débloque à l&apos;étape {verrou.etapeRequise} (tu es à l&apos;étape {verrou.etapeActuelle}).
      </p>
      {verrou.conditions.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 font-normal">
          {verrou.conditions.map((c) => {
            const p = phraseCondition(c);
            return <li key={c.cle}>{p.charAt(0).toUpperCase() + p.slice(1)}</li>;
          })}
        </ul>
      )}
    </Verrou>
  );
}

/** Bandeau d'information pleine largeur (.banner). */
export function Bandeau({ children, droite }: { children: ReactNode; droite?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.86rem]">
      <span>{children}</span>
      {droite && <span className="text-muted">{droite}</span>}
    </div>
  );
}

/* ----------------------------------------------------------- Catalogue */

/** Catalogue de boutons avec prix (.cat), par exemple « Acheter et placer ». */
export function Catalogue<T extends string>({
  articles,
  choisi,
  onChoisir,
}: {
  articles: ReadonlyArray<{ id: T; nom: ReactNode; prix: ReactNode; effet: ReactNode; desactive?: boolean }>;
  choisi?: T | null;
  onChoisir: (id: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {articles.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={a.desactive}
          aria-pressed={choisi === a.id}
          onClick={() => onChoisir(a.id)}
          className={classes(
            "grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 rounded-[10px] border px-[11px] py-[9px] text-left transition",
            "disabled:cursor-not-allowed disabled:opacity-50",
            choisi === a.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent",
          )}
        >
          <b className="text-[0.88rem]">{a.nom}</b>
          <em className="text-[0.85rem] font-semibold not-italic tabular-nums">{a.prix}</em>
          <span className="col-span-2 text-[0.76rem] text-muted">{a.effet}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Tableaux */

/** Tableau simple aux couleurs du thème. */
export function Tableau({
  entetes,
  children,
}: {
  entetes: readonly { texte: string; droite?: boolean }[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.88rem]">
        <thead>
          <tr>
            {entetes.map((e) => (
              <th
                key={e.texte}
                className={classes(
                  "border-b border-line px-2.5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted",
                  e.droite ? "text-right" : "text-left",
                )}
              >
                {e.texte}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums [&_td]:border-b [&_td]:border-line [&_td]:px-2.5 [&_td]:py-[9px]">{children}</tbody>
      </table>
    </div>
  );
}

/** Classement (table.rank) : la ligne du joueur est surlignée. */
export function TableauRang({
  entetes,
  lignes,
}: {
  entetes: readonly { texte: string; droite?: boolean }[];
  lignes: ReadonlyArray<{ cle: string; moi?: boolean; cellules: readonly ReactNode[] }>;
}) {
  return (
    <Tableau entetes={entetes}>
      {lignes.map((l) => (
        <tr key={l.cle} className={l.moi ? "bg-accent-soft font-semibold [&_td]:bg-accent-soft" : ""}>
          {l.cellules.map((c, i) => (
            <td key={i} className={entetes[i]?.droite ? "text-right" : ""}>
              {c}
            </td>
          ))}
        </tr>
      ))}
    </Tableau>
  );
}

/* --------------------------------------------------------------- Courbe */

/** Petite courbe (spark) d'une série de valeurs, par exemple la trésorerie mois par mois. */
export function Courbe({ valeurs, titre, hauteur = 46 }: { valeurs: readonly number[]; titre: string; hauteur?: number }) {
  const L = 220;
  const p = pointsCourbe(valeurs, L, hauteur);
  if (p.length === 0) return null;
  const d = "M" + p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
  const dernier = p[p.length - 1]!;
  return (
    <svg viewBox={`0 0 ${L} ${hauteur}`} width="100%" height={hauteur} preserveAspectRatio="none" role="img" aria-label={titre}>
      <path d={`${d} L${dernier[0]} ${hauteur} L${p[0]![0]} ${hauteur}Z`} className="fill-accent opacity-[0.12]" />
      <path d={d} className="fill-none stroke-accent" strokeWidth={2} />
      <circle cx={dernier[0]} cy={dernier[1]} r={3} className="fill-accent" />
    </svg>
  );
}
