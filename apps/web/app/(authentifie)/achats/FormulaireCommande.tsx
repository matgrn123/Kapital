"use client";

import type { Parametres } from "@kapital/content";
import { quantiteMaxPayable } from "@kapital/engine";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, Choix, Curseur, EcritureComptable, Ligne, Note, Refus, Resultat, Succes } from "../../../components/ui";
import { apercuCommandeMatiere, bornesQuantite, texteDelai } from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";

type Fournisseur = {
  id: string;
  nom: string;
  pays: string;
  delai_mois: number;
  minimum_commande: number;
};

type LigneCatalogue = {
  supplier_id: string;
  material_id: string;
  prix_centimes: number;
};

export function FormulaireCommande({
  fournisseurs,
  catalogue,
  materials,
  tresorerie,
  params,
}: {
  fournisseurs: readonly Fournisseur[];
  catalogue: readonly LigneCatalogue[];
  materials: readonly { id: string; nom: string }[];
  /** Trésorerie du joueur : sert à borner le curseur de quantité. */
  tresorerie: number;
  params: Parametres;
}) {
  const router = useRouter();
  const [fournisseurId, setFournisseurId] = useState<string>(fournisseurs[0]?.id ?? "");
  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);
  const matieresPourFourn = useMemo(
    () => catalogue.filter((l) => l.supplier_id === fournisseurId),
    [fournisseurId, catalogue],
  );
  const [materialId, setMaterialId] = useState<string>(matieresPourFourn[0]?.material_id ?? "");
  const [quantiteChoisie, setQuantite] = useState<number>(fournisseurs[0]?.minimum_commande ?? 1);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const ligne = catalogue.find((l) => l.supplier_id === fournisseurId && l.material_id === materialId);
  const nomMat = materials.find((m) => m.id === materialId)?.nom ?? "matière";
  // Du minimum du fournisseur à ce que ta trésorerie peut payer (plafond tiré des données).
  const bornes = bornesQuantite({
    minimum: fournisseur?.minimum_commande ?? 1,
    plafonds: ligne && ligne.prix_centimes > 0 ? [quantiteMaxPayable(tresorerie, ligne.prix_centimes)] : [],
  });
  const quantiteN = Math.min(Math.max(quantiteChoisie, bornes.min), bornes.max);

  const apercu = useMemo(() => {
    if (!fournisseur || !ligne) return null;
    return apercuCommandeMatiere({
      fournisseur: {
        id: fournisseur.id,
        nom: fournisseur.nom,
        delaiMois: fournisseur.delai_mois,
        minimumCommande: fournisseur.minimum_commande,
      },
      matiere: ligne.material_id,
      prixUnitaire: ligne.prix_centimes,
      quantite: quantiteN,
      moisCourant: 0,
      params,
    });
  }, [fournisseur, ligne, quantiteN, params]);

  function choisirFournisseur(id: string) {
    setFournisseurId(id);
    const prem = catalogue.find((l) => l.supplier_id === id);
    if (prem) setMaterialId(prem.material_id);
  }

  /** « 4,20 € l'unité · 1 mois de jeu » : le moins cher du catalogue de ce fournisseur, et son délai. */
  function prixLigne(id: string): string {
    const f = fournisseurs.find((x) => x.id === id);
    const prix = catalogue.filter((l) => l.supplier_id === id).map((l) => l.prix_centimes);
    const delai = f ? texteDelai(f.delai_mois, params) : "";
    if (prix.length === 0) return delai;
    return `${prix.length > 1 ? "dès " : ""}${formaterEuros(Math.min(...prix))} € l'unité · ${delai}`;
  }

  async function commander(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setOk(null);
    if (!fournisseur || !ligne || !apercu) {
      setErreur("Choisis un fournisseur et une matière.");
      return;
    }
    if (!apercu.ok) {
      setErreur(apercu.message);
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/actions/commander-matiere", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierId: fournisseur.id, materialId, quantite: quantiteN }),
      });
      const data = (await reponse.json().catch(() => ({}))) as { error?: string };
      if (!reponse.ok || data.error) {
        setErreur(data.error ?? `Commande impossible (erreur ${reponse.status}).`);
        return;
      }
      setOk(`Commande passée : ${quantiteN} de ${nomMat.toLowerCase()} chez ${fournisseur.nom}.`);
      router.refresh();
    } catch {
      setErreur("Impossible de joindre le serveur. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  if (fournisseurs.length === 0) {
    return <Refus>Aucun fournisseur n&apos;est disponible pour l&apos;instant.</Refus>;
  }

  return (
    <form onSubmit={commander} className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-[0.9rem] font-bold">Chez qui ?</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {fournisseurs.map((f) => (
            <Choix
              key={f.id}
              actif={f.id === fournisseurId}
              onClick={() => choisirFournisseur(f.id)}
              titre={f.nom}
              prix={prixLigne(f.id)}
            >
              {f.pays} · minimum {f.minimum_commande}
            </Choix>
          ))}
        </div>
      </div>

      {matieresPourFourn.length > 1 && (
        <div>
          <h4 className="mb-2 text-[0.9rem] font-bold">Quelle matière ?</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {matieresPourFourn.map((l) => (
              <Choix
                key={l.material_id}
                actif={l.material_id === materialId}
                onClick={() => setMaterialId(l.material_id)}
                titre={materials.find((m) => m.id === l.material_id)?.nom ?? "Matière"}
                prix={`${formaterEuros(l.prix_centimes)} € l'unité`}
              />
            ))}
          </div>
        </div>
      )}

      <Curseur
        libelle={`Quantité (${nomMat.toLowerCase()})`}
        valeur={quantiteN}
        min={bornes.min}
        max={bornes.max}
        onChange={setQuantite}
        affichage={quantiteN.toLocaleString("fr-FR")}
        aide={`De ${bornes.min} (minimum du fournisseur) à ${bornes.max.toLocaleString("fr-FR")} (ce que ta trésorerie peut payer).`}
      />

      {apercu && apercu.ok && ligne && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <Resultat libelle="Coût total" valeur={`${formaterEuros(apercu.total)} €`} />
            <Resultat libelle="Prix à l'unité" valeur={`${formaterEuros(ligne.prix_centimes)} €`} detail="figé à la commande" />
            <Resultat libelle="Livraison" valeur={`${apercu.delaiMois} mois`} detail={texteDelai(apercu.delaiMois, params)} />
          </div>
          <Ligne libelle="Sortie de trésorerie aujourd'hui">0,00 €</Ligne>
          <Note>
            Rien n&apos;est écrit maintenant. À la livraison, le moteur entrera la matière en stock et notera ce que tu dois
            au fournisseur :
          </Note>
          <EcritureComptable
            libelle={`Livraison : ${nomMat.toLowerCase()}`}
            etiquette="à la livraison"
            lignes={apercu.ecritureLivraison}
          />
        </div>
      )}
      {apercu && !apercu.ok && <Refus>{apercu.message}</Refus>}
      {erreur && <Refus>{erreur}</Refus>}
      {ok && <Succes>{ok}</Succes>}

      <div className="flex justify-end">
        <Bouton type="submit" variante="principal" disabled={enCours || !apercu?.ok}>
          {enCours ? "Envoi…" : "Passer la commande"}
        </Bouton>
      </div>
    </form>
  );
}
