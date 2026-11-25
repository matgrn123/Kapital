// Composants d'interface du design V2 (modèle : docs/maquette/kapital-maquette-v2.html).
// Ils affichent ce qu'on leur donne et ne calculent aucun chiffre métier.
// Montants en centimes, formatés ici.

import Link from "next/link";
import { chargerFilRougeLV, type EcranFilRouge } from "@kapital/content";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { compteParNumero } from "../../lib/comptes";
import { formaterEuros } from "../../lib/formatage";
import {
  echelleGraphique,
  equilibreEcriture,
  pourcentageJauge,
  type LigneEcriture,
} from "./calculs";

function classes(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

export function SurTitre({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={classes(
        "text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Carte */

export function Carte({
  titre,
  surTitre,
  action,
  children,
  className,
}: {
  titre?: ReactNode;
  surTitre?: ReactNode;
  /** Lien ou bouton affiché à droite du titre. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={classes(
        "min-w-0 rounded-[14px] border border-line bg-surface p-[18px]",
        className,
      )}
    >
      {(titre || surTitre || action) && (
        <header className="mb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {surTitre && <SurTitre className="block">{surTitre}</SurTitre>}
            {titre && <h3 className="text-base font-bold">{titre}</h3>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ Kpi */

export function Kpi({
  libelle,
  valeur,
  detail,
  ton = "neutre",
}: {
  libelle: ReactNode;
  valeur: ReactNode;
  detail?: ReactNode;
  ton?: "neutre" | "bon" | "critique";
}) {
  return (
    <Carte>
      <div className="flex flex-col gap-1">
        <SurTitre>{libelle}</SurTitre>
        <span
          className={classes(
            "font-display text-[1.7rem] font-extrabold leading-[1.1] tabular-nums",
            ton === "bon" && "text-good",
            ton === "critique" && "text-bad",
          )}
        >
          {valeur}
        </span>
        {detail && <span className="text-[0.8rem] text-muted">{detail}</span>}
      </div>
    </Carte>
  );
}

/* ---------------------------------------------------------------- Jauge */

const TON_JAUGE = {
  accent: "bg-accent",
  or: "bg-thread",
  bon: "bg-good",
  critique: "bg-bad",
} as const;

export function Jauge({
  libelle,
  valeur,
  max,
  texte,
  ton = "accent",
  compacte = false,
}: {
  libelle: ReactNode;
  valeur: number;
  max: number;
  /** Texte de la valeur ; par défaut « valeur / max ». */
  texte?: ReactNode;
  ton?: keyof typeof TON_JAUGE;
  compacte?: boolean;
}) {
  const part = pourcentageJauge(valeur, max);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2 text-[0.82rem]">
        <span>{libelle}</span>
        <b className="tabular-nums">{texte ?? `${valeur} / ${max}`}</b>
      </div>
      <div
        className={classes(
          "overflow-hidden rounded border border-line bg-surface-2",
          compacte ? "h-1" : "h-2",
        )}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={valeur}
      >
        <i
          className={classes("block h-full rounded-[3px] transition-[width] duration-500", TON_JAUGE[ton])}
          style={{ width: `${part}%` }}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Puce */

const TON_PUCE = {
  neutre: "border-line bg-surface text-ink",
  bon: "border-transparent bg-good-soft text-good",
  alerte: "border-transparent bg-thread-soft text-thread",
  critique: "border-transparent bg-bad-soft text-bad",
  accent: "border-transparent bg-accent-soft text-accent",
} as const;

export function Puce({
  ton = "neutre",
  children,
}: {
  ton?: keyof typeof TON_PUCE;
  children: ReactNode;
}) {
  return (
    <span
      className={classes(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem] font-semibold",
        TON_PUCE[ton],
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Bouton */

const VARIANTE_BOUTON = {
  principal: "border-accent bg-accent text-on-accent hover:brightness-110",
  secondaire: "border-line bg-surface text-ink hover:border-accent",
  discret: "border-line bg-transparent text-ink hover:border-accent",
} as const;

function classeBouton(variante: keyof typeof VARIANTE_BOUTON, petit: boolean, className?: string) {
  return classes(
    "inline-flex items-center justify-center gap-2 rounded-[9px] border font-semibold transition",
    "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
    petit ? "px-2.5 py-1 text-[0.82rem]" : "px-3.5 py-2",
    VARIANTE_BOUTON[variante],
    className,
  );
}

type ProprietesBouton = {
  variante?: keyof typeof VARIANTE_BOUTON;
  petit?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Bouton({ variante = "secondaire", petit = false, className, type, ...reste }: ProprietesBouton) {
  return (
    <button type={type ?? "button"} className={classeBouton(variante, petit, className)} {...reste} />
  );
}

/** Même apparence qu'un bouton, pour aller vers un autre écran. */
export function BoutonLien({
  href,
  variante = "secondaire",
  petit = false,
  children,
  className,
}: {
  href: string;
  variante?: keyof typeof VARIANTE_BOUTON;
  petit?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={classeBouton(variante, petit, className)}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------- Encadrés pédagogiques */

export function EncadreNotion({ titre, children }: { titre: ReactNode; children: ReactNode }) {
  return (
    <aside className="flex flex-col gap-1 rounded-r-xl border-l-[3px] border-accent bg-accent-soft px-3.5 py-3">
      <SurTitre className="text-accent">Ce que tu apprends</SurTitre>
      <h4 className="text-[0.95rem] font-bold">{titre}</h4>
      <div className="text-[0.88rem]">{children}</div>
    </aside>
  );
}

/**
 * Fil rouge Louis Vuitton d'un écran : textes sourcés de
 * packages/content/fil-rouge-lv.json. N'affiche rien s'il n'y en a pas.
 */
export function FilRouge({ ecran }: { ecran: EcranFilRouge }) {
  const textes = chargerFilRougeLV().filter((t) => t.ecran === ecran);
  if (textes.length === 0) return null;
  return (
    <>
      {textes.map((t) => (
        <EncadreFilRouge key={t.texte}>
          <p>{t.texte}</p>
          <p className="mt-1 text-[0.72rem] text-muted">
            Source :{" "}
            {t.url ? (
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="underline">
                {t.source}
              </a>
            ) : (
              t.source
            )}
          </p>
        </EncadreFilRouge>
      ))}
    </>
  );
}

export function EncadreFilRouge({ children }: { children: ReactNode }) {
  return (
    <aside className="flex flex-col gap-1 rounded-xl border border-dashed border-thread bg-thread-soft px-3.5 py-3">
      <SurTitre className="text-thread">Fil rouge · Louis Vuitton</SurTitre>
      <div className="text-[0.86rem]">{children}</div>
    </aside>
  );
}

/* ---------------------------------------------------- Écriture comptable */

export type { LigneEcriture };

/**
 * Une écriture en partie double, comptes au débit puis au crédit (décalés).
 * Les lignes viennent du moteur ou du serveur, jamais d'un calcul d'écran.
 */
export function EcritureComptable({
  libelle,
  etiquette,
  lignes,
}: {
  libelle: ReactNode;
  /** Mention à droite du libellé, par exemple « aperçu » ou une date. */
  etiquette?: ReactNode;
  lignes: readonly LigneEcriture[];
}) {
  const { equilibree } = equilibreEcriture(lignes);
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface-2 font-mono text-[0.8rem]">
      <div className="flex justify-between gap-2 border-b border-line px-2.5 py-[7px] font-medium">
        <span>{libelle}</span>
        {etiquette && <span className="text-muted">{etiquette}</span>}
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[0.7rem] text-muted">
            <th className="px-2.5 py-1 text-left font-medium">Compte</th>
            <th className="px-2.5 py-1 text-right font-medium">Débit</th>
            <th className="px-2.5 py-1 text-right font-medium">Crédit</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={`${l.compte}-${i}`}>
              <td className={classes("px-2.5 py-1", l.credit ? "pl-7" : "")}>
                {l.compte} {compteParNumero(l.compte)?.libelle ?? ""}
              </td>
              <td className="w-[96px] whitespace-nowrap px-2.5 py-1 text-right tabular-nums">
                {l.debit ? formaterEuros(l.debit) : ""}
              </td>
              <td className="w-[96px] whitespace-nowrap px-2.5 py-1 text-right tabular-nums">
                {l.credit ? formaterEuros(l.credit) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!equilibree && (
        <p className="border-t border-line bg-bad-soft px-2.5 py-1 text-bad">
          Écriture déséquilibrée : débit et crédit diffèrent.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Graphique */

/** Graphique en barres (montants en centimes), la dernière barre mise en avant. */
export function Graphique({
  barres,
  titre,
}: {
  barres: ReadonlyArray<{ readonly libelle: string; readonly valeur: number }>;
  /** Description pour les lecteurs d'écran. */
  titre: string;
}) {
  const L = 520;
  const H = 210;
  const gauche = 52;
  const bas = 28;
  const haut = 16;
  const echelle = echelleGraphique(barres.map((b) => b.valeur));
  const y = (v: number) => haut + (H - haut - bas) * (1 - Math.max(0, v) / echelle.max);
  const pasX = barres.length > 0 ? (L - gauche - 4) / barres.length : 0;
  const largeur = Math.min(54, pasX * 0.6);
  const euros = (c: number) =>
    (c / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${L} ${H}`} width="100%" className="min-w-[320px]" role="img" aria-label={titre}>
        {echelle.graduations.map((v) => (
          <g key={v}>
            <line x1={gauche} x2={L - 4} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={gauche - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {euros(v)}
            </text>
          </g>
        ))}
        {barres.map((b, i) => {
          const cx = gauche + (i + 0.5) * pasX;
          const derniere = i === barres.length - 1;
          return (
            <g key={`${b.libelle}-${i}`}>
              <rect
                x={cx - largeur / 2}
                y={y(b.valeur)}
                width={largeur}
                height={Math.max(0, y(0) - y(b.valeur))}
                rx={3}
                className={classes("fill-accent", derniere ? "opacity-100" : "opacity-55")}
              />
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
                {b.libelle}
              </text>
              {b.valeur > 0 && (
                <text x={cx} y={y(b.valeur) - 5} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
                  {euros(b.valeur)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export {
  Alerte,
  Bandeau,
  BandeauEtape,
  CLASSE_SAISIE,
  Catalogue,
  Champ,
  Choix,
  Courbe,
  EnTete,
  Etapes,
  Faits,
  Ligne,
  Message,
  Note,
  Options,
  Refus,
  Resultat,
  Succes,
  Tableau,
  TableauRang,
  Verrou,
  Vide,
  Curseur,
} from "./formulaire";
