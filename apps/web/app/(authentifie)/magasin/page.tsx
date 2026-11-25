import { chargerBatimentsV1, chargerParametresV1 } from "@kapital/content";
import { etapeEffective, seuilsEtapesDepuis, type EtapeEntreprise } from "@kapital/engine";
import { Carte, EncadreNotion, FilRouge, Jauge } from "../../../components/ui";
import { EnTete, Verrou, Vide } from "../../../components/ui/formulaire";
import { formaterEuros } from "../../../lib/formatage";
import { creerClientServeur } from "../../../lib/supabase/server";
import { conditionsBoutique } from "../societe/donnees";

// Magasin physique (maquette V2, V.magasin), VERROUILLÉ : la boutique réelle
// arrive avec les tickets AE-9 à AE-11. Aucune action possible ici.

export const dynamic = "force-dynamic";

export default async function PageMagasin() {
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: entreprises } = await supabase
    .from("companies")
    .select("id, etape, tresorerie_centimes, pieces_vendues_total, chiffre_affaires_cumule_ht_centimes")
    .eq("owner_profile_id", user?.id ?? "")
    .limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const params = chargerParametresV1();
  const conditions = conditionsBoutique(
    {
      etape: etapeEffective(entreprise.etape as EtapeEntreprise, params),
      piecesVendues: Number(entreprise.pieces_vendues_total),
      chiffreAffairesHt: Number(entreprise.chiffre_affaires_cumule_ht_centimes),
      tresorerie: Number(entreprise.tresorerie_centimes),
    },
    seuilsEtapesDepuis(params),
  );
  const boutiques = chargerBatimentsV1().filter((b) => String(b.categorie) === "boutique");

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Pignon sur rue" titre="Ouvrir un magasin physique">
        Le grand pas : une boutique à ton nom. Avant, il faut une marque qui vend déjà et des comptes solides.
      </EnTete>

      <Verrou>
        <p className="font-semibold">La boutique arrive avec une prochaine étape.</p>
        <p>Rien à faire ici pour l&apos;instant : cet écran te montre le chemin.</p>
      </Verrou>

      <div className="grid gap-4 md:grid-cols-2">
        <Carte titre="Avant la boutique : atteindre l'étape 2">
          <div className="flex flex-col gap-3">
            {conditions.map((c) => (
              <Jauge
                key={c.cle}
                libelle={c.libelle}
                valeur={c.valeur}
                max={c.max}
                texte={c.texte}
                ton={c.remplie ? "bon" : "or"}
              />
            ))}
          </div>
          <p className="mt-3 text-[0.84rem] text-muted">
            Ce sont les conditions de l&apos;étape 2, lues dans le moteur du jeu. Les conditions propres à la boutique
            ne sont pas encore fixées.
          </p>
        </Carte>

        <Carte titre="Emplacements">
          {boutiques.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
              {boutiques.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled
                  className="flex cursor-not-allowed flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-left opacity-60"
                >
                  <b>{b.nom}</b>
                  <span className="text-[0.8rem] text-muted">{b.surface_m2} m²</span>
                  <span className="text-[0.8rem] font-semibold tabular-nums">
                    {formaterEuros(b.loyer_mensuel_centimes)} €/mois
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Vide>
              Aucun emplacement de boutique n&apos;est encore au catalogue des bâtiments. Les adresses, leurs loyers et
              leurs passants seront ajoutés avec la boutique.
            </Vide>
          )}
        </Carte>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <EncadreNotion titre="Le bail commercial">
          Pour ouvrir une boutique, on loue en général le local avec un bail commercial, signé pour plusieurs années.
          On verse souvent un dépôt de garantie : ce n&apos;est pas une charge, tu le récupères en partant, il reste à
          l&apos;actif.
        </EncadreNotion>
        <EncadreNotion titre="Le seuil de rentabilité">
          Une boutique ajoute des charges fixes : le loyer, le salaire du vendeur, l&apos;agencement. Le seuil de
          rentabilité, c&apos;est le chiffre d&apos;affaires à partir duquel la marge couvre ces charges. En dessous, la
          boutique perd de l&apos;argent chaque mois.
        </EncadreNotion>
      </div>
      <FilRouge ecran="magasin" />
    </div>
  );
}
