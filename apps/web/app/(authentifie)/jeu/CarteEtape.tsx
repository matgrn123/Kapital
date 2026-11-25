import {
  DEBLOCAGES_PAR_ACTION,
  centimes,
  conditionsManquantes,
  seuilsEtapesDepuis,
  type ActionVerrouillable,
  type ConditionManquante,
  type EtapeEntreprise,
} from "@kapital/engine";
import { chargerParametresV1 } from "@kapital/content";
import { formaterEuros } from "../../../lib/formatage";

const LIBELLES_ACTIONS: Record<ActionVerrouillable, string> = {
  action_marketing: "la publicité",
  demande_pret: "l'emprunt",
  louer_atelier: "la location d'un local",
  achat_local: "l'achat d'un local",
  production_atelier: "la production à l'atelier",
  embauche: "l'embauche",
  vente_revendeur: "la vente aux revendeurs",
};

const INTITULES: Record<EtapeEntreprise, string> = {
  0: "Démarrage",
  1: "Marque lancée",
  2: "Entreprise installée",
};

function debloquesPar(etape: EtapeEntreprise): string[] {
  return (Object.keys(DEBLOCAGES_PAR_ACTION) as ActionVerrouillable[])
    .filter((a) => DEBLOCAGES_PAR_ACTION[a] === etape)
    .map((a) => LIBELLES_ACTIONS[a]);
}

function euros(c: number): string {
  return `${formaterEuros(c)} €`;
}

function phrase(c: ConditionManquante): string {
  switch (c.cle) {
    case "pieces_vendues":
      return `Il manque ${c.manque} pièces vendues (${c.actuel} sur ${c.requis}).`;
    case "chiffre_affaires_ht_cumule":
      return `Il manque ${euros(c.manque)} de chiffre d'affaires hors taxes cumulé (${euros(c.actuel)} sur ${euros(c.requis)}).`;
    case "tresorerie_positive":
      return `La trésorerie doit être positive (${euros(c.actuel)} aujourd'hui).`;
  }
}

export function CarteEtape({
  etape,
  piecesVendues,
  chiffreAffairesHt,
  tresorerie,
}: {
  etape: EtapeEntreprise;
  piecesVendues: number;
  chiffreAffairesHt: number;
  tresorerie: number;
}) {
  const seuils = seuilsEtapesDepuis(chargerParametresV1());
  const prochaine = etape < 2 ? ((etape + 1) as EtapeEntreprise) : null;
  const conditions =
    prochaine === null
      ? []
      : conditionsManquantes(
          prochaine,
          {
            etape,
            cumuls: { piecesVendues, chiffreAffairesHt: centimes(chiffreAffairesHt) },
            tresorerie: centimes(tresorerie),
          },
          seuils,
        );

  // Progression vers la prochaine étape : le critère de volume (pièces ou chiffre d'affaires).
  let pourcent = 100;
  if (prochaine === 1) {
    pourcent = Math.floor((piecesVendues / seuils.piecesEtape1) * 100);
  } else if (prochaine === 2) {
    pourcent = Math.floor((chiffreAffairesHt / seuils.chiffreAffairesHtEtape2) * 100);
  }
  pourcent = Math.max(0, Math.min(100, pourcent));

  const acquis = debloquesPar(etape);
  const suivants = prochaine === null ? [] : debloquesPar(prochaine);

  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-5">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
        Étape
      </p>
      <h3 className="mt-1 text-sm font-semibold">
        <span className="chiffre">{etape}</span> · {INTITULES[etape]}
      </h3>
      {etape === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
          Vous pouvez fixer vos prix, acheter et faire produire chez un façonnier.
        </p>
      ) : (
        <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
          Débloqué à cette étape : {acquis.join(", ")}.
        </p>
      )}
      {prochaine === null ? (
        <p className="mt-3 text-sm text-[color:var(--color-g-500)]">
          Dernière étape atteinte : tout est débloqué.
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Prochaine étape : <span className="chiffre">{prochaine}</span> ·{" "}
            {INTITULES[prochaine]}
          </p>
          <p className="mt-1 text-sm text-[color:var(--color-g-700)]">
            Elle débloque : {suivants.join(", ")}.
          </p>
          <div
            className="mt-3 h-2 w-full rounded-full bg-[color:var(--color-g-200)]"
            role="progressbar"
            aria-valuenow={pourcent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-2 rounded-full bg-[color:var(--color-g-900)]"
              style={{ width: `${pourcent}%` }}
            />
          </div>
          <p className="chiffre mt-1 text-xs text-[color:var(--color-g-500)]">
            {pourcent} %
          </p>
          {conditions.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-[color:var(--color-g-700)]">
              {conditions.map((c) => (
                <li key={c.cle}>{phrase(c)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
