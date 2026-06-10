import { supabase } from "@/integrations/supabase/client";
import type { InventoryBatch } from "./inventory";
import { recordTransaction } from "./inventory";
import { fromBase, toBase, type ProductUnit } from "./product-units";

export const DEFAULT_NEAR_EXPIRY_DAYS = 90;

export type ExpiryStatus = "ok" | "near" | "expired" | "no-expiry";

export function classifyExpiry(
  expiry: string | null | undefined,
  nearDays = DEFAULT_NEAR_EXPIRY_DAYS,
): ExpiryStatus {
  if (!expiry) return "no-expiry";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  const diff = Math.floor((exp.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "expired";
  if (diff <= nearDays) return "near";
  return "ok";
}

export function daysUntil(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  return Math.floor((exp.getTime() - today.getTime()) / 86400000);
}

/**
 * FIFO ordering: earliest expiry first (nulls last), then oldest created_at.
 * Skips zero/negative-stock and expired batches.
 */
export async function fetchFifoBatches(
  productId: string,
  warehouseId: string,
  sectionId?: string | null,
  opts?: { includeExpired?: boolean },
): Promise<InventoryBatch[]> {
  let q = supabase
    .from("inventory_batches")
    .select("*")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .gt("quantity_base_unit", 0);
  if (sectionId) q = q.eq("section_id", sectionId);
  const { data, error } = await q
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as InventoryBatch[];
  if (opts?.includeExpired) return rows;
  return rows.filter((b) => classifyExpiry(b.expiry_date) !== "expired");
}

export interface FifoAllocation {
  batch: InventoryBatch;
  takeBase: number;
}

/** Greedy allocation across FIFO-ordered batches. Throws if insufficient. */
export function planFifoAllocation(
  batches: InventoryBatch[],
  neededBase: number,
): FifoAllocation[] {
  if (neededBase <= 0) throw new Error("Quantity must be > 0");
  const plan: FifoAllocation[] = [];
  let remaining = neededBase;
  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = Number(b.quantity_base_unit);
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    plan.push({ batch: b, takeBase: take });
    remaining -= take;
  }
  if (remaining > 0.0000001) {
    const have = neededBase - remaining;
    throw new Error(
      `Insufficient stock. Needed ${neededBase} base units, only ${have} available.`,
    );
  }
  return plan;
}

interface DispenseFifoArgs {
  product_id: string;
  warehouse_id: string;
  section_id?: string | null;
  unit: ProductUnit;
  quantity: number; // in selected unit
  notes?: string | null;
  type?: "dispensing" | "disposal";
  allowNearExpiry?: boolean;
}

/**
 * Dispense `quantity` (in `unit`) using FIFO across batches at the location.
 * Posts one transaction per consumed batch in the same unit. Expired batches
 * are excluded. Throws if any expired batch is selected or stock is short.
 */
export async function dispenseFifo(args: DispenseFifoArgs) {
  const txnType = args.type ?? "dispensing";
  const neededBase = toBase(args.quantity, args.unit);
  const candidates = await fetchFifoBatches(
    args.product_id,
    args.warehouse_id,
    args.section_id ?? null,
  );
  const plan = planFifoAllocation(candidates, neededBase);

  // Final guard: reject expired batches in plan
  for (const step of plan) {
    if (classifyExpiry(step.batch.expiry_date) === "expired") {
      throw new Error("Cannot dispense expired batches");
    }
  }

  const results = [];
  for (const step of plan) {
    const qtyInUnit = fromBase(step.takeBase, args.unit);
    const txn = await recordTransaction({
      transaction_type: txnType,
      product_id: args.product_id,
      batch_id: step.batch.id,
      warehouse_id: args.warehouse_id,
      section_id: args.section_id ?? null,
      unit_id: args.unit.id,
      quantity: qtyInUnit,
      notes: args.notes ?? null,
    });
    results.push({ txn, batch: step.batch, qtyInUnit, qtyBase: step.takeBase });
  }
  return results;
}

// ---------- Alerts / dashboard queries ----------

export interface BatchWithRefs extends InventoryBatch {
  products: { id: string; product_name: string; product_code: string; reorder_level: number } | null;
  warehouses: { id: string; warehouse_name: string } | null;
  warehouse_sections: { id: string; section_name: string } | null;
}

export async function listExpiredBatches(): Promise<BatchWithRefs[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("inventory_batches")
    .select(
      "*, products:product_id(id,product_name,product_code,reorder_level), warehouses:warehouse_id(id,warehouse_name), warehouse_sections:section_id(id,section_name)",
    )
    .gt("quantity_base_unit", 0)
    .lt("expiry_date", today)
    .order("expiry_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as BatchWithRefs[];
}

export async function listNearExpiryBatches(
  days = DEFAULT_NEAR_EXPIRY_DAYS,
): Promise<BatchWithRefs[]> {
  const today = new Date();
  const limit = new Date();
  limit.setDate(today.getDate() + days);
  const { data, error } = await supabase
    .from("inventory_batches")
    .select(
      "*, products:product_id(id,product_name,product_code,reorder_level), warehouses:warehouse_id(id,warehouse_name), warehouse_sections:section_id(id,section_name)",
    )
    .gt("quantity_base_unit", 0)
    .gte("expiry_date", today.toISOString().slice(0, 10))
    .lte("expiry_date", limit.toISOString().slice(0, 10))
    .order("expiry_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as BatchWithRefs[];
}

export interface LowStockRow {
  product_id: string;
  product_name: string;
  product_code: string;
  reorder_level: number;
  on_hand_base: number;
}

/** Sum on-hand per product, return those below reorder_level. */
export async function listLowStock(): Promise<LowStockRow[]> {
  const [{ data: batches, error: e1 }, { data: products, error: e2 }] = await Promise.all([
    supabase.from("inventory_batches").select("product_id, quantity_base_unit"),
    supabase.from("products").select("id, product_name, product_code, reorder_level"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const onHand = new Map<string, number>();
  for (const b of batches ?? []) {
    onHand.set(
      b.product_id as string,
      (onHand.get(b.product_id as string) ?? 0) + Number(b.quantity_base_unit),
    );
  }
  const rows: LowStockRow[] = [];
  for (const p of products ?? []) {
    const total = onHand.get(p.id as string) ?? 0;
    if (Number(p.reorder_level) > 0 && total < Number(p.reorder_level)) {
      rows.push({
        product_id: p.id as string,
        product_name: p.product_name as string,
        product_code: p.product_code as string,
        reorder_level: Number(p.reorder_level),
        on_hand_base: total,
      });
    }
  }
  return rows.sort((a, b) => a.on_hand_base - b.on_hand_base);
}
