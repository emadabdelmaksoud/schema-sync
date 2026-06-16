import { getDB } from "./local-db";
import { recordTransaction, upsertBatch, type InventoryBatch, type InventoryTxnType } from "./inventory";

export async function listLocationBatches(productId: string, warehouseId: string, sectionId?: string | null): Promise<InventoryBatch[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");

  let filtered = batches.filter(
    (b) => b.product_id === productId && b.warehouse_id === warehouseId
  );

  if (sectionId) {
    filtered = filtered.filter((b) => b.section_id === sectionId);
  }

  return filtered.sort((a, b) => {
    const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
    const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
    if (aExp !== bExp) return aExp - bExp;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
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
