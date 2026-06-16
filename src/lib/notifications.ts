import { getDB, generateId, now, type Notification } from "./local-db";

export type Severity = "info" | "warning" | "error" | "critical";
export type NotificationCategory = "low_stock" | "near_expiry" | "expired" | "import" | "backup" | "system";

export type AppNotification = Notification;

export interface CreateNotificationInput {
  title: string;
  message: string;
  severity?: Severity;
  category?: NotificationCategory;
  user_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createNotification(input: CreateNotificationInput): Promise<AppNotification> {
  const db = await getDB();
  const notification: Notification = {
    id: generateId(),
    title: input.title,
    message: input.message,
    severity: input.severity ?? "info",
    category: input.category ?? "system",
    user_id: input.user_id ?? null,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    metadata: input.metadata ?? null,
    read_at: null,
    created_at: now(),
  };
  await db.put("notifications", notification);
  return notification;
}

export async function listNotifications(opts?: {
  limit?: number;
  unreadOnly?: boolean;
  severity?: Severity | "all";
  category?: NotificationCategory | "all";
}): Promise<AppNotification[]> {
  const db = await getDB();
  let notifications = await db.getAll("notifications");

  if (opts?.unreadOnly) notifications = notifications.filter((n) => !n.read_at);
  if (opts?.severity && opts.severity !== "all") {
    notifications = notifications.filter((n) => n.severity === opts.severity);
  }
  if (opts?.category && opts.category !== "all") {
    notifications = notifications.filter((n) => n.category === opts.category);
  }

  return notifications
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, opts?.limit ?? 100);
}

export async function unreadCount(): Promise<number> {
  const db = await getDB();
  const notifications = await db.getAll("notifications");
  return notifications.filter((n) => !n.read_at).length;
}

export async function markRead(id: string): Promise<void> {
  const db = await getDB();
  const notification = await db.get("notifications", id);
  if (notification) {
    notification.read_at = now();
    await db.put("notifications", notification);
  }
}

export async function markAllRead(): Promise<void> {
  const db = await getDB();
  const notifications = await db.getAll("notifications");
  const readAt = now();
  for (const n of notifications) {
    if (!n.read_at) {
      n.read_at = readAt;
      await db.put("notifications", n);
    }
  }
}

export async function deleteNotification(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("notifications", id);
}

// ------- Scan helpers (low stock / expiry) -------

export interface ScanResult {
  created: number;
  lowStock: number;
  nearExpiry: number;
  expired: number;
}

export interface ScanOptions {
  lowStockThreshold?: number;
  nearExpiryDays?: number;
}

export async function runInventoryScan(opts: ScanOptions = {}): Promise<ScanResult> {
  const db = await getDB();
  const lowStockThreshold = opts.lowStockThreshold ?? 10;
  const nearExpiryDays = opts.nearExpiryDays ?? 30;
  const nowDate = new Date();
  const horizon = new Date(nowDate.getTime() + nearExpiryDays * 86400_000);

  const batches = await db.getAll("inventory_batches");
  const products = await db.getAll("products");
  const pMap = new Map(products.map((p) => [p.id, p]));

  // Get existing alerts from last 24h
  const notifications = await db.getAll("notifications");
  const since = new Date(nowDate.getTime() - 86400_000).toISOString();
  const recent = notifications.filter((n) => n.created_at >= since);
  const seen = new Set(recent.map((r) => `${r.category}:${r.entity_type}:${r.entity_id}`));

  let lowStock = 0;
  let nearExpiry = 0;
  let expired = 0;

  // Aggregate stock by product
  const stockByProduct = new Map<string, number>();
  for (const b of batches) {
    stockByProduct.set(b.product_id, (stockByProduct.get(b.product_id) ?? 0) + b.quantity_base_unit);
  }

  for (const [productId, qty] of stockByProduct) {
    const p = pMap.get(productId);
    if (!p) continue;
    const threshold = Math.max(p.reorder_level ?? 0, lowStockThreshold);
    if (qty <= threshold) {
      const key = `low_stock:product:${productId}`;
      if (!seen.has(key)) {
        await createNotification({
          title: `Low stock: ${p.product_name}`,
          message: `${p.product_code} has ${qty} units remaining (threshold ${threshold}).`,
          severity: qty === 0 ? "critical" : "warning",
          category: "low_stock",
          entity_type: "product",
          entity_id: productId,
          metadata: { quantity: qty, threshold },
        });
        lowStock++;
      }
    }
  }

  for (const b of batches) {
    if (!b.expiry_date || b.quantity_base_unit <= 0) continue;
    const exp = new Date(b.expiry_date);
    const p = pMap.get(b.product_id);
    const name = p?.product_name ?? "Unknown product";

    if (exp < nowDate) {
      const key = `expired:batch:${b.id}`;
      if (!seen.has(key)) {
        await createNotification({
          title: `Expired stock: ${name}`,
          message: `Batch expired on ${b.expiry_date}. Quantity ${b.quantity_base_unit}.`,
          severity: "critical",
          category: "expired",
          entity_type: "batch",
          entity_id: b.id,
          metadata: { expiry_date: b.expiry_date, quantity: b.quantity_base_unit },
        });
        expired++;
      }
    } else if (exp <= horizon) {
      const key = `near_expiry:batch:${b.id}`;
      if (!seen.has(key)) {
        const days = Math.ceil((exp.getTime() - nowDate.getTime()) / 86400_000);
        await createNotification({
          title: `Near expiry: ${name}`,
          message: `Batch expires in ${days} day(s) on ${b.expiry_date}.`,
          severity: "warning",
          category: "near_expiry",
          entity_type: "batch",
          entity_id: b.id,
          metadata: { expiry_date: b.expiry_date, days },
        });
        nearExpiry++;
      }
    }
  }

  return { created: lowStock + nearExpiry + expired, lowStock, nearExpiry, expired };
}

export const severityColor: Record<Severity, string> = {
  info: "text-sky-500",
  warning: "text-amber-500",
  error: "text-orange-500",
  critical: "text-red-500",
};

export const severityBadge: Record<Severity, string> = {
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  error: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
};

export const categoryLabel: Record<NotificationCategory, string> = {
  low_stock: "Low stock",
  near_expiry: "Near expiry",
  expired: "Expired",
  import: "Import",
  backup: "Backup",
  system: "System",
};
