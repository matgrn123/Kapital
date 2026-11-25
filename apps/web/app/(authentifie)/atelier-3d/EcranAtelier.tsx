"use client";

// Écran « L'atelier » (maquette V.atelier). Le dessin isométrique affiche l'état calculé par le
// moteur ; il n'invente aucun chiffre. Coordonnées des modules : à partir de 1 (voir plan.ts).

import { useMemo, useState } from "react";
import type { Parametres, TypeModule } from "@kapital/content";
import { Piece, SceneIso, type ObjetIso } from "../../../components/iso";
import { Alerte, Bouton, BoutonLien, Carte, Catalogue, EncadreNotion, EnTete, Faits, FilRouge, Jauge, Message, Puce, Refus } from "../../../components/ui";
import { formaterEuros } from "../../../lib/formatage";
import {
  apercuPlacement,
  chargeMensuelle,
  empriseModule,
  meublesDuModule,
  resumeProduction,
  texteEffet,
  validerPlan,
  type DimensionsAtelier,
  type ModulePlace,
  type SalarieAtelier,
} from "./plan";

export type ProprietesAtelier = {
  societe: string;
  local: string;
  surfaceM2: number;
  /** null : page de démonstration, rien n'est envoyé au serveur. */
  workshopId: string | null;
  atelier: DimensionsAtelier;
  planInitial: readonly ModulePlace[];
  salaries: readonly SalarieAtelier[];
  catalogue: readonly TypeModule[];
  parametres: Parametres;
};

const TENUES = ["#C46E8A", "#3E7D4A", "#2D4A9E", "#B0362A", "#8A6A2E"];
const heures = (min: number) => `${Math.round(min / 60).toLocaleString("fr-FR")} h`;

