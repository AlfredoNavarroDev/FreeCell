import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("createReview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST /reviews con orderId, productId, rating y body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const review = {
      id: "rev-1",
      orderId: "order-1",
      productId: "prod-1",
      productName: "Producto",
      rating: 5,
      body: "Funcionó perfecto y rápido",
      status: "PENDING",
      createdAt: "2026-11-15T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(review), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createReview } = await import("./reviews-client");
    const result = await createReview("order-1", "prod-1", 5, "Funcionó perfecto y rápido");

    expect(result).toEqual({ ok: true, data: review });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/reviews");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      orderId: "order-1",
      productId: "prod-1",
      rating: 5,
      body: "Funcionó perfecto y rápido",
    });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-123" });
  });

  it("devuelve ok:false con el mensaje del backend (ej. 409 duplicado)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ statusCode: 409, message: "Ya valoraste este producto en este pedido", error: "Conflict" }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createReview } = await import("./reviews-client");
    const result = await createReview("order-1", "prod-1", 5, "Texto suficientemente largo");

    expect(result).toEqual({
      ok: false,
      status: 409,
      message: "Ya valoraste este producto en este pedido",
    });
  });

  it("une los mensajes de validación cuando el backend devuelve una lista", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 400, message: ["rating debe estar entre 1 y 5", "body demasiado corto"] }), {
        status: 400,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createReview } = await import("./reviews-client");
    const result = await createReview("o", "p", 0, "x");

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "rating debe estar entre 1 y 5, body demasiado corto",
    });
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { createReview } = await import("./reviews-client");
    const result = await createReview("o", "p", 5, "Texto suficientemente largo");

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listMyReviews", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace GET /reviews?pageSize=50 con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { listMyReviews } = await import("./reviews-client");
    const result = await listMyReviews();

    expect(result).toEqual({ ok: true, data: page });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/reviews?pageSize=50");
    expect((init as RequestInit).method).toBe("GET");
  });
});
