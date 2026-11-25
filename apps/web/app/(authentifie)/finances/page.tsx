import { Carte, Courbe, Kpi } from "../../../components/ui";
import { EnTete, Ligne, Message } from "../../../components/ui/formulaire";
import { creerClientServeur } from "../../../lib/supabase/server";
import { tresorerieFinDeMois, type LigneGrandLivre } from "../../../lib/tableau";
import { formaterEuros } from "../../../lib/formatage";
import { compteParNumero, PLAN_COMPTABLE, type TypeCompte } from "../../../lib/comptes";

type Ecriture = Pick<LigneGrandLivre, "compte" | "sens" | "montant_centimes">;

type SoldesParCompte = Map<string, number>;

const COTE_NORMAL: Record<TypeCompte, "debit" | "credit"> = {
  actif: "debit",
  passif: "credit",
  charges: "debit",
  produits: "credit",
};

function calculerSoldes(ecritures: readonly Ecriture[]): SoldesParCompte {
  const soldes: SoldesParCompte = new Map();
  for (const compte of PLAN_COMPTABLE) soldes.set(compte.numero, 0);
  for (const e of ecritures) {
    const compte = compteParNumero(e.compte);
    if (!compte) continue;
    const signe = e.sens === COTE_NORMAL[compte.type] ? 1 : -1;
    soldes.set(compte.numero, (soldes.get(compte.numero) ?? 0) + signe * e.montant_centimes);
  }
  return soldes;
}

function solde(soldes: SoldesParCompte, num: string): number {
  return soldes.get(num) ?? 0;
}

export default async function PageFinances() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: entreprises } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_profile_id", user?.id ?? "")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const [{ data: ecritures }, { data: monde }] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("ecriture_id, mois_jeu, libelle, compte, sens, montant_centimes, cree_le")
      .eq("company_id", entreprise.id),
    supabase.from("worlds").select("mois_courant").limit(1).maybeSingle(),
  ]);

  const ec = (ecritures ?? []) as LigneGrandLivre[];
  const soldes = calculerSoldes(ec);

  const comptesActifs = PLAN_COMPTABLE.filter((c) => c.type === "actif" && solde(soldes, c.numero) !== 0);
  const comptesPassifs = PLAN_COMPTABLE.filter((c) => c.type === "passif" && solde(soldes, c.numero) !== 0);
  const comptesCharges = PLAN_COMPTABLE.filter((c) => c.type === "charges" && solde(soldes, c.numero) !== 0);
  const comptesProduits = PLAN_COMPTABLE.filter((c) => c.type === "produits" && solde(soldes, c.numero) !== 0);

  const totalActif = comptesActifs.reduce((s, c) => s + solde(soldes, c.numero), 0);
  const totalPassif = comptesPassifs.reduce((s, c) => s + solde(soldes, c.numero), 0);
  const totalCharges = comptesCharges.reduce((s, c) => s + solde(soldes, c.numero), 0);
  const totalProduits = comptesProduits.reduce((s, c) => s + solde(soldes, c.numero), 0);
  const resultat = totalProduits - totalCharges;

  const bilanOk = totalActif === totalPassif + resultat;
  const tresorerie = solde(soldes, "512");
  const moisCourant = monde?.mois_courant ?? 0;
  const courbe = tresorerieFinDeMois(ec, moisCourant, 12);

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Comptabilité" titre="Finances">
        Les trois documents comptables depuis ta création, en cumulé (pas encore de filtre par mois).
      </EnTete>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          libelle="Résultat net"
          valeur={eur(resultat)}
          detail="Produits moins charges : ce qui reste après avoir payé tout le monde."
          ton={resultat < 0 ? "critique" : "neutre"}
        />
        <Kpi libelle="Trésorerie" valeur={eur(tresorerie)} detail="Argent en banque (compte 512). Différent du résultat." ton={tresorerie < 0 ? "critique" : "neutre"} />
        <Kpi libelle="Total actif" valeur={eur(totalActif)} detail="Tout ce que l'entreprise possède : banque, stocks, créances." />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Carte titre="Compte de résultat" surTitre="Depuis la création">
          <Groupe titre="Produits (ce que l'entreprise gagne)" comptes={comptesProduits} soldes={soldes} />
          <Ligne libelle="Total produits" fort>{eur(totalProduits)}</Ligne>
          <Groupe titre="Charges (ce que l'entreprise dépense)" comptes={comptesCharges} soldes={soldes} />
          <Ligne libelle="Total charges" fort>{eur(totalCharges)}</Ligne>
          <Ligne libelle="Résultat net" fort ton={resultat < 0 ? "critique" : "bon"}>{eur(resultat)}</Ligne>
        </Carte>

        <Carte titre="Bilan" surTitre="À aujourd'hui">
          <Groupe titre="Actif (ce qu'on possède)" comptes={comptesActifs} soldes={soldes} />
          <Ligne libelle="Total actif" fort>{eur(totalActif)}</Ligne>
          <Groupe titre="Passif (ce qu'on doit)" comptes={comptesPassifs} soldes={soldes} />
          <Ligne libelle="Dont résultat">{eur(resultat)}</Ligne>
          <Ligne libelle="Total passif + résultat" fort>{eur(totalPassif + resultat)}</Ligne>
        </Carte>
      </div>

      <Carte titre="Trésorerie" surTitre="Solde du compte 512 à la fin de chaque mois">
        <Courbe valeurs={courbe} titre="Trésorerie en fin de mois" hauteur={70} />
        <Ligne libelle="Solde actuel" fort>{eur(tresorerie)}</Ligne>
      </Carte>

      <Message ton={bilanOk ? "succes" : "erreur"}>
        Vérification : actif {eur(totalActif)} {bilanOk ? "=" : "≠"} passif + résultat {eur(totalPassif + resultat)}.{" "}
        {bilanOk ? "Le bilan est équilibré." : "Le bilan est déséquilibré."}
      </Message>
    </div>
  );
}

function eur(c: number): string {
  return `${formaterEuros(c)} €`;
}

function Groupe({
  titre,
  comptes,
  soldes,
}: {
  titre: string;
  comptes: readonly { numero: string; libelle: string }[];
  soldes: SoldesParCompte;
}) {
  return (
    <div className="mb-2 mt-3 first:mt-0">
      <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">{titre}</p>
      {comptes.length === 0 ? (
        <p className="text-[0.84rem] text-muted">(aucun)</p>
      ) : (
        comptes.map((c) => (
          <Ligne
            key={c.numero}
            libelle={
              <>
                <span className="tabular-nums text-muted">{c.numero}</span> {c.libelle}
              </>
            }
          >
            {eur(soldes.get(c.numero) ?? 0)}
          </Ligne>
        ))
      )}
    </div>
  );
}
