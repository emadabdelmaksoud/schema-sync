import { z } from "zod";
import { getDB, generateId, now, type InventoryBatch, type InventoryTransaction } from "./local-db";
import { toBase } from "./product-units";
import { getProduct } from "./products";

export const TRANSACTION_TYPES = [
  "stock_in",
  "dispensing",
  "transfer_in",
  "transfer_out",
  "disposal",
  "adjustment",
  "inventory_count",
] as const;

export type InventoryTxnType = (typeof TRANSACTION_TYPES)[number];
export type { InventoryBatch, InventoryTransaction };

// ---------- Schemas ----------
export const batchSchema = z
  .object({
    product_id: z.string().uuid(),
    warehouse_id: z.string().uuid(),
    section_id: z.string().uuid().nullable().optional(),
    batch_number: z.string().trim().max(100).nullable().optional(),
    expiry_date: z.string().nullable().optional(),
  })
  .strict();

export type BatchInput = z.infer<typeof batchSchema>;

export const transactionSchema = z
  .object({
    transaction_type: z.enum(TRANSACTION_TYPES),
    product_id: z.string().uuid(),
    batch_id: z.string().uuid(),
    warehouse_id: z.string().uuid(),
    section_id: z.string().uuid().nullable().optional(),
    quantity: z.coerce.number().positive(),
    unit_id: z.string().uuid(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export type TransactionInput = z.infer<typeof transactionSchema>;

// ---------- Batches ----------
export async function listBatches(filter?: {
  product_id?: string;
  warehouse_id?: string;
}): Promise<InventoryBatch[]> {
  const db = await getDB();
  let batches = await db.getAll("inventory_batches");

  if (filter?.product_id) {
    batches = batches.filter((b) => b.product_id === filter.product_id);
  }
  if (filter?.warehouse_id) {
    batches = batches.filter((b) => b.warehouse_id === filter.warehouse_id);
  }

  return batches.sort((a, b) => {
    const aExpiry = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
    const bExpiry = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
    return aExpiry - bExpiry;
  });
}

/** Find or create a batch identified by (product, warehouse, section, batch#, expiry). */
export async function upsertBatch(input: BatchInput): Promise<InventoryBatch> {
  const db = await getDB();
  const payload = batchSchema.parse(input);

  // Find existing batch
  const batches = await db.getAll("inventory_batches");
  const existing = batches.find(
    (b) =>
      b.product_id === payload.product_id &&
      b.warehouse_id === payload.warehouse_id &&
      (payload.section_id ? b.section_id === payload.section_id : b.section_id === null) &&
      (payload.batch_number ? b.batch_number === payload.batch_number : b.batch_number === null) &&
      (payload.expiry_date ? b.expiry_date === payload.expiry_date : b.expiry_date === null)
  );

  if (existing) return existing;

  // Create new batch
  const batch: InventoryBatch = {
    id: generateId(),
    product_id: payload.product_id,
    warehouse_id: payload.warehouse_id,
    section_id: payload.section_id ?? null,
    batch_number: payload.batch_number ?? null,
    expiry_date: payload.expiry_date ?? null,
    quantity_base_unit: 0,
    created_at: now(),
    updated_at: now(),
  };

  await db.put("inventory_batches", batch);
  return batch;
}

// ---------- Transactions ----------
export async function recordTransaction(
  input: TransactionInput,
  performedBy?: string
): Promise<InventoryTransaction> {
  const db = await getDB();
  const payload = transactionSchema.parse(input);

  // Get the unit to calculate quantity in base units
  const units = await db.getAll("product_units");
  const unit = units.find((u) => u.id === payload.unit_id);
  if (!unit) throw new Error("Unit not found");

  const quantityBaseUnit = toBase(payload.quantity, unit);

  // Get the batch and update its quantity
  const batch = await db.get("inventory_batches", payload.batch_id);
  if (!batch) throw new Error("Batch not found");

  let delta = quantityBaseUnit;
  if (payload.transaction_type === "dispensing" || payload.transaction_type === "transfer_out" || payload.transaction_type === "disposal") {
    delta = -quantityBaseUnit;
  }

  batch.quantity_base_unit = Math.max(0, batch.quantity_base_unit + delta);
  batch.updated_at = now();
  await db.put("inventory_batches", batch);

  // Record the transaction
  const txn: InventoryTransaction = {
    id: generateId(),
    transaction_type: payload.transaction_type,
    product_id: payload.product_id,
    batch_id: payload.batch_id,
    warehouse_id: payload.warehouse_id,
    section_id: payload.section_id ?? null,
    quantity: payload.quantity,
    unit_id: payload.unit_id,
    quantity_base_unit: quantityBaseUnit,
    performed_by: performedBy ?? null,
    notes: payload.notes ?? null,
    created_at: now(),
  };

  await db.put("inventory_transactions", txn);
  return txn;
}

export async function listTransactions(filter?: {
  product_id?: string;
  warehouse_id?: string;
  batch_id?: string;
  transaction_type?: InventoryTxnType;
  limit?: number;
}): Promise<InventoryTransaction[]> {
  const db = await getDB();
  let txns = await db.getAll("inventory_transactions");

  if (filter?.product_id) txns = txns.filter((t) => t.product_id === filter.product_id);
  if (filter?.warehouse_id) txns = txns.filter((t) => t.warehouse_id === filter.warehouse_id);
  if (filter?.batch_id) txns = txns.filter((t) => t.batch_id === filter.batch_id);
  if (filter?.transaction_type) txns = txns.filter((t) => t.transaction_type === filter.transaction_type);

  return txns
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, filter?.limit ?? 200);
}

/** Sum of base-unit stock per (product, warehouse, section). */
export async function getStockOnHand(filter?: {
  product_id?: string;
  warehouse_id?: string;
}): Promise<Array<{ product_id: string; warehouse_id: string; section_id: string | null; quantity_base_unit: number }>> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");

  // Group by (product, warehouse, section)
  const stockMap = new Map<string, { product_id: string; warehouse_id: string; section_id: string | null; quantity_base_unit: number }>();

  for (const batch of batches) {
    if (filter?.product_id && batch.product_id !== filter.product_id) continue;
    if (filter?.warehouse_id && batch.warehouse_id !== filter.warehouse_id) continue;

    const key = `${batch.product_id}:${batch.warehouse_id}:${batch.section_id ?? "null"}`;
    const existing = stockMap.get(key);
    if (existing) {
      existing.quantity_base_unit += batch.quantity_base_unit;
    } else {
      stockMap.set(key, {
        product_id: batch.product_id,
        warehouse_id: batch.warehouse_id,
        section_id: batch.section_id,
        quantity_base_unit: batch.quantity_base_unit,
      });
    }
  }

  return Array.from(stockMap.values());
}

/** FIFO batch list for dispensing: earliest expiry first, then oldest. */
export async function getFifoBatches(productId: string, warehouseId: string): Promise<InventoryBatch[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");

  return batches
    .filter((b) => b.product_id === productId && b.warehouse_id === warehouseId && b.quantity_base_unit > 0)
    .sort((a, b) => {
      const aExpiry = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const bExpiry = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
      if (aExpiry !== bExpiry) return aExpiry - bExpiry;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}
