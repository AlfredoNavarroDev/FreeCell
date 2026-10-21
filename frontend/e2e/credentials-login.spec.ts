import { expect, test } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

test("un cliente registrado puede iniciar sesión con credenciales", async ({ page }) => {
  const email = `e2e-${Date.now()}@freecell.test`;
  const password = "Contrasena#123";

  const registerRes = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name: "Cliente E2E" },
  });
  expect(registerRes.ok()).toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL("/");

  const sessionRes = await page.request.get("/api/auth/session");
  const session = await sessionRes.json();
  expect(session.user.email).toBe(email);
  expect(session.user.role).toBe("CUSTOMER");
  expect(session.accessToken).toBeTruthy();
  expect(session.refreshToken).toBeUndefined();
});

test("credenciales inválidas muestran error y no crean sesión", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("no-existe@freecell.test");
  await page.getByLabel("Contraseña").fill("loquesea123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/login\?error=credenciales/);

  const sessionRes = await page.request.get("/api/auth/session");
  const session = await sessionRes.json();
  // Auth.js v5 devuelve el literal JSON `null` (no `{}`) cuando no hay sesión,
  // para que las comprobaciones de verdad (truthiness) fallen de forma segura.
  expect(session).toBeNull();
});
