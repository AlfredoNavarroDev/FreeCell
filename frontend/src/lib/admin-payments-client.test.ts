import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("fetchAdminPayments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("pide la cola con status y pageSize en la query, con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminPayments } = await import("./admin-payments-client");
    const result = await fetchAdminPayments("PENDING", 50);

    expect(result).toEqual({ ok: true, data: page });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments?status=PENDING&pageSize=50");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-admin" });
  });

  it("usa status=PENDING y pageSize=50 por defecto", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminPayments } = await import("./admin-payments-client");
    await fetchAdminPayments();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments?status=PENDING&pageSize=50");
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminPayments } = await import("./admin-payments-client");
    const result = await fetchAdminPayments();

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("approvePayment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/payments/:id/approve con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const order = {
      id: "order-1",
      orderNumber: 1,
      status: "DELIVERED",
      totalCents: 1000,
      currency: "PEN",
      expiresAt: "2026-11-07T00:00:00.000Z",
      cancelReason: null,
      items: [{ planId: "plan-1", unitPriceCents: 1000 }],
      paymentStatus: "APPROVED",
      paymentRejectionReason: null,
      tracking: { createdAt: "2026-11-07T00:00:00.000Z", paymentApprovedAt: "2026-11-07T00:01:00.000Z", deliveredAt: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(order), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { approvePayment } = await import("./admin-payments-client");
    const result = await approvePayment("payment-1");

    expect(result).toEqual({ ok: true, data: order });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments/payment-1/approve");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-admin" });
  });

  it("devuelve ok:false con el mensaje del backend si falla (ej. 409 ya revisado)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: "El pago ya fue revisado", error: "Conflict" }), {
        status: 409,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { approvePayment } = await import("./admin-payments-client");
    const result = await approvePayment("payment-1");

    expect(result).toEqual({ ok: false, status: 409, message: "El pago ya fue revisado" });
  });
});

describe("rejectPayment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/payments/:id/reject con el motivo en el body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const order = {
      id: "order-1",
      orderNumber: 1,
      status: "PENDING_PAYMENT",
      totalCents: 1000,
      currency: "PEN",
      expiresAt: "2026-11-07T00:30:00.000Z",
      cancelReason: null,
      items: [{ planId: "plan-1", unitPriceCents: 1000 }],
      paymentStatus: "REJECTED",
      paymentRejectionReason: "Comprobante ilegible",
      tracking: { createdAt: "2026-11-07T00:00:00.000Z", paymentApprovedAt: null, deliveredAt: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(order), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { rejectPayment } = await import("./admin-payments-client");
    const result = await rejectPayment("payment-1", "ILLEGIBLE_PROOF");

    expect(result).toEqual({ ok: true, data: order });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments/payment-1/reject");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: "ILLEGIBLE_PROOF" });
  });
});
