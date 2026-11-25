"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pourcentageJauge } from "../../components/ui/calculs";
import { dateDeJeu, ventesParJour } from "../../lib/cadre";
import { creerClientNavigateur } from "../../lib/supabase/client";

// Barre du haut (design V2, docs/maquette) : ce qu'un joueur regarde sans
// arrêt. Aucun chiffre n'est inventé : trésorerie, ventes et marque sont lues
// en base, la date vient de l'horloge commune (/api/monde/horloge).

type Horloge = {
  readonly moisEnCours: number;
  readonly indexDansMois: number;
  readonly pasParMois: number;
  readonly finDuMoisMs: number;
};

type Etat = {
  readonly tresorerie: number;
  readonly etape: number;
  readonly caMoisHt: number | null;
  readonly notoriete: number | null;
  readonly desirabilite: number | null;
};

const RAFRAICHIR_MS = 30_000;

function dureeLisible(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")}`;
}

function eurosRonds(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function Vignette({
  libelle,
  children,
  jauge,
  ton = "accent",
}: {
  libelle: string;
  children: React.ReactNode;
  jauge?: number | null;
  ton?: "accent" | "or";
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-[5px]">
      <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted">
        {libelle}
      </span>
      <b className="text-[0.95rem] tabular-nums">{children}</b>
      {jauge !== undefined && (
        <span className="mt-[3px] block h-1 w-[88px] overflow-hidden rounded-sm bg-line">
          <i
            className={`block h-full ${ton === "or" ? "bg-thread" : "bg-accent"}`}
            style={{ width: `${jauge === null ? 0 : pourcentageJauge(jauge, 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

export function BarreJeu({
  companyId,
  nomEntreprise,
  tresorerieInitiale,
  etapeInitiale,
}: {
  companyId: string;
  nomEntreprise: string;
  tresorerieInitiale: number;
  etapeInitiale: number;
}) {
  const chemin = usePathname();
  const [etat, setEtat] = useState<Etat>({
    tresorerie: tresorerieInitiale,
    etape: etapeInitiale,
    caMoisHt: null,
    notoriete: null,
    desirabilite: null,
  });
  const [horloge, setHorloge] = useState<Horloge | null>(null);
  const [decalageMs, setDecalageMs] = useState(0);
  const [maintenant, setMaintenant] = useState<number | null>(null);

  // Horloge commune : relue chaque minute, l'affichage avance entre deux lectures.
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

  const mois = horloge?.moisEnCours ?? null;

  // Après une action, l'écran appelle router.refresh() : le serveur renvoie la nouvelle
  // trésorerie. On la reprend aussitôt, et l'effet suivant relit la marque et les ventes.
  useEffect(() => {
    setEtat((e) => ({ ...e, tresorerie: tresorerieInitiale, etape: etapeInitiale }));
  }, [tresorerieInitiale, etapeInitiale]);

  // Trésorerie, étape, ventes du mois, marque : relues à chaque écran et régulièrement.
  useEffect(() => {
    let actif = true;
    const supabase = creerClientNavigateur();
    const lire = async () => {
      const [societe, marque, ventes] = await Promise.all([
        supabase.from("companies").select("tresorerie_centimes, etape").eq("id", companyId).maybeSingle(),
        supabase.from("brand_state").select("notoriete, desirabilite").eq("company_id", companyId).maybeSingle(),
        mois === null
          ? Promise.resolve({ data: null })
          : supabase
              .from("ledger_entries")
              .select("sens, montant_centimes")
              .eq("company_id", companyId)
              .eq("compte", "707")
              .eq("mois_jeu", mois),
      ]);
      if (!actif) return;
      const lignes = (ventes.data ?? null) as Array<{ sens: string; montant_centimes: number }> | null;
      setEtat((e) => ({
        tresorerie: societe.data?.tresorerie_centimes ?? e.tresorerie,
        etape: societe.data?.etape ?? e.etape,
        caMoisHt:
          lignes === null
            ? e.caMoisHt
            : lignes.reduce((s, l) => s + (l.sens === "credit" ? l.montant_centimes : -l.montant_centimes), 0),
        notoriete: marque.data?.notoriete ?? e.notoriete,
        desirabilite: marque.data?.desirabilite ?? e.desirabilite,
      }));
    };
    void lire();
    const t = setInterval(lire, RAFRAICHIR_MS);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [companyId, chemin, mois, tresorerieInitiale]);

  useEffect(() => {
    setMaintenant(Date.now());
    const t = setInterval(() => setMaintenant(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const date = horloge ? dateDeJeu(horloge.moisEnCours, horloge.indexDansMois, horloge.pasParMois) : null;
  const parJour =
    horloge && etat.caMoisHt !== null
      ? ventesParJour(etat.caMoisHt, horloge.indexDansMois, horloge.pasParMois)
      : null;
  const reste = horloge && maintenant !== null ? horloge.finDuMoisMs - (maintenant + decalageMs) : null;

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line bg-bg py-3 max-[900px]:static">
      <Link href="/jeu" className="mr-auto flex items-center gap-2.5">
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
          <path d="M16 3 28 9.5v13L16 29 4 22.5v-13z" fill="var(--accent)" />
          <path d="M16 3 28 9.5 16 16 4 9.5z" fill="var(--accent)" opacity=".55" />
          <path d="M16 16 28 9.5v13L16 29z" fill="var(--thread)" />
        </svg>
        <span>
          <b className="block font-display text-[1.3rem] font-extrabold leading-none tracking-[-0.02em]">
            Kapital
          </b>
          <small className="text-[0.78rem] text-muted">
            {nomEntreprise} · étape {etat.etape}
          </small>
        </span>
      </Link>

      <div className="flex flex-wrap gap-2">
        <Vignette libelle="Date de jeu">{date ?? "…"}</Vignette>
        <Vignette libelle="Trésorerie">
          <span className={etat.tresorerie < 0 ? "text-bad" : ""}>{eurosRonds(etat.tresorerie)} €</span>
        </Vignette>
        <Vignette libelle="Ventes / jour">{parJour === null ? "…" : `${eurosRonds(parJour)} € HT`}</Vignette>
        <Vignette libelle="Notoriété" jauge={etat.notoriete}>
          {etat.notoriete === null ? "…" : Math.round(etat.notoriete)}
        </Vignette>
        <Vignette libelle="Désirabilité" jauge={etat.desirabilite} ton="or">
          {etat.desirabilite === null ? "…" : Math.round(etat.desirabilite)}
        </Vignette>
      </div>

      <div
        className="rounded-[9px] border border-accent bg-accent px-3.5 py-2 font-semibold text-on-accent"
        title="Salaires, loyers et échéances sont payés en fin de mois de jeu, pour tous les joueurs en même temps."
      >
        Fin du mois{" "}
        <small className="font-medium opacity-80">{reste === null ? "" : `dans ${dureeLisible(reste)}`}</small>
      </div>
    </header>
  );
}

