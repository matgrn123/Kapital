"use client";

import { useEffect } from "react";

/** Nom de l'événement du navigateur qui demande à la cloche de recompter. */
export const EVENEMENT_JOURNAL_VU = "kapital:journal-vu";

/**
 * Note que le joueur a vu son journal jusqu'à `jusqua` (instant où la page a été calculée).
 * La carte « Pendant ton absence » reste affichée pendant la lecture et disparaît au prochain
 * chargement ; la cloche se remet à zéro.
 */
export function MarquerVu({ jusqua }: { jusqua: string }) {
  useEffect(() => {
    let actif = true;
    void fetch("/api/journal/vu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jusqua }),
    })
      .then(() => {
        if (actif) window.dispatchEvent(new Event(EVENEMENT_JOURNAL_VU));
      })
      .catch(() => {
        // Réseau coupé : la carte reviendra à la prochaine visite, rien de grave.
      });
    return () => {
      actif = false;
    };
  }, [jusqua]);
  return null;
}
