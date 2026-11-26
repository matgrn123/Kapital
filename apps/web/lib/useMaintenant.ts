import { useEffect, useState } from "react";

/**
 * Heure courante pour un aperçu (« livré vers 12 h 21 (dans 2 h) »), rafraîchie toutes les
 * 30 secondes. Le premier rendu reprend l'instant donné par la page serveur : même texte
 * côté serveur et navigateur, pas d'écart d'hydratation.
 */
export function useMaintenant(initialMs: number, periodeMs = 30_000): number {
  const [maintenant, setMaintenant] = useState(initialMs);
  useEffect(() => {
    setMaintenant(Date.now());
    const t = setInterval(() => setMaintenant(Date.now()), periodeMs);
    return () => clearInterval(t);
  }, [periodeMs]);
  return maintenant;
}
