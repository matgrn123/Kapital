import Link from "next/link";
import { BoutonLien, Carte, EncadreNotion, EnTete, Jauge, Kpi, Puce, Vide } from "../../../components/ui";
import { formaterEuros } from "../../../lib/formatage";
import { dureeReelleLisible, libelleJours, libelleRythme, type LigneStock, type StatutStock } from "../../../lib/stock";
import { creerClientServeur } from "../../../lib/supabase/server";
import { chargerSituationStock } from "./donnees";

// Écran « Stock et ventes » : pour chaque produit, ce qu'il reste, ce qui arrive, à quel rythme
// ça part, et combien de jours ça va tenir. Lecture seule : réapprovisionner se fait dans Production.

const STATUT: Record<StatutStock, { texte: string; puce: "critique" | "alerte" | "bon" | "neutre"; jauge: "critique" | "or" | "bon" | "accent" }> = {
  rupture: { texte: "Rupture", puce: "critique", jauge: "critique" },
  bas: { texte: "Stock bas", puce: "critique", jauge: "critique" },
  ok: { texte: "Stock suffisant", puce: "bon", jauge: "bon" },
  nouveau: { texte: "Pas encore de vente", puce: "neutre", jauge: "accent" },
  dort: { texte: "Stock qui dort", puce: "alerte", jauge: "or" },
};

function Chiffre({ libelle, valeur, detail }: { libelle: string; valeur: React.ReactNode; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-muted">{libelle}</span>
      <b className="text-[1.05rem] tabular-nums">{valeur}</b>
      {detail && <span className="text-[0.76rem] text-muted">{detail}</span>}
    </div>
  );
}

function LigneProduit({
  l,
  joursParMois,
  minutesReellesParMois,
  pasParMois,
  seuilJours,
  boutiqueOuverte,
}: {
  l: LigneStock;
  joursParMois: number;
  minutesReellesParMois: number;
  pasParMois: number;
  seuilJours: number;
  boutiqueOuverte: boolean;
}) {
  const s = STATUT[l.statut];
  const reel = dureeReelleLisible(l.jours, { joursParMois, minutesReellesParMois, pasParMois });
  const texteJours =
    l.statut === "rupture"
      ? "rupture : plus rien à vendre"
      : l.jours === null
      ? l.statut === "dort"
        ? "aucune vente depuis un mois"
        : "pas encore de vente"
      : `${libelleJours(l.jours, joursParMois)}${reel ? ` (${reel})` : ""}`;
  return (
    <section className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{l.nom}</h3>
          <Puce ton={s.puce}>{s.texte}</Puce>
        </div>
        <BoutonLien href={`/atelier?produit=${encodeURIComponent(l.id)}`} petit variante={l.statut === "rupture" || l.statut === "bas" ? "principal" : "secondaire"}>
          Réapprovisionner
        </BoutonLien>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Chiffre libelle="À l'atelier" valeur={l.atelier.toLocaleString("fr-FR")} />
        <Chiffre
          libelle="En boutique"
          valeur={boutiqueOuverte || l.boutique > 0 ? l.boutique.toLocaleString("fr-FR") : "—"}
          detail={boutiqueOuverte || l.boutique > 0 ? undefined : "pas de boutique ouverte"}
        />
        <Chiffre libelle="En route" valeur={l.enRoute.toLocaleString("fr-FR")} detail={l.enRoute > 0 ? "productions et commandes en cours" : undefined} />
        <Chiffre libelle="Rythme de vente" valeur={libelleRythme(l.piecesParMois)} detail="sur le dernier mois de jeu" />
      </div>

      <Jauge
        libelle={`Jours de stock (seuil d'alerte : ${seuilJours} jours)`}
        valeur={Math.min(l.jours ?? (l.statut === "dort" ? joursParMois : 0), joursParMois)}
        max={joursParMois}
        texte={texteJours}
        ton={s.jauge}
      />

      <div className="flex flex-wrap items-center gap-1.5 text-[0.82rem]">
        <span className="text-muted">En vente :</span>
        {l.canaux.length === 0 ? (
          <span className="text-muted">
            aucun canal, fixe un prix dans{" "}
            <Link href="/produits" className="text-accent underline">
              Vente
            </Link>
          </span>
        ) : (
          l.canaux.map((c) => (
            <Puce key={c.canal}>
              {c.libelle} · {formaterEuros(c.prix)} € {c.taxe}
            </Puce>
          ))
        )}
      </div>
    </section>
  );
}

