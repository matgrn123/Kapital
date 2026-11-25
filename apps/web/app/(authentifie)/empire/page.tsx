import { chargerBatimentsV1 } from "@kapital/content";
import { BoutonLien, Carte, EncadreNotion, Puce } from "../../../components/ui";
import { EnTete, Etapes, Faits, Vide } from "../../../components/ui/formulaire";
import { batimentsDeLEmpire, LIBELLE_CATEGORIE, type LocalDuJoueur } from "../../../lib/empire";
import { formaterEuros } from "../../../lib/formatage";
import { creerClientServeur } from "../../../lib/supabase/server";
import { VignetteBatiment } from "./VignetteBatiment";

// 3D-8 : « Mon Empire », tous les bâtiments du joueur connecté : 3D-7, tous ses locaux ; la liste
// s'allongera avec la boutique (lib/empire.ts).

export default async function PageEmpire() {
  const supabase = await creerClientServeur();
  const { data: entreprises } = await supabase.from("companies").select("id, nom").limit(1);
  const entreprise = entreprises?.[0] as { id: string; nom: string } | undefined;
  if (!entreprise) return null;

  const { data: ateliers } = await supabase
    .from("workshops")
    .select("id, batiment_id, surface_m2, loyer_mensuel_centimes, charges_mensuelles_centimes, mode_detention")
    .eq("company_id", entreprise.id)
    .order("cree_le");

  const batiments = batimentsDeLEmpire({ ateliers: (ateliers ?? []) as LocalDuJoueur[] }, chargerBatimentsV1());
  const loyers = batiments.reduce((s, b) => s + (b.mode === "locataire" ? b.loyerMensuelCentimes + b.chargesMensuellesCentimes : 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <EnTete
        surTitre={entreprise.nom}
        titre="Mon Empire"
        action={<BoutonLien href={`/societes/${entreprise.id}`}>Mon profil public</BoutonLien>}
      >
        Tous les bâtiments de ta société. Les autres joueurs en voient l&apos;extérieur, jamais l&apos;intérieur ni tes
        chiffres du jour.
      </EnTete>

      {batiments.length === 0 ? (
        <Carte titre="Ton empire commence ici">
          <div className="flex flex-col gap-3">
            <Vide>
              Tu n&apos;as encore aucun bâtiment. Tu peux vendre en faisant produire chez un façonnier, mais pour produire
              toi-même il te faut un local.
            </Vide>
            <Etapes
              etapes={[
                "Choisis un local : louer coûte peu au départ, acheter immobilise ta trésorerie.",
                "Aménage ton atelier : machines, tables de coupe, stockage.",
                "Embauche des artisans pour faire tourner les machines.",
              ]}
            />
            <div>
              <BoutonLien href="/locaux" variante="principal">
                Voir les locaux disponibles
              </BoutonLien>
            </div>
          </div>
        </Carte>
      ) : (
        <>
          <p className="text-[0.86rem] text-muted">
            {batiments.length} bâtiment{batiments.length > 1 ? "s" : ""}
            {loyers > 0 ? ` · ${formaterEuros(loyers)} € de loyer et charges par mois de jeu` : ""}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {batiments.map((b) => (
              <Carte
                key={b.cle}
                surTitre={LIBELLE_CATEGORIE[b.categorie] ?? b.categorie}
                titre={b.nom}
                action={<Puce ton={b.mode === "proprietaire" ? "bon" : "neutre"}>{b.mode === "proprietaire" ? "Propriétaire" : "Locataire"}</Puce>}
              >
                <div className="flex flex-col gap-3">
                  <VignetteBatiment
                    categorie={b.categorie}
                    nbEtages={b.nbEtages}
                    surfaceM2={b.surfaceM2}
                    enseigne={entreprise.nom}
                    titre={`${b.nom} de ${entreprise.nom}`}
                  />
                  <Faits
                    lignes={[
                      ["Surface", `${b.surfaceM2} m²`],
                      ["Niveaux", String(b.nbEtages)],
                      b.mode === "locataire"
                        ? ["Loyer", `${formaterEuros(b.loyerMensuelCentimes)} € / mois`]
                        : ["Loyer", "Aucun : tu es propriétaire"],
                      ...(b.mode === "locataire" && b.chargesMensuellesCentimes > 0
                        ? [["Charges", `${formaterEuros(b.chargesMensuellesCentimes)} € / mois`] as const]
                        : []),
                    ]}
                  />
                  <div className="flex flex-wrap gap-2">
                    {b.liens.map((l, i) => (
                      <BoutonLien key={l.href} href={l.href} petit variante={i === 0 ? "principal" : "secondaire"}>
                        {l.libelle}
                      </BoutonLien>
                    ))}
                  </div>
                </div>
              </Carte>
            ))}
          </div>
        </>
      )}

      <EncadreNotion titre="Ce que tu apprends : louer ou posséder ses murs">
        Un locataire paie un loyer chaque mois, en charge : il garde sa trésorerie pour produire. Un propriétaire ne paie
        pas de loyer, mais son argent est immobilisé dans le bâtiment (à l&apos;actif du bilan) et il rembourse son
        crédit s&apos;il en a pris un. Ce qui se voit de l&apos;extérieur ne dit rien de qui possède les murs.
      </EncadreNotion>
    </div>
  );
}
