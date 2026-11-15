"use client";

import { useState } from "react";
import { AdminReviewsQueue } from "@/components/admin-reviews-queue";
import { AdminSupportQueue } from "@/components/admin-support-queue";
import type { AdminReviewView } from "@/lib/reviews-admin-client";
import type { AdminTicketSummary } from "@/lib/support-admin-client";

type TabKey = "tickets" | "reviews";

const TABS: { key: TabKey; label: string }[] = [
  { key: "tickets", label: "Tickets" },
  { key: "reviews", label: "Reseñas" },
];

export function AdminSupportTabs({
  initialTickets,
  initialReviews,
  reviewsError = null,
}: {
  initialTickets: AdminTicketSummary[];
  initialReviews: AdminReviewView[];
  reviewsError?: string | null;
}) {
  const [active, setActive] = useState<TabKey>("tickets");

  return (
    <div>
      <div className="mb-5 flex gap-2 border-b border-line" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`soporte-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`soporte-panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
              active === tab.key ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="soporte-panel-tickets"
        aria-labelledby="soporte-tab-tickets"
        hidden={active !== "tickets"}
      >
        <AdminSupportQueue initialTickets={initialTickets} />
      </div>
      <div
        role="tabpanel"
        id="soporte-panel-reviews"
        aria-labelledby="soporte-tab-reviews"
        hidden={active !== "reviews"}
      >
        {reviewsError ? <p className="mb-3 text-danger-ink">{reviewsError}</p> : null}
        <AdminReviewsQueue initialReviews={initialReviews} />
      </div>
    </div>
  );
}