export default async function PageStock() {
  const supabase = await creerClientServeur();
  const { data: entreprises } = await supabase.from("companies").select("id").limit(1);
  const entreprise = entreprises?.[0];
  if (!entreprise) return null;

  const { lignes, temps, seuilJours, boutiqueOuverte } = await chargerSituationStock(supabase, entreprise.id);
  const disponible = lignes.reduce((s, l) => s + l.disponible, 0);
  const enRoute = lignes.reduce((s, l) => s + l.enRoute, 0);
  const aReapprovisionner = lignes.filter((l) => l.statut === "rupture" || l.statut === "bas").length;
  const quiDorment = lignes.filter((l) => l.statut === "dort").length;

  return (
    <div className="flex flex-col gap-5">
      <EnTete surTitre="Gestion des stocks" titre="Stock et ventes" action={<BoutonLien href="/atelier">Production</BoutonLien>}>
        Combien de jours ton stock va tenir au rythme où il part, et ce qui arrive. Réapprovisionne avant la rupture, sans
        laisser dormir trop de pièces.
      </EnTete>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi libelle="Pièces prêtes à vendre" valeur={disponible.toLocaleString("fr-FR")} detail="atelier et boutique" />
        <Kpi libelle="Pièces en route" valeur={enRoute.toLocaleString("fr-FR")} detail="productions et commandes en cours" />
        <Kpi
          libelle="À réapprovisionner"
          valeur={aReapprovisionner}
          detail={`moins de ${seuilJours} jours de stock`}
          ton={aReapprovisionner > 0 ? "critique" : "bon"}
        />
        <Kpi libelle="Stock qui dort" valeur={quiDorment} detail="aucune vente depuis un mois" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Carte titre="Tes produits" surTitre="Du plus urgent au moins urgent">
          {lignes.length === 0 ? (
            <Vide>
              Aucun produit à ton catalogue. Ajoute-en un dans{" "}
              <Link href="/produits" className="text-accent underline">
                Vente
              </Link>{" "}
              : tu reçois une première série prête à vendre.
            </Vide>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {lignes.map((l) => (
                <LigneProduit
                  key={l.id}
                  l={l}
                  joursParMois={temps.joursParMois}
                  minutesReellesParMois={temps.minutesReellesParMois}
                  pasParMois={temps.pasParMois}
                  seuilJours={seuilJours}
                  boutiqueOuverte={boutiqueOuverte}
                />
              ))}
            </div>
          )}
        </Carte>

        <div className="flex flex-col gap-4">
          <EncadreNotion titre="Les jours de stock">
            Jours de stock = pièces prêtes à vendre ÷ pièces vendues par jour. C&apos;est le temps qu&apos;il te reste avant
            la rupture si rien n&apos;arrive. Compare-le au délai de ta production : s&apos;il est plus court, relance-la
            maintenant. Ici, un jour de jeu dure {Math.round(temps.minutesReellesParMois / temps.joursParMois)} minutes
            réelles.
          </EncadreNotion>
          <EncadreNotion titre="La rupture">
            Sans stock, les clients qui voulaient ton produit repartent les mains vides : la vente est perdue, elle ne se
            rattrape pas plus tard. C&apos;est le coût caché d&apos;un stock trop maigre : la marge que tu aurais gagnée,
            alors que le loyer et les salaires, eux, tombent quand même.
          </EncadreNotion>
          <EncadreNotion titre="Le stock qui dort">
            Une pièce en stock, c&apos;est de l&apos;argent déjà dépensé (matière, façon) qui ne rapporte rien tant
            qu&apos;elle n&apos;est pas vendue. Trop de stock pèse sur ta trésorerie : c&apos;est ton besoin en fonds de
            roulement. Un prix trop haut ou un produit qui ne plaît pas fait dormir le stock.
          </EncadreNotion>
        </div>
      </div>
    </div>
  );
}
