import { expect, test } from "@playwright/test";
import { expireOrderNow, markEmailVerified } from "./db";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function registerAndLogin(page: import("@playwright/test").Page) {
  const email = `e2e-checkout-${Date.now()}@freecell.test`;
  const password = "Contrasena#123";

  const registerRes = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name: "Cliente Checkout E2E" },
  });
  expect(registerRes.ok()).toBeTruthy();
  await markEmailVerified(email);

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
}

test("flujo feliz: producto -> carrito -> checkout -> pago -> entrega", async ({ page }) => {
  await registerAndLogin(page);

  // Intercepta la subida directa a R2: en este entorno de e2e no se valida contenido real,
  // solo que el frontend hace el PUT con el Content-Type correcto.
  await page.route("**/*.r2.cloudflarestorage.com/**", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );

  await page.goto("/p/producto-demo");
  await page.getByRole("button", { name: "Comprar ahora" }).click();

  await expect(page).toHaveURL("/checkout");
  await expect(page.getByText("[Plan demo]")).toBeVisible();
  await page.getByRole("button", { name: "Continuar a pago" }).click();

  await expect(page).toHaveURL(/\/checkout\/.+\/pago/);
  await expect(page.getByText(/Reserva vigente/)).toBeVisible();

  await page.getByLabel("N.º de operación").fill(`OP-${Date.now()}`);
  const fileInput = page.getByLabel(/Comprobante/);
  await fileInput.setInputFiles({
    name: "comprobante.png",
    mimeType: "image/png",
    // El contenido debe ser único por corrida: proofHash es único globalmente (D21),
    // y cancelar el pedido no borra el Payment ya insertado.
    buffer: Buffer.from(`comprobante-e2e-${Date.now()}`),
  });
  await page.getByLabel(/Declaro ser propietario/).check();
  await page.getByRole("button", { name: "Confirmar pago" }).click();

  await expect(page).toHaveURL(/\/checkout\/.+\/entrega/);
  await expect(page.getByText("¡Comprobante recibido!")).toBeVisible();

  const orderId = page.url().match(/\/checkout\/([^/]+)\/entrega/)?.[1];
  expect(orderId).toBeTruthy();
  const session = await (await page.request.get("/api/auth/session")).json();
  await page.request.post(`${API_URL}/orders/${orderId}/cancel`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
});

test("reserva vencida bloquea la subida del comprobante", async ({ page }) => {
  await registerAndLogin(page);

  await page.goto("/p/producto-demo");
  await page.getByRole("button", { name: "Comprar ahora" }).click();
  await page.getByRole("button", { name: "Continuar a pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/.+\/pago/);

  const orderId = page.url().match(/\/checkout\/([^/]+)\/pago/)?.[1];
  expect(orderId).toBeTruthy();
  await expireOrderNow(orderId!);

  await page.reload();
  // Next.js dev (streaming SSR) puede dejar, apenas tras el reload, una copia oculta
  // del árbol anterior (`hidden`) mientras React termina de reconciliar: filtrar por
  // visibilidad evita que esa copia transitoria duplique los matches.
  await expect(page.getByText("Reserva vencida").and(page.locator(":visible"))).toBeVisible();
  await expect(page.getByLabel(/Comprobante/).and(page.locator(":visible"))).toHaveCount(0);

  const session = await (await page.request.get("/api/auth/session")).json();
  await page.request.post(`${API_URL}/orders/${orderId}/cancel`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
});
