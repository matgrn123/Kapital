"use client";

// Écran « L'atelier » (maquette V.atelier). Le dessin isométrique affiche l'état calculé par le
// moteur ; il n'invente aucun chiffre. Coordonnées des modules : à partir de 1 (voir plan.ts).
//
// 3D-5 : le joueur prépare un plan (ajouter, déplacer, pivoter, retirer), voit son coût et
// l'écriture comptable AVANT d'enregistrer ; le serveur revalide et enregistre le plan PRÉVU, qui
// s'applique à la fin du mois de jeu. Jusque-là, le plan en service fait la production.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Parametres, TypeModule } from "@kapital/content";
import { Piece, SceneIso, type ObjetIso } from "../../../components/iso";
import {
  Alerte,
  Bouton,
  BoutonLien,
  Carte,
  Catalogue,
  EcritureComptable,
  EncadreNotion,
  EnTete,
  Faits,
  FilRouge,
  Jauge,
  Message,
  Puce,
  Refus,
} from "../../../components/ui";
import { deciderAmenagement, phraseErreurPlan } from "../../../lib/amenagement";
import { formaterEuros } from "../../../lib/formatage";
import {
  apercuPlacement,
  chargeMensuelle,
  deplacerModule,
  empriseModule,
  meublesDuModule,
  pivoterModule,
  resumeProduction,
  texteEffet,
  type DimensionsAtelier,
  type ModulePlace,
} from "./plan";
import { FicheSalarie } from "./FicheSalarie";
import { placerSalaries, type PosteAtelier, type SalarieFiche } from "./salaries";

export type ProprietesAtelier = {
  societe: string;
  local: string;
  surfaceM2: number;
  /** null : page de démonstration, rien n'est envoyé au serveur. */
  workshopId: string | null;
  atelier: DimensionsAtelier;
  /** Plan en service ce mois-ci (placed_modules.statut = 'actif'). */
  planActif: readonly ModulePlace[];
  /** Plan prévu enregistré, appliqué à la clôture du mois ; null s'il n'y en a pas. */
  planPrevu: readonly ModulePlace[] | null;
  /** Modules déjà payés pour le plan prévu (remboursés s'il est remplacé ou annulé). */
  coutPlanPrevu: number;
  /** Trésorerie de la société (centimes) ; null : inconnue (démonstration). */
  tresorerie: number | null;
  /** Paramètre bail_machines_a_la_signature : postes fournis avec le local, pas à l'actif. */
  postesFournis: number;
  /** Matériel en service encore à amortir (2154 − 2815, centimes). */
  valeurNetteMateriel: number;
  salaries: readonly SalarieFiche[];
  catalogue: readonly TypeModule[];
  parametres: Parametres;
};

const TENUES = ["#C46E8A", "#3E7D4A", "#2D4A9E", "#B0362A", "#8A6A2E"];
const heures = (min: number) => `${Math.round(min / 60).toLocaleString("fr-FR")} h`;
const euros = (c: number) => `${formaterEuros(c)} €`;
const memePlace = (a: ModulePlace, b: ModulePlace) =>
  a.module_type_id === b.module_type_id && a.x === b.x && a.y === b.y && a.pivote === b.pivote;

