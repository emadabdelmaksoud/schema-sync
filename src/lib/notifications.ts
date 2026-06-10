import { supabase } from "@/integrations/supabase/client";

export type Severity = "info" | "warning" | "error" | "critical";
export type NotificationCategory =
  | "low_stock"
  | "near_expiry"
  | "expired"
  | "import"
  | "backup"
  | "system";

export interface AppNotification {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  severity: Severity;
  category: NotificationCategory;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

type DB = ReturnType<typeof supabase.from> extends infer T ? T : never;
const tbl = () => (supabase as any).from("notifications");

export interface CreateNotificationInput {
  title: string;
  message: string;
  severity?: Severity;
  category?: NotificationCategory;
  user_id?: string | null; // null/undefined = broadcast
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createNotification(input: CreateNotificationInput) {
  const payload = {
    title: input.title,
    message: input.message,
    severity: input.severity ?? "info",
    category: input.category ?? "system",
    user_id: input.user_id ?? null,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    metadata: input.metadata ?? null,
  };
  const { data, error } = await tbl().insert(payload).select().single();
  if (error) throw error;
  return data as AppNotification;
}

export async function listNotifications(opts?: {
  limit?: number;
  unreadOnly?: boolean;
  severity?: Severity | "all";
  category?: NotificationCategory | "all";
}) {
  let q = tbl().select("*").order("created_at", { ascending: false }).limit(opts?.limit ?? 100);
  if (opts?.unreadOnly) q = q.is("read_at", null);
  if (opts?.severity && opts.severity !== "all") q = q.eq("severity", opts.severity);
  if (opts?.category && opts.category !== "all") q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function unreadCount() {
  const { count, error } = await tbl()
    .select("*", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markRead(id: string) {
  const { error } = await tbl().update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function markAllRead() {
  const { error } = await tbl()
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await tbl().delete().eq("id", id);
  if (error) throw error;
}

// ------- Scan helpers (low stock / expiry) -------

export interface ScanResult {
  created: number;
  lowStock: number;
  nearExpiry: number;
  expired: number;
}

export interface ScanOptions {
  lowStockThreshold?: number; // base units
  nearExpiryDays?: number;
}

/**
 * Scans inventory and audit log to (re)create alerts. Idempotent within a 24h
 * window per entity (won't duplicate identical alerts).
 */
export async function runInventoryScan(opts: ScanOptions = {}): Promise<ScanResult> {
  const lowStockThreshold = opts.lowStockThreshold ?? 10;
  const nearExpiryDays = opts.nearExpiryDays ?? 30;
  const now = new Date();
  const horizon = new Date(now.getTime() + nearExpiryDays * 86400_000);

  const { data: batches, error: bErr } = await supabase
    .from("inventory_batches")
    .select("id, product_id, quantity_base_unit, expiry_date, warehouse_id");
  if (bErr) throw bErr;

  const { data: products } = await supabase.from("products").select("id, product_name, product_code, reorder_level");
  const pMap = new Map((products ?? []).map((p: any) => [p.id, p]));

  // Existing alerts in last 24h to dedupe
  const since = new Date(now.getTime() - 86400_000).toISOString();
  const { data: existing } = await tbl()
    .select("entity_type, entity_id, category")
    .gte("created_at", since);
  const seen = new Set<string>(
    (existing ?? []).map((r: any) => `${r.category}:${r.entity_type}:${r.entity_id}`),
  );

  let lowStock = 0;
  let nearExpiry = 0;
  let expired = 0;
  const toInsert: any[] = [];

  // Aggregate stock per product
  const stockByProduct = new Map<string, number>();
  for (const b of batches ?? []) {
    stockByProduct.set(b.product_id, (stockByProduct.get(b.product_id) ?? 0) + Number(b.quantity_base_unit ?? 0));
  }

  for (const [productId, qty] of stockByProduct) {
    const p: any = pMap.get(productId);
    if (!p) continue;
    const threshold = Math.max(Number(p.reorder_level ?? 0), 0) || lowStockThreshold;
    if (qty <= threshold) {
      const key = `low_stock:product:${productId}`;
      if (!seen.has(key)) {
        toInsert.push({
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

  for (const b of batches ?? []) {
    if (!b.expiry_date) continue;
    if (Number(b.quantity_base_unit ?? 0) <= 0) continue;
    const exp = new Date(b.expiry_date);
    const p: any = pMap.get(b.product_id);
    const name = p?.product_name ?? "Unknown product";
    if (exp < now) {
      const key = `expired:batch:${b.id}`;
      if (!seen.has(key)) {
        toInsert.push({
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
        const days = Math.ceil((exp.getTime() - now.getTime()) / 86400_000);
        toInsert.push({
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

  let created = 0;
  if (toInsert.length) {
    const { error } = await tbl().insert(toInsert);
    if (error) throw error;
    created = toInsert.length;
  }
  return { created, lowStock, nearExpiry, expired };
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
