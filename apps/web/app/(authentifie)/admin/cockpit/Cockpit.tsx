"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VueCockpit } from "@kapital/server";
import { formaterEuros } from "../../../../lib/formatage";
import { creerClientNavigateur } from "../../../../lib/supabase/client";
import { BoutonAvancerMonde } from "../BoutonAvancerMonde";

type Reponse = VueCockpit & {
  maintenantMs: number;
  modeRecette: boolean;
  codeConfigure: boolean;
};

type Vente = {
  readonly cle: string;
  readonly heure: string;
  readonly entreprise: string;
  readonly libelle: string;
  readonly montantCentimes: number;
};

type EtatDirect = "connexion" | "direct" | "hors ligne";

const FREQUENCE_RAFRAICHISSEMENT_MS = 5_000;
const VENTES_CONSERVEES = 100;

function formaterDuree(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, "0")} s`;
  return `${s} s`;
}

const CARTE = "rounded-md border border-[color:var(--color-g-200)] p-6";
const TITRE = "text-sm font-semibold";
const LEGENDE = "text-xs text-[color:var(--color-g-500)]";
const ERREUR = "text-[color:var(--color-erreur)]";

export function Cockpit() {
  const [vue, setVue] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [decalageMs, setDecalageMs] = useState(0); // horloge du serveur − horloge du navigateur
  const [, setTic] = useState(0);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [direct, setDirect] = useState<EtatDirect>("connexion");
  const [code, setCode] = useState("");
  const [avance, setAvance] = useState<{ ok: boolean; texte: string } | null>(null);
  const [avanceEnCours, setAvanceEnCours] = useState(false);
  const nomsRef = useRef<Map<string, string>>(new Map());

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch("/api/admin/cockpit", { cache: "no-store" });
      const data = (await reponse.json()) as Reponse & { error?: string };
      if (!reponse.ok) throw new Error(data.error ?? `erreur ${reponse.status}`);
      setVue(data);
      setDecalageMs(data.maintenantMs - Date.now());
      setErreur(null);
      nomsRef.current = new Map(data.entreprises.map((e) => [e.id, e.nom]));
    } catch (ex) {
      setErreur(ex instanceof Error ? ex.message : "Erreur inconnue");
    }
  }, []);

  // Rafraîchissement régulier de l'état (horloge, entreprises, minuterie, commandes)
  useEffect(() => {
    void charger();
    const id = setInterval(() => void charger(), FREQUENCE_RAFRAICHISSEMENT_MS);
    return () => clearInterval(id);
  }, [charger]);

  // Compte à rebours : on redessine chaque seconde
  useEffect(() => {
    const id = setInterval(() => setTic((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Ventes en direct : chaque nouvelle écriture de produit (compte 707) arrive sans recharger
  useEffect(() => {
    const supabase = creerClientNavigateur();
    const canal = supabase
      .channel("cockpit-ventes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ledger_entries" }, (payload) => {
        const l = payload.new as {
          id: string;
          company_id: string;
          compte: string;
          sens: string;
          libelle: string;
          montant_centimes: number;
        };
        if (l.compte !== "707" || l.sens !== "credit") return;
        const vente: Vente = {
          cle: l.id,
          heure: new Date().toLocaleTimeString("fr-FR"),
          entreprise: nomsRef.current.get(l.company_id) ?? l.company_id.slice(0, 8),
          libelle: l.libelle,
          montantCentimes: Number(l.montant_centimes),
        };
        setVentes((v) => [vente, ...v].slice(0, VENTES_CONSERVEES));
      })
      .subscribe((statut) => {
        if (statut === "SUBSCRIBED") setDirect("direct");
        else if (statut === "CHANNEL_ERROR" || statut === "TIMED_OUT" || statut === "CLOSED") {
          setDirect("hors ligne");
        }
      });
    return () => {
      void supabase.removeChannel(canal);
    };
  }, []);

  async function avancer(duree: "jour" | "semaine" | "mois") {
    setAvanceEnCours(true);
    setAvance(null);
    try {
      const reponse = await fetch("/api/admin/monde/avancer-temps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duree, code }),
      });
      const data = (await reponse.json()) as { ok?: boolean; error?: string; erreurs?: number };
      if (!reponse.ok) throw new Error(data.error ?? `erreur ${reponse.status}`);
      setAvance({
        ok: data.ok === true,
        texte:
          data.ok === true
            ? `Temps avancé d'un(e) ${duree} de jeu, le monde a rattrapé.`
            : `Temps avancé, mais ${data.erreurs} entreprise(s) en erreur (voir le dernier passage).`,
      });
      void charger();
    } catch (ex) {
      setAvance({ ok: false, texte: ex instanceof Error ? ex.message : "Erreur inconnue" });
    } finally {
      setAvanceEnCours(false);
    }
  }

  if (erreur && !vue) {
    return <p className={`mt-8 text-sm ${ERREUR}`}>Impossible de charger le cockpit : {erreur}</p>;
  }
  if (!vue) return <p className="mt-8 text-sm">Chargement…</p>;

  const maintenant = Date.now() + decalageMs;
  const peutAvancer = vue.modeRecette && vue.codeConfigure;

  return (
    <div className="mt-8 space-y-6">
      {erreur && <p className={`text-sm ${ERREUR}`}>Dernière actualisation échouée : {erreur}</p>}

      {vue.alertes.length > 0 && (
        <section className={`${CARTE} border-[color:var(--color-erreur)]`}>
          <h2 className={`${TITRE} ${ERREUR}`}>Alertes</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {vue.alertes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARTE}>
        <h2 className={TITRE}>Horloge commune</h2>
        {vue.horloge.actif ? (
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <p className={LEGENDE}>Mois de jeu</p>
              <p className="chiffre text-lg font-medium">{vue.horloge.horloge.moisEnCours}</p>
            </div>
            <div>
              <p className={LEGENDE}>Pas dans le mois</p>
              <p className="chiffre text-lg font-medium">
                {vue.horloge.horloge.indexDansMois + 1} / {vue.horloge.horloge.pasParMois}
              </p>
            </div>
            <div>
              <p className={LEGENDE}>Prochain pas dans</p>
              <p className="chiffre text-lg font-medium">
                {formaterDuree(vue.horloge.horloge.finPasEnCoursMs - maintenant)}
              </p>
            </div>
            <div>
              <p className={LEGENDE}>Fin du mois dans</p>
              <p className="chiffre text-lg font-medium">
                {formaterDuree(vue.horloge.horloge.finDuMoisMs - maintenant)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm">
            Pas encore initialisée (mois courant {vue.horloge.moisCourant}). Utiliser « Mettre le monde à jour
            maintenant » ci-dessous.
          </p>
        )}
      </section>

      <section className={CARTE}>
        <h2 className={TITRE}>Actions</h2>
        <div className="mt-4">
          <BoutonAvancerMonde />
        </div>
        <div className="mt-6 border-t border-[color:var(--color-g-200)] pt-4">
          <p className="text-sm font-medium">Avancer le temps (monde de recette)</p>
          <p className={`mt-1 ${LEGENDE}`}>
            Irréversible : seule une remise à zéro du monde de recette ramène en arrière. Chaque action est inscrite
            au journal d'audit.
          </p>
          {!peutAvancer ? (
            <p className={`mt-3 text-sm ${ERREUR}`}>
              {!vue.modeRecette
                ? "Désactivé : KAPITAL_MODE_RECETTE n'est pas à « true » sur le serveur."
                : "Verrouillé : KAPITAL_ADMIN_CODE n'est pas configuré sur le serveur."}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="password"
                autoComplete="off"
                placeholder="Code admin"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-md border border-[color:var(--color-g-300)] px-3 py-2 text-sm"
              />
              {(["jour", "semaine", "mois"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={avanceEnCours || code.length === 0}
                  onClick={() => void avancer(d)}
                  className="rounded-md border border-[color:var(--color-noir)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--color-g-100)] disabled:opacity-50"
                >
                  {avanceEnCours ? "…" : `+ 1 ${d} de jeu`}
                </button>
              ))}
            </div>
          )}
          {avance && <p className={`mt-3 text-sm ${avance.ok ? "" : ERREUR}`}>{avance.texte}</p>}
        </div>
      </section>

      <section className={CARTE}>
        <h2 className={TITRE}>Minuterie</h2>
        {vue.dernierPassage ? (
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
            <div>
              <dt className={LEGENDE}>Dernier passage</dt>
              <dd className="chiffre font-medium">il y a {formaterDuree(vue.dernierPassage.ageSecondes * 1000)}</dd>
            </div>
            <div>
              <dt className={LEGENDE}>Déclencheur</dt>
              <dd className="font-medium">{vue.dernierPassage.declencheur}</dd>
            </div>
            <div>
              <dt className={LEGENDE}>Entreprises avancées</dt>
              <dd className="chiffre font-medium">
                {vue.dernierPassage.nbAvancees} / {vue.dernierPassage.nbEntreprises}
              </dd>
            </div>
            <div>
              <dt className={LEGENDE}>Durée</dt>
              <dd className="chiffre font-medium">{vue.dernierPassage.dureeMs} ms</dd>
            </div>
            <div>
              <dt className={LEGENDE}>État</dt>
              <dd className={`font-medium ${vue.dernierPassage.etat === "ok" ? "" : ERREUR}`}>
                {vue.dernierPassage.etat === "ok"
                  ? "en marche"
                  : vue.dernierPassage.etat === "silencieuse"
                    ? "silencieuse"
                    : `${vue.dernierPassage.nbErreurs} erreur(s)`}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm">Aucun passage enregistré.</p>
        )}
        {vue.dernierPassage && vue.dernierPassage.erreurs.length > 0 && (
          <ul className={`mt-3 list-disc pl-5 text-sm ${ERREUR}`}>
            {vue.dernierPassage.erreurs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARTE}>
        <h2 className={TITRE}>Entreprises</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={LEGENDE}>
              <tr>
                <th className="py-1 pr-4 font-normal">Entreprise</th>
                <th className="py-1 pr-4 font-normal">Statut</th>
                <th className="py-1 pr-4 text-right font-normal">Trésorerie</th>
                <th className="py-1 pr-4 text-right font-normal">Pas traités</th>
                <th className="py-1 pr-4 text-right font-normal">Retard</th>
                <th className="py-1 font-normal">État</th>
              </tr>
            </thead>
            <tbody>
              {vue.entreprises.map((e) => (
                <tr key={e.id} className="border-t border-[color:var(--color-g-200)]">
                  <td className="py-1 pr-4">{e.nom}</td>
                  <td className="py-1 pr-4">{e.statut}</td>
                  <td className="chiffre py-1 pr-4 text-right">{formaterEuros(e.tresorerieCentimes)}</td>
                  <td className="chiffre py-1 pr-4 text-right">{e.pasTraites ?? "—"}</td>
                  <td className="chiffre py-1 pr-4 text-right">
                    {e.retardMinutes === null ? "—" : `${e.retardMinutes} min`}
                  </td>
                  <td className={`py-1 ${e.etat === "en_retard" ? ERREUR : ""}`}>
                    {e.etat === "a_jour" ? "à jour" : e.etat === "en_retard" ? "en retard" : "non démarrée"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={CARTE}>
          <div className="flex items-baseline justify-between">
            <h2 className={TITRE}>Ventes en direct</h2>
            <span className={`${LEGENDE} ${direct === "hors ligne" ? ERREUR : ""}`}>
              {direct === "direct" ? "● en direct" : direct === "connexion" ? "connexion…" : "hors ligne"}
            </span>
          </div>
          {ventes.length === 0 ? (
            <p className={`mt-3 ${LEGENDE}`}>
              En attente de la prochaine vente. Les ventes apparaissent ici dès qu'elles sont enregistrées.
            </p>
          ) : (
            <ul className="mt-3 max-h-96 space-y-1 overflow-y-auto text-sm">
              {ventes.map((v) => (
                <li key={v.cle} className="flex justify-between gap-3 border-t border-[color:var(--color-g-200)] pt-1">
                  <span>
                    <span className="chiffre text-[color:var(--color-g-500)]">{v.heure}</span> · {v.entreprise} ·{" "}
                    {v.libelle}
                  </span>
                  <span className="chiffre">{formaterEuros(v.montantCentimes)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={CARTE}>
          <h2 className={TITRE}>Commandes en cours</h2>
          {vue.commandes.length === 0 ? (
            <p className={`mt-3 ${LEGENDE}`}>Aucune commande en attente de livraison.</p>
          ) : (
            <ul className="mt-3 max-h-96 space-y-1 overflow-y-auto text-sm">
              {vue.commandes.map((c) => {
                const reste = c.resteMs - (maintenant - vue.maintenantMs);
                return (
                  <li key={c.id} className="flex justify-between gap-3 border-t border-[color:var(--color-g-200)] pt-1">
                    <span>
                      {c.entreprise} · {c.type === "matiere" ? "matière" : "façonnier"} · {c.libelle}
                    </span>
                    <span className="chiffre">{reste <= 0 ? "à traiter" : `dans ${formaterDuree(reste)}`}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
