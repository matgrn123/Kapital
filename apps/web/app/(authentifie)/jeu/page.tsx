import Link from "next/link";
import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros, formaterDateHeure } from "../../../lib/formatage";
import { chargerProgressionMissions } from "../../../lib/missions";
import { DEFINITIONS_MISSIONS } from "@kapital/engine";

type Ecriture = {
  id: string;
  mois_jeu: number;
  libelle: string;
  compte: string;
  sens: "debit" | "credit";
  montant_centimes: number;
  cree_le: string;
};

export default async function PageJeu() {
  const supabase = await creerClientServeur();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, nom, gamme, etape, statut, tresorerie_centimes, cree_le")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { data: monde } = await supabase
    .from("worlds")
    .select("mois_courant")
    .limit(1)
    .maybeSingle();
  const moisCourant = monde?.mois_courant ?? 0;

  const { data: ecritures } = await supabase
    .from("ledger_entries")
    .select("id, mois_jeu, libelle, compte, sens, montant_centimes, cree_le")
    .eq("company_id", entreprise.id)
    .order("cree_le", { ascending: false })
    .limit(10);

  const dernieres = (ecritures ?? []) as Ecriture[];

  // Agregats du mois en cours : CA (707 credit), coût (7135 debit), encaissement (512)
  const { data: ecrituresMois } = await supabase
    .from("ledger_entries")
    .select("compte, sens, montant_centimes")
    .eq("company_id", entreprise.id)
    .eq("mois_jeu", moisCourant);

  let caMois = 0;
  let coutMois = 0;
  for (const e of (ecrituresMois ?? []) as Array<{
    compte: string;
    sens: "debit" | "credit";
    montant_centimes: number;
  }>) {
    if (e.compte === "707") {
      caMois += e.sens === "credit" ? e.montant_centimes : -e.montant_centimes;
    }
    if (e.compte === "7135") {
      coutMois += e.sens === "debit" ? e.montant_centimes : -e.montant_centimes;
    }
  }
  const margeMois = caMois - coutMois;

  // Stock : est-ce que le joueur a au moins un produit avec du stock ?
  const { data: stocks } = await supabase
    .from("product_stock")
    .select("quantite_pieces")
    .eq("company_id", entreprise.id);
  const stockTotal = ((stocks ?? []) as Array<{ quantite_pieces: number }>)
    .reduce((s, x) => s + x.quantite_pieces, 0);

  // Catalogue : est-ce que le joueur a un produit avec un prix > 0 ?
  const { data: catalogue } = await supabase
    .from("company_products")
    .select("prix_vente_directe_centimes")
    .eq("company_id", entreprise.id);
  const aUnProduitEnVente = ((catalogue ?? []) as Array<{
    prix_vente_directe_centimes: number;
  }>).some((p) => p.prix_vente_directe_centimes > 0);

  const progressions = (await chargerProgressionMissions(supabase, entreprise.id)) ?? [];
  const missionACourante =
    progressions.find((p) => p.etat !== "validee") ?? progressions[0];
  const defACourante = DEFINITIONS_MISSIONS.find(
    (d) => d.id === missionACourante?.id,
  );

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="flex items-end justify-between border-b border-[color:var(--color-g-200)] pb-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
            Tableau de bord
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {entreprise.nom}
          </h1>
        </div>
        <div className="text-right text-xs text-[color:var(--color-g-500)]">
          <p>Gamme <span className="font-medium text-[color:var(--color-noir)] capitalize">{entreprise.gamme}</span></p>
          <p>Étape <span className="chiffre font-medium text-[color:var(--color-noir)]">{entreprise.etape}</span></p>
          <p>Statut <span className="font-medium text-[color:var(--color-noir)]">{entreprise.statut}</span></p>
        </div>
      </header>

      <section className="mt-10 grid grid-cols-4 gap-4">
        <Carte libelle="Trésorerie">
          <span className="chiffre">{formaterEuros(entreprise.tresorerie_centimes)} €</span>
        </Carte>
        <Carte libelle="Chiffre d'affaires">
          <span className="chiffre">{formaterEuros(caMois)} €</span>
          <span className="block text-xs text-[color:var(--color-g-500)]">mois {moisCourant}</span>
        </Carte>
        <Carte libelle="Marge brute">
          <span className="chiffre">{formaterEuros(margeMois)} €</span>
          <span className="block text-xs text-[color:var(--color-g-500)]">mois {moisCourant}</span>
        </Carte>
        <Carte libelle="Coût de revient">
          <span className="chiffre">{formaterEuros(coutMois)} €</span>
          <span className="block text-xs text-[color:var(--color-g-500)]">mois {moisCourant}</span>
        </Carte>
      </section>

      <section className="mt-10 grid grid-cols-5 gap-6">
        <div className="col-span-3 rounded-md border border-[color:var(--color-g-200)]">
          <header className="flex items-center justify-between border-b border-[color:var(--color-g-200)] px-5 py-3">
            <h2 className="text-sm font-semibold">Dernières écritures</h2>
            <p className="text-xs text-[color:var(--color-g-500)]">
              {dernieres.length === 0 ? "aucune" : dernieres.length}
            </p>
          </header>
          {dernieres.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[color:var(--color-g-500)]">
              Aucune activité encore. Commencez par passer une commande de
              matière ou embaucher un artisan.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-g-100)] text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Libellé</th>
                  <th className="px-5 py-2 text-left font-medium">Compte</th>
                  <th className="px-5 py-2 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {dernieres.map((e) => (
                  <tr key={e.id} className="border-t border-[color:var(--color-g-200)]">
                    <td className="px-5 py-2">
                      <p>{e.libelle}</p>
                      <p className="text-xs text-[color:var(--color-g-500)]">
                        {formaterDateHeure(e.cree_le)}
                      </p>
                    </td>
                    <td className="chiffre px-5 py-2 text-[color:var(--color-g-700)]">{e.compte}</td>
                    <td className="chiffre px-5 py-2 text-right">
                      <span className={e.sens === "debit" ? "" : "text-[color:var(--color-g-500)]"}>
                        {e.sens === "debit" ? "" : "-"}
                        {formaterEuros(e.montant_centimes)} €
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="col-span-2 space-y-4">
          {caMois === 0 && (
            <div className="rounded-md border border-[color:var(--color-g-900)] bg-[color:var(--color-g-100)] p-5">
              <h3 className="text-sm font-semibold">Comment vendre ?</h3>
              <ol className="mt-3 space-y-2 text-sm text-[color:var(--color-g-700)]">
                <li>
                  <span className="chiffre mr-2 text-[color:var(--color-g-500)]">1.</span>
                  {aUnProduitEnVente ? (
                    <span>
                      <span className="line-through text-[color:var(--color-g-500)]">
                        Fixer un prix sur un produit
                      </span>{" "}
                      ✓
                    </span>
                  ) : (
                    <>
                      Ajouter un produit au catalogue et fixer un prix{" "}
                      <Link href="/produits" className="underline">
                        (page Produits)
                      </Link>
                    </>
                  )}
                </li>
                <li>
                  <span className="chiffre mr-2 text-[color:var(--color-g-500)]">2.</span>
                  {stockTotal > 0 ? (
                    <span>
                      <span className="line-through text-[color:var(--color-g-500)]">
                        Avoir du stock disponible
                      </span>{" "}
                      ({stockTotal} pièces) ✓
                    </span>
                  ) : (
                    <>
                      Avoir du stock à vendre : clique{" "}
                      <Link href="/produits" className="underline">
                        "+100 (recette)"
                      </Link>{" "}
                      sur un produit
                    </>
                  )}
                </li>
                <li>
                  <span className="chiffre mr-2 text-[color:var(--color-g-500)]">3.</span>
                  Attendre qu'un mois s'écoule (ou bouton{" "}
                  <Link href="/admin" className="underline">Avancer</Link> si admin)
                </li>
              </ol>
            </div>
          )}
          <div className="rounded-md border border-[color:var(--color-g-200)] p-5">
            <h3 className="text-sm font-semibold">Alertes</h3>
            <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
              {caMois === 0 ? "Pas de vente ce mois-ci." : "Aucune alerte pour l'instant."}
            </p>
          </div>
          <div className="rounded-md border border-[color:var(--color-g-200)] p-5">
            <h3 className="text-sm font-semibold">Prochain événement</h3>
            <p className="mt-2 text-sm text-[color:var(--color-g-500)]">
              Pas de livraison ni d'échéance planifiée.
            </p>
          </div>
          {defACourante && missionACourante && (
            <Link
              href="/missions"
              className="block rounded-md border border-dashed border-[color:var(--color-g-300)] p-5 transition hover:border-[color:var(--color-g-500)] hover:bg-[color:var(--color-g-100)]"
            >
              <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                Mission {defACourante.numero}
                {missionACourante.etat === "validee" ? " — validée" : ""}
              </p>
              <h3 className="mt-1 text-sm font-semibold">{defACourante.titre}</h3>
              <p className="mt-2 text-sm text-[color:var(--color-g-700)]">
                {defACourante.objectif}
              </p>
              <p className="chiffre mt-3 text-xs text-[color:var(--color-g-500)]">
                {missionACourante.cible > 0
                  ? `${missionACourante.actuel} / ${missionACourante.cible}`
                  : "voir le détail →"}
              </p>
            </Link>
          )}
        </aside>
      </section>
    </div>
  );
}

function Carte({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
        {libelle}
      </p>
      <p className="mt-2 text-xl font-medium">{children}</p>
    </div>
  );
}
