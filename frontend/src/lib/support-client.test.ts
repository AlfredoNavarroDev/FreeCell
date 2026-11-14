import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));

describe("support-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("createTicket hace POST /support-tickets con subject y body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const ticket = { id: "t1", subject: "Ayuda", status: "OPEN", messages: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ticket), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createTicket } = await import("./support-client");
    const result = await createTicket("Ayuda", "Necesito ayuda");

    expect(result).toEqual({ ok: true, data: ticket });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/support-tickets");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ subject: "Ayuda", body: "Necesito ayuda" });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-123" });
  });

  it("replyTicket devuelve el mensaje del backend ante 409 (ticket cerrado)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 409, message: "El ticket está cerrado" }), { status: 409 }),
      ),
    );

    const { replyTicket } = await import("./support-client");
    const result = await replyTicket("t1", "hola");

    expect(result).toEqual({ ok: false, status: 409, message: "El ticket está cerrado" });
  });

  it("devuelve 401 sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { listTickets } = await import("./support-client");
    const result = await listTickets();

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
