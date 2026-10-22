import { expect, test } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

test("cerrar sesión limpia la sesión de NextAuth", async ({ page }) => {
  const email = `e2e-logout-${Date.now()}@freecell.test`;
  const password = "Contrasena#123";
  await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name: "Cliente E2E" },
  });

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/cuenta");
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL("/");

  const sessionRes = await page.request.get("/api/auth/session");
  const session = await sessionRes.json();
  // Auth.js v5 devuelve el literal JSON `null` (no `{}`) cuando no hay sesión.
  expect(session).toBeNull();
});
