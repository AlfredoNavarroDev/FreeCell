import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  fetchPaymentMethods,
  fetchProductDetail,
} from "./catalog-client";

describe("fetchCatalogProducts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arma la URL con query, category, sort y pageSize", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCatalogProducts({ query: "unlock", category: "cat-1", sort: "price_asc", pageSize: 50 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/catalog/products?");
    expect(calledUrl).toContain("query=unlock");
    expect(calledUrl).toContain("category=cat-1");
    expect(calledUrl).toContain("sort=price_asc");
    expect(calledUrl).toContain("pageSize=50");
  });

  it("omite parámetros no provistos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCatalogProducts({});

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("query=");
    expect(calledUrl).not.toContain("category=");
    expect(calledUrl).not.toContain("sort=");
  });

  it("devuelve los productos parseados del backend", async () => {
    const payload = {
      items: [
        {
          id: "p1",
          name: "UnlockTool",
          slug: "unlocktool",
          categoryName: "Desbloqueo",
          priceFromCents: 8900,
          currency: "PEN",
          stockState: "IN_STOCK",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCatalogProducts({});

    expect(result).toEqual(payload);
  });

  it("lanza un error si el backend responde con un status de error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCatalogProducts({})).rejects.toThrow();
  });
});

describe("fetchCatalogCategories", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve las categorías del backend", async () => {
    const payload = [{ id: "c1", name: "Desbloqueo" }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCatalogCategories();

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/catalog/categories"),
      expect.anything(),
    );
  });
});

describe("fetchPaymentMethods", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pide los métodos de pago en soles por defecto", async () => {
    const payload = [
      { id: "m1", code: "yape", name: "Yape", kind: "WALLET", currencies: ["PEN"], active: true },
    ];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPaymentMethods();

    expect(result).toEqual(payload);
    expect((fetchMock.mock.calls[0][0] as string)).toContain("currency=PEN");
  });
});

describe("fetchProductDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve la ficha del producto parseada", async () => {
    const payload = {
      id: "p1",
      name: "UnlockTool",
      slug: "unlocktool",
      description: "Desbloquea el equipo",
      whatIncluded: "1 licencia",
      compatibility: "Android",
      activationGuide: "Paso 1...",
      faq: [{ question: "¿Cuánto dura?", answer: "30 días" }],
      categoryName: "Desbloqueo",
      requiresToolUsername: false,
      plans: [
        {
          id: "plan-1",
          name: "Plan mensual",
          kind: "NEW",
          durationDays: 30,
          prices: [{ currency: "PEN", priceCents: 8900 }],
          stockState: "IN_STOCK",
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProductDetail("unlocktool");

    expect(result).toEqual(payload);
    expect((fetchMock.mock.calls[0][0] as string)).toContain("/catalog/products/unlocktool");
  });

  it("devuelve null si el producto no existe (404)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProductDetail("no-existe");

    expect(result).toBeNull();
  });

  it("lanza un error si el backend responde con otro status de error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProductDetail("unlocktool")).rejects.toThrow();
  });
});
