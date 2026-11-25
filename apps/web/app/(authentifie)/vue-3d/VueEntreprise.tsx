"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ZoneVue3D, IdZone } from "../../../lib/vue3d";
import { PanneauDetail } from "./PanneauDetail";

const Scene3D = dynamic(
  () => import("./Scene3D").then((m) => m.Scene3D),
  { ssr: false, loading: () => <ChargementScene /> },
);

function ChargementScene() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        fontFamily: "system-ui, sans-serif",
        color: "var(--muted)",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          border: "3px solid #e5e7eb",
          borderTopColor: "#111827",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: "13px" }}>Construction de l'atelier…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function VueEntreprise({ zones }: { zones: ZoneVue3D[] }) {
  const [zoneSelectionnee, setZoneSelectionnee] = useState<IdZone | null>(null);

  const zoneDetail = zoneSelectionnee
    ? zones.find((z) => z.id === zoneSelectionnee) ?? null
    : null;

  return (
    <div className="scene-ciel relative w-full h-full">
      {/* Ciel de la maquette (--sky-top / --sky-bot), clair ou sombre selon le thème */}
      <style>{`
        .scene-ciel { --sky-top:#BCD8EA; --sky-bot:#E4EEF2; --scene-dim:1;
          background: radial-gradient(120% 80% at 30% 0%, var(--sky-bot), var(--sky-top)); }
        .scene-ciel canvas { filter: brightness(var(--scene-dim)); }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .scene-ciel { --sky-top:#22364C; --sky-bot:#3A4D60; --scene-dim:.86; }
        }
        :root[data-theme="dark"] .scene-ciel { --sky-top:#22364C; --sky-bot:#3A4D60; --scene-dim:.86; }
      `}</style>
      <Scene3D
        zones={zones}
        zoneSelectionnee={zoneSelectionnee}
        onSelectZone={setZoneSelectionnee}
      />

      {zoneDetail && (
        <PanneauDetail
          zone={zoneDetail}
          onFermer={() => setZoneSelectionnee(null)}
        />
      )}

      {/* Aide contextuelle */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.5)",
          color: "white",
          borderRadius: "20px",
          padding: "5px 14px",
          fontSize: "11px",
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        Glisser pour tourner · Molette pour zoomer · Cliquer un bâtiment
      </div>
    </div>
  );
}
