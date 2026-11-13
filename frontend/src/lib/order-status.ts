import type { OrderStatusView } from "./orders-client";

export type OrderTab = "all" | "delivered" | "pending" | "cancelled";

export const ORDER_TABS: { id: OrderTab; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "delivered", label: "Entregados" },
  { id: "pending", label: "Pendientes" },
  { id: "cancelled", label: "Cancelados" },
];

export const ORDER_STATUS_LABEL: Record<OrderStatusView, string> = {
  PENDING_PAYMENT: "Esperando pago",
  IN_REVIEW: "Pago en revisión",
  PENDING_ACTIVATION: "Activando licencia",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export const ORDER_STATUS_BADGE: Record<OrderStatusView, string> = {
  PENDING_PAYMENT: "bg-warning-bg text-warning-ink",
  IN_REVIEW: "bg-accent-soft-bg text-accent-soft-ink",
  PENDING_ACTIVATION: "bg-accent-soft-bg text-accent-soft-ink",
  DELIVERED: "bg-success-bg text-success-ink",
  CANCELLED: "bg-line-soft text-muted",
};

/** Agrupa PENDING_PAYMENT e IN_REVIEW bajo "Pendientes" (mockup Pedidos.dc.html); el backend solo filtra por un status exacto. */
export function matchesTab(status: OrderStatusView, tab: OrderTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "delivered":
      return status === "DELIVERED";
    case "pending":
      return status === "PENDING_PAYMENT" || status === "IN_REVIEW";
    case "cancelled":
      return status === "CANCELLED";
  }
}
