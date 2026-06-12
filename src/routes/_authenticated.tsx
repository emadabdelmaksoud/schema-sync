import { createFileRoute, Link, Navigate, Outlet, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Boxes, DatabaseBackup, FileBarChart, FileSpreadsheet, FlaskConical, LayoutDashboard, LogOut,
  Menu, Package, ScanLine, ScrollText, Search as SearchIcon, Settings, Users as UsersIcon, Warehouse,
} from "lucide-react";
import { visibleSections, isAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading, signOut, role } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const mobileLink =
    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors";
  const mobileActive = {
    className:
      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm bg-accent text-accent-foreground font-medium",
  };

  const navItems = [
    { show: true, to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { show: sections.products, to: "/products", label: "Products", icon: Package },
    { show: sections.products, to: "/warehouses", label: "Warehouses", icon: Warehouse },
    { show: sections.inventory, to: "/inventory", label: "Inventory", icon: Boxes },
    { show: sections.reports, to: "/reports", label: "Reports", icon: FileBarChart },
    { show: sections.importExport, to: "/import-export", label: "Import/Export", icon: FileSpreadsheet },
    { show: sections.barcodes, to: "/barcodes", label: "Barcodes", icon: ScanLine },
    { show: sections.users, to: "/users", label: "Users", icon: UsersIcon },
    { show: sections.auditLogs, to: "/audit-logs", label: "Audit", icon: ScrollText },
    { show: sections.backups, to: "/backups", label: "Backups", icon: DatabaseBackup },
    { show: sections.settings, to: "/settings", label: "Settings", icon: Settings },
    { show: isAdmin(role), to: "/qa", label: "QA", icon: FlaskConical },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden shrink-0" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col">
              <SheetHeader className="border-b p-4 text-left">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground shadow-sm">
                    <Package className="h-4 w-4" />
                  </span>
                  Clinic Inventory Hub
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {navItems.filter((i) => i.show).map(({ to, label, icon: Icon }) => (
                  <SheetClose asChild key={to}>
                    <Link to={to} className={mobileLink} activeProps={mobileActive} onClick={() => setMobileOpen(false)}>
                      <Icon className="h-4 w-4 shrink-0" /> {label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="border-t p-3 space-y-2">
                <div className="px-2 text-xs text-muted-foreground truncate">
                  {user.email} · {role ?? "—"}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={async () => {
                    setMobileOpen(false);
                    await logAudit({ action_type: "logout", entity_type: "auth", entity_id: user.id });
                    await signOut();
                    router.navigate({ to: "/login" });
                  }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/products" className="flex items-center gap-2 font-semibold tracking-tight min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-primary text-primary-foreground shadow-sm">
              <Package className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline truncate">Clinic Inventory Hub</span>
          </Link>

          <nav className="hidden lg:flex flex-1 flex-wrap items-center gap-1 min-w-0">
            {navItems.filter((i) => i.show).map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className={navLink} activeProps={navActive}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const ev = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
                window.dispatchEvent(ev);
              }}
              className="hidden md:inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Open command palette"
            >
              <SearchIcon className="h-3.5 w-3.5" />
              <span>Search</span>
              <kbd className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium border border-border">⌘K</kbd>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => {
                const ev = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
                window.dispatchEvent(ev);
              }}
              aria-label="Search"
            >
              <SearchIcon className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground hidden xl:inline truncate max-w-[200px]">
              {user.email} · {role ?? "—"}
            </span>
            <NotificationBell />
            <Button
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={async () => {
                await logAudit({ action_type: "logout", entity_type: "auth", entity_id: user.id });
                await signOut();
                router.navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
