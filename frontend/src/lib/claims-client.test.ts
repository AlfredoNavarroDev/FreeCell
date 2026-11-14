import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("createClaim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST /claims con orderId, orderItemId y reason", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const claim = {
      id: "claim-1",
      orderId: "order-1",
      orderNumber: 1001,
      status: "OPEN",
      reason: "La clave no funciona",
      rejectionReason: null,
      createdAt: "2026-11-13T00:00:00.000Z",
      resolvedAt: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(claim), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createClaim } = await import("./claims-client");
    const result = await createClaim("order-1", "item-1", "La clave no funciona");

    expect(result).toEqual({ ok: true, data: claim });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/claims");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      orderId: "order-1",
      orderItemId: "item-1",
      reason: "La clave no funciona",
    });
  });

  it("devuelve ok:false con el mensaje del backend si falla (ej. 409 ventana vencida)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ statusCode: 409, message: "La ventana de reposición de 7 días ya venció", error: "Conflict" }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createClaim } = await import("./claims-client");
    const result = await createClaim("order-1", "item-1", "motivo");

    expect(result).toEqual({
      ok: false,
      status: 409,
      message: "La ventana de reposición de 7 días ya venció",
    });
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { createClaim } = await import("./claims-client");
    const result = await createClaim("order-1", "item-1", "motivo");

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listClaims", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace GET /claims con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { listClaims } = await import("./claims-client");
    const result = await listClaims();

    expect(result).toEqual({ ok: true, data: page });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/claims");
    expect((init as RequestInit).method).toBe("GET");
  });
});