export function EcranAtelier(p: ProprietesAtelier) {
  const router = useRouter();
  const reference = p.planPrevu ?? p.planActif;
  const [plan, setPlan] = useState<ModulePlace[]>([...reference]);
  const [choisi, setChoisi] = useState<number | null>(null);
  const [salarieChoisi, setSalarieChoisi] = useState<string | null>(null);
  const [placement, setPlacement] = useState<string | null>(null);
  const [pivotePlacement, setPivotePlacement] = useState(false);
  const [deplacement, setDeplacement] = useState(false);
  const [survol, setSurvol] = useState<{ x: number; y: number } | null>(null);
  const [refusLocal, setRefusLocal] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<{ etat: "attente" | "ok" | "refus"; texte?: string } | null>(null);

  const typeDe = (id: string) => p.catalogue.find((c) => c.id === id);
  // Production de CE mois : le plan en service (le plan prévu attend la clôture).
  const resume = useMemo(() => resumeProduction(p.planActif, p.salaries, p.catalogue, p.parametres), [p.planActif, p.salaries, p.catalogue, p.parametres]);
  const resumePlan = useMemo(() => resumeProduction(plan, p.salaries, p.catalogue, p.parametres), [plan, p.salaries, p.catalogue, p.parametres]);
  const modifie = JSON.stringify(plan) !== JSON.stringify(reference);
  const differentDuPlanActif = JSON.stringify(plan) !== JSON.stringify(p.planActif);

  // Aperçu du coût et de l'écriture : même calcul que le serveur (lib/amenagement, moteur).
  const decision = useMemo(
    () =>
      deciderAmenagement({
        grille: { largeur_grille: p.atelier.largeur, hauteur_grille: p.atelier.hauteur, entree_x: p.atelier.entree_x, entree_y: p.atelier.entree_y },
        ancien: p.planActif,
        nouveau: plan,
        catalogue: p.catalogue,
        tresorerie: p.tresorerie ?? Number.POSITIVE_INFINITY,
        postesFournis: p.postesFournis,
        valeurNetteMateriel: p.valeurNetteMateriel,
        coutPlanPrevu: p.planPrevu ? p.coutPlanPrevu : 0,
      }),
    [p.atelier, p.planActif, plan, p.catalogue, p.tresorerie, p.postesFournis, p.valeurNetteMateriel, p.planPrevu, p.coutPlanPrevu],
  );

  // Aperçu vert / rouge : la case survolée (dessin, à partir de 0) devient le coin du module (moteur, à partir de 1).
  const enDeplacement = deplacement && choisi !== null && !!plan[choisi];
  let candidat: ModulePlace | null = null;
  let candidatValide = false;
  if (survol && placement) {
    candidat = { module_type_id: placement, x: survol.x + 1, y: survol.y + 1, pivote: pivotePlacement };
    candidatValide = apercuPlacement(p.atelier, plan, candidat, p.catalogue).valide;
  } else if (survol && enDeplacement) {
    candidat = { ...plan[choisi!]!, x: survol.x + 1, y: survol.y + 1 };
    candidatValide = deplacerModule(p.atelier, plan, choisi!, { x: survol.x + 1, y: survol.y + 1 }, p.catalogue).validation.valide;
  }
  const empCandidat = candidat ? empriseModule(candidat, p.catalogue) : null;
  const modeCase = !!placement || enDeplacement;

  const objets: ObjetIso[] = [];
  const postesEnService: PosteAtelier[] = [];
  const emprises: { x: number; y: number; w: number; d: number }[] = [];
  let tableCoupe: { x: number; y: number; w: number; d: number } | null = null;
  plan.forEach((m, i) => {
    const t = typeDe(m.module_type_id);
    const e = empriseModule(m, p.catalogue);
    if (!t || !e) return;
    emprises.push(e);
    // Les salariés ne s'assoient qu'aux postes en service (même place dans le plan actif).
    const enService = p.planActif.some((a) => memePlace(a, m));
    if ((t.effet.type === "poste_artisan" || t.effet.type === "poste_artisan_specialise") && enService) postesEnService.push({ emprise: e, nom: t.nom });
    if (t.effet.type === "table_coupe" && !tableCoupe) tableCoupe = e;
    meublesDuModule(t.effet.type, e, m.pivote).forEach((mb, k) =>
      objets.push({
        type: "meuble",
        id: k === 0 ? `m${i}` : `m${i}-${k}`,
        meuble: mb.meuble,
        pivote: mb.pivote,
        x: mb.x,
        y: mb.y,
        nom: `${t.nom}${enService ? "" : " (prévu)"}`,
        selectionnable: !modeCase,
      }),
    );
  });
  // Chaque salarié recruté est dessiné : devant son poste (moteur : artisansAuPoste), sinon dans l'allée.
  const salariesPlaces = placerSalaries({ salaries: p.salaries, auPoste: resume.auPoste, postes: postesEnService, atelier: p.atelier, occupees: emprises });
  salariesPlaces.forEach((s) => {
    const i = p.salaries.findIndex((x) => x.id === s.id);
    const nom = `${p.salaries[i]?.poste === "encadrement" ? "Encadrement" : "Artisan"}${s.poste ? "" : " sans poste"}`;
    objets.push({ type: "personnage", id: `s-${s.id}`, x: s.x, y: s.y, haut: TENUES[i % TENUES.length], nom, selectionnable: !modeCase });
  });
  const coupe = tableCoupe as { x: number; y: number; w: number; d: number } | null;
  if (coupe) objets.push({ type: "personnage", id: "toi", x: coupe.x - 1 + coupe.w + 0.3, y: coupe.y - 1 + coupe.d / 2, haut: "#17202E", etiquette: "Toi", aToi: true, selectionnable: false });

  const dans = (e: { x: number; y: number; w: number; d: number } | null | undefined, x: number, y: number) =>
    !!e && x + 1 >= e.x && x + 1 < e.x + e.w && y + 1 >= e.y && y + 1 < e.y + e.d;
  const couleurCase = (x: number, y: number) => {
    if (dans(empCandidat, x, y)) return candidatValide ? "rgba(60,180,90,.55)" : "rgba(220,80,60,.55)";
    if (choisi !== null && plan[choisi] && dans(empriseModule(plan[choisi]!, p.catalogue), x, y)) return "rgba(70,110,220,.28)";
    return undefined;
  };

  const changer = (nouveau: ModulePlace[]) => {
    setPlan(nouveau);
    setEnvoi(null);
    setRefusLocal(null);
  };

  const clicCase = (c: { x: number; y: number }) => {
    const vers = { x: c.x + 1, y: c.y + 1 };
    if (placement) {
      const m: ModulePlace = { module_type_id: placement, ...vers, pivote: pivotePlacement };
      if (!apercuPlacement(p.atelier, plan, m, p.catalogue).valide) return;
      changer([...plan, m]);
      setPlacement(null);
      setPivotePlacement(false);
    } else if (enDeplacement) {
      const r = deplacerModule(p.atelier, plan, choisi!, vers, p.catalogue);
      if (!r.validation.valide) return;
      changer(r.plan);
      setDeplacement(false);
    }
  };

  const pivoter = () => {
    if (choisi === null) return;
    const r = pivoterModule(p.atelier, plan, choisi, p.catalogue);
    if (r.validation.valide) changer(r.plan);
    else setRefusLocal(`Pivoté, ce module ne tient pas ici. ${r.validation.erreurs.map(phraseErreurPlan).join(" ")} Déplace-le d'abord.`);
  };

  const envoyer = async (corps: object, succes: string) => {
    if (!p.workshopId) return;
    setEnvoi({ etat: "attente" });
    try {
      const r = await fetch("/api/actions/sauvegarder-amenagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopId: p.workshopId, ...corps }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!r.ok || j.error) {
        setEnvoi({ etat: "refus", texte: j.error ?? "Le serveur a refusé l'aménagement." });
        return false;
      }
      setEnvoi({ etat: "ok", texte: j.message ?? succes });
      router.refresh();
      return true;
    } catch {
      setEnvoi({ etat: "refus", texte: "Impossible de joindre le serveur. Réessaie." });
      return false;
    }
  };

  const enregistrer = () => void envoyer({ modules: plan }, "Plan enregistré : il s'appliquera à la fin du mois de jeu.");
  const annulerPrevu = async () => {
    if (await envoyer({ annuler: true }, "Plan prévu annulé.")) {
      setPlan([...p.planActif]);
      setChoisi(null);
    }
  };

  const sel = choisi !== null && plan[choisi] ? typeDe(plan[choisi]!.module_type_id) : undefined;
  const salarieSel = salarieChoisi ? p.salaries.find((s) => s.id === salarieChoisi) : undefined;
  const W = p.atelier.largeur;
  const D = p.atelier.hauteur;
  const nomAchat = (id: string) => typeDe(id)?.nom ?? id;

  return (
    <div className="flex flex-col gap-4">
      <EnTete
        surTitre={`${p.societe} · ${p.local} · ${p.surfaceM2.toLocaleString("fr-FR")} m²`}
        titre="L'atelier"
        action={<BoutonLien href="/vue-3d">← Retour au village</BoutonLien>}
      />
      {p.planPrevu && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-thread-soft px-3 py-2">
          <p className="min-w-0 flex-1 text-[0.88rem] text-thread">
            <b>Plan prévu</b> : il s&apos;appliquera à la fin du mois de jeu. D&apos;ici là, l&apos;atelier produit avec le plan en service
            {p.coutPlanPrevu > 0 ? ` ; les modules commandés (${euros(p.coutPlanPrevu)}) sont remboursés si tu l'annules.` : "."}
          </p>
          {p.workshopId && (
            <Bouton petit disabled={envoi?.etat === "attente"} onClick={() => void annulerPrevu()}>
              Annuler le plan prévu
            </Bouton>
          )}
        </div>
      )}
      <div className="grid grid-cols-[1fr_320px] gap-4 max-[1000px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {placement ? (
              <>
                <Puce ton="accent">Placement : {typeDe(placement)?.nom} · clique une case verte</Puce>
                <Bouton petit onClick={() => setPivotePlacement(!pivotePlacement)}>Pivoter ({pivotePlacement ? "pivoté" : "droit"})</Bouton>
                <Bouton petit onClick={() => { setPlacement(null); setPivotePlacement(false); }}>Annuler</Bouton>
              </>
            ) : enDeplacement ? (
              <>
                <Puce ton="accent">Déplacement : {sel?.nom} · clique sa nouvelle case (coin haut-gauche)</Puce>
                <Bouton petit onClick={() => setDeplacement(false)}>Annuler</Bouton>
              </>
            ) : (
              <Puce>Clique un objet pour le déplacer, le pivoter ou voir son effet ; un salarié pour sa fiche</Puce>
            )}
          </div>
          <SceneIso
            titre={`Atelier de ${p.societe}`}
            sol={<Piece W={W} D={D} enseigne={p.societe.toUpperCase()} />}
            grille={{ W, D, traits: true, couleur: couleurCase }}
            objets={objets}
            selection={choisi !== null ? `m${choisi}` : salarieChoisi ? `s-${salarieChoisi}` : null}
            onSelect={(id) => {
              // « s-<uuid> » : un salarié ; « m<index> » : un module du plan.
              setRefusLocal(null);
              setDeplacement(false);
              if (id.startsWith("s-")) {
                setSalarieChoisi(id.slice(2));
                setChoisi(null);
                return;
              }
              const n = Number(id.replace(/^m/, "").split("-")[0]);
              setChoisi(Number.isInteger(n) ? n : null);
              setSalarieChoisi(null);
            }}
            onCaseSurvol={setSurvol}
            onCaseClic={modeCase ? clicCase : undefined}
            etendue={{ x: -0.2, y: -0.2, w: W + 0.2, d: D + 0.2, h: 2.6 }}
            marge={24}
          />
        </div>

        <aside className="flex flex-col gap-3">
          <Carte titre="Production ce mois-ci">
            <div className="flex flex-col gap-2.5">
              <Jauge libelle="Capacité du mois" valeur={resume.capaciteMinutes} max={Math.max(1, resume.capaciteMaxMinutes)} texte={`${heures(resume.capaciteMinutes)} / ${heures(resume.capaciteMaxMinutes)}`} />
              <Jauge libelle="Postes occupés" valeur={resume.auPoste.length} max={Math.max(1, resume.postes)} texte={`${resume.auPoste.length} / ${resume.postes}`} ton="bon" />
              <Faits lignes={[["Stockage", `${resume.stockageM3.toLocaleString("fr-FR")} m³`], ["Artisans", String(resume.artisans)]]} />
              {differentDuPlanActif && (
                <Faits
                  lignes={[
                    ["Avec le plan affiché : postes", String(resumePlan.postes)],
                    ["Capacité maximale", heures(resumePlan.capaciteMaxMinutes)],
                  ]}
                />
              )}
              {resume.postesSansArtisan > 0 && <Alerte ton="alerte">{resume.postesSansArtisan} poste(s) sans artisan : la machine ne produit rien.</Alerte>}
              {resume.artisansSansPoste > 0 && <Alerte ton="critique">{resume.artisansSansPoste} artisan(s) sans poste : payés, mais ils ne produisent pas.</Alerte>}
            </div>
          </Carte>

          <Carte titre={salarieSel ? "Salarié sélectionné" : "Objet sélectionné"}>
            {salarieSel ? (
              <FicheSalarie salarie={salarieSel} place={salariesPlaces.find((s) => s.id === salarieSel.id)} parametres={p.parametres} />
            ) : sel ? (
              <div className="flex flex-col gap-2">
                <Faits
                  lignes={[
                    ["Nom", sel.nom],
                    ["Effet", texteEffet(sel.effet)],
                    ["Prix", euros(sel.prix_centimes)],
                    ["Amortissement", `${sel.amortissement_mois} mois`],
                    ["Charge par mois", euros(chargeMensuelle(sel))],
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Bouton petit onClick={() => { setDeplacement(true); setPlacement(null); setRefusLocal(null); }}>Déplacer</Bouton>
                  <Bouton petit onClick={pivoter}>Pivoter</Bouton>
                  <Bouton petit onClick={() => { changer(plan.filter((_, i) => i !== choisi)); setChoisi(null); setDeplacement(false); }}>Retirer du plan</Bouton>
                </div>
                {refusLocal && <Refus>{refusLocal}</Refus>}
              </div>
            ) : (
              <p className="text-[0.85rem] text-muted">Aucun objet choisi. Clique une machine ou un salarié.</p>
            )}
          </Carte>

          <Carte titre="Acheter et placer">
            <div className="flex flex-col gap-2.5">
              <Catalogue
                articles={p.catalogue.map((m) => ({ id: m.id, nom: m.nom, prix: euros(m.prix_centimes), effet: texteEffet(m.effet) }))}
                choisi={placement}
                onChoisir={(id) => { setPlacement(id); setPivotePlacement(false); setDeplacement(false); setChoisi(null); setSalarieChoisi(null); }}
              />
              {modifie && (
                decision.ok ? (
                  <div className="flex flex-col gap-2">
                    <Faits
                      lignes={[
                        ...decision.achetes.map((a) => [`${a.quantite} × ${nomAchat(a.id_type)}`, euros(a.quantite * a.prixUnitaire)] as const),
                        ["À payer à l'enregistrement", euros(decision.cout)],
                        ...(decision.remboursement > 0 ? [["Commande du plan prévu remboursée", euros(decision.remboursement)] as const] : []),
                        ["Effet sur la banque", `${decision.variationTresorerie > 0 ? "+" : ""}${euros(decision.variationTresorerie)}`],
                      ]}
                    />
                    {decision.ecritures.map((e, i) => (
                      <EcritureComptable
                        key={i}
                        libelle={e.libelle}
                        etiquette="à l'enregistrement"
                        lignes={e.lignes.map((l) => (l.sens === "debit" ? { compte: l.compte, debit: l.montant } : { compte: l.compte, credit: l.montant }))}
                      />
                    ))}
                    {decision.cout > 0 && (
                      <p className="text-[0.8rem] text-muted">
                        Les modules sont payés maintenant ; ils entrent en service, et commencent à s&apos;amortir, à la fin du mois de jeu.
                      </p>
                    )}
                  </div>
                ) : (
                  <Refus>{decision.message}</Refus>
                )
              )}
              {p.workshopId ? (
                <Bouton variante="principal" disabled={!modifie || !decision.ok || envoi?.etat === "attente"} onClick={enregistrer}>
                  {envoi?.etat === "attente" ? "Envoi…" : "Enregistrer le plan (appliqué en fin de mois)"}
                </Bouton>
              ) : (
                <Message ton="info">Page de démonstration : rien n&apos;est enregistré.</Message>
              )}
              {envoi?.etat === "refus" && <Refus>{envoi.texte}</Refus>}
              {envoi?.etat === "ok" && <Message ton="succes">{envoi.texte}</Message>}
            </div>
          </Carte>

          <EncadreNotion titre="Une machine n'est pas une dépense comme les autres">
            Une machine sert plusieurs années : c&apos;est une <b>immobilisation</b>. Son prix ne passe pas en charge le jour de
            l&apos;achat ; il est réparti sur sa durée d&apos;utilisation, mois après mois : c&apos;est l&apos;<b>amortissement</b>.
          </EncadreNotion>
          <FilRouge ecran="atelier" />
        </aside>
      </div>
    </div>
  );
}
