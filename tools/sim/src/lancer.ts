import { jouerScenarioSolo } from "./scenarioSolo.js";

// npm run banc-solo -w @kapital/tool-sim [-- <mois> <graine>]
// Affiche le tableau de bord mois par mois du scénario solo et les anomalies du garde-fou.

const mois = Number(process.argv[2] ?? 24);
const graine = Number(process.argv[3] ?? 1);
const { etat, journal } = jouerScenarioSolo({ mois, graine });

const euros = (c: number): string => (c / 100).toFixed(2).padStart(11);
console.log("mois étape  trésorerie   CA HT cumulé  vendues  stock  salariés postes  anomalies");
for (const b of etat.historique) {
  console.log(
    `${String(b.mois).padStart(4)} ${String(b.etape).padStart(5)} ${euros(b.tresorerie)} ${euros(b.chiffreAffairesHtCumule)} ${String(b.piecesVenduesCumulees).padStart(8)} ${String(b.stockFiniPieces).padStart(6)} ${String(b.salaries).padStart(8)} ${String(b.postes).padStart(6)}  ${b.anomalies.map((a) => `${a.code} (attendu ${a.attendu}, obtenu ${a.obtenu})`).join(" ; ")}`,
  );
}
console.log("\nDécisions :");
for (const l of journal) console.log(`  ${l}`);
