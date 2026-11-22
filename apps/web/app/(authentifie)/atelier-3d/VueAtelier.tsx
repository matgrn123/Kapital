"use client";

import dynamic from "next/dynamic";
import type { ModulePose, InfoModule } from "./SceneAtelierInterieur";

const SceneAtelierInterieur = dynamic(
  () => import("./SceneAtelierInterieur").then((m) => m.SceneAtelierInterieur),
  {
    ssr: false,
    loading: () => <Chargement />,
  },
);

function Chargement() {
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
        background: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
        color: "#6b7280",
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
      <span style={{ fontSize: "13px" }}>Chargement de l'atelier…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

type Props = {
  largeur: number;
  hauteur: number;
  entree_x: number;
  entree_y: number;
  modules: ModulePose[];
  catalogue: InfoModule[];
};

export function VueAtelier(props: Props) {
  return (
    <div className="relative w-full h-full">
      <SceneAtelierInterieur {...props} />

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
        Glisser pour tourner · Molette pour zoomer · Survoler un module
      </div>
    </div>
  );
}
