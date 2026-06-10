import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AppNotification,
  listNotifications,
  severityBadge,
  categoryLabel,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function NotificationWidget() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listNotifications({ limit: 5, unreadOnly: true })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" /> Recent alerts
        </h3>
        <Link to="/notifications" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No unread notifications.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className="text-sm border-l-2 border-primary/40 pl-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{n.title}</span>
                <Badge variant="outline" className={cn("text-[10px]", severityBadge[n.severity])}>
                  {n.severity}
                </Badge>
                <Badge variant="outline" className="text-[10px]">{categoryLabel[n.category]}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">{n.message}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
