"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appelerAction } from "./_partage/reponses";

type Gamme = "entree" | "milieu" | "haut";

const GAMMES: ReadonlyArray<{ id: Gamme; titre: string; phrase: string }> = [
  {
    id: "entree",
    titre: "Entrée de gamme",
    phrase: "Des pièces simples à petit prix : on vise le volume, avec peu de marge sur chaque pièce.",
  },
  {
    id: "milieu",
    titre: "Milieu de gamme",
    phrase: "Un bon rapport qualité-prix : un équilibre entre volume de ventes et marge.",
  },
  {
    id: "haut",
    titre: "Haut de gamme",
    phrase: "Des pièces soignées vendues cher : moins de clients, mais une marge plus forte.",
  },
];

export function FormulaireSociete({
  capitalAffiche,
  serieLancementPieces,
}: {
  capitalAffiche: string;
  /** Nombre de pièces de la série de lancement (paramètre serie_lancement_pieces). */
  serieLancementPieces: number;
}) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [gamme, setGamme] = useState<Gamme>("milieu");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const nomNet = nom.trim();
    if (nomNet.length === 0) {
      setErreur("Donne un nom à ta marque.");
      return;
    }
    setEnCours(true);
    const r = await appelerAction("/api/actions/creer-societe", { nom: nomNet, gamme });
    setEnCours(false);
    if (!r.ok) {
      setErreur(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={creer} className="mt-8 space-y-6">
      <div className="space-y-1.5">
        <label
          htmlFor="nom-marque"
          className="block text-xs uppercase tracking-wider text-[color:var(--color-g-500)]"
        >
          Nom de la marque
        </label>
        <input
          id="nom-marque"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={60}
          className="w-full rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-noir)]"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Gamme
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {GAMMES.map((g) => {
            const actif = gamme === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGamme(g.id)}
                aria-pressed={actif}
                className={`rounded-md border p-4 text-left transition ${
                  actif
                    ? "border-[color:var(--color-noir)] bg-[color:var(--color-g-100)]"
                    : "border-[color:var(--color-g-300)] hover:border-[color:var(--color-g-500)]"
                }`}
              >
                <span className="block text-sm font-semibold">{g.titre}</span>
                <span className="mt-1 block text-xs text-[color:var(--color-g-700)]">{g.phrase}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-md border border-[color:var(--color-g-200)] p-4 text-sm">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-g-500)]">
          Capital de départ
        </p>
        <p className="mt-1 text-xl font-medium">
          <span className="chiffre">{capitalAffiche}</span> €
        </p>
        <p className="mt-1 text-xs text-[color:var(--color-g-500)]">
          Cet argent est versé sur le compte de ta société au départ. Tu commences sans atelier, mais pas
          les mains vides : ton premier produit arrive avec une série de lancement de{" "}
          {serieLancementPieces.toLocaleString("fr-FR")} pièces prêtes à vendre, payées sur ce capital au
          prix de l&apos;usine.
        </p>
        <p className="mt-1 text-xs text-[color:var(--color-g-500)]">
          Pour la suite, tu fais fabriquer chez des façonniers (moins cher, mais il faut attendre) ou
          chez le grossiste local, qui livre dans l&apos;heure, plus cher.
        </p>
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-[color:var(--color-erreur)]">
          {erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="rounded-md bg-[color:var(--color-noir)] px-4 py-2 text-sm font-medium text-[color:var(--color-blanc)] transition hover:bg-[color:var(--color-g-900)] disabled:opacity-50"
      >
        {enCours ? "Création..." : "Créer ma société"}
      </button>
    </form>
  );
}
