"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Marque = { notoriete: number; desirabilite: number };

const ACTIONS = [
  { type: "publicite" as const, libelle: "Publicité", desc: "Monte la notoriété. Sans effet sur la désirabilité." },
  { type: "image_marque" as const, libelle: "Image de marque", desc: "Monte la désirabilité. Sans effet sur la notoriété." },
  { type: "promotion" as const, libelle: "Promotion", desc: "Monte la notoriété mais abîme la désirabilité." },
  { type: "relations_presse" as const, libelle: "Relations presse", desc: "Monte les deux jauges modérément." },
];

const K: Record<string, { n: number; d: number }> = {
  publicite: { n: 2.0, d: 0 },
  image_marque: { n: 0, d: 2.0 },
  promotion: { n: 1.0, d: -1.5 },
  relations_presse: { n: 1.5, d: 1.5 },
};

function clamp(x: number): number {
  return Math.max(0, Math.min(100, x));
}

export function ActionsMarketing({
  tresorerie,
  marque,
}: {
  tresorerie: number;
  marque: Marque;
}) {
  const router = useRouter();
  const [actionActive, setActionActive] = useState<string | null>(null);
  const [montant, setMontant] = useState("500");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const montantCentimes = Math.round(parseFloat(montant) * 100);
  const montantEuros = parseFloat(montant);
  const simuler = (type: string) => {
    if (!Number.isFinite(montantEuros) || montantEuros <= 0) return null;
    const k = K[type]!;
    const m = Math.log(1 + montantEuros);
    return {
      noto: clamp(marque.notoriete + k.n * m),
      desi: clamp(marque.desirabilite + k.d * m),
    };
  };

  async function lancer(type: string) {
    setErreur(null);
    if (!Number.isFinite(montantCentimes) || montantCentimes <= 0) {
      setErreur("Montant invalide.");
      return;
    }
    if (montantCentimes > tresorerie) {
      setErreur(`Trésorerie insuffisante (manque ${((montantCentimes - tresorerie) / 100).toFixed(2)} €).`);
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/actions/action-marketing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, montantCentimes }),
      });
      const data = (await reponse.json()) as { error?: string };
      if (data.error) {
        setErreur(data.error);
        return;
      }
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-[color:var(--color-g-200)] p-5">
      <div className="space-y-1.5">
        <span className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Montant (€)
        </span>
        <input
          type="text"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          className="chiffre w-32 rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => {
          const sim = simuler(a.type);
          const actif = actionActive === a.type;
          return (
            <div
              key={a.type}
              onMouseEnter={() => setActionActive(a.type)}
              onMouseLeave={() => setActionActive(null)}
              className={`rounded-md border p-4 transition ${
                actif ? "border-[color:var(--color-noir)]" : "border-[color:var(--color-g-200)]"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{a.libelle}</h3>
                  <p className="mt-1 text-xs text-[color:var(--color-g-500)]">{a.desc}</p>
                </div>
                <button
                  onClick={() => lancer(a.type)}
                  disabled={enCours}
                  className="shrink-0 rounded-md bg-[color:var(--color-noir)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-blanc)] hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
                >
                  Lancer
                </button>
              </div>
              {sim && (
                <p className="chiffre mt-3 text-xs text-[color:var(--color-g-700)]">
                  Après : noto <span className="font-medium">{sim.noto.toFixed(1)}</span>,
                  désir <span className="font-medium">{sim.desi.toFixed(1)}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}
    </div>
  );
}
