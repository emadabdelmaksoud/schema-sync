import { createFileRoute, Link, Navigate, Outlet, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Boxes, DatabaseBackup, FileBarChart, FileSpreadsheet, FlaskConical, LayoutDashboard, LogOut,
  Package, ScanLine, ScrollText, Settings, Users as UsersIcon, Warehouse,
} from "lucide-react";
import { visibleSections, isAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { NotificationBell } from "@/components/notifications/notification-bell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading, signOut, role } = useAuth();
  const router = useRouter();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" />;

  const sections = visibleSections(role);

  const navLink =
    "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1.5 transition-colors";
  const navActive = {
    className:
      "rounded-md px-2.5 py-1.5 text-sm bg-accent text-accent-foreground font-medium inline-flex items-center gap-1.5 shadow-sm",
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between gap-3 px-4">
          <Link to="/products" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground shadow-sm">
              <Package className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">Clinic Inventory Hub</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <Link to="/dashboard" className={navLink} activeProps={navActive}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
            {sections.products && (
              <Link to="/products" className={navLink} activeProps={navActive}>Products</Link>
            )}
            {sections.products && (
              <Link to="/warehouses" className={navLink} activeProps={navActive}>
                <Warehouse className="h-4 w-4" /> Warehouses
              </Link>
            )}
            {sections.inventory && (
              <Link to="/inventory" className={navLink} activeProps={navActive}>
                <Boxes className="h-4 w-4" /> Inventory
              </Link>
            )}
            {sections.reports && (
              <Link to="/reports" className={navLink} activeProps={navActive}>
                <FileBarChart className="h-4 w-4" /> Reports
              </Link>
            )}
            {sections.importExport && (
              <Link to="/import-export" className={navLink} activeProps={navActive}>
                <FileSpreadsheet className="h-4 w-4" /> Import/Export
              </Link>
            )}
            {sections.barcodes && (
              <Link to="/barcodes" className={navLink} activeProps={navActive}>
                <ScanLine className="h-4 w-4" /> Barcodes
              </Link>
            )}
            {sections.users && (
              <Link to="/users" className={navLink} activeProps={navActive}>
                <UsersIcon className="h-4 w-4" /> Users
              </Link>
            )}
            {sections.auditLogs && (
              <Link to="/audit-logs" className={navLink} activeProps={navActive}>
                <ScrollText className="h-4 w-4" /> Audit
              </Link>
            )}
            {sections.backups && (
              <Link to="/backups" className={navLink} activeProps={navActive}>
                <DatabaseBackup className="h-4 w-4" /> Backups
              </Link>
            )}
            {sections.settings && (
              <Link to="/settings" className={navLink} activeProps={navActive}>
                <Settings className="h-4 w-4" /> Settings
              </Link>
            )}
            {isAdmin(role) && (
              <Link to="/qa" className={navLink} activeProps={navActive}>
                <FlaskConical className="h-4 w-4" /> QA
              </Link>
            )}
            <div className="mx-1 hidden h-6 w-px bg-border md:block" />
            <button
              type="button"
              onClick={() => {
                const ev = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
                window.dispatchEvent(ev);
              }}
              className="hidden md:inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Open command palette"
            >
              <span>Search</span>
              <kbd className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium border border-border">⌘K</kbd>
            </button>
            <span className="text-xs text-muted-foreground hidden lg:inline">
              {user.email} · {role ?? "—"}
            </span>
            <NotificationBell />
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logAudit({ action_type: "logout", entity_type: "auth", entity_id: user.id });
                await signOut();
                router.navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
