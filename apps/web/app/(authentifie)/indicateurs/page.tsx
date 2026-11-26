import { chargerParametresV1 } from "@kapital/content";
import {
  chargerLignesGrandLivreSupabase,
  lireIndicateursEntreprise,
  StockageSupabase,
} from "@kapital/server";
import type { Indicateurs } from "@kapital/engine";
import { chargerContexte, estErreurAction } from "../../../lib/api-helpers";
import { enMois, libelleMois } from "../../../lib/cadre";
import { formaterEuros } from "../../../lib/formatage";
import { Carte, Kpi } from "../../../components/ui";
import { Alerte, EnTete, Message, Tableau, Vide } from "../../../components/ui/formulaire";

export const dynamic = "force-dynamic";

const AUCUNE_DONNEE = "Pas encore de données : cet indicateur se remplit dès les premières ventes.";

export default async function PageIndicateurs() {
  const ctx = await chargerContexte();
  if (estErreurAction(ctx)) return null;

  let indicateurs: Indicateurs;
  try {
    const stockage = new StockageSupabase(ctx.supabaseAdmin);
    indicateurs = await lireIndicateursEntreprise(
      {
        chargerEtat: (id, mois) => stockage.chargerEtat(id, mois),
        chargerLignesGrandLivre: (id) => chargerLignesGrandLivreSupabase(ctx.supabaseAdmin, id),
      },
      chargerParametresV1(),
      { companyId: ctx.companyId, moisCourant: ctx.moisCourant },
    );
  } catch {
    return (
      <div className="flex flex-col gap-5">
        <EnTete surTitre="Pilotage" titre="Indicateurs" />
        <Message ton="erreur">
          Les indicateurs n&apos;ont pas pu être calculés pour le moment. Recharge la page dans un instant.
        </Message>
      </div>
    );
  }

  const { marges, pointMort, besoinEnFondsDeRoulement: bfr, previsionnel, endettement } = indicateurs;
  const aDesVentes = marges.total.pieces > 0;
  const canaux = [
    { cle: "vente_directe", libelle: "Vente directe" },
    { cle: "revendeur", libelle: "Revendeurs" },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Pilotage" titre="Indicateurs">
        Cinq repères pour savoir si ton entreprise est en bonne santé.
      </EnTete>

      <Section titre="Marge par canal" explication="La marge brute, c'est ce qui reste d'une vente une fois payé le coût de fabrication de la pièce.">
        {!aDesVentes ? (
          <Vide>{AUCUNE_DONNEE}</Vide>
        ) : (
          <>
            <TableauTexte
              entetes={["Canal", "Pièces vendues", "Chiffre d'affaires HT", "Marge brute", "Marge (en % du CA)"]}
              lignes={[
                ...canaux.map((c) => ligneMarge(c.libelle, marges.parCanal[c.cle])),
                ligneMarge("Total", marges.total),
              ]}
            />
            {marges.produitsIgnores.length > 0 && (
              <p className="text-[0.78rem] text-muted">
                {marges.produitsIgnores.length} produit(s) vendu(s) sont exclus du calcul : leur coût de revient ou leur prix est inconnu.
              </p>
            )}
          </>
        )}
      </Section>

      <Section titre="Point mort" explication="Le point mort, c'est le niveau de ventes à partir duquel tu ne perds plus d'argent chaque mois.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi libelle="Salaires et cotisations" valeur={eur(pointMort.chargesFixes.salaires)} />
          <Kpi libelle="Loyer" valeur={eur(pointMort.chargesFixes.loyer)} />
          <Kpi libelle="Intérêts des prêts" valeur={eur(pointMort.chargesFixes.interetsPrets)} />
          <Kpi libelle="Charges fixes par mois" valeur={eur(pointMort.chargesFixes.total)} />
        </div>
        {pointMort.piecesPointMort === null || pointMort.chiffreAffairesPointMortHt === null ? (
          <p className="text-[0.88rem] text-muted">
            {aDesVentes
              ? "Point mort non calculable : tes ventes ne dégagent pas encore de marge positive."
              : AUCUNE_DONNEE}
          </p>
        ) : (
          <p className="text-[0.88rem]">
            Il te faut vendre environ <b className="tabular-nums">{Math.ceil(pointMort.piecesPointMort)}</b> pièces
            par mois, soit <b className="tabular-nums">{eur(pointMort.chiffreAffairesPointMortHt)}</b> de
            chiffre d&apos;affaires hors taxes.
          </p>
        )}
      </Section>

      <Section titre="Besoin en fonds de roulement" explication="C'est l'argent immobilisé par ton activité : ce que tu as en stock ou que l'on te doit, moins ce que tu dois à tes fournisseurs.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi libelle="Stocks" valeur={eur(bfr.stocks)} />
          <Kpi libelle="Créances clients" valeur={eur(bfr.creances)} />
          <Kpi libelle="Dettes fournisseurs" valeur={eur(bfr.dettesFournisseurs)} />
          <Kpi libelle="Besoin" valeur={eur(bfr.besoin)} />
        </div>
      </Section>

      <Section titre="Trésorerie des 3 prochains mois" explication="Une prévision de ton compte en banque si tes ventes gardent leur rythme actuel ; elle ne compte pas tes futurs achats de matière ni la TVA.">
        {previsionnel.premierMoisDecouvert !== null && (
          <Alerte ton="critique">
            Attention : ta trésorerie prévue passe sous zéro {enMois(previsionnel.premierMoisDecouvert)}. Pense à
            réduire tes dépenses ou à emprunter.
          </Alerte>
        )}
        <p className="text-[0.88rem]">
          Trésorerie de départ : <b className="tabular-nums">{eur(previsionnel.tresorerieDepart)}</b>
        </p>
        <TableauTexte
          entetes={["Mois", "Ventes directes", "Revendeurs", "Salaires", "Loyer", "Prêts", "Fournisseurs", "Flux net", "Trésorerie fin de mois"]}
          lignes={previsionnel.mois.map((m) => [
            libelleMois(m.mois),
            eur(m.encaissementsDirects),
            eur(m.encaissementsRevendeurs),
            eur(-m.salaires),
            eur(-m.loyer),
            eur(-m.echeancesPrets),
            eur(-m.dettesFournisseurs),
            eur(m.fluxNet),
            eur(m.tresorerieFin),
          ])}
        />
      </Section>

      <Section titre="Endettement" explication="Le ratio dettes sur capitaux propres compare ce que tu dois aux banques à ce que les associés ont mis et gagné : plus il est haut, plus tu es fragile.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi libelle="Dettes financières" valeur={eur(endettement.dettesFinancieres)} />
          <Kpi libelle="Mensualités du mois" valeur={eur(endettement.mensualitesDuMois)} />
          <Kpi libelle="Capitaux propres" valeur={eur(endettement.capitauxPropres)} />
          <Kpi
            libelle="Dettes / capitaux propres"
            valeur={
              endettement.ratioDettesCapitauxPropres === null
                ? "Non calculable"
                : endettement.ratioDettesCapitauxPropres.toFixed(2).replace(".", ",")
            }
          />
        </div>
        {endettement.ratioDettesCapitauxPropres === null && (
          <p className="text-[0.78rem] text-muted">
            Le ratio n&apos;a de sens que si tes capitaux propres sont positifs.
          </p>
        )}
      </Section>
    </div>
  );
}

