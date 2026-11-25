"use client";

import type { Parametres } from "@kapital/content";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, EcritureComptable } from "../../../components/ui";
import { CLASSE_SAISIE, Champ, Choix, Ligne, NoteEcriture, Refus, Succes } from "../../../components/apercu/elements";
import { apercuCommandeMatiere, texteDelai } from "../../../lib/apercus";
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
  params,
}: {
  fournisseurs: readonly Fournisseur[];
  catalogue: readonly LigneCatalogue[];
  materials: readonly { id: string; nom: string }[];
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
  const [quantite, setQuantite] = useState(String(fournisseurs[0]?.minimum_commande ?? 100));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const ligne = catalogue.find((l) => l.supplier_id === fournisseurId && l.material_id === materialId);
  const nomMat = materials.find((m) => m.id === materialId)?.nom ?? "matière";
  const quantiteN = Number(quantite.replace(",", "."));

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
    const f = fournisseurs.find((x) => x.id === id);
    if (f && quantiteN < f.minimum_commande) setQuantite(String(f.minimum_commande));
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
            <Choix key={f.id} actif={f.id === fournisseurId} onClick={() => choisirFournisseur(f.id)} titre={f.nom}>
              {f.pays} · livraison en {texteDelai(f.delai_mois, params)} · minimum {f.minimum_commande}
            </Choix>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Champ libelle="Matière">
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={CLASSE_SAISIE}>
            {matieresPourFourn.map((l) => (
              <option key={l.material_id} value={l.material_id}>
                {materials.find((m) => m.id === l.material_id)?.nom ?? "Matière"} · {formaterEuros(l.prix_centimes)} € l&apos;unité
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Quantité" aide={fournisseur ? `Minimum ${fournisseur.minimum_commande}` : undefined}>
          <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} className={CLASSE_SAISIE} />
        </Champ>
      </div>

      {apercu && apercu.ok && ligne && (
        <div className="flex flex-col gap-3">
          <div>
            <Ligne libelle="Prix à l'unité (figé à la commande)">{formaterEuros(ligne.prix_centimes)} €</Ligne>
            <Ligne libelle="Coût total">{formaterEuros(apercu.total)} €</Ligne>
            <Ligne libelle="Livraison">dans {texteDelai(apercu.delaiMois, params)}</Ligne>
            <Ligne libelle="Sortie de trésorerie aujourd'hui">0,00 €</Ligne>
          </div>
          <NoteEcriture>
            Rien n&apos;est écrit maintenant. À la livraison, le moteur entrera la matière en stock et notera ce que tu dois
            au fournisseur :
          </NoteEcriture>
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
