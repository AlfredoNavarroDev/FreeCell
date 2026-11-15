import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProductReviews } from "./reviews-public-client";

describe("fetchProductReviews", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pide la página indicada del slug, sin caché", async () => {
    const page = { items: [], total: 0, page: 2, pageSize: 10, ratingAvg: null, ratingCount: 0 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProductReviews("mi-producto", 2, 10);

    expect(result).toEqual(page);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/catalog/products/mi-producto/reviews?page=2&pageSize=10");
    expect((init as RequestInit).cache).toBe("no-store");
  });

  it("usa página 1 y pageSize 10 por defecto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchProductReviews("mi-producto");

    expect(fetchMock.mock.calls[0][0]).toContain("page=1&pageSize=10");
  });

  it("devuelve null si el backend responde error (404, 500)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchProductReviews("no-existe")).toBeNull();
  });

  it("devuelve null si falla la red", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    expect(await fetchProductReviews("mi-producto")).toBeNull();
  });
});
