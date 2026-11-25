"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formaterEuros } from "../../lib/formatage";
import { creerClientNavigateur } from "../../lib/supabase/client";

// Bandeau de jeu, visible sur tous les écrans : ce qu'un joueur regarde sans
// arrêt (l'argent, le temps, l'étape). Il n'invente aucun chiffre : la
// trésorerie et l'étape sont lues en base, l'horloge vient de
// /api/monde/horloge (la même pour tous les joueurs).

type Horloge = {
  readonly moisEnCours: number;
  readonly indexDansMois: number;
  readonly pasParMois: number;
  readonly finDuMoisMs: number;
};

type Etat = { readonly tresorerie: number; readonly etape: number };

const RAFRAICHIR_MS = 30_000;

function dureeLisible(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function BarreJeu({
  companyId,
  tresorerieInitiale,
  etapeInitiale,
}: {
  companyId: string;
  tresorerieInitiale: number;
  etapeInitiale: number;
}) {
  const chemin = usePathname();
  const [etat, setEtat] = useState<Etat>({
    tresorerie: tresorerieInitiale,
    etape: etapeInitiale,
  });
  const [horloge, setHorloge] = useState<Horloge | null>(null);
  const [decalageMs, setDecalageMs] = useState(0);
  const [maintenant, setMaintenant] = useState<number | null>(null);

  // Trésorerie et étape : relues à chaque changement d'écran, puis régulièrement.
  useEffect(() => {
    let actif = true;
    const supabase = creerClientNavigateur();
    const lire = async () => {
      const { data } = await supabase
        .from("companies")
        .select("tresorerie_centimes, etape")
        .eq("id", companyId)
        .maybeSingle();
      if (actif && data) {
        setEtat({ tresorerie: data.tresorerie_centimes, etape: data.etape });
      }
    };
    void lire();
    const t = setInterval(lire, RAFRAICHIR_MS);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [companyId, chemin]);

  // Horloge commune : relue régulièrement, l'affichage avance entre deux lectures.
  useEffect(() => {
    let actif = true;
    const lire = async () => {
      try {
        const r = await fetch("/api/monde/horloge", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { maintenantMs?: number; horloge?: Horloge };
        if (!actif || !j.horloge) return;
        setHorloge(j.horloge);
        if (typeof j.maintenantMs === "number") setDecalageMs(j.maintenantMs - Date.now());
      } catch {
        // Réseau coupé : on garde le dernier affichage.
      }
    };
    void lire();
    const t = setInterval(lire, 60_000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    setMaintenant(Date.now());
    const t = setInterval(() => setMaintenant(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const negatif = etat.tresorerie < 0;
  const part =
    horloge && horloge.pasParMois > 0
      ? Math.min(1, Math.max(0, horloge.indexDansMois / horloge.pasParMois))
      : null;
  const reste =
    horloge && maintenant !== null ? horloge.finDuMoisMs - (maintenant + decalageMs) : null;

  return (
    <header className="flex shrink-0 items-stretch gap-6 border-b border-[color:var(--color-g-200)] bg-[color:var(--color-carte)] px-6 py-2.5">
      <div className="flex shrink-0 flex-col justify-center whitespace-nowrap">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-g-500)]">
          Trésorerie
        </span>
        <span
          className={`chiffre text-lg font-semibold leading-tight ${
            negatif ? "text-[color:var(--color-erreur)]" : "text-[color:var(--color-noir)]"
          }`}
        >
          {formaterEuros(etat.tresorerie)} €
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-g-500)]">
            {horloge ? `Mois ${horloge.moisEnCours} de jeu` : "Horloge du monde"}
          </span>
          <span className="truncate text-xs text-[color:var(--color-g-700)]">
            {reste !== null
              ? `Fin du mois (salaires, loyers) dans ${dureeLisible(reste)}`
              : "…"}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--color-g-200)]"
          role="progressbar"
          aria-label="Avancement du mois de jeu"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={part === null ? 0 : Math.round(part * 100)}
        >
          <div
            className="h-full rounded-full bg-[color:var(--color-accent)] transition-[width] duration-700"
            style={{ width: `${part === null ? 0 : part * 100}%` }}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-g-500)]">
          Étape
        </span>
        <span className="chiffre text-lg font-semibold leading-tight">{etat.etape}</span>
      </div>
    </header>
  );
}
