import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Store,
  ArrowLeftRight,
  Upload,
  Download,
  Users,
  LogOut,
  Package,
  Settings,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: Layout,
});

function Layout() {
  const { session, loading, role, signOut, user } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/stores", label: "Stores", icon: Store },
    { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
    { to: "/import", label: "Import", icon: Upload },
    { to: "/export", label: "Export", icon: Download },
    ...(role === "admin" ? [{ to: "/admin/users", label: "Users", icon: Users }] : []),
    { to: "/settings/biometric", label: "Biometric", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 border-r bg-card flex flex-col print:hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">StoreCtrl</div>
            <div className="text-xs text-muted-foreground capitalize">{role}</div>
          </div>
        </div>
        <nav className="p-2 flex-1 space-y-1">
          {nav.map((n) => {
            const active = location.pathname === n.to || (n.to !== "/" && location.pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          <Button variant="ghost" className="w-full justify-start" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}