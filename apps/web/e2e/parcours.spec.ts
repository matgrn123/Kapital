import { test, expect } from "@playwright/test";

// Pendant la phase de développement, le site auto-connecte chaque visiteur
// sur le compte partagé via le middleware. Les pages /connexion /inscription
// /creer-entreprise sont supprimées. Le test vérifie seulement qu'ouvrir la
// racine mène au tableau de bord sans erreur.
//
// Nécessite les variables KAPITAL_DEV_EMAIL / KAPITAL_DEV_PASSWORD côté
// serveur (voir tools/supabase/configurer-compte-dev.ts).

test("racine redirige vers le tableau de bord du compte partagé", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/jeu$/, { timeout: 15_000 });
});
