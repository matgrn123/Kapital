"use client";

// Fiche d'un salarié cliqué dans l'atelier (ticket 3D-6). Elle affiche ce que calculent la base
// et le moteur (chiffresFiche) ; le licenciement se fait sur l'écran Salariés.

import type { Parametres } from "@kapital/content";
import { Alerte, BoutonLien, Faits } from "../../../components/ui";
import { dateLisible } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import { chiffresFiche, type SalarieFiche, type SalariePlace } from "./salaries";

const POSTES = { artisan: "Artisan", encadrement: "Encadrement" } as const;
const mois = (n: number) => `${n.toLocaleString("fr-FR")} mois`;
const jours = (n: number) => {
  const j = Math.floor(n);
  return j < 1 ? "moins d'un jour" : `${j.toLocaleString("fr-FR")} jour${j > 1 ? "s" : ""}`;
};
const pourcent = (r: number) => `${Math.round(r * 100).toLocaleString("fr-FR")} %`;

export function FicheSalarie({ salarie, place, parametres }: { salarie: SalarieFiche; place: SalariePlace | undefined; parametres: Parametres }) {
  const c = chiffresFiche(salarie, parametres);
  const poste = place?.poste ?? null;
  const artisan = salarie.poste === "artisan";
  return (
    <div className="flex flex-col gap-2">
      <Faits
        lignes={[
          ["Fonction", POSTES[salarie.poste]],
          ["Poste occupé", poste ? `${poste.nom} (case ${poste.emprise.x}, ${poste.emprise.y})` : "Sans poste"],
          ["Depuis", dateLisible(salarie.depuis)],
          ["Ancienneté", mois(salarie.ancienneteMois)],
          ["Expérience", jours(salarie.experienceJours)],
          ["Salaire brut", `${formaterEuros(salarie.salaireBrutCentimes)} € / mois`],
          ["Coût employeur", `${formaterEuros(c.coutEmployeurCentimes)} € / mois`],
          ...(artisan
            ? ([["Rendement", `${pourcent(c.rendement)} (débutant ${pourcent(c.rendementDebutant)}, maximum ${pourcent(c.rendementMax)})`]] as const)
            : []),
        ]}
      />
      {artisan && !poste && <Alerte ton="critique">Aucun poste libre : il est payé, mais il ne produit pas. Place une machine ou réduis l&apos;équipe.</Alerte>}
      {!artisan && <Alerte>L&apos;encadrement ne travaille pas sur une machine : il n&apos;occupe pas de poste de couture.</Alerte>}
      {artisan && (
        <p className="text-[0.8rem] text-muted">
          Le rendement monte avec l&apos;expérience : un débutant produit moins par heure payée qu&apos;un artisan confirmé.
          L&apos;essentiel s&apos;apprend pendant les deux premières semaines après l&apos;embauche.
        </p>
      )}
      <div>
        <BoutonLien href="/salaries" petit>
          Gérer ou licencier dans Salariés
        </BoutonLien>
      </div>
    </div>
  );
}
