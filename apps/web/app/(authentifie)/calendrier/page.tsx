import { chargerBatimentsV1 } from "@kapital/content";
import { Carte, EncadreNotion, EnTete, Puce } from "../../../components/ui";
import { dateHeureLisible, indexDuMoisDe, instantDuJeu } from "../../../lib/cadre";
import { friseDeLAnnee, NOMS_SAISONS, nomCollection, type MoisFrise, type TypeEvenementFrise } from "../../../lib/calendrier";
import { creerClientServeur } from "../../../lib/supabase/server";

// Calendrier : la vraie année civile, mois par mois, avec ce qui va arriver
// (fins de mois, échéances, livraisons, fins de bail, collections, clôture de l'exercice).
// L'horloge du jeu est l'horloge réelle, à l'heure de Paris. Tout vient de la base ;
// l'écran ne décide d'aucun chiffre.

export const dynamic = "force-dynamic";

const COULEUR_SAISON = {
  hiver: "bg-accent-soft text-accent",
  printemps: "bg-good-soft text-good",
  ete: "bg-thread-soft text-thread",
  automne: "bg-bad-soft text-bad",
} as const;

const PASTILLE: Record<TypeEvenementFrise, string> = {
  collection: "bg-thread",
  fin_de_bail: "bg-bad",
  livraison: "bg-good",
  echeance_pret: "bg-accent",
  cloture_exercice: "bg-ink",
  fin_de_mois: "bg-line",
};

