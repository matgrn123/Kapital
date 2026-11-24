// Test d'intégration des migrations 0020 (horloge commune, application atomique d'un pas)
// et 0021 (minuterie toutes les minutes, diffusion en direct).
//
// Joue la migration et ses cas dans UNE transaction qui est TOUJOURS annulée :
// rien ne reste en base, y compris la migration elle-même.
//
//   npm run test-horloge -w @kapital/tool-supabase
//
// Connexion : SUPABASE_DB_URL, ou SUPABASE_URL + SUPABASE_DB_PASSWORD (voir README).

import { readFileSync } from "node:fs";
import { Client } from "pg";
import {
  centimes,
  idEntreprise,
  idMatiere,
  idPret,
  idProduit,
  moisJeu,
  type Entreprise,
} from "@kapital/engine";
import { chargeUtileDepuisLot } from "@kapital/server";

function connectionString(): string {
  const direct = process.env["SUPABASE_DB_URL"];
  if (direct && direct.length > 0) return direct;
  const url = process.env["SUPABASE_URL"];
  const pwd = process.env["SUPABASE_DB_PASSWORD"];
  if (!url || !pwd) {
    throw new Error("Fournir SUPABASE_DB_URL, ou SUPABASE_URL + SUPABASE_DB_PASSWORD dans .env.local.");
  }
  const ref = url.replace(/^https:\/\//, "").split(".")[0]!;
  return `postgresql://postgres:${encodeURIComponent(pwd)}@db.${ref}.supabase.co:5432/postgres`;
}

let echecs = 0;
function verifier(nom: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ✓" : "  ✗"} ${nom}${ok ? "" : ` ${detail}`}`);
  if (!ok) echecs += 1;
}

let compteurSavepoint = 0;

/** Exécute une requête qui doit échouer avec ce code, sans casser la transaction. */
async function attendreErreur(
  c: Client,
  nom: string,
  sql: string,
  params: unknown[],
  codeAttendu: string,
  extrait?: RegExp,
): Promise<void> {
  const sp = `sp_${compteurSavepoint++}`;
  await c.query(`savepoint ${sp}`);
  try {
    await c.query(sql, params);
    verifier(nom, false, "(aucune erreur levée)");
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const bonCode = err.code === codeAttendu;
    const bonTexte = extrait ? extrait.test(err.message ?? "") : true;
    verifier(nom, bonCode && bonTexte, `(code ${err.code}, message « ${err.message} »)`);
  }
  await c.query(`rollback to savepoint ${sp}`);
  await c.query(`release savepoint ${sp}`);
}

async function un<T>(c: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return r.rows[0] as T;
}

const APPEL = "select public.appliquer_pas_entreprise($1::uuid, $2::integer, $3::jsonb) as pas";
const APPEL_N =
  "select public.appliquer_pas_entreprise($1::uuid, $2::integer, $3::jsonb, $4::integer) as pas";

async function main(): Promise<void> {
  const lire = (nom: string) =>
    readFileSync(new URL(`../../supabase/migrations/${nom}`, import.meta.url), "utf8");
  const migrations = [lire("0020_horloge_commune.sql"), lire("0021_minuterie_et_direct.sql")];
  const c = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin");
  try {
    console.log("Migration");
    for (const m of [...migrations, ...migrations]) await c.query(m); // rejouables : la CI les rejouera
    verifier("les migrations 0020 et 0021 s'appliquent, et se rejouent sans erreur", true);

    // --- Jeu de données de test (annulé en fin de test) ---------------------
    const monde = await un<{ id: string; debut_reel: Date | null }>(
      c,
      "insert into public.worlds (nom) values ('test-horloge') returning id, debut_reel",
    );
    verifier("un monde créé démarre sur l'horloge commune (debut_reel renseigné)", monde.debut_reel !== null);

    const company = await un<{ id: string; pas_traites: number | null }>(
      c,
      `insert into public.companies (world_id, nom, gamme, tresorerie_centimes)
       values ($1, 'Test horloge', 'milieu', 0) returning id, pas_traites`,
      [monde.id],
    );
    verifier("une entreprise créée n'a pas encore de pas traité (NULL)", company.pas_traites === null);
    await c.query("update public.companies set pas_traites = 5 where id = $1", [company.id]);

    const matiere = (await un<{ id: string }>(c, "select id from public.materials limit 1")).id;
    const produit = (await un<{ id: string }>(c, "select id from public.products limit 1")).id;
    const fournisseur = (await un<{ id: string }>(c, "select id from public.suppliers limit 1")).id;
    const pret = (
      await un<{ id: string }>(
        c,
        `insert into public.loans (company_id, capital_initial_centimes, capital_restant_centimes, taux_annuel, duree_mois)
         values ($1, 100000, 100000, 0.04, 12) returning id`,
        [company.id],
      )
    ).id;
    await c.query(
      `insert into public.loan_schedules (loan_id, numero, mensualite_centimes, interets_centimes,
         amortissement_centimes, capital_restant_apres_centimes, instant_prevu)
       values ($1, 1, 100000, 0, 100000, 0, now())`,
      [pret],
    );
    const commande = (
      await un<{ id: string }>(
        c,
        `insert into public.purchase_orders (company_id, supplier_id, material_id, quantite, prix_unitaire_centimes, instant_livraison_prevue)
         values ($1, $2, $3, 10, 100, now()) returning id`,
        [company.id, fournisseur, matiere],
      )
    ).id;

    const ecritureVente = (id: string, debit = 1200) => [
      { ecriture_id: id, mois_jeu: 1, libelle: "Vente test", compte: "512", sens: "debit", montant_centimes: debit },
      { ecriture_id: id, mois_jeu: 1, libelle: "Vente test", compte: "707", sens: "credit", montant_centimes: 1000 },
      { ecriture_id: id, mois_jeu: 1, libelle: "Vente test", compte: "44571", sens: "credit", montant_centimes: 200 },
    ];
    const etatComplet = {
      ecritures: ecritureVente("test_vente_p5"),
      stocks_matiere: [{ material_id: matiere, quantite: 12.5, valeur_totale_centimes: 3000 }],
      stocks_finis: [{ product_id: produit, quantite_pieces: 7, valeur_totale_centimes: 500 }],
      prets: [{ id: pret, capital_restant_centimes: 0 }],
      echeances_payees: [{ loan_id: pret, numero: 1 }],
      marque: { notoriete: 42.5, desirabilite: 61 },
      entreprise: { statut: "en_difficulte", mois_decouvert_consecutifs: 3 },
      commandes_matiere_livrees: [commande],
      cumul: { mois: 1, pasTraites: 6 },
    };

    // --- Droits : seul le serveur peut appeler la fonction ------------------
    console.log("Droits");
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set local role ${role}`);
      await attendreErreur(
        c,
        `le rôle ${role} ne peut pas appeler la fonction`,
        APPEL,
        [company.id, 5, JSON.stringify(etatComplet)],
        "42501",
      );
      await c.query("reset role");
    }

    // --- Cas nominal, joué avec la clé de service ----------------------------
    console.log("Application d'un pas");
    await c.query("set local role service_role");
    const r1 = await un<{ pas: number }>(c, APPEL, [company.id, 5, JSON.stringify(etatComplet)]);
    await c.query("reset role");
    verifier("rend le nouveau nombre de pas traités (6)", r1.pas === 6, `(reçu ${r1.pas})`);

    const entreprise = await un<{ pas_traites: number; statut: string; mois_decouvert_consecutifs: number; tresorerie_centimes: string }>(
      c,
      "select pas_traites, statut, mois_decouvert_consecutifs, tresorerie_centimes from public.companies where id = $1",
      [company.id],
    );
    verifier("le compteur de pas passe à 6", entreprise.pas_traites === 6);
    verifier("le statut et le découvert consécutif sont mis à jour", entreprise.statut === "en_difficulte" && entreprise.mois_decouvert_consecutifs === 3);
    verifier("la trésorerie suit la banque (512) : 1 200 centimes", Number(entreprise.tresorerie_centimes) === 1200, `(reçu ${entreprise.tresorerie_centimes})`);
    const nbLignes = await un<{ n: string }>(c, "select count(*) as n from public.ledger_entries where company_id = $1", [company.id]);
    verifier("les 3 lignes de l'écriture sont enregistrées", Number(nbLignes.n) === 3);
    const stM = await un<{ quantite: string; valeur_totale_centimes: string }>(c, "select quantite, valeur_totale_centimes from public.material_stock where company_id = $1 and material_id = $2", [company.id, matiere]);
    verifier("le stock de matière est enregistré (12,5 ; 3 000)", Number(stM.quantite) === 12.5 && Number(stM.valeur_totale_centimes) === 3000);
    const stP = await un<{ quantite_pieces: number }>(c, "select quantite_pieces from public.product_stock where company_id = $1 and product_id = $2", [company.id, produit]);
    verifier("le stock de produits finis est enregistré (7)", stP.quantite_pieces === 7);
    const l = await un<{ capital_restant_centimes: string; statut: string }>(c, "select capital_restant_centimes, statut from public.loans where id = $1", [pret]);
    verifier("le prêt soldé passe au statut « solde »", Number(l.capital_restant_centimes) === 0 && l.statut === "solde");
    const ech = await un<{ statut: string }>(c, "select statut from public.loan_schedules where loan_id = $1 and numero = 1", [pret]);
    verifier("l'échéance payée est marquée « payee »", ech.statut === "payee");
    const marque = await un<{ notoriete: string; desirabilite: string }>(c, "select notoriete, desirabilite from public.brand_state where company_id = $1", [company.id]);
    verifier("la marque est enregistrée", Number(marque.notoriete) === 42.5 && Number(marque.desirabilite) === 61);
    const po = await un<{ statut: string }>(c, "select statut from public.purchase_orders where id = $1", [commande]);
    verifier("la commande de matière livrée passe à « livree »", po.statut === "livree");
    const etat = await un<{ mois: number; cumul: { pasTraites: number } }>(c, "select mois, cumul from public.etat_mois_entreprise where company_id = $1", [company.id]);
    verifier("l'état du mois en cours est conservé", etat.mois === 1 && etat.cumul.pasTraites === 6);

    // --- Un pas ne s'applique jamais deux fois -------------------------------
    console.log("Rejeu et pas manquant");
    await attendreErreur(c, "rejouer le pas 5 est refusé (KP409)", APPEL, [company.id, 5, JSON.stringify({ ...etatComplet, ecritures: ecritureVente("test_vente_rejeu") })], "KP409", /pas_deja_traite/);
    await attendreErreur(c, "sauter un pas (attendu 9, trouvé 6) est refusé (KP409)", APPEL, [company.id, 9, "{}"], "KP409");
    const apresRejeu = await un<{ n: string }>(c, "select count(*) as n from public.ledger_entries where company_id = $1", [company.id]);
    verifier("les refus n'ont écrit aucune écriture supplémentaire", Number(apresRejeu.n) === 3);
    await attendreErreur(c, "une entreprise inconnue est refusée (KP404)", APPEL, ["00000000-0000-0000-0000-000000000000", 0, "{}"], "KP404");

    // --- Tout ou rien --------------------------------------------------------
    console.log("Atomicité");
    const desequilibre = {
      ecritures: ecritureVente("test_desequilibre", 1500), // débit 1 500, crédits 1 200 : déséquilibrée
      stocks_matiere: [{ material_id: matiere, quantite: 999, valeur_totale_centimes: 999 }],
      marque: { notoriete: 1, desirabilite: 1 },
    };
    await attendreErreur(c, "une écriture déséquilibrée fait échouer tout le pas", APPEL, [company.id, 6, JSON.stringify(desequilibre)], "P0001", /déséquilibrée/);
    const apres = await un<{ pas_traites: number; q: string; notoriete: string }>(
      c,
      `select c.pas_traites, m.quantite as q, b.notoriete
       from public.companies c
       join public.material_stock m on m.company_id = c.id and m.material_id = $2
       join public.brand_state b on b.company_id = c.id
       where c.id = $1`,
      [company.id, matiere],
    );
    verifier("après l'échec : compteur, stock et marque sont inchangés", apres.pas_traites === 6 && Number(apres.q) === 12.5 && Number(apres.notoriete) === 42.5);

    // --- Clôture du mois : l'état du mois disparaît ---------------------------
    console.log("Clôture du mois");
    await c.query("set local role service_role");
    const r2 = await un<{ pas: number }>(c, APPEL, [company.id, 6, JSON.stringify({ cumul: null })]);
    await c.query("reset role");
    verifier("un pas sans cumul avance le compteur (7)", r2.pas === 7);
    const reste = await un<{ n: string }>(c, "select count(*) as n from public.etat_mois_entreprise where company_id = $1", [company.id]);
    verifier("l'état du mois est supprimé à la clôture", Number(reste.n) === 0);
    const r3 = await un<{ pas: number }>(c, APPEL, [company.id, 7, null]);
    verifier("un état nul est accepté et avance le compteur (8)", r3.pas === 8);

    // --- Rattrapage : plusieurs pas calculés en mémoire, appliqués d'un coup ---
    console.log("Rattrapage de plusieurs pas");
    const r4 = await un<{ pas: number }>(c, APPEL_N, [company.id, 8, JSON.stringify({ ecritures: ecritureVente("test_vente_rattrapage") }), 3]);
    verifier("appliquer 3 pas d'un coup avance le compteur de 3 (11)", r4.pas === 11, `(reçu ${r4.pas})`);
    await attendreErreur(c, "un nombre de pas nul est refusé (KP400)", APPEL_N, [company.id, 11, "{}", 0], "KP400");
    await attendreErreur(c, "rejouer un rattrapage déjà appliqué est refusé (KP409)", APPEL_N, [company.id, 8, "{}", 3], "KP409");

    // --- Contrat TypeScript <-> SQL : la charge utile fabriquée par le serveur ---
    console.log("Charge utile fabriquée par le serveur (chargeUtileDepuisLot)");
    const entrepriseApres: Entreprise = {
      id: idEntreprise(company.id),
      nom: "Test horloge",
      gamme: "milieu",
      etape: 1,
      proprietaire: { type: "pnj" },
      statut: "active",
      tresorerie: centimes(3_600), // 2 ventes de 1 200 déjà passées dans ce test + celle-ci
      stocksMatiere: [{ matiere: idMatiere(matiere), quantite: 4.25, valeurTotale: centimes(1_700) }],
      stocksFinis: [{ produit: idProduit(produit), quantite: 3, valeurTotale: centimes(250) }],
      salaries: [],
      atelier: null,
      marque: { notoriete: 33, desirabilite: 44 },
      prets: [
        {
          id: idPret(pret),
          capitalInitial: centimes(100_000),
          capitalRestant: centimes(55_000),
          tauxAnnuel: 0.04,
          dureeTotaleMois: 12,
          moisDebut: moisJeu(0),
        },
      ],
      catalogue: [],
    };
    const payload = chargeUtileDepuisLot({
      ecritures: [
        {
          id: "test_contrat_ts",
          mois: moisJeu(2),
          libelle: "Vente contrat",
          lignes: [
            { compte: "512", sens: "debit", montant: centimes(1200) },
            { compte: "707", sens: "credit", montant: centimes(1000) },
            { compte: "44571", sens: "credit", montant: centimes(200) },
          ],
        },
      ],
      entreprise: entrepriseApres,
      moisDecouvertConsecutifs: 1,
      echeancesPayees: [],
      commandesMatiereLivrees: [],
      ordresFaconnierLivres: [],
      cumul: null,
    });
    await c.query("set local role service_role");
    const r5 = await un<{ pas: number }>(c, APPEL, [company.id, 11, JSON.stringify(payload)]);
    await c.query("reset role");
    verifier("la charge utile du serveur est acceptée par la fonction SQL (pas 11 → 12)", r5.pas === 12, `(reçu ${r5.pas})`);
    const contrat = await un<{ tres: string; q: string; p: number; cap: string; notoriete: string; mdc: number }>(
      c,
      `select c.tresorerie_centimes as tres, m.quantite as q, ps.quantite_pieces as p,
              l.capital_restant_centimes as cap, b.notoriete, c.mois_decouvert_consecutifs as mdc
       from public.companies c
       join public.material_stock m on m.company_id = c.id and m.material_id = $2
       join public.product_stock ps on ps.company_id = c.id and ps.product_id = $3
       join public.loans l on l.id = $4
       join public.brand_state b on b.company_id = c.id
       where c.id = $1`,
      [company.id, matiere, produit, pret],
    );
    verifier(
      "écritures, stocks, prêt, marque et découvert sont bien enregistrés depuis cette charge utile",
      Number(contrat.tres) === 3600 && Number(contrat.q) === 4.25 && contrat.p === 3 &&
        Number(contrat.cap) === 55_000 && Number(contrat.notoriete) === 33 && contrat.mdc === 1,
      `(${JSON.stringify(contrat)})`,
    );

    // --- Migration 0021 : minuterie et diffusion en direct --------------------
    console.log("Minuterie et diffusion en direct");
    const job = await c.query("select schedule, command from cron.job where jobname = 'kapital-avance-monde'");
    verifier("la tâche « kapital-avance-monde » est programmée toutes les minutes", job.rowCount === 1 && job.rows[0].schedule === "* * * * *", `(${JSON.stringify(job.rows)})`);
    const diffusion = await c.query("select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger_entries'");
    verifier("les écritures comptables sont diffusées en direct (Realtime)", diffusion.rowCount === 1);
    const sansSecret = await un<{ r: string | null }>(c, "select public.declencher_avance_monde() as r");
    verifier("sans adresse ni secret dans le coffre, le déclencheur ne fait rien (NULL)", sansSecret.r === null);
    await c.query("select vault.create_secret('https://exemple.invalide/api/admin/monde/avancer', 'kapital_avance_url')");
    await c.query("select vault.create_secret('secret-de-test', 'kapital_cron_secret')");
    const avecSecret = await un<{ r: string | null }>(c, "select public.declencher_avance_monde() as r");
    verifier("avec adresse et secret, le déclencheur met une requête en file (pg_net)", avecSecret.r !== null, `(reçu ${avecSecret.r})`);
    // Les trois instructions du script activer-minuterie.ts : mettre à jour puis retirer les secrets
    const secretAvant = await un<{ id: string }>(c, "select id from vault.secrets where name = 'kapital_cron_secret'");
    await c.query("select vault.update_secret($1::uuid, $2::text)", [secretAvant.id, "nouveau-secret"]);
    const secretApres = await un<{ decrypted_secret: string }>(c, "select decrypted_secret from vault.decrypted_secrets where name = 'kapital_cron_secret'");
    verifier("le script d'activation peut mettre à jour un secret du coffre", secretApres.decrypted_secret === "nouveau-secret");
    await c.query("delete from vault.secrets where name = any($1::text[])", [["kapital_avance_url", "kapital_cron_secret"]]);
    const coffreVide = await un<{ r: string | null }>(c, "select public.declencher_avance_monde() as r");
    verifier("une fois les secrets retirés (--desactiver), le déclencheur ne fait plus rien", coffreVide.r === null);
    for (const role of ["anon", "authenticated"]) {
      await c.query(`set local role ${role}`);
      await attendreErreur(c, `le rôle ${role} ne peut pas appeler le déclencheur`, "select public.declencher_avance_monde()", [], "42501");
      await c.query("reset role");
    }
  } finally {
    await c.query("rollback");
    const colonne = await c.query(
      "select 1 from information_schema.columns where table_schema='public' and table_name='companies' and column_name='pas_traites'",
    );
    console.log(`\nTransaction annulée : colonne pas_traites ${colonne.rowCount === 0 ? "absente (la base est intacte)" : "PRÉSENTE (migration déjà appliquée avant le test)"}.`);
    await c.end();
  }

  if (echecs > 0) {
    console.error(`\n${echecs} vérification(s) en échec.`);
    process.exit(1);
  }
  console.log("\nToutes les vérifications passent.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
