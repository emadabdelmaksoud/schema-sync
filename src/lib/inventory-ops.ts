import { supabase } from "@/integrations/supabase/client";
import {
  recordTransaction,
  upsertBatch,
  type InventoryBatch,
  type InventoryTxnType,
} from "./inventory";

/** Batches at a location with their current stock (base units). */
export async function listLocationBatches(
  productId: string,
  warehouseId: string,
  sectionId?: string | null,
) {
  let q = supabase
    .from("inventory_batches")
    .select("*")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId);
  if (sectionId) q = q.eq("section_id", sectionId);
  const { data, error } = await q
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as InventoryBatch[];
}

interface StockInArgs {
  product_id: string;
  warehouse_id: string;
  section_id?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  unit_id: string;
  quantity: number;
  notes?: string | null;
}

/** Upsert (find-or-create) a batch then post a stock_in transaction. */
export async function performStockIn(args: StockInArgs) {
  const batch = await upsertBatch({
    product_id: args.product_id,
    warehouse_id: args.warehouse_id,
    section_id: args.section_id ?? null,
    batch_number: args.batch_number ?? null,
    expiry_date: args.expiry_date ?? null,
  });
  return recordTransaction({
    transaction_type: "stock_in",
    product_id: args.product_id,
    batch_id: batch.id,
    warehouse_id: args.warehouse_id,
    section_id: args.section_id ?? null,
    unit_id: args.unit_id,
    quantity: args.quantity,
    notes: args.notes ?? null,
  });
}

interface OutArgs {
  type: Extract<InventoryTxnType, "dispensing" | "disposal" | "inventory_count">;
  product_id: string;
  batch_id: string;
  warehouse_id: string;
  section_id?: string | null;
  unit_id: string;
  quantity: number;
  notes?: string | null;
}
export async function performOutOrCount(args: OutArgs) {
  return recordTransaction({
    transaction_type: args.type,
    product_id: args.product_id,
    batch_id: args.batch_id,
    warehouse_id: args.warehouse_id,
    section_id: args.section_id ?? null,
    unit_id: args.unit_id,
    quantity: args.quantity,
    notes: args.notes ?? null,
  });
}

interface TransferArgs {
  product_id: string;
  source_batch_id: string;
  source_warehouse_id: string;
  source_section_id?: string | null;
  dest_warehouse_id: string;
  dest_section_id?: string | null;
  dest_batch_number?: string | null;
  dest_expiry_date?: string | null;
  unit_id: string;
  quantity: number;
  notes?: string | null;
}
/** Two-leg transfer: transfer_out at source, transfer_in at destination (upsert batch). */
export async function performTransfer(args: TransferArgs) {
  await recordTransaction({
    transaction_type: "transfer_out",
    product_id: args.product_id,
    batch_id: args.source_batch_id,
    warehouse_id: args.source_warehouse_id,
    section_id: args.source_section_id ?? null,
    unit_id: args.unit_id,
    quantity: args.quantity,
    notes: args.notes ?? null,
  });
  const destBatch = await upsertBatch({
    product_id: args.product_id,
    warehouse_id: args.dest_warehouse_id,
    section_id: args.dest_section_id ?? null,
    batch_number: args.dest_batch_number ?? null,
    expiry_date: args.dest_expiry_date ?? null,
  });
  return recordTransaction({
    transaction_type: "transfer_in",
    product_id: args.product_id,
    batch_id: destBatch.id,
    warehouse_id: args.dest_warehouse_id,
    section_id: args.dest_section_id ?? null,
    unit_id: args.unit_id,
    quantity: args.quantity,
    notes: args.notes ?? null,
  });
}
