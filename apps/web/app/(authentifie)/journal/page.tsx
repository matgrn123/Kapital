import Link from "next/link";
import type { DetailCloture } from "@kapital/server";
import { Alerte, Carte, EncadreNotion, Puce, SurTitre, Vide } from "../../../components/ui";
import { debriefDuMois } from "../../../lib/debrief";
import { formaterDateHeure } from "../../../lib/formatage";
import {
  COLONNES_EVENEMENTS,
  evenementAffiche,
  nouveautes,
  parMois,
  type LigneEvenementLue,
  type NomsJournal,
} from "../../../lib/journal";
import { creerClientServeur } from "../../../lib/supabase/server";
import { MarquerVu } from "./MarquerVu";

// Journal : tout ce qui est arrivé à la société, mois par mois (table evenements, migration 0041).
// Chaque clôture de mois y est racontée en trois phrases (lib/debrief.ts).

const LIMITE = 300;

export default async function PageJournal() {
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

  const vuJusqua = new Date().toISOString();
  const [visite, journal, produits, matieres] = await Promise.all([
    supabase.from("companies").select("derniere_visite_le").eq("id", entreprise.id).maybeSingle(),
    supabase
      .from("evenements")
      .select(COLONNES_EVENEMENTS)
      .eq("company_id", entreprise.id)
      .order("cree_le", { ascending: false })
      .limit(LIMITE),
    supabase.from("products").select("id, nom"),
    supabase.from("materials").select("id, nom, unite"),
  ]);

  const nomsProduits: Record<string, string> = Object.fromEntries(
    ((produits.data ?? []) as Array<{ id: string; nom: string }>).map((p) => [p.id, p.nom]),
  );
  const noms: NomsJournal = {
    produits: nomsProduits,
    matieres: Object.fromEntries(
      ((matieres.data ?? []) as Array<{ id: string; nom: string; unite: string }>).map((m) => [m.id, { nom: m.nom, unite: m.unite }]),
    ),
  };
  const lignes = (journal.data ?? []) as LigneEvenementLue[];
  const derniereVisite = (visite.data?.derniere_visite_le as string | null | undefined) ?? null;
  const nouveaux = new Set(nouveautes(lignes, derniereVisite).map((l) => l.id));
  const clotures = new Map(lignes.filter((l) => l.type === "cloture_mois" && l.detail).map((l) => [l.mois_jeu, l]));
  const mois = parMois(lignes.map((l) => evenementAffiche(l, noms)));

  return (
    <div className="flex flex-col gap-5">
      <MarquerVu jusqua={vuJusqua} />
      <header>
        <SurTitre>Ta société, mois par mois</SurTitre>
        <h1 className="text-[1.75rem] font-extrabold">Journal</h1>
        <p className="mt-1 max-w-[62ch] text-muted">
          Ta société tourne même quand tu n&apos;es pas là. Ici, tout ce qui lui est arrivé : livraisons, ruptures
          de stock, paiements des revendeurs, et le bilan de chaque mois clos.
        </p>
      </header>

      {journal.error ? (
        <Vide>Le journal n&apos;est pas encore disponible. Reviens dans quelques minutes.</Vide>
      ) : mois.length === 0 ? (
        <Vide>
          Rien pour l&apos;instant. Les livraisons, les ruptures de stock et la clôture de chaque mois de jeu
          s&apos;inscriront ici au fil du temps.
        </Vide>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            {mois.map((g) => {
              const cloture = clotures.get(g.mois);
              const debrief = cloture ? debriefDuMois(cloture.detail as unknown as DetailCloture, nomsProduits) : null;
              return (
                <Carte key={g.mois} surTitre={debrief ? "Mois clos" : "Mois en cours"} titre={`Mois ${g.mois}`}>
                  {debrief && (
                    <div className="mb-3 flex flex-col gap-1 rounded-[10px] bg-accent-soft px-3 py-2.5 text-[0.86rem]">
                      <SurTitre className="text-accent">Bilan du mois</SurTitre>
                      <p>{debrief.quoi}</p>
                      <p>{debrief.pourquoi}</p>
                      <p>
                        {debrief.essayer}{" "}
                        <Link href={debrief.lien.href} className="text-accent underline">
                          {debrief.lien.libelle}
                        </Link>
                      </p>
                    </div>
                  )}
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {g.evenements.map((e) => (
                      <li key={e.id}>
                        <Alerte ton={e.ton}>
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span>{e.texte}</span>
                            {e.lien && (
                              <Link href={e.lien.href} className="text-accent underline">
                                {e.lien.libelle}
                              </Link>
                            )}
                            <span className="text-[0.75rem] text-muted">{formaterDateHeure(e.quand)}</span>
                            {nouveaux.has(e.id) && <Puce ton="accent">Nouveau</Puce>}
                          </span>
                        </Alerte>
                      </li>
                    ))}
                  </ul>
                </Carte>
              );
            })}
            {lignes.length === LIMITE && (
              <p className="text-[0.8rem] text-muted">Seuls les {LIMITE} derniers événements sont affichés.</p>
            )}
          </div>
          <EncadreNotion titre="La clôture du mois">
            Chaque fin de mois de jeu, la société paie ce qui tombe à échéance : salaires, loyers, échéances de prêt,
            TVA du mois précédent. Le résultat du mois compare ce que tu as vendu à ce que tu as consommé ; la
            trésorerie, elle, suit l&apos;argent réellement sorti du compte. Les deux ne bougent pas toujours ensemble.
          </EncadreNotion>
        </div>
      )}
    </div>
  );
}