export default async function PageCalendrier() {
  const supabase = await creerClientServeur();
  const { data: entreprises } = await supabase.from("companies").select("id, cree_le").limit(1);
  const entreprise = entreprises?.[0] as { id: string; cree_le: string | null } | undefined;
  if (!entreprise) return null;

  const [{ data: monde }, { data: prets }, { data: achats }, { data: productions }, { data: locaux }, { data: matieres }, { data: produits }] =
    await Promise.all([
      supabase.from("worlds").select("debut_reel").eq("etat", "actif").limit(1).maybeSingle(),
      supabase.from("loans").select("id").eq("company_id", entreprise.id).eq("statut", "actif"),
      supabase
        .from("purchase_orders")
        .select("material_id, quantite, instant_livraison_prevue")
        .eq("company_id", entreprise.id)
        .eq("statut", "en_cours"),
      supabase
        .from("production_orders")
        .select("product_id, quantite, instant_livraison_prevue")
        .eq("company_id", entreprise.id)
        .eq("statut", "en_cours"),
      supabase.from("workshops").select("batiment_id, mois_fin").eq("company_id", entreprise.id).not("mois_fin", "is", null),
      supabase.from("materials").select("id, nom"),
      supabase.from("products").select("id, nom"),
    ]);

  const pretsActifs = (prets ?? []) as { id: string }[];
  const { data: echeances } =
    pretsActifs.length === 0
      ? { data: [] }
      : await supabase
          .from("loan_schedules")
          .select("mois_jeu, instant_prevu, mensualite_centimes")
          .in("loan_id", pretsActifs.map((p) => p.id))
          .eq("statut", "a_venir");

  // Aujourd'hui : l'horloge commune, lue à l'instant du rendu sur le serveur.
  const maintenantJeu = instantDuJeu(Date.now(), (monde as { debut_reel?: string | null } | null)?.debut_reel ?? null);
  const creation = entreprise.cree_le ? Date.parse(entreprise.cree_le) : Number.NaN;

  const nomMatiere = new Map(((matieres ?? []) as { id: string; nom: string }[]).map((x) => [x.id, x.nom]));
  const nomProduit = new Map(((produits ?? []) as { id: string; nom: string }[]).map((x) => [x.id, x.nom]));
  const batiments = chargerBatimentsV1();
  const nombre = (n: unknown) => Number(n).toLocaleString("fr-FR");

  const frise = friseDeLAnnee({
    maintenantJeuMs: maintenantJeu,
    moisCreation: Number.isFinite(creation) ? indexDuMoisDe(creation) : null,
    echeances: ((echeances ?? []) as { mois_jeu: number | null; instant_prevu: string | null; mensualite_centimes: number }[]).map(
      (e) => ({
        moisJeu: e.mois_jeu === null ? null : Number(e.mois_jeu),
        instantPrevu: e.instant_prevu,
        mensualiteCentimes: Number(e.mensualite_centimes),
      }),
    ),
    livraisons: [
      ...((achats ?? []) as { material_id: string; quantite: number; instant_livraison_prevue: string }[]).map((a) => ({
        instant: a.instant_livraison_prevue,
        libelle: `Livraison de matière : ${nomMatiere.get(a.material_id) ?? "matière"} (${nombre(a.quantite)})`,
      })),
      ...((productions ?? []) as { product_id: string; quantite: number; instant_livraison_prevue: string }[]).map((p) => ({
        instant: p.instant_livraison_prevue,
        libelle: `Production livrée : ${nombre(p.quantite)} × ${nomProduit.get(p.product_id) ?? "produit"}`,
      })),
    ],
    finsDeBail: ((locaux ?? []) as { batiment_id: string | null; mois_fin: number }[]).map((l) => ({
      mois: Number(l.mois_fin),
      libelle: `Fin du bail : ${batiments.find((b) => b.id === l.batiment_id)?.nom ?? "local"}`,
    })),
  });

  return (
    <div className="flex flex-col gap-5">
      <EnTete
        surTitre="Temps du jeu"
        titre={`Calendrier ${frise.annee}`}
        action={<Puce ton="accent">Aujourd&apos;hui : {dateHeureLisible(maintenantJeu)}</Puce>}
      >
        La date du jeu est la vraie date, à l&apos;heure de Paris : un mois de jeu est un vrai mois. Voici ce qui
        t&apos;attend cette année, mois par mois.
      </EnTete>

      <Carte titre="L'année en un coup d'œil">
        <ol className="grid grid-cols-6 gap-[3px] sm:grid-cols-12" aria-label={`Mois de l'année ${frise.annee}`}>
          {frise.mois.map((mo) => (
            <li
              key={mo.index}
              title={`${mo.nom} ${frise.annee} · ${NOMS_SAISONS[mo.saison]}`}
              className={`flex h-10 flex-col items-center justify-center rounded-md text-[0.7rem] font-semibold uppercase ${
                COULEUR_SAISON[mo.saison]
              } ${mo.etat === "en_cours" ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""} ${
                mo.etat === "passe" || mo.etat === "avant_la_societe" ? "opacity-50" : ""
              }`}
            >
              <span>{mo.nom.slice(0, 3)}</span>
              {mo.evenements.some((e) => e.type !== "fin_de_mois") && (
                <span aria-hidden="true" className="mt-0.5 h-1 w-1 rounded-full bg-current" />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.78rem] text-muted">
          {(["hiver", "printemps", "ete", "automne"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <i className={`inline-block h-2.5 w-2.5 rounded-sm ${COULEUR_SAISON[s]}`} />
              {NOMS_SAISONS[s]}
            </span>
          ))}
        </div>
      </Carte>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {frise.mois.map((mo) => (
          <CarteMois key={mo.index} mois={mo} annee={frise.annee} jourCourant={frise.aujourdhui.jour} />
        ))}
      </div>

      {frise.plusTard.length > 0 && (
        <Carte titre="Plus tard" surTitre={`Après décembre ${frise.annee}`}>
          <ul className="flex flex-col gap-1.5 text-[0.86rem]">
            {frise.plusTard.slice(0, 8).map((p, i) => (
              <li key={`${p.quand}_${i}`} className="flex flex-wrap gap-x-2">
                <b className="min-w-[9.5rem]">{p.quand}</b>
                <span>{p.libelle}</span>
              </li>
            ))}
            {frise.plusTard.length > 8 && (
              <li className="text-muted">… et {frise.plusTard.length - 8} autres échéances ou livraisons.</li>
            )}
          </ul>
        </Carte>
      )}

      <EncadreNotion titre="L'exercice comptable et le calendrier de la mode">
        <p>
          Une société arrête ses comptes une fois par an, à la fin de son <b>exercice</b>. Ici, l&apos;exercice suit
          l&apos;année civile : le 31 décembre, on fait le bilan de l&apos;année et on calcule l&apos;impôt sur les
          sociétés.
        </p>
        <p className="mt-1.5">
          La mode vit au rythme de deux <b>collections</b> par an : printemps-été et automne-hiver. Chaque nouvelle
          collection arrive en boutique après les soldes ; ce qui reste de l&apos;ancienne devient plus difficile à vendre.
        </p>
      </EncadreNotion>
    </div>
  );
}

function CarteMois({ mois, annee, jourCourant }: { mois: MoisFrise; annee: number; jourCourant: number }) {
  const enCours = mois.etat === "en_cours";
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-[14px] border bg-surface ${
        enCours ? "border-accent shadow-carte" : "border-line"
      } ${mois.etat === "passe" || mois.etat === "avant_la_societe" ? "opacity-60" : ""}`}
    >
      <div className={`h-1.5 ${COULEUR_SAISON[mois.saison]}`} aria-hidden="true" />
      <div className="flex flex-col gap-2 p-3.5">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold capitalize">
              {mois.nom} <span className="font-medium normal-case text-muted">{annee}</span>
            </h3>
            <span className="text-[0.76rem] text-muted">
              {enCours ? `Jour ${jourCourant} sur ${mois.jours} · ` : ""}Collection {nomCollection(mois.collection)}
            </span>
          </div>
          {enCours ? (
            <Puce ton="accent">En cours</Puce>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${COULEUR_SAISON[mois.saison]}`}>
              {NOMS_SAISONS[mois.saison]}
            </span>
          )}
        </header>
        {mois.etat === "avant_la_societe" ? (
          <p className="text-[0.82rem] text-muted">Ta société n&apos;existait pas encore.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-[0.82rem]">
            {mois.evenements.map((e, i) => (
              <li key={`${e.type}_${i}`} className={`flex items-start gap-2 ${e.type === "fin_de_mois" ? "text-muted" : ""}`}>
                <span className="w-6 shrink-0 text-right tabular-nums text-muted">{e.jour}</span>
                <i className={`mt-[0.4rem] h-2 w-2 shrink-0 rounded-full ${PASTILLE[e.type]}`} aria-hidden="true" />
                <span className="min-w-0">{e.libelle}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
