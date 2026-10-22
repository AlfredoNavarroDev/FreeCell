import { expect, test } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("anónimo que visita /admin es redirigido a /login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin/);
});

test("cliente (rol CUSTOMER) no puede entrar a /admin", async ({ page }) => {
  const email = `e2e-customer-${Date.now()}@freecell.test`;
  const password = "Contrasena#123";
  await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name: "Cliente E2E" },
  });

  await loginAs(page, email, password);
  await expect(page).toHaveURL("/");

  await page.goto("/admin");
  await expect(page).toHaveURL("/");
});

test("admin puede entrar a /admin", async ({ page }) => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD no están definidos (revisar backend/.env)");
  }

  await loginAs(page, adminEmail, adminPassword);
  await expect(page).toHaveURL("/");

  await page.goto("/admin");
  await expect(page.getByText("Panel admin")).toBeVisible();
});
