import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("fetchInventory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace GET a /admin/inventory con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], usdPenRate: null };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchInventory } = await import("./inventory-client");
    const result = await fetchInventory();

    expect(result).toEqual({ ok: true, data: page });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-admin" });
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchInventory } = await import("./inventory-client");
    const result = await fetchInventory();

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchAvailableLicenses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace GET a /admin/inventory/plans/:planId/licenses", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const list = [{ id: "lic-1", createdAt: "2026-11-11T00:00:00.000Z" }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(list), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAvailableLicenses } = await import("./inventory-client");
    const result = await fetchAvailableLicenses("plan-1");

    expect(result).toEqual({ ok: true, data: list });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/plans/plan-1/licenses");
  });
});

describe("previewBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/inventory/batches/preview con planId y secrets", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const summary = { validCount: 1, duplicateCount: 1, errorCount: 0 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { previewBatch } = await import("./inventory-client");
    const result = await previewBatch("plan-1", ["A", "A"]);

    expect(result).toEqual({ ok: true, data: summary });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/batches/preview");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      planId: "plan-1",
      secrets: ["A", "A"],
    });
  });
});

describe("createBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/inventory/batches con el body completo", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const result = { batchId: "batch-1", loadedCount: 1, duplicateCount: 0, errorCount: 0 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createBatch } = await import("./inventory-client");
    const res = await createBatch({
      planId: "plan-1",
      costCurrency: "USD",
      unitCostCents: 200,
      supplier: "Proveedor X",
      secrets: ["A"],
    });

    expect(res).toEqual({ ok: true, data: result });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/batches");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      planId: "plan-1",
      costCurrency: "USD",
      unitCostCents: 200,
      supplier: "Proveedor X",
      secrets: ["A"],
    });
  });

  it("devuelve ok:false con el mensaje del backend si falla (ej. 400 sin tasa configurada)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ statusCode: 400, message: "Configura la tasa USD→PEN antes de cargar un lote en dólares", error: "Bad Request" }),
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createBatch } = await import("./inventory-client");
    const res = await createBatch({
      planId: "plan-1",
      costCurrency: "USD",
      unitCostCents: 200,
      secrets: ["A"],
    });

    expect(res).toEqual({
      ok: false,
      status: 400,
      message: "Configura la tasa USD→PEN antes de cargar un lote en dólares",
    });
  });
});

describe("voidLicense", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/inventory/licenses/:id/void con el motivo, sin cuerpo en la respuesta (204)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { voidLicense } = await import("./inventory-client");
    const result = await voidLicense("lic-1", "Clave inválida");

    expect(result).toEqual({ ok: true, data: undefined });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/licenses/lic-1/void");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: "Clave inválida" });
  });
});

describe("updateUsdRate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace PUT a /admin/inventory/usd-rate con la tasa", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { updateUsdRate } = await import("./inventory-client");
    const result = await updateUsdRate(3.75);

    expect(result).toEqual({ ok: true, data: undefined });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/usd-rate");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ rate: 3.75 });
  });
});
