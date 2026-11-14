import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("fetchAdminClaims", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("pide la cola con status y pageSize en la query", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminClaims } = await import("./claims-admin-client");
    const result = await fetchAdminClaims("OPEN", 50);

    expect(result).toEqual({ ok: true, data: page });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/claims?status=OPEN&pageSize=50");
  });

  it("usa status=OPEN y pageSize=50 por defecto", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminClaims } = await import("./claims-admin-client");
    await fetchAdminClaims();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/claims?status=OPEN&pageSize=50");
  });
});

describe("replaceClaim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST /admin/claims/:id/replace", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const result = { claimId: "claim-1", status: "RESOLVED", orderNumber: 1001 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { replaceClaim } = await import("./claims-admin-client");
    const res = await replaceClaim("claim-1");

    expect(res).toEqual({ ok: true, data: result });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/claims/claim-1/replace");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("devuelve ok:false con el mensaje del backend si no hay stock (409)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 409,
          message: "Sin stock para reponer; el pedido queda en espera del próximo lote",
          error: "Conflict",
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { replaceClaim } = await import("./claims-admin-client");
    const res = await replaceClaim("claim-1");

    expect(res).toEqual({
      ok: false,
      status: 409,
      message: "Sin stock para reponer; el pedido queda en espera del próximo lote",
    });
  });
});

describe("rejectClaim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST /admin/claims/:id/reject con el motivo en el body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const result = { claimId: "claim-1", status: "REJECTED", orderNumber: 1001 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { rejectClaim } = await import("./claims-admin-client");
    const res = await rejectClaim("claim-1", "La clave funciona correctamente");

    expect(res).toEqual({ ok: true, data: result });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/claims/claim-1/reject");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      reason: "La clave funciona correctamente",
    });
  });
});
