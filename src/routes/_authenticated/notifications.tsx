import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  AppNotification,
  Severity,
  NotificationCategory,
  listNotifications,
  markAllRead,
  markRead,
  deleteNotification,
  runInventoryScan,
  severityBadge,
  categoryLabel,
} from "@/lib/notifications";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  head: () => ({ meta: [{ title: "Notifications — Clinic Inventory Hub" }] }),
});

function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listNotifications({
        limit: 500,
        unreadOnly,
        severity,
        category,
      });
      setItems(list);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [severity, category, unreadOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = items.filter((n) => {
    if (query) {
      const q = query.toLowerCase();
      if (!n.title.toLowerCase().includes(q) && !n.message.toLowerCase().includes(q)) return false;
    }
    if (from && new Date(n.created_at) < new Date(from)) return false;
    if (to && new Date(n.created_at) > new Date(to + "T23:59:59")) return false;
    return true;
  });

  const handleScan = async () => {
    setScanning(true);
    try {
      const r = await runInventoryScan();
      toast.success(`Scan complete: ${r.created} new alert(s)`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead();
      toast.success("All marked as read");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleMark = async (id: string) => {
    try {
      await markRead(id);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      toast.success("Deleted");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notification Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Inventory alerts, system warnings, import &amp; backup status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleScan} disabled={scanning}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1">Run scan</span>
          </Button>
          <Button variant="outline" onClick={handleMarkAll}>
            <CheckCheck className="h-4 w-4" /> <span className="ml-1">Mark all read</span>
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search title or message…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
            <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => setCategory(v as any)}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="low_stock">Low stock</SelectItem>
              <SelectItem value="near_expiry">Near expiry</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="import">Import</SelectItem>
              <SelectItem value="backup">Backup</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            id="unread"
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          <label htmlFor="unread" className="text-sm">Unread only</label>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {items.length}
          </span>
        </div>
      </Card>

      <Card className="divide-y">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No notifications match.</div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              className={cn(
                "p-4 flex items-start gap-3",
                !n.read_at && "bg-accent/30",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{n.title}</span>
                  <Badge variant="outline" className={cn("text-[10px]", severityBadge[n.severity])}>
                    {n.severity}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {categoryLabel[n.category]}
                  </Badge>
                  {!n.read_at && (
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                      Unread
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">{n.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-1">
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => handleMark(n.id)}>
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => handleDelete(n.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
