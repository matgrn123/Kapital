"use client";

import type { ZoneVue3D, StatutZone } from "../../../lib/vue3d";

const LABEL_STATUT: Record<StatutZone, string> = {
  ok: "OK",
  alerte: "Attention",
  rupture: "Critique",
  info: "En cours",
  inactif: "Inactif",
};

const COULEUR_STATUT: Record<StatutZone, { bg: string; text: string; border: string }> = {
  ok:      { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  alerte:  { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  rupture: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
  info:    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  inactif: { bg: "#f9fafb", text: "#6b7280", border: "#e5e7eb" },
};

const ICONE_ZONE: Record<string, string> = {
  tresorerie: "💰",
  atelier: "🏭",
  production: "⚙️",
  stock_finis: "📦",
  approvisionnement: "🚚",
  equipe: "👥",
  marque: "✨",
};

export function PanneauDetail({
  zone,
  onFermer,
}: {
  zone: ZoneVue3D;
  onFermer: () => void;
}) {
  const couleurs = COULEUR_STATUT[zone.statut];

  return (
    <div
      style={{
        position: "absolute",
        top: "1rem",
        right: "1rem",
        width: "280px",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        borderRadius: "16px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.06)",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
        animation: "glisser-droite 0.2s ease",
      }}
    >
      <style>{`
        @keyframes glisser-droite {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* En-tête */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "16px 16px 12px",
          borderBottom: "1px solid #f3f4f6",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "22px" }}>{ICONE_ZONE[zone.id] ?? "🏢"}</span>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>
              {zone.libelle}
            </div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "1px" }}>
              Vue d'ensemble
            </div>
          </div>
        </div>
        <button
          onClick={onFermer}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#9ca3af",
            fontSize: "18px",
            lineHeight: 1,
            padding: "2px 4px",
          }}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      {/* Chiffre principal */}
      <div style={{ padding: "16px 16px 12px" }}>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#111827",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {zone.chiffre}
        </div>
        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
          {zone.detail}
        </div>
      </div>

      {/* Badge statut */}
      <div style={{ padding: "0 16px 16px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: couleurs.bg,
            color: couleurs.text,
            border: `1px solid ${couleurs.border}`,
            borderRadius: "20px",
            padding: "3px 10px",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: couleurs.text,
              opacity: 0.7,
            }}
          />
          {LABEL_STATUT[zone.statut]}
        </span>
      </div>
    </div>
  );
}
