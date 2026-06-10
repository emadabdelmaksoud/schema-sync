import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ExpiryDashboard } from "@/components/dashboard/expiry-dashboard";
import { ActivityWidgets } from "@/components/dashboard/activity-widgets";
import { StatisticsWidgets } from "@/components/dashboard/statistics-widgets";
import { NotificationWidget } from "@/components/notifications/notification-widget";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — Clinic Inventory Hub" }] }),
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6" /> Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Inventory overview, alerts, activity, and statistics across all warehouses.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Inventory overview
        </h2>
        <KpiCards />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Alerts
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ExpiryDashboard />
          <NotificationWidget />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Inventory activity
        </h2>
        <ActivityWidgets />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Statistics
        </h2>
        <StatisticsWidgets />
      </section>
    </div>
  );
}