function eur(c: number): string {
  return `${formaterEuros(c)} €`;
}

function ligneMarge(
  libelle: string,
  m: { pieces: number; chiffreAffairesHt: number; margeBrute: number },
): string[] {
  const taux =
    m.chiffreAffairesHt > 0
      ? `${((m.margeBrute / m.chiffreAffairesHt) * 100).toFixed(1).replace(".", ",")} %`
      : "n.d.";
  return [libelle, String(m.pieces), eur(m.chiffreAffairesHt), eur(m.margeBrute), taux];
}

function Section({
  titre,
  explication,
  children,
}: {
  titre: string;
  explication: string;
  children: React.ReactNode;
}) {
  return (
    <Carte titre={titre}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.86rem] text-muted">{explication}</p>
        {children}
      </div>
    </Carte>
  );
}

function TableauTexte({ entetes, lignes }: { entetes: string[]; lignes: string[][] }) {
  return (
    <Tableau entetes={entetes.map((texte, i) => ({ texte, droite: i > 0 }))}>
      {lignes.map((l) => (
        <tr key={l[0]}>
          {l.map((c, i) => (
            <td key={i} className={i === 0 ? "text-left" : "text-right"}>
              {c}
            </td>
          ))}
        </tr>
      ))}
    </Tableau>
  );
}
