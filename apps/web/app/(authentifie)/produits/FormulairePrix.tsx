"use client";

import type { Parametres } from "@kapital/content";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bouton,
  CLASSE_SAISIE,
  Champ,
  Curseur,
  EcritureComptable,
  Ligne,
  Note,
  Options,
  Refus,
  Succes,
} from "../../../components/ui";
import { apercuVente } from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";
import { bornesPrix } from "../../../lib/vente";

type LignePrix = {
  id: string;
  product_id: string;
  qualite_visee: number;
  prix_vente_directe_centimes: number;
  prix_revendeur_centimes: number;
  production_mensuelle_cible: number;
};

function pourcent(x: number): string {
  return `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`;
}

export function FormulairePrix({
  lignePrix,
  nomProduit,
  coutRevient,
  origineCout,
  params,
  aUnAtelier,
}: {
  lignePrix: LignePrix;
  nomProduit: string;
  /** Coût de revient d'une pièce en centimes (stock ou estimation), null si inconnu. */
  coutRevient: number | null;
  origineCout: string;
  params: Parametres;
  aUnAtelier: boolean;
}) {
  const router = useRouter();
  const [pDirecte, setDirecte] = useState(lignePrix.prix_vente_directe_centimes);
  const [pRevendeur, setRevendeur] = useState(lignePrix.prix_revendeur_centimes);
  const [production, setProduction] = useState(String(lignePrix.production_mensuelle_cible));
  const [q, setQualite] = useState(lignePrix.qualite_visee);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const tauxTva = params["tva_standard"]?.valeur ?? 0;
  // Bornes figées au chargement : le curseur ne doit pas fuir sous le doigt.
  const [bornesTtc] = useState(() =>
    bornesPrix({ coutRevient, prixActuel: lignePrix.prix_vente_directe_centimes, tauxTva }),
  );
  const [bornesHt] = useState(() =>
    bornesPrix({ coutRevient, prixActuel: lignePrix.prix_revendeur_centimes, tauxTva: 0 }),
  );
  const apercu = useMemo(
    () =>
      apercuVente({
        produit: lignePrix.product_id,
        prixTtc: pDirecte,
        prixGrosHt: pRevendeur,
        coutRevient: coutRevient ?? 0,
        params,
        mois: 0,
      }),
    [lignePrix.product_id, pDirecte, pRevendeur, coutRevient, params],
  );
  const delaiRevendeur = params["indicateurs_delai_encaissement_revendeur_mois"]?.valeur;

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setOk(false);
    const prod = Number(production);
    if (!Number.isInteger(pDirecte) || !Number.isInteger(pRevendeur) || pDirecte <= 0 || pRevendeur <= 0) {
      setErreur("Les deux prix doivent être positifs : pousse les curseurs vers la droite.");
      return;
    }
    if (!Number.isInteger(prod) || prod < 0) {
      setErreur("La production mensuelle doit être un nombre entier de pièces.");
      return;
    }
    if (!Number.isInteger(q) || q < 0 || q > 100) {
      setErreur("La qualité visée va de 0 à 100.");
      return;
    }
    setEnCours(true);
    try {
      const reponse = await fetch("/api/actions/fixer-prix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lignePrixId: lignePrix.id,
          prixVenteDirecteCentimes: pDirecte,
          prixRevendeurCentimes: pRevendeur,
          productionMensuelleCible: prod,
          qualiteVisee: q,
        }),
      });
      const data = (await reponse.json().catch(() => ({}))) as { error?: string };
      if (!reponse.ok || data.error) {
        setErreur(data.error ?? `Enregistrement impossible (erreur ${reponse.status}).`);
        return;
      }
      setOk(true);
      router.refresh();
    } catch {
      setErreur("Impossible de joindre le serveur. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="flex flex-col gap-4">
      <Curseur
        libelle="Prix public TTC"
        valeur={pDirecte}
        min={bornesTtc.min}
        max={bornesTtc.max}
        pas={10}
        onChange={setDirecte}
        affichage={`${formaterEuros(pDirecte)} €`}
        aide={
          apercu.ok
            ? `Marge par pièce ${formaterEuros(apercu.margeDirecte)} € (${pourcent(apercu.tauxMargeDirecte)}), retours compris`
            : "Ce que paie ton client."
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Curseur
          libelle="Prix revendeur HT"
          valeur={pRevendeur}
          min={bornesHt.min}
          max={bornesHt.max}
          pas={10}
          onChange={setRevendeur}
          affichage={`${formaterEuros(pRevendeur)} €`}
          aide="Ce que te paie une boutique."
        />
        <Curseur
          libelle="Qualité visée"
          valeur={q}
          min={0}
          max={100}
          onChange={setQualite}
          affichage={`${q} / 100`}
          aide="Plus haut, plus de clients."
        />
        <Champ
          libelle="Production mensuelle"
          aide={aUnAtelier ? "Ce que ton atelier fabrique chaque mois." : "Servira quand tu auras un atelier."}
        >
          <input inputMode="numeric" value={production} onChange={(e) => setProduction(e.target.value)} className={CLASSE_SAISIE} />
        </Champ>
      </div>

      {apercu.ok ? (
        <div className="flex flex-col gap-4">
          <div>
            <Ligne libelle="Prix public hors taxes">{formaterEuros(apercu.prixHt)} €</Ligne>
            <Ligne libelle="TVA reversée à l'État">{formaterEuros(apercu.tva)} €</Ligne>
            <Ligne libelle="Coût de revient d'une pièce">{formaterEuros(coutRevient ?? 0)} €</Ligne>
            <Ligne libelle="Marge par pièce en ligne (retours compris)" ton={apercu.margeDirecte < 0 ? "critique" : "bon"}>
              {formaterEuros(apercu.margeDirecte)} € · {pourcent(apercu.tauxMargeDirecte)}
            </Ligne>
            <Ligne libelle="Marge par pièce chez un revendeur" ton={apercu.margeRevendeur < 0 ? "critique" : "bon"}>
              {formaterEuros(apercu.margeRevendeur)} € · {pourcent(apercu.tauxMargeRevendeur)}
            </Ligne>
            <p className="mt-2 text-[0.78rem] text-muted">{origineCout}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Note>
              Changer un prix n&apos;écrit rien en comptabilité. Chaque vente, elle, est écrite au fil du temps par le
              moteur. Pour une pièce de {nomProduit.toLowerCase()} :
            </Note>
            <EcritureComptable libelle="Vente en ligne d'une pièce" etiquette="aperçu" lignes={apercu.ecritureDirecte} />
            <EcritureComptable
              libelle="Vente d'une pièce à un revendeur"
              etiquette={delaiRevendeur ? `payée dans ${delaiRevendeur} mois de jeu` : "payée plus tard"}
              lignes={apercu.ecritureRevendeur}
            />
          </div>
        </div>
      ) : (
        <Refus>{apercu.message}</Refus>
      )}

      {erreur && <Refus>{erreur}</Refus>}
      {ok && <Succes>Prix enregistrés. Ils s&apos;appliquent dès maintenant aux ventes.</Succes>}
      <div className="flex justify-end">
        <Bouton type="submit" variante="principal" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer les prix"}
        </Bouton>
      </div>
    </form>
  );
}

export type ProduitAAjouter = { id: string; nom: string; detail: string; prix: string | null };

/** Tuiles des produits que tu peux ajouter ; un seul bouton pour celui choisi. */
export function AjouterProduit({ produits, premier }: { produits: ProduitAAjouter[]; premier: boolean }) {
  const [choisi, setChoisi] = useState(produits[0]?.id ?? "");
  return (
    <div className="flex flex-col gap-3">
      <Options
        libelle="Produit à ajouter"
        valeur={choisi}
        onChange={setChoisi}
        options={produits.map((p) => ({ id: p.id, titre: p.nom, detail: p.detail, prix: p.prix ?? undefined }))}
      />
      {choisi && <AjouterProduitBouton productId={choisi} premier={premier} />}
    </div>
  );
}

function AjouterProduitBouton({ productId, premier }: { productId: string; premier: boolean }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter() {
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch("/api/actions/ajouter-produit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = (await reponse.json().catch(() => ({}))) as { error?: string };
      if (!reponse.ok || data.error) {
        setErreur(data.error ?? `Ajout impossible (erreur ${reponse.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setErreur("Impossible de joindre le serveur. Vérifie ta connexion et réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Bouton variante={premier ? "principal" : "secondaire"} petit onClick={ajouter} disabled={enCours}>
        {enCours ? "Ajout…" : "Ajouter au catalogue"}
      </Bouton>
      {erreur && <Refus>{erreur}</Refus>}
    </div>
  );
}
