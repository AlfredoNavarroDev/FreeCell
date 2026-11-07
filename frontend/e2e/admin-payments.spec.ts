import { expect, test } from "@playwright/test";
import { markEmailVerified, releaseDeliveredOrderLicense, releaseOrderLicenses } from "./db";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function registerAndLoginCustomer(
  page: import("@playwright/test").Page,
): Promise<{ orderId: string; name: string }> {
  const email = `e2e-admin-flow-${Date.now()}@freecell.test`;
  const name = `Cliente Admin E2E ${Date.now()}`;
  const password = "Contrasena#123";

  const registerRes = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name },
  });
  expect(registerRes.ok()).toBeTruthy();
  await markEmailVerified(email);

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.route("**/*.r2.cloudflarestorage.com/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.goto("/p/producto-demo");
  await page.getByRole("button", { name: "Comprar ahora" }).click();
  await expect(page).toHaveURL("/checkout");
  await page.getByRole("button", { name: "Continuar a pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/.+\/pago/);

  const orderId = page.url().match(/\/checkout\/([^/]+)\/pago/)?.[1];
  if (!orderId) throw new Error("No se pudo extraer el orderId de la URL");

  await page.getByLabel("N.º de operación").fill(`OP-${Date.now()}`);
  await page.getByLabel(/Comprobante/).setInputFiles({
    name: "comprobante.png",
    mimeType: "image/png",
    buffer: Buffer.from(`comprobante-admin-e2e-${Date.now()}`),
  });
  await page.getByLabel(/Declaro ser propietario/).check();
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/.+\/entrega/);

  return { orderId, name };
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD no están definidos (revisar backend/.env)");
  }
  await page.goto("/login");
  await page.getByLabel("Correo").fill(adminEmail);
  await page.getByLabel("Contraseña").fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
}

test("admin rechaza un pago: vuelve a PENDING_PAYMENT y desaparece de la cola", async ({ page }) => {
  const { orderId, name } = await registerAndLoginCustomer(page);

  await loginAsAdmin(page);
  await page.goto("/admin/pagos");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Rechazar" }).click();
  await page.getByRole("button", { name: "Comprobante ilegible" }).click();
  await page.getByRole("button", { name: "Confirmar rechazo" }).click();

  await expect(page.getByText(/rechazado/)).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);

  await releaseOrderLicenses(orderId);
});

test("admin aprueba un pago: entrega la licencia y desaparece de la cola", async ({ page }) => {
  const { orderId, name } = await registerAndLoginCustomer(page);

  await loginAsAdmin(page);
  await page.goto("/admin/pagos");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Aprobar y entregar licencia" }).click();

  await expect(page.getByText(/aprobado/)).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);

  await releaseDeliveredOrderLicense(orderId);
});
