import { creerClientServeur } from "../../../lib/supabase/server";
import { formaterEuros } from "../../../lib/formatage";
import { compteParNumero, PLAN_COMPTABLE, type TypeCompte } from "../../../lib/comptes";

type Ecriture = {
  compte: string;
  sens: "debit" | "credit";
  montant_centimes: number;
};

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

  const { data: entreprises } = await supabase.from("companies").select("id").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { data: ecritures } = await supabase
    .from("ledger_entries")
    .select("compte, sens, montant_centimes")
    .eq("company_id", entreprise.id);

  const ec = (ecritures ?? []) as Ecriture[];
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

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="border-b border-[color:var(--color-g-200)] pb-6">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Comptabilité
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Finances</h1>
        <p className="mt-1 text-sm text-[color:var(--color-g-500)]">
          Les trois documents comptables depuis votre création. Mode cumulatif,
          pas encore de filtre mensuel.
        </p>
      </header>

      <section className="mt-10 grid grid-cols-3 gap-4">
        <Carte
          libelle="Résultat net"
          aide="Produits moins charges. Ce qui reste à l'entreprise après avoir payé tout le monde."
        >
          <span className={`chiffre ${resultat < 0 ? "text-[color:var(--color-erreur)]" : ""}`}>
            {formaterEuros(resultat)} €
          </span>
        </Carte>
        <Carte
          libelle="Trésorerie"
          aide="Argent disponible en banque (solde du compte 512). Différent du résultat."
        >
          <span className="chiffre">{formaterEuros(tresorerie)} €</span>
        </Carte>
        <Carte
          libelle="Total actif"
          aide="Tout ce que l'entreprise possède : banque, stocks, créances clients."
        >
          <span className="chiffre">{formaterEuros(totalActif)} €</span>
        </Carte>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-6">
        <Document titre="Compte de résultat" sousTitre="depuis la création">
          <GroupeLignes
            titre="Produits (ce que l'entreprise gagne)"
            comptes={comptesProduits}
            soldes={soldes}
          />
          <Total libelle="Total produits" montant={totalProduits} />
          <GroupeLignes
            titre="Charges (ce que l'entreprise dépense)"
            comptes={comptesCharges}
            soldes={soldes}
          />
          <Total libelle="Total charges" montant={totalCharges} />
          <Total libelle="Résultat net" montant={resultat} fort />
        </Document>

        <Document titre="Bilan" sousTitre="instantané à aujourd'hui">
          <GroupeLignes
            titre="Actif (ce qu'on possède)"
            comptes={comptesActifs}
            soldes={soldes}
          />
          <Total libelle="Total actif" montant={totalActif} />
          <GroupeLignes
            titre="Passif (ce qu'on doit)"
            comptes={comptesPassifs}
            soldes={soldes}
          />
          <Total libelle="Dont résultat" montant={resultat} discret />
          <Total libelle="Total passif + résultat" montant={totalPassif + resultat} fort />
        </Document>
      </section>

      <section className="mt-6">
        <Document titre="Trésorerie" sousTitre="solde du compte 512 Banque">
          <p className="text-sm text-[color:var(--color-g-700)]">
            Solde actuel : <span className="chiffre font-medium">{formaterEuros(tresorerie)} €</span>.
            Le détail des entrées et sorties sera affiché quand le processeur
            d'événements sera branché sur Supabase.
          </p>
        </Document>
      </section>

      <section className="mt-6">
        <div
          className={`rounded-md border p-4 ${
            bilanOk
              ? "border-[color:var(--color-g-200)]"
              : "border-[color:var(--color-erreur)]"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
                Vérification de concordance
              </p>
              <p className="mt-1 text-sm">
                Actif <span className="chiffre font-medium">{formaterEuros(totalActif)} €</span>{" "}
                {bilanOk ? "=" : "≠"} Passif + Résultat{" "}
                <span className="chiffre font-medium">
                  {formaterEuros(totalPassif + resultat)} €
                </span>
              </p>
            </div>
            <p className={`text-sm font-medium ${bilanOk ? "text-[color:var(--color-succes)]" : "text-[color:var(--color-erreur)]"}`}>
              {bilanOk ? "Équilibré" : "Déséquilibré"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Carte({
  libelle,
  aide,
  children,
}: {
  libelle: string;
  aide: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-g-200)] p-4">
      <p
        className="cursor-help text-xs uppercase tracking-wider text-[color:var(--color-g-500)]"
        title={aide}
      >
        {libelle} <span className="text-[color:var(--color-g-300)]">?</span>
      </p>
      <p className="mt-2 text-xl font-medium">{children}</p>
    </div>
  );
}

function Document({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-md border border-[color:var(--color-g-200)]">
      <header className="border-b border-[color:var(--color-g-200)] px-5 py-3">
        <h2 className="text-sm font-semibold">{titre}</h2>
        <p className="text-xs text-[color:var(--color-g-500)]">{sousTitre}</p>
      </header>
      <div className="divide-y divide-[color:var(--color-g-200)]">{children}</div>
    </article>
  );
}

function GroupeLignes({
  titre,
  comptes,
  soldes,
}: {
  titre: string;
  comptes: readonly CompteV1Like[];
  soldes: SoldesParCompte;
}) {
  if (comptes.length === 0) {
    return (
      <div className="px-5 py-3">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          {titre}
        </p>
        <p className="mt-1 text-xs text-[color:var(--color-g-500)]">(aucun)</p>
      </div>
    );
  }
  return (
    <div className="px-5 py-3">
      <p className="mb-2 text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
        {titre}
      </p>
      <dl className="space-y-1">
        {comptes.map((c) => (
          <div key={c.numero} className="flex justify-between text-sm">
            <dt>
              <span className="chiffre text-[color:var(--color-g-500)]">{c.numero}</span>{" "}
              <span>{c.libelle}</span>
            </dt>
            <dd className="chiffre">{formaterEuros(soldes.get(c.numero) ?? 0)} €</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Total({
  libelle,
  montant,
  fort,
  discret,
}: {
  libelle: string;
  montant: number;
  fort?: boolean;
  discret?: boolean;
}) {
  return (
    <div
      className={`flex justify-between px-5 py-2 text-sm ${
        fort ? "bg-[color:var(--color-g-100)] font-semibold" : ""
      } ${discret ? "text-[color:var(--color-g-500)]" : ""}`}
    >
      <span>{libelle}</span>
      <span className={`chiffre ${montant < 0 && !discret ? "text-[color:var(--color-erreur)]" : ""}`}>
        {formaterEuros(montant)} €
      </span>
    </div>
  );
}

type CompteV1Like = { numero: string; libelle: string };
