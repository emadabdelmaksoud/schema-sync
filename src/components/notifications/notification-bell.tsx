import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import {
  AppNotification,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
  severityBadge,
  categoryLabel,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, list] = await Promise.all([unreadCount(), listNotifications({ limit: 20 })]);
      setCount(c);
      setItems(list);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 60_000);
    let sub: any;
    try {
      sub = (supabase as any)
        .channel("notifications-bell")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications" },
          () => refresh(),
        )
        .subscribe();
    } catch {
      /* realtime not enabled — polling fallback */
    }
    return () => {
      clearInterval(iv);
      try {
        sub?.unsubscribe?.();
      } catch {
        /* ignore */
      }
    };
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleMarkAll = async () => {
    setLoading(true);
    try {
      await markAllRead();
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = async (n: AppNotification) => {
    if (!n.read_at) {
      await markRead(n.id);
      refresh();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAll}
            disabled={loading || count === 0}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
            <span className="ml-1 text-xs">Mark all read</span>
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "p-3 text-sm cursor-pointer hover:bg-accent",
                    !n.read_at && "bg-accent/40",
                  )}
                  onClick={() => handleItemClick(n)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{n.title}</div>
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", severityBadge[n.severity])}>
                      {n.severity}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between">
                    <span>{categoryLabel[n.category]}</span>
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="p-2 border-t text-center">
          <Link
            to="/notifications"
            className="text-xs text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
