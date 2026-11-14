import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));

describe("support-admin-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("fetchAdminTickets pide la cola filtrada por estado", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminTickets } = await import("./support-admin-client");
    const result = await fetchAdminTickets("OPEN");

    expect(result).toEqual({ ok: true, data: page });
    expect(fetchMock.mock.calls[0][0]).toContain("/admin/support-tickets?status=OPEN&pageSize=50");
  });

  it("closeAdminTicket hace POST a /close", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ticketId: "t1", status: "CLOSED" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { closeAdminTicket } = await import("./support-admin-client");
    const result = await closeAdminTicket("t1");

    expect(result).toEqual({ ok: true, data: { ticketId: "t1", status: "CLOSED" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/support-tickets/t1/close");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("replyAdminTicket envía el body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticketId: "t1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { replyAdminTicket } = await import("./support-admin-client");
    await replyAdminTicket("t1", "Ya lo vemos");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/support-tickets/t1/messages");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ body: "Ya lo vemos" });
  });
});
