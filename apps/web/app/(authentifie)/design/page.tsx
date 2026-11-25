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
  Alerte,
  Bandeau,
  Courbe,
  EnTete,
  Etapes,
  Faits,
  Ligne,
  Note,
  Resultat,
  TableauRang,
  Verrou,
} from "../../../components/ui";

// Vitrine des composants du design V2, hors menu (adresse /design).
// Les valeurs sont des exemples d'affichage, pas des chiffres du jeu.

export default function PageDesign() {
  return (
    <div className="flex flex-col gap-5">
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
      <EnTete surTitre="Composants d'écran" titre="En-tête avec action" action={<BoutonLien href="/jeu">← Village</BoutonLien>}>
        L&apos;en-tête peut porter une action à droite, comme dans la maquette.
      </EnTete>
      <Bandeau droite="mois 10, jour 19 · 1 jour réel = 1 mois de jeu">Bandeau d&apos;information pleine largeur.</Bandeau>
      <div className="grid gap-4 md:grid-cols-3">
        <Carte titre="Faits et lignes">
          <Faits lignes={[["Capacité", "440 pièces/mois"], ["Stock", "205 pièces"], ["Équipe", "1 salarié"]]} />
          <div className="mt-3">
            <Ligne libelle="Coût total">1 200 €</Ligne>
            <Ligne libelle="Marge" ton="bon">+ 340 €</Ligne>
          </div>
        </Carte>
        <Carte titre="Étapes et alertes">
          <Etapes etapes={["Choisir la forme", "Déposer le capital", "Immatriculer"]} />
          <div className="mt-3 flex flex-col gap-2">
            <Alerte ton="critique">Compte à découvert.</Alerte>
            <Alerte ton="alerte">Stock bas.</Alerte>
            <Alerte ton="bon">Tout va bien.</Alerte>
          </div>
        </Carte>
        <Carte titre="Résultat, courbe, verrou">
          <Resultat libelle="Mensualité" valeur="860 €" detail="pendant 12 mois" />
          <div className="my-3">
            <Courbe titre="Exemple de trésorerie" valeurs={[100, 140, 120, 180, 160, 210]} />
          </div>
          <Verrou>Se débloque à l&apos;étape 2.</Verrou>
          <div className="mt-2">
            <Note>Le serveur revérifie au moment de valider.</Note>
          </div>
        </Carte>
      </div>
      <Carte titre="Classement">
        <TableauRang
          entetes={[{ texte: "Rang" }, { texte: "Entreprise" }, { texte: "Valeur", droite: true }]}
          lignes={[
            { cle: "a", cellules: ["1", "Exemple A", "52 000 €"] },
            { cle: "b", moi: true, cellules: ["2", "Ta société", "41 000 €"] },
            { cle: "c", cellules: ["3", "Exemple C", "38 000 €"] },
          ]}
        />
      </Carte>
    </div>
  );
}
