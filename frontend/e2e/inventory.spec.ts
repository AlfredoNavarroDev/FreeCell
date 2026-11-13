import { expect, test } from "@playwright/test";

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

test("admin carga un lote con una clave duplicada y luego anula una licencia", async ({ page }) => {
  await loginAsAdmin(page);
  // Nota: BUG-01 (docs/11-bugs-pendientes.md) duplica el contenido de /admin en un
  // BrowserContext nuevo si se navega a él justo después del login. Una navegación
  // intermedia a otra ruta evita el bug (igual que admin-payments.spec.ts, que nunca
  // lo reproduce por el checkout previo en el mismo contexto).
  await page.goto("/p/producto-demo");
  await page.goto("/admin/inventario");
  // El streaming SSR de Next 16 puede tardar unos instantes en "colapsar" el shell
  // duplicado (BUG-01, ver docs/11-bugs-pendientes.md: duplica todo el contenido de
  // /admin, incluido el <main>, en un BrowserContext nuevo). El shell oculto no cuenta
  // para locators por rol (getByRole excluye nodos fuera del árbol de accesibilidad),
  // así que esperamos a que el <main> accesible quede en una sola copia y acotamos
  // todos los locators a él para no chocar con el duplicado oculto.
  const main = page.getByRole("main");
  await expect(main).toHaveCount(1, { timeout: 10_000 });
  // El <select> de Plan, dentro de su <label>, calcula su nombre accesible como "Plan" +
  // el texto de todas sus <option> (comportamiento real del navegador, no un bug de la
  // pantalla), lo que además choca por substring con el aria-label "Stock por plan" de
  // la otra sección — acotar a la sección "Cargar licencias" evita esa colisión.
  const cargarLicencias = main.getByRole("region", { name: "Cargar licencias" });

  const key = `E2E-${Date.now()}`;
  await cargarLicencias.getByLabel("Plan").selectOption({ label: "[Producto demo] · [Plan demo]" });
  await main.getByLabel("Moneda del costo").selectOption("PEN");
  await main.getByLabel(/Costo por licencia/).fill("5.00");
  await main.getByLabel("Pega una licencia por línea").fill(`${key}\n${key}`);

  await expect(main.getByText("1 válidas")).toBeVisible();
  await expect(main.getByText("1 duplicadas (se omiten)")).toBeVisible();

  await main.getByRole("button", { name: "Cargar al inventario" }).click();
  await expect(main.getByText(/1 licencias cargadas/)).toBeVisible();

  await main.getByRole("button", { name: /\[Producto demo\] · \[Plan demo\]/ }).click();
  await expect(main.getByText(/Cargada el/).first()).toBeVisible();

  await main.getByRole("button", { name: "Anular" }).last().click();
  await main.getByPlaceholder("Motivo de la anulación").fill("Clave de prueba E2E, se descarta");
  await main.getByRole("button", { name: "Confirmar" }).click();

  await expect(main.getByPlaceholder("Motivo de la anulación")).toHaveCount(0);
});
