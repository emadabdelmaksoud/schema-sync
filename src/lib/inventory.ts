import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

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

export interface InventoryBatch {
  id: string;
  product_id: string;
  warehouse_id: string;
  section_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity_base_unit: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  transaction_type: InventoryTxnType;
  product_id: string;
  batch_id: string | null;
  warehouse_id: string;
  section_id: string | null;
  quantity: number;
  unit_id: string;
  quantity_base_unit: number;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

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
}) {
  let q = supabase.from("inventory_batches").select("*");
  if (filter?.product_id) q = q.eq("product_id", filter.product_id);
  if (filter?.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  const { data, error } = await q.order("expiry_date", { ascending: true });
  if (error) throw error;
  return data as InventoryBatch[];
}

/** Find or create a batch identified by (product, warehouse, section, batch#, expiry). */
export async function upsertBatch(input: BatchInput) {
  const payload = batchSchema.parse(input);
  let lookup = supabase
    .from("inventory_batches")
    .select("*")
    .eq("product_id", payload.product_id)
    .eq("warehouse_id", payload.warehouse_id);
  lookup = payload.section_id
    ? lookup.eq("section_id", payload.section_id)
    : lookup.is("section_id", null);
  lookup = payload.batch_number
    ? lookup.eq("batch_number", payload.batch_number)
    : lookup.is("batch_number", null);
  lookup = payload.expiry_date
    ? lookup.eq("expiry_date", payload.expiry_date)
    : lookup.is("expiry_date", null);
  const found = await lookup.maybeSingle();
  if (found.data) return found.data as InventoryBatch;

  const { data, error } = await supabase
    .from("inventory_batches")
    .insert({
      product_id: payload.product_id,
      warehouse_id: payload.warehouse_id,
      section_id: payload.section_id ?? null,
      batch_number: payload.batch_number ?? null,
      expiry_date: payload.expiry_date ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as InventoryBatch;
}

// ---------- Transactions ----------
export async function recordTransaction(input: TransactionInput) {
  const payload = transactionSchema.parse(input);
  // quantity_base_unit is computed server-side via trigger, but the column is
  // NOT NULL with a positive check; supply a placeholder that the trigger
  // overwrites. We send the same value (qty) — trigger replaces it with
  // qty * factor_to_base before insert completes.
  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert({
      transaction_type: payload.transaction_type,
      product_id: payload.product_id,
      batch_id: payload.batch_id,
      warehouse_id: payload.warehouse_id,
      section_id: payload.section_id ?? null,
      quantity: payload.quantity,
      unit_id: payload.unit_id,
      quantity_base_unit: payload.quantity,
      notes: payload.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as InventoryTransaction;
}

export async function listTransactions(filter?: {
  product_id?: string;
  warehouse_id?: string;
  batch_id?: string;
  transaction_type?: InventoryTxnType;
  limit?: number;
}) {
  let q = supabase.from("inventory_transactions").select("*");
  if (filter?.product_id) q = q.eq("product_id", filter.product_id);
  if (filter?.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter?.batch_id) q = q.eq("batch_id", filter.batch_id);
  if (filter?.transaction_type)
    q = q.eq("transaction_type", filter.transaction_type);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(filter?.limit ?? 200);
  if (error) throw error;
  return data as InventoryTransaction[];
}

/** Sum of base-unit stock per (product, warehouse, section). */
export async function getStockOnHand(filter?: {
  product_id?: string;
  warehouse_id?: string;
}) {
  let q = supabase.from("stock_on_hand").select("*");
  if (filter?.product_id) q = q.eq("product_id", filter.product_id);
  if (filter?.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  const { data, error } = await q;
  if (error) throw error;
  return data as Array<{
    product_id: string;
    warehouse_id: string;
    section_id: string | null;
    quantity_base_unit: number;
  }>;
}

/** FIFO batch list for dispensing: earliest expiry first, then oldest. */
export async function getFifoBatches(productId: string, warehouseId: string) {
  const { data, error } = await supabase
    .from("inventory_batches")
    .select("*")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .gt("quantity_base_unit", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as InventoryBatch[];
}
