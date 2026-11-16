import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("fetchAdminReviews", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("pide la cola con status y pageSize en la query", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminReviews } = await import("./reviews-admin-client");
    const result = await fetchAdminReviews("HIDDEN", 20);

    expect(result).toEqual({ ok: true, data: page });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/reviews?status=HIDDEN&pageSize=20");
  });

  it("usa status=PENDING y pageSize=50 por defecto", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminReviews } = await import("./reviews-admin-client");
    await fetchAdminReviews();

    expect(fetchMock.mock.calls[0][0]).toContain("/admin/reviews?status=PENDING&pageSize=50");
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminReviews } = await import("./reviews-admin-client");
    const result = await fetchAdminReviews();

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("approveReview y hideReview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("approveReview hace POST /admin/reviews/:id/approve", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const result = { reviewId: "rev-1", status: "APPROVED" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { approveReview } = await import("./reviews-admin-client");
    const res = await approveReview("rev-1");

    expect(res).toEqual({ ok: true, data: result });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/reviews/rev-1/approve");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("hideReview hace POST /admin/reviews/:id/hide", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const result = { reviewId: "rev-1", status: "HIDDEN" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { hideReview } = await import("./reviews-admin-client");
    const res = await hideReview("rev-1");

    expect(res).toEqual({ ok: true, data: result });
    expect(fetchMock.mock.calls[0][0]).toContain("/admin/reviews/rev-1/hide");
  });

  it("devuelve ok:false con el mensaje del backend si ya tiene ese estado (409)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: "La reseña ya tiene ese estado" }), { status: 409 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { approveReview } = await import("./reviews-admin-client");
    const res = await approveReview("rev-1");

    expect(res).toEqual({ ok: false, status: 409, message: "La reseña ya tiene ese estado" });
  });
});
