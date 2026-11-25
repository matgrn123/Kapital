import { chargerParametresV1 } from "@kapital/content";
import {
  chargerLignesGrandLivreSupabase,
  lireIndicateursEntreprise,
  StockageSupabase,
} from "@kapital/server";
import type { Indicateurs } from "@kapital/engine";
import { chargerContexte, estErreurAction } from "../../../lib/api-helpers";
import { formaterEuros } from "../../../lib/formatage";

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
        <h1 className="text-3xl font-semibold tracking-tight">Indicateurs</h1>
        <p role="alert" className="mt-4 text-sm text-[color:var(--color-erreur)]">
          Les indicateurs n'ont pas pu être calculés pour le moment. Rechargez la page dans un instant.
        </p>
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
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">Pilotage</p>
        <h1 className="text-3xl font-semibold tracking-tight">Indicateurs</h1>
        <p className="mt-1 text-sm text-[color:var(--color-g-500)]">
          Cinq repères pour savoir si votre entreprise est en bonne santé.
        </p>
      </header>

      <Section titre="Marge par canal" explication="La marge brute, c'est ce qui reste d'une vente une fois payé le coût de fabrication de la pièce.">
        {!aDesVentes ? (
          <Vide />
        ) : (
          <>
            <Tableau
              entetes={["Canal", "Pièces vendues", "Chiffre d'affaires HT", "Marge brute", "Marge (en % du CA)"]}
              lignes={[
                ...canaux.map((c) => ligneMarge(c.libelle, marges.parCanal[c.cle])),
                ligneMarge("Total", marges.total),
              ]}
            />
            {marges.produitsIgnores.length > 0 && (
              <p className="text-xs text-[color:var(--color-g-500)]">
                {marges.produitsIgnores.length} produit(s) vendu(s) sont exclus du calcul : leur coût de revient ou leur prix est inconnu.
              </p>
            )}
          </>
        )}
      </Section>

      <Section titre="Point mort" explication="Le point mort, c'est le niveau de ventes à partir duquel vous ne perdez plus d'argent chaque mois.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Carte libelle="Salaires et cotisations">{eur(pointMort.chargesFixes.salaires)}</Carte>
          <Carte libelle="Loyer">{eur(pointMort.chargesFixes.loyer)}</Carte>
          <Carte libelle="Intérêts des prêts">{eur(pointMort.chargesFixes.interetsPrets)}</Carte>
          <Carte libelle="Charges fixes par mois">{eur(pointMort.chargesFixes.total)}</Carte>
        </div>
        {pointMort.piecesPointMort === null || pointMort.chiffreAffairesPointMortHt === null ? (
          <p className="text-sm text-[color:var(--color-g-500)]">
            {aDesVentes
              ? "Point mort non calculable : vos ventes ne dégagent pas encore de marge positive."
              : AUCUNE_DONNEE}
          </p>
        ) : (
          <p className="text-sm">
            Il vous faut vendre environ <span className="chiffre font-medium">{Math.ceil(pointMort.piecesPointMort)}</span> pièces
            par mois, soit <span className="chiffre font-medium">{formaterEuros(pointMort.chiffreAffairesPointMortHt)}</span> € de
            chiffre d'affaires hors taxes.
          </p>
        )}
      </Section>

      <Section titre="Besoin en fonds de roulement" explication="C'est l'argent immobilisé par votre activité : ce que vous avez en stock ou que l'on vous doit, moins ce que vous devez à vos fournisseurs.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Carte libelle="Stocks">{eur(bfr.stocks)}</Carte>
          <Carte libelle="Créances clients">{eur(bfr.creances)}</Carte>
          <Carte libelle="Dettes fournisseurs">{eur(bfr.dettesFournisseurs)}</Carte>
          <Carte libelle="Besoin">{eur(bfr.besoin)}</Carte>
        </div>
      </Section>

      <Section titre="Trésorerie des 3 prochains mois" explication="Une prévision de votre compte en banque si vos ventes gardent leur rythme actuel ; elle ne compte pas vos futurs achats de matière ni la TVA.">
        {previsionnel.premierMoisDecouvert !== null && (
          <p
            role="alert"
            className="rounded-md border border-[color:var(--color-erreur)] px-4 py-3 text-sm text-[color:var(--color-erreur)]"
          >
            Attention : votre trésorerie prévue passe sous zéro au mois de jeu {previsionnel.premierMoisDecouvert}. Pensez à
            réduire vos dépenses ou à emprunter.
          </p>
        )}
        <p className="text-sm">
          Trésorerie de départ : <span className="chiffre font-medium">{eur(previsionnel.tresorerieDepart)}</span>
        </p>
        <Tableau
          entetes={["Mois de jeu", "Ventes directes", "Revendeurs", "Salaires", "Loyer", "Prêts", "Fournisseurs", "Flux net", "Trésorerie fin de mois"]}
          lignes={previsionnel.mois.map((m) => [
            String(m.mois),
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

      <Section titre="Endettement" explication="Le ratio dettes sur capitaux propres compare ce que vous devez aux banques à ce que vos associés ont mis et gagné : plus il est haut, plus vous êtes fragile.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Carte libelle="Dettes financières">{eur(endettement.dettesFinancieres)}</Carte>
          <Carte libelle="Mensualités du mois">{eur(endettement.mensualitesDuMois)}</Carte>
          <Carte libelle="Capitaux propres">{eur(endettement.capitauxPropres)}</Carte>
          <Carte libelle="Dettes / capitaux propres">
            {endettement.ratioDettesCapitauxPropres === null
              ? "Non calculable"
              : endettement.ratioDettesCapitauxPropres.toFixed(2).replace(".", ",")}
          </Carte>
        </div>
        {endettement.ratioDettesCapitauxPropres === null && (
          <p className="text-xs text-[color:var(--color-g-500)]">
            Le ratio n'a de sens que si vos capitaux propres sont positifs.
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
    <section className="mt-10 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider">{titre}</h2>
      <p className="text-sm text-[color:var(--color-g-500)]">{explication}</p>
      {children}
    </section>
  );
}

function Vide() {
  return (
    <p className="rounded-md border border-dashed border-[color:var(--color-g-300)] px-5 py-6 text-center text-sm text-[color:var(--color-g-500)]">
      {AUCUNE_DONNEE}
    </p>
  );
}

function Carte({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">{libelle}</p>
      <p className="chiffre mt-2 text-lg font-medium">{children}</p>
    </div>
  );
}

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[color:var(--color-g-200)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          <tr>
            {entetes.map((e, i) => (
              <th key={e} className={`px-4 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l[0]} className="border-t border-[color:var(--color-g-200)]">
              {l.map((c, i) => (
                <td key={i} className={`px-4 py-2 ${i === 0 ? "text-left" : "chiffre text-right"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
