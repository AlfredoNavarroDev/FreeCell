import { describe, expect, it } from "vitest";
import { matchesTab, ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, ORDER_TABS } from "./order-status";
import type { OrderStatusView } from "./orders-client";

const ALL_STATUSES: OrderStatusView[] = [
  "PENDING_PAYMENT",
  "IN_REVIEW",
  "PENDING_ACTIVATION",
  "DELIVERED",
  "CANCELLED",
];

describe("ORDER_STATUS_LABEL / ORDER_STATUS_BADGE", () => {
  it("tienen una entrada para cada estado posible", () => {
    for (const status of ALL_STATUSES) {
      expect(ORDER_STATUS_LABEL[status]).toBeTruthy();
      expect(ORDER_STATUS_BADGE[status]).toBeTruthy();
    }
  });
});

describe("matchesTab", () => {
  it("'all' incluye cualquier estado", () => {
    for (const status of ALL_STATUSES) {
      expect(matchesTab(status, "all")).toBe(true);
    }
  });

  it("'delivered' solo incluye DELIVERED", () => {
    expect(matchesTab("DELIVERED", "delivered")).toBe(true);
    expect(matchesTab("PENDING_PAYMENT", "delivered")).toBe(false);
  });

  it("'pending' agrupa PENDING_PAYMENT e IN_REVIEW", () => {
    expect(matchesTab("PENDING_PAYMENT", "pending")).toBe(true);
    expect(matchesTab("IN_REVIEW", "pending")).toBe(true);
    expect(matchesTab("DELIVERED", "pending")).toBe(false);
    expect(matchesTab("CANCELLED", "pending")).toBe(false);
  });

  it("'cancelled' solo incluye CANCELLED", () => {
    expect(matchesTab("CANCELLED", "cancelled")).toBe(true);
    expect(matchesTab("IN_REVIEW", "cancelled")).toBe(false);
  });

  it("ORDER_TABS define las 4 pestañas del mockup, en orden", () => {
    expect(ORDER_TABS.map((t) => t.id)).toEqual(["all", "delivered", "pending", "cancelled"]);
  });
});
