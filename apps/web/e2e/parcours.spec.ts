import { test, expect, type Page } from "@playwright/test";

const emailTest = `t19-${Date.now()}@kapital-e2e.local`;
const motDePasse = "motDePasseE2E123!";
const pseudoTest = `e2e_${Date.now()}`;
const nomEntreprise = `Marque E2E ${Date.now()}`;

async function remplirInscription(page: Page) {
  await page.getByLabel("Pseudo").fill(pseudoTest);
  await page.getByLabel("Email").fill(emailTest);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: /créer mon compte/i }).click();
}

test("parcours complet : inscription → création entreprise → tableau de bord", async ({ page }) => {
  // Landing
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kapital" })).toBeVisible();

  // Inscription
  await page.getByRole("link", { name: /créer un compte/i }).click();
  await expect(page).toHaveURL(/\/inscription$/);
  await remplirInscription(page);

  // Création entreprise
  await expect(page).toHaveURL(/\/creer-entreprise$/, { timeout: 15_000 });
  await page.getByLabel("Nom de la marque").fill(nomEntreprise);
  await page.getByText("Haut", { exact: true }).click();
  await page.getByRole("button", { name: /démarrer l'aventure/i }).click();

  // Jeu
  await expect(page).toHaveURL(/\/jeu$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: nomEntreprise })).toBeVisible();
  await expect(page.locator("text=20 000,00 €")).toBeVisible();
});