export function EcranAtelier(p: ProprietesAtelier) {
  const [plan, setPlan] = useState<ModulePlace[]>([...p.planInitial]);
  const [choisi, setChoisi] = useState<number | null>(null);
  const [placement, setPlacement] = useState<string | null>(null);
  const [survol, setSurvol] = useState<{ x: number; y: number } | null>(null);
  const [envoi, setEnvoi] = useState<{ etat: "attente" | "ok" | "refus"; texte?: string } | null>(null);

  const typeDe = (id: string) => p.catalogue.find((c) => c.id === id);
  const resume = useMemo(() => resumeProduction(plan, p.salaries, p.catalogue, p.parametres), [plan, p.salaries, p.catalogue, p.parametres]);
  const modifie = JSON.stringify(plan) !== JSON.stringify(p.planInitial);
  const planValide = validerPlan(p.atelier, plan, p.catalogue).valide;

  // Aperçu : la case survolée (dessin, à partir de 0) devient le coin du module (moteur, à partir de 1).
  const candidat: ModulePlace | null = placement && survol ? { module_type_id: placement, x: survol.x + 1, y: survol.y + 1, pivote: false } : null;
  const apercu = candidat ? apercuPlacement(p.atelier, plan, candidat, p.catalogue) : null;
  const empCandidat = candidat ? empriseModule(candidat, p.catalogue) : null;

  const objets: ObjetIso[] = [];
  const postesPlaces: { x: number; y: number; w: number; d: number }[] = [];
  let tableCoupe: { x: number; y: number; w: number; d: number } | null = null;
  plan.forEach((m, i) => {
    const t = typeDe(m.module_type_id);
    const e = empriseModule(m, p.catalogue);
    if (!t || !e) return;
    if (t.effet.type === "poste_artisan" || t.effet.type === "poste_artisan_specialise") postesPlaces.push(e);
    if (t.effet.type === "table_coupe" && !tableCoupe) tableCoupe = e;
    meublesDuModule(t.effet.type, e).forEach((mb, k) =>
      objets.push({ type: "meuble", id: k === 0 ? `m${i}` : `m${i}-${k}`, meuble: mb.meuble, x: mb.x, y: mb.y, nom: t.nom, selectionnable: !placement }),
    );
  });
  // Salariés au poste (moteur : artisansAuPoste), dessinés devant leur machine.
  resume.auPoste.forEach((s, i) => {
    const e = postesPlaces[i];
    if (!e) return;
    objets.push({ type: "personnage", id: `s-${s.id}`, x: e.x - 1 + e.w / 2, y: e.y - 1 + e.d - 0.2, haut: TENUES[i % TENUES.length], selectionnable: false });
  });
  const coupe = tableCoupe as { x: number; y: number; w: number; d: number } | null;
  if (coupe) objets.push({ type: "personnage", id: "toi", x: coupe.x - 1 + coupe.w + 0.3, y: coupe.y - 1 + coupe.d / 2, haut: "#17202E", etiquette: "Toi", aToi: true, selectionnable: false });

  const dansCandidat = (x: number, y: number) => !!empCandidat && x + 1 >= empCandidat.x && x + 1 < empCandidat.x + empCandidat.w && y + 1 >= empCandidat.y && y + 1 < empCandidat.y + empCandidat.d;
  const couleurCase = (x: number, y: number) => {
    if (dansCandidat(x, y)) return apercu?.valide ? "rgba(60,180,90,.55)" : "rgba(220,80,60,.55)";
    const i = choisi;
    if (i !== null) {
      const e = plan[i] && empriseModule(plan[i]!, p.catalogue);
      if (e && x + 1 >= e.x && x + 1 < e.x + e.w && y + 1 >= e.y && y + 1 < e.y + e.d) return "rgba(70,110,220,.28)";
    }
    return undefined;
  };

  const poser = (c: { x: number; y: number }) => {
    if (!placement) return;
    const m: ModulePlace = { module_type_id: placement, x: c.x + 1, y: c.y + 1, pivote: false };
    if (!apercuPlacement(p.atelier, plan, m, p.catalogue).valide) return;
    setPlan([...plan, m]);
    setPlacement(null);
    setEnvoi(null);
  };

  const enregistrer = async () => {
    if (!p.workshopId) return;
    setEnvoi({ etat: "attente" });
    try {
      const r = await fetch("/api/actions/sauvegarder-amenagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workshopId: p.workshopId, modules: plan }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!r.ok || j.error) setEnvoi({ etat: "refus", texte: j.error ?? "Le serveur a refusé l'aménagement." });
      else setEnvoi({ etat: "ok", texte: j.message ?? "Aménagement enregistré." });
    } catch {
      setEnvoi({ etat: "refus", texte: "Impossible de joindre le serveur. Réessaie." });
    }
  };

  const sel = choisi !== null && plan[choisi] ? typeDe(plan[choisi]!.module_type_id) : undefined;
  const W = p.atelier.largeur;
  const D = p.atelier.hauteur;

  return (
    <div className="flex flex-col gap-4">
      <EnTete
        surTitre={`${p.societe} · ${p.local} · ${p.surfaceM2.toLocaleString("fr-FR")} m²`}
        titre="L'atelier"
        action={<BoutonLien href="/vue-3d">← Retour au village</BoutonLien>}
      />
      <div className="grid grid-cols-[1fr_320px] gap-4 max-[1000px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {placement ? (
              <>
                <Puce ton="accent">Placement : {typeDe(placement)?.nom} · clique une case verte</Puce>
                <Bouton petit onClick={() => setPlacement(null)}>Annuler</Bouton>
              </>
            ) : (
              <Puce>Clique un objet pour voir son effet</Puce>
            )}
          </div>
          <SceneIso
            titre={`Atelier de ${p.societe}`}
            sol={<Piece W={W} D={D} enseigne={p.societe.toUpperCase()} />}
            grille={{ W, D, traits: true, couleur: couleurCase }}
            objets={objets}
            selection={choisi !== null ? `m${choisi}` : null}
            onSelect={(id) => {
              const n = Number(id.replace(/^m/, "").split("-")[0]);
              setChoisi(Number.isInteger(n) ? n : null);
            }}
            onCaseSurvol={setSurvol}
            onCaseClic={poser}
            etendue={{ x: -0.2, y: -0.2, w: W + 0.2, d: D + 0.2, h: 2.6 }}
            marge={24}
          />
        </div>

        <aside className="flex flex-col gap-3">
          <Carte titre="Production">
            <div className="flex flex-col gap-2.5">
              <Jauge libelle="Capacité du mois" valeur={resume.capaciteMinutes} max={Math.max(1, resume.capaciteMaxMinutes)} texte={`${heures(resume.capaciteMinutes)} / ${heures(resume.capaciteMaxMinutes)}`} />
              <Jauge libelle="Postes occupés" valeur={resume.auPoste.length} max={Math.max(1, resume.postes)} texte={`${resume.auPoste.length} / ${resume.postes}`} ton="bon" />
              <Faits lignes={[["Stockage", `${resume.stockageM3.toLocaleString("fr-FR")} m³`], ["Artisans", String(resume.artisans)]]} />
              {resume.postesSansArtisan > 0 && <Alerte ton="alerte">{resume.postesSansArtisan} poste(s) sans artisan : la machine ne produit rien.</Alerte>}
              {resume.artisansSansPoste > 0 && <Alerte ton="critique">{resume.artisansSansPoste} artisan(s) sans poste : payés, mais ils ne produisent pas.</Alerte>}
            </div>
          </Carte>

          <Carte titre="Objet sélectionné">
            {sel ? (
              <div className="flex flex-col gap-2">
                <Faits
                  lignes={[
                    ["Nom", sel.nom],
                    ["Effet", texteEffet(sel.effet)],
                    ["Prix", formaterEuros(sel.prix_centimes)],
                    ["Amortissement", `${sel.amortissement_mois} mois`],
                    ["Charge par mois", formaterEuros(chargeMensuelle(sel))],
                  ]}
                />
                <Bouton petit onClick={() => { setPlan(plan.filter((_, i) => i !== choisi)); setChoisi(null); setEnvoi(null); }}>Retirer du plan</Bouton>
              </div>
            ) : (
              <p className="text-[0.85rem] text-muted">Aucun objet choisi.</p>
            )}
          </Carte>

          <Carte titre="Acheter et placer">
            <div className="flex flex-col gap-2.5">
              <Catalogue
                articles={p.catalogue.map((m) => ({ id: m.id, nom: m.nom, prix: `${formaterEuros(m.prix_centimes)} €`, effet: texteEffet(m.effet) }))}
                choisi={placement}
                onChoisir={(id) => { setPlacement(id); setChoisi(null); }}
              />
              {p.workshopId ? (
                <Bouton variante="principal" disabled={!modifie || !planValide || envoi?.etat === "attente"} onClick={() => void enregistrer()}>
                  {envoi?.etat === "attente" ? "Envoi…" : "Enregistrer l'aménagement"}
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
