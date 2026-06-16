import { getDB } from "./local-db";
import type { InventoryBatch } from "./inventory";
import { recordTransaction } from "./inventory";
import { fromBase, toBase, type ProductUnit } from "./product-units";

export const DEFAULT_NEAR_EXPIRY_DAYS = 90;

export type ExpiryStatus = "ok" | "near" | "expired" | "no-expiry";

export function classifyExpiry(expiry: string | null | undefined, nearDays = DEFAULT_NEAR_EXPIRY_DAYS): ExpiryStatus {
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

export async function fetchFifoBatches(
  productId: string,
  warehouseId: string,
  sectionId?: string | null,
  opts?: { includeExpired?: boolean }
): Promise<InventoryBatch[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");

  let filtered = batches.filter(
    (b) => b.product_id === productId && b.warehouse_id === warehouseId && b.quantity_base_unit > 0
  );

  if (sectionId) {
    filtered = filtered.filter((b) => b.section_id === sectionId);
  }

  // Sort by expiry date (nulls last), then by created_at
  const sorted = filtered.sort((a, b) => {
    const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
    const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
    if (aExp !== bExp) return aExp - bExp;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  if (opts?.includeExpired) return sorted;
  return sorted.filter((b) => classifyExpiry(b.expiry_date) !== "expired");
}

export interface FifoAllocation {
  batch: InventoryBatch;
  takeBase: number;
}

export function planFifoAllocation(batches: InventoryBatch[], neededBase: number): FifoAllocation[] {
  if (neededBase <= 0) throw new Error("Quantity must be > 0");
  const plan: FifoAllocation[] = [];
  let remaining = neededBase;
  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = b.quantity_base_unit;
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    plan.push({ batch: b, takeBase: take });
    remaining -= take;
  }
  if (remaining > 0.0000001) {
    const have = neededBase - remaining;
    throw new Error(`Insufficient stock. Needed ${neededBase} base units, only ${have} available.`);
  }
  return plan;
}

interface DispenseFifoArgs {
  product_id: string;
  warehouse_id: string;
  section_id?: string | null;
  unit: ProductUnit;
  quantity: number;
  notes?: string | null;
  type?: "dispensing" | "disposal";
  allowNearExpiry?: boolean;
}

export async function dispenseFifo(args: DispenseFifoArgs) {
  const txnType = args.type ?? "dispensing";
  const neededBase = toBase(args.quantity, args.unit);
  const candidates = await fetchFifoBatches(args.product_id, args.warehouse_id, args.section_id ?? null);
  const plan = planFifoAllocation(candidates, neededBase);

  for (const step of plan) {
    if (classifyExpiry(step.batch.expiry_date) === "expired") {
      throw new Error("Cannot dispense expired batches");
    }
  }

  const results = [];
  for (const step of plan) {
    const qtyInUnit = fromBase(step.takeBase, args.unit);
    const txn = await recordTransaction(
      {
        transaction_type: txnType,
        product_id: args.product_id,
        batch_id: step.batch.id,
        warehouse_id: args.warehouse_id,
        section_id: args.section_id ?? null,
        unit_id: args.unit.id,
        quantity: qtyInUnit,
        notes: args.notes ?? null,
      }
    );
    results.push({ txn, batch: step.batch, qtyInUnit, qtyBase: step.takeBase });
  }
  return results;
}

// ---------- Alerts / dashboard queries ----------

export interface BatchWithRefs extends InventoryBatch {
  product_name: string;
  product_code: string;
  reorder_level: number;
  warehouse_name: string;
  section_name: string | null;
}

export async function listExpiredBatches(): Promise<BatchWithRefs[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");
  const products = await db.getAll("products");
  const warehouses = await db.getAll("warehouses");
  const sections = await db.getAll("warehouse_sections");

  const today = new Date().toISOString().slice(0, 10);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  return batches
    .filter((b) => b.quantity_base_unit > 0 && b.expiry_date && b.expiry_date < today)
    .sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""))
    .map((b) => {
      const p = productMap.get(b.product_id);
      const w = warehouseMap.get(b.warehouse_id);
      const s = b.section_id ? sectionMap.get(b.section_id) : null;
      return {
        ...b,
        product_name: p?.product_name ?? "—",
        product_code: p?.product_code ?? "",
        reorder_level: p?.reorder_level ?? 0,
        warehouse_name: w?.warehouse_name ?? "—",
        section_name: s?.section_name ?? null,
      };
    });
}

export async function listNearExpiryBatches(days = DEFAULT_NEAR_EXPIRY_DAYS): Promise<BatchWithRefs[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");
  const products = await db.getAll("products");
  const warehouses = await db.getAll("warehouses");
  const sections = await db.getAll("warehouse_sections");

  const today = new Date();
  const limit = new Date();
  limit.setDate(today.getDate() + days);
  const todayStr = today.toISOString().slice(0, 10);
  const limitStr = limit.toISOString().slice(0, 10);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  return batches
    .filter(
      (b) =>
        b.quantity_base_unit > 0 &&
        b.expiry_date &&
        b.expiry_date >= todayStr &&
        b.expiry_date <= limitStr
    )
    .sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""))
    .map((b) => {
      const p = productMap.get(b.product_id);
      const w = warehouseMap.get(b.warehouse_id);
      const s = b.section_id ? sectionMap.get(b.section_id) : null;
      return {
        ...b,
        product_name: p?.product_name ?? "—",
        product_code: p?.product_code ?? "",
        reorder_level: p?.reorder_level ?? 0,
        warehouse_name: w?.warehouse_name ?? "—",
        section_name: s?.section_name ?? null,
      };
    });
}

export interface LowStockRow {
  product_id: string;
  product_name: string;
  product_code: string;
  reorder_level: number;
  on_hand_base: number;
}

export async function listLowStock(): Promise<LowStockRow[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");
  const products = await db.getAll("products");

  const onHand = new Map<string, number>();
  for (const b of batches) {
    onHand.set(b.product_id, (onHand.get(b.product_id) ?? 0) + b.quantity_base_unit);
  }

  const rows: LowStockRow[] = [];
  for (const p of products) {
    const total = onHand.get(p.id) ?? 0;
    if (p.reorder_level > 0 && total < p.reorder_level) {
      rows.push({
        product_id: p.id,
        product_name: p.product_name,
        product_code: p.product_code,
        reorder_level: p.reorder_level,
        on_hand_base: total,
      });
    }
  }
  return rows.sort((a, b) => a.on_hand_base - b.on_hand_base);
}
