"use client";

import type { ZoneVue3D, StatutZone } from "../../../lib/vue3d";

const LABEL_STATUT: Record<StatutZone, string> = {
  ok: "OK",
  alerte: "Attention",
  rupture: "Critique",
  info: "En cours",
  inactif: "Inactif",
};

// Jetons du thème (suivent le clair / sombre)
const CLASSE_STATUT: Record<StatutZone, string> = {
  ok:      "bg-good-soft text-good",
  alerte:  "bg-thread-soft text-thread",
  rupture: "bg-bad-soft text-bad",
  info:    "bg-accent-soft text-accent",
  inactif: "bg-surface-2 text-muted",
};

// Panneau latéral, dans le style de la maquette : carte blanche, petit
// surtitre en capitales, titre, lignes libellé / valeur.
export function PanneauDetail({
  zone,
  onFermer,
}: {
  zone: ZoneVue3D;
  onFermer: () => void;
}) {
  return (
    <div
      className="absolute right-4 top-4 w-[300px] overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-lg"
      style={{ animation: "glisser-droite 0.2s ease" }}
    >
      <style>{`
        @keyframes glisser-droite {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="flex items-start justify-between px-4 pb-2 pt-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Ta société · vue d&apos;ensemble
          </div>
          <div className="mt-0.5 text-lg font-bold">{zone.libelle}</div>
        </div>
        <button
          onClick={onFermer}
          className="cursor-pointer px-1 text-lg leading-none text-muted hover:text-ink"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      <div className="px-4 pb-4">
        <p className="text-sm text-muted">{zone.detail}</p>
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3 text-sm">
          <span className="text-muted">Chiffre clé</span>
          <span className="font-semibold tabular-nums">{zone.chiffre}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted">État</span>
          <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + CLASSE_STATUT[zone.statut]}>
            {LABEL_STATUT[zone.statut]}
          </span>
        </div>
      </div>
    </div>
  );
}
