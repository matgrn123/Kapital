export function formaterEuros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formaterEurosCompact(centimes: number): string {
  if (Math.abs(centimes) >= 100_000_00) {
    return (centimes / 100_00).toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " k€";
  }
  return formaterEuros(centimes);
}

// Le jeu se joue à l'heure de Paris, même quand la page est rendue sur un serveur en UTC.
const FUSEAU = "Europe/Paris";

export function formaterDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: FUSEAU,
  });
}

export function formaterDateHeure(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSEAU,
  });
}
