import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("createOrder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("envía currency=PEN, items y toolUsername con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const orderPayload = {
      id: "order-1",
      orderNumber: 1,
      status: "PENDING_PAYMENT",
      totalCents: 8900,
      currency: "PEN",
      expiresAt: "2026-11-03T16:00:00.000Z",
      cancelReason: null,
      items: [{ planId: "plan-1", unitPriceCents: 8900 }],
      paymentStatus: null,
      paymentRejectionReason: null,
      tracking: { createdAt: "2026-11-03T15:30:00.000Z", paymentApprovedAt: null, deliveredAt: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(orderPayload), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }], "usuario-herramienta");

    expect(result).toEqual({ ok: true, data: orderPayload });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-123" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      currency: "PEN",
      items: [{ planId: "plan-1", qty: 1 }],
      toolUsername: "usuario-herramienta",
    });
  });

  it("devuelve ok:false con el mensaje del backend si falla (ej. 409 sin stock)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: "Sin stock suficiente de Plan mensual", error: "Conflict" }), {
        status: 409,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }]);

    expect(result).toEqual({ ok: false, status: 409, message: "Sin stock suficiente de Plan mensual" });
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }]);

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("une el message en array (errores de validación) con coma", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 400, message: ["La cantidad mínima es 1", "moneda inválida"], error: "Bad Request" }), {
        status: 400,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }]);

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "La cantidad mínima es 1, moneda inválida",
    });
  });
});

describe("getOrder / requestPaymentUploadUrl / submitPayment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("getOrder hace GET /orders/:id con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getOrder } = await import("./orders-client");
    await getOrder("order-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders/order-1");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("requestPaymentUploadUrl envía contentType y fileSizeBytes", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ uploadUrl: "https://r2/x", proofKey: "proofs/order-1/a.png" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { requestPaymentUploadUrl } = await import("./orders-client");
    const result = await requestPaymentUploadUrl("order-1", "image/png", 1024);

    expect(result).toEqual({ ok: true, data: { uploadUrl: "https://r2/x", proofKey: "proofs/order-1/a.png" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      contentType: "image/png",
      fileSizeBytes: 1024,
    });
  });

  it("submitPayment envía el body completo del pago", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order-1", status: "IN_REVIEW" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { submitPayment } = await import("./orders-client");
    await submitPayment("order-1", {
      paymentMethodId: "method-1",
      proofKey: "proofs/order-1/a.png",
      proofHash: "a".repeat(64),
      operationNumber: "123456",
      acceptsLegalDeclaration: true,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders/order-1/payment");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      paymentMethodId: "method-1",
      proofKey: "proofs/order-1/a.png",
      proofHash: "a".repeat(64),
      operationNumber: "123456",
      acceptsLegalDeclaration: true,
    });
  });
});

describe("listOrders / revealLicense", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("listOrders hace GET /orders sin status por defecto", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { listOrders } = await import("./orders-client");
    const result = await listOrders();

    expect(result).toEqual({ ok: true, data: page });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders?pageSize=50");
    expect(url).not.toContain("status=");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("listOrders agrega status cuando se pasa", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { listOrders } = await import("./orders-client");
    await listOrders("DELIVERED");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("status=DELIVERED");
  });

  it("revealLicense hace POST /orders/:id/license/reveal y devuelve las claves", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const revealed = [{ orderItemId: "item-1", planId: "plan-1", secret: "CLAVE-SECRETA" }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(revealed), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { revealLicense } = await import("./orders-client");
    const result = await revealLicense("order-1");

    expect(result).toEqual({ ok: true, data: revealed });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders/order-1/license/reveal");
    expect((init as RequestInit).method).toBe("POST");
  });
});
