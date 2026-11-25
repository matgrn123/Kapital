import {
  Bouton,
  BoutonLien,
  Carte,
  EcritureComptable,
  EncadreFilRouge,
  EncadreNotion,
  Graphique,
  Jauge,
  Kpi,
  Puce,
  SurTitre,
} from "../../../components/ui";

// Vitrine des composants du design V2, hors menu (adresse /design).
// Les valeurs sont des exemples d'affichage, pas des chiffres du jeu.

export default function PageDesign() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-8 py-10">
      <header>
        <SurTitre>Design V2</SurTitre>
        <h1 className="text-[1.75rem] font-extrabold">Composants de l&apos;interface</h1>
        <p className="mt-1 max-w-[62ch] text-muted">
          Vitrine des briques qui serviront à reprendre les écrans. Les montants affichés
          ici sont des exemples, pas des chiffres du jeu.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi libelle="Trésorerie" valeur="18 420 €" detail="sur le compte en banque" />
        <Kpi libelle="Chiffre d'affaires" valeur="6 250 €" detail="ce mois-ci" />
        <Kpi libelle="Résultat" valeur="+ 1 180 €" detail="ce mois-ci" ton="bon" />
        <Kpi libelle="Découvert" valeur="− 320 €" detail="à combler" ton="critique" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Carte titre="Puces et boutons">
          <div className="flex flex-wrap gap-2">
            <Puce>Neutre</Puce>
            <Puce ton="accent">● Ta société</Puce>
            <Puce ton="bon">Rentable</Puce>
            <Puce ton="alerte">Stock bas</Puce>
            <Puce ton="critique">Découvert</Puce>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Bouton variante="principal">Valider</Bouton>
            <Bouton>Annuler</Bouton>
            <Bouton variante="discret" petit>
              Petit bouton
            </Bouton>
            <Bouton variante="principal" disabled>
              Indisponible
            </Bouton>
            <BoutonLien href="/jeu" petit>
              Lien en bouton
            </BoutonLien>
          </div>
        </Carte>

        <Carte titre="Jauges">
          <div className="flex flex-col gap-3">
            <Jauge libelle="Notoriété" valeur={62} max={100} texte="62 / 100" />
            <Jauge libelle="Désirabilité" valeur={48} max={100} texte="48 / 100" ton="or" />
            <Jauge libelle="Stockage" valeur={340} max={400} texte="340 / 400 pièces" ton="critique" />
            <Jauge libelle="Capacité utilisée" valeur={120} max={300} texte="120 / 300" ton="bon" />
          </div>
        </Carte>
      </div>

      <Carte titre="Chiffre d'affaires par mois" surTitre="Graphique">
        <Graphique
          titre="Exemple de chiffre d'affaires sur six mois"
          barres={[
            { libelle: "mai", valeur: 1_200_00 },
            { libelle: "juin", valeur: 2_450_00 },
            { libelle: "juil.", valeur: 1_980_00 },
            { libelle: "août", valeur: 3_100_00 },
            { libelle: "sept.", valeur: 0 },
            { libelle: "oct.", valeur: 4_620_00 },
          ]}
        />
      </Carte>

      <div className="grid gap-4 md:grid-cols-2">
        <Carte titre="Écriture comptable">
          <div className="flex flex-col gap-3">
            <EcritureComptable
              libelle="Emprunt bancaire"
              etiquette="aperçu"
              lignes={[
                { compte: "512", debit: 10_000_00 },
                { compte: "164", credit: 10_000_00 },
              ]}
            />
            <EcritureComptable
              libelle="Exemple volontairement faux"
              lignes={[
                { compte: "613", debit: 1_000_00 },
                { compte: "512", credit: 900_00 },
              ]}
            />
          </div>
        </Carte>

        <div className="flex flex-col gap-4">
          <EncadreNotion titre="Une machine n'est pas une dépense comme les autres">
            Une machine sert plusieurs années. Elle va à l&apos;actif du bilan
            (immobilisation), puis perd un peu de valeur chaque mois : c&apos;est
            l&apos;amortissement, une charge qui ne sort pas de la trésorerie.
          </EncadreNotion>
          <EncadreFilRouge>
            Dès 1859, Louis Vuitton installe ses ateliers à Asnières. Fabriquer soi-même
            permet de contrôler la qualité, au prix de coûts fixes à payer chaque mois.
          </EncadreFilRouge>
        </div>
      </div>
    </div>
  );
}
