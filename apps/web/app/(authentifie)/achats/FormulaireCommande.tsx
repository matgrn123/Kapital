"use client";

import type { Parametres } from "@kapital/content";
import { quantiteMaxPayable } from "@kapital/engine";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, Choix, Curseur, EcritureComptable, Ligne, Note, Refus, Resultat, Succes } from "../../../components/ui";
import { apercuCommandeMatiere, bornesQuantite, texteDelai, texteLivraison } from "../../../lib/apercus";
import { heureLisible, versQuand } from "../../../lib/cadre";
import { useMaintenant } from "../../../lib/useMaintenant";
import { articleUnite, formaterEuros, prixParUnite, quantiteMatiere, symboleUnite } from "../../../lib/formatage";

type Fournisseur = {
  id: string;
  nom: string;
  pays: string;
  /** Délai de livraison en heures réelles (suppliers.delai_heures). */
  delai_heures: number;
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
  maintenantMs,
}: {
  fournisseurs: readonly Fournisseur[];
  catalogue: readonly LigneCatalogue[];
  /** `unite` : « metre » ou « lot » (materials.unite). */
  materials: readonly { id: string; nom: string; unite: string }[];
  /** Trésorerie du joueur : sert à borner le curseur de quantité. */
  tresorerie: number;
  params: Parametres;
  /** Instant du rendu serveur (ms) : point de départ de l'heure de livraison affichée. */
  maintenantMs: number;
}) {
  const router = useRouter();
  const maintenant = useMaintenant(maintenantMs);
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
  const uniteDe = (id: string | undefined) => materials.find((m) => m.id === id)?.unite ?? "metre";
  const uniteMat = uniteDe(materialId);
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
        delaiHeures: Number(fournisseur.delai_heures),
        minimumCommande: fournisseur.minimum_commande,
      },
      matiere: ligne.material_id,
      prixUnitaire: ligne.prix_centimes,
      quantite: quantiteN,
      instantCommandeMs: maintenant,
      params,
    });
  }, [fournisseur, ligne, quantiteN, params, maintenant]);

  function choisirFournisseur(id: string) {
    setFournisseurId(id);
    const prem = catalogue.find((l) => l.supplier_id === id);
    if (prem) setMaterialId(prem.material_id);
  }

  /** « 4,20 € le mètre · livré dans 2 h » : le moins cher du catalogue de ce fournisseur, et son délai. */
  function prixLigne(id: string): string {
    const f = fournisseurs.find((x) => x.id === id);
    const lignes = catalogue.filter((l) => l.supplier_id === id);
    const delai = f ? texteDelai(Number(f.delai_heures)) : "";
    if (lignes.length === 0) return delai;
    const moinsChere = lignes.reduce((a, b) => (b.prix_centimes < a.prix_centimes ? b : a));
    return `${lignes.length > 1 ? "dès " : ""}${prixParUnite(moinsChere.prix_centimes, uniteDe(moinsChere.material_id))} · ${delai}`;
  }

  /** Minimum de commande d'un fournisseur, dans l'unité de sa matière : « minimum 50 m ». */
  function minimumLigne(f: Fournisseur): string {
    const premiere = catalogue.find((l) => l.supplier_id === f.id);
    const unite = premiere ? ` ${symboleUnite(uniteDe(premiere.material_id), f.minimum_commande)}` : "";
    return `minimum ${f.minimum_commande.toLocaleString("fr-FR")}${unite}`;
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
      setOk(
        `Commande passée : ${quantiteMatiere(quantiteN, uniteMat, nomMat)} chez ${fournisseur.nom}. Livraison ${versQuand(apercu.instantLivraisonMs, Date.now())}.`,
      );
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
              {f.pays} · {minimumLigne(f)}
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
                prix={prixParUnite(l.prix_centimes, uniteDe(l.material_id))}
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
        saisie="nombre"
        unite={symboleUnite(uniteMat, quantiteN)}
        aide={`De ${quantiteMatiere(bornes.min, uniteMat, nomMat)} (minimum du fournisseur) à ${bornes.max.toLocaleString("fr-FR")} ${symboleUnite(uniteMat, bornes.max)} (ce que ta trésorerie peut payer).`}
      />

      {apercu && apercu.ok && ligne && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <Resultat libelle="Coût total" valeur={`${formaterEuros(apercu.total)} €`} />
            <Resultat
              libelle="Prix unitaire"
              valeur={`${formaterEuros(ligne.prix_centimes)} €`}
              detail={`${articleUnite(uniteMat)}, figé à la commande`}
            />
            <Resultat
              libelle="Livraison"
              valeur={`vers ${heureLisible(apercu.instantLivraisonMs)}`}
              detail={texteLivraison(apercu.instantLivraisonMs, maintenant)}
            />
          </div>
          <Ligne libelle="Sortie de trésorerie aujourd'hui">0,00 €</Ligne>
          <Note>
            Rien n&apos;est écrit maintenant. À la livraison, le moteur entrera la matière en stock et notera ce que tu dois
            au fournisseur :
          </Note>
          <EcritureComptable
            libelle={`Livraison : ${quantiteMatiere(quantiteN, uniteMat, nomMat)}`}
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
