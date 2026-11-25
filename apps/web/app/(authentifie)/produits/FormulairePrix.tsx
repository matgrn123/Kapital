"use client";

import type { Parametres } from "@kapital/content";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bouton, EcritureComptable } from "../../../components/ui";
import { CLASSE_SAISIE, Champ, Ligne, NoteEcriture, Refus, Succes } from "../../../components/apercu/elements";
import { apercuVente } from "../../../lib/apercus";
import { formaterEuros } from "../../../lib/formatage";

type LignePrix = {
  id: string;
  product_id: string;
  qualite_visee: number;
  prix_vente_directe_centimes: number;
  prix_revendeur_centimes: number;
  production_mensuelle_cible: number;
};

/** "25,50" ou "25.5" → 2550 centimes ; NaN si la saisie n'est pas un montant. */
function enCentimes(saisie: string): number {
  const n = Number(saisie.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

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
  const [directe, setDirecte] = useState(formaterEuros(lignePrix.prix_vente_directe_centimes));
  const [revendeur, setRevendeur] = useState(formaterEuros(lignePrix.prix_revendeur_centimes));
  const [production, setProduction] = useState(String(lignePrix.production_mensuelle_cible));
  const [qualite, setQualite] = useState(String(lignePrix.qualite_visee));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const pDirecte = enCentimes(directe);
  const pRevendeur = enCentimes(revendeur);
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
    const q = Number(qualite);
    if (!Number.isInteger(pDirecte) || !Number.isInteger(pRevendeur) || pDirecte <= 0 || pRevendeur <= 0) {
      setErreur("Les deux prix doivent être des montants positifs (par exemple 24,90).");
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Champ libelle="Prix public (€ TTC)" aide="Ce que paie ton client en ligne.">
          <input inputMode="decimal" value={directe} onChange={(e) => setDirecte(e.target.value)} className={CLASSE_SAISIE} />
        </Champ>
        <Champ libelle="Prix revendeur (€ HT)" aide="Ce que te paie une boutique.">
          <input inputMode="decimal" value={revendeur} onChange={(e) => setRevendeur(e.target.value)} className={CLASSE_SAISIE} />
        </Champ>
        <Champ
          libelle="Production mensuelle"
          aide={aUnAtelier ? "Ce que ton atelier fabrique chaque mois." : "Servira quand tu auras un atelier."}
        >
          <input inputMode="numeric" value={production} onChange={(e) => setProduction(e.target.value)} className={CLASSE_SAISIE} />
        </Champ>
        <Champ libelle="Qualité visée (0 à 100)" aide="Plus haut, plus de clients.">
          <input inputMode="numeric" value={qualite} onChange={(e) => setQualite(e.target.value)} className={CLASSE_SAISIE} />
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
            <NoteEcriture>
              Changer un prix n&apos;écrit rien en comptabilité. Chaque vente, elle, est écrite au fil du temps par le
              moteur. Pour une pièce de {nomProduit.toLowerCase()} :
            </NoteEcriture>
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

export function AjouterProduitBouton({ productId, premier }: { productId: string; premier: boolean }) {
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
