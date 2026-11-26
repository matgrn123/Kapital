import { NextResponse } from "next/server";
import {
  avancerLeTemps,
  avancerMondeMaintenant,
  ErreurAdmin,
  JournalAuditSupabase,
  StockageSupabase,
} from "@kapital/server";
import { exigerAdmin, reglagesRecette } from "../../../../../lib/admin";

// Fait avancer le temps du monde de RECETTE d'une durée prédéfinie (une heure, un jour, jusqu'à la
// fin du mois : l'horloge du jeu est l'horloge réelle),
// puis laisse le moteur rattraper. Verrouillé : mode recette + code admin, journal d'audit.
// Le navigateur n'envoie qu'un nom de durée : aucune date n'est lue dans la requête.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const acces = await exigerAdmin();
  if (!acces.ok) return acces.reponse;

  let corps: { duree?: unknown; code?: unknown };
  try {
    corps = (await request.json()) as { duree?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ error: "corps JSON invalide" }, { status: 400 });
  }
  const { modeRecette, codeAttendu } = reglagesRecette();

  try {
    const decalage = await avancerLeTemps(
      new StockageSupabase(acces.admin),
      new JournalAuditSupabase(acces.admin),
      typeof corps.duree === "string" ? corps.duree : "",
      {
        modeRecette,
        codeAttendu,
        codeSaisi: typeof corps.code === "string" ? corps.code : undefined,
        acteur: acces.userId,
      },
      Date.now(), // horloge du serveur, jamais celle du navigateur
    );
    const resultat = await avancerMondeMaintenant(acces.admin, "avance-temps");
    const erreurs = resultat.entreprises.filter((e) => e.etat === "erreur").length;
    return NextResponse.json({ ok: erreurs === 0, erreurs, decalageMs: decalage.decalageMs, ...resultat });
  } catch (ex) {
    if (ex instanceof ErreurAdmin) {
      return NextResponse.json({ error: ex.message }, { status: ex.statut });
    }
    const message = ex instanceof Error ? ex.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
