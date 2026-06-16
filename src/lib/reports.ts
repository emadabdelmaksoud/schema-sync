import { getDB } from "./local-db";
import type { InventoryTxnType } from "./inventory";
import * as XLSX from "xlsx";

// ---------- Shared filter type ----------
export interface ReportFilters {
  from?: string | null;
  to?: string | null;
  warehouse_id?: string | null;
  product_id?: string | null;
  category?: string | null;
  transaction_type?: InventoryTxnType | null;
}

// ---------- Overview KPIs ----------
export interface OverviewKpis {
  totalProducts: number;
  totalBatches: number;
  totalWarehouses: number;
  totalStockBaseUnits: number;
}

export async function getOverviewKpis(): Promise<OverviewKpis> {
  const db = await getDB();
  const products = await db.getAll("products");
  const batches = await db.getAll("inventory_batches");
  const warehouses = await db.getAll("warehouses");

  const activeBatches = batches.filter((b) => b.quantity_base_unit > 0);
  const activeWarehouses = warehouses.filter((w) => w.is_active);
  const totalStockBaseUnits = batches.reduce((sum, b) => sum + b.quantity_base_unit, 0);

  return {
    totalProducts: products.length,
    totalBatches: activeBatches.length,
    totalWarehouses: activeWarehouses.length,
    totalStockBaseUnits,
  };
}

// ---------- Recent activity ----------
export interface TxnRow {
  id: string;
  created_at: string;
  transaction_type: InventoryTxnType;
  quantity: number;
  quantity_base_unit: number;
  notes: string | null;
  product_id: string;
  warehouse_id: string;
  section_id: string | null;
  batch_id: string | null;
  unit_id: string;
  product_name: string;
  product_code: string;
  category: string | null;
  warehouse_name: string;
  section_name: string | null;
  unit_name: string;
  batch_number: string | null;
  expiry_date: string | null;
}

export async function listTransactionsFull(
  filters: ReportFilters = {},
  limit = 500
): Promise<TxnRow[]> {
  const db = await getDB();
  const txns = await db.getAll("inventory_transactions");
  const products = await db.getAll("products");
  const warehouses = await db.getAll("warehouses");
  const sections = await db.getAll("warehouse_sections");
  const units = await db.getAll("product_units");
  const batches = await db.getAll("inventory_batches");

  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  let rows: TxnRow[] = txns.map((t) => {
    const product = productMap.get(t.product_id);
    const warehouse = warehouseMap.get(t.warehouse_id);
    const section = t.section_id ? sectionMap.get(t.section_id) : null;
    const unit = unitMap.get(t.unit_id);
    const batch = t.batch_id ? batchMap.get(t.batch_id) : null;

    return {
      id: t.id,
      created_at: t.created_at,
      transaction_type: t.transaction_type,
      quantity: t.quantity,
      quantity_base_unit: t.quantity_base_unit,
      notes: t.notes,
      product_id: t.product_id,
      warehouse_id: t.warehouse_id,
      section_id: t.section_id,
      batch_id: t.batch_id,
      unit_id: t.unit_id,
      product_name: product?.product_name ?? "—",
      product_code: product?.product_code ?? "",
      category: product?.category ?? null,
      warehouse_name: warehouse?.warehouse_name ?? "—",
      section_name: section?.section_name ?? null,
      unit_name: unit?.unit_name ?? "—",
      batch_number: batch?.batch_number ?? null,
      expiry_date: batch?.expiry_date ?? null,
    };
  });

  // Apply filters
  if (filters.from) rows = rows.filter((r) => r.created_at >= filters.from!);
  if (filters.to) rows = rows.filter((r) => r.created_at <= filters.to! + "T23:59:59");
  if (filters.warehouse_id) rows = rows.filter((r) => r.warehouse_id === filters.warehouse_id);
  if (filters.product_id) rows = rows.filter((r) => r.product_id === filters.product_id);
  if (filters.transaction_type) rows = rows.filter((r) => r.transaction_type === filters.transaction_type);
  if (filters.category) rows = rows.filter((r) => r.category === filters.category);

  return rows
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

// ---------- Statistics: ranking by transaction type ----------
export interface ProductRanking {
  product_id: string;
  product_name: string;
  product_code: string;
  total_base: number;
  txn_count: number;
}

export async function rankProductsByTxnType(
  type: InventoryTxnType,
  filters: ReportFilters = {},
  topN = 10
): Promise<ProductRanking[]> {
  const rows = await listTransactionsFull({ ...filters, transaction_type: type }, 5000);
  const map = new Map<string, ProductRanking>();

  for (const r of rows) {
    const cur = map.get(r.product_id) ?? {
      product_id: r.product_id,
      product_name: r.product_name,
      product_code: r.product_code,
      total_base: 0,
      txn_count: 0,
    };
    cur.total_base += r.quantity_base_unit;
    cur.txn_count += 1;
    map.set(r.product_id, cur);
  }

  return Array.from(map.values())
    .sort((a, b) => b.total_base - a.total_base)
    .slice(0, topN);
}

export interface WarehouseRanking {
  warehouse_id: string;
  warehouse_name: string;
  txn_count: number;
  total_base: number;
}

export async function rankWarehousesByActivity(
  filters: ReportFilters = {},
  topN = 10
): Promise<WarehouseRanking[]> {
  const rows = await listTransactionsFull(filters, 5000);
  const map = new Map<string, WarehouseRanking>();

  for (const r of rows) {
    const cur = map.get(r.warehouse_id) ?? {
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouse_name,
      txn_count: 0,
      total_base: 0,
    };
    cur.txn_count += 1;
    cur.total_base += r.quantity_base_unit;
    map.set(r.warehouse_id, cur);
  }

  return Array.from(map.values())
    .sort((a, b) => b.txn_count - a.txn_count)
    .slice(0, topN);
}

export interface MovementRow {
  product_id: string;
  product_name: string;
  product_code: string;
  on_hand_base: number;
  dispensed_base: number;
}

export async function listMovement(filters: ReportFilters = {}): Promise<MovementRow[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");
  const products = await db.getAll("products");
  const dispRows = await listTransactionsFull({ ...filters, transaction_type: "dispensing" }, 10000);

  const onHand = new Map<string, number>();
  for (const b of batches) {
    onHand.set(b.product_id, (onHand.get(b.product_id) ?? 0) + b.quantity_base_unit);
  }

  const disp = new Map<string, number>();
  for (const r of dispRows) {
    disp.set(r.product_id, (disp.get(r.product_id) ?? 0) + r.quantity_base_unit);
  }

  return products.map((p) => ({
    product_id: p.id,
    product_name: p.product_name,
    product_code: p.product_code,
    on_hand_base: onHand.get(p.id) ?? 0,
    dispensed_base: disp.get(p.id) ?? 0,
  }));
}

// ---------- Current inventory ----------
export interface CurrentInventoryRow {
  batch_id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  category: string | null;
  warehouse_name: string;
  section_name: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity_base_unit: number;
}

export async function listCurrentInventory(filters: ReportFilters = {}): Promise<CurrentInventoryRow[]> {
  const db = await getDB();
  const batches = await db.getAll("inventory_batches");
  const products = await db.getAll("products");
  const warehouses = await db.getAll("warehouses");
  const sections = await db.getAll("warehouse_sections");

  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  let rows = batches
    .filter((b) => b.quantity_base_unit > 0)
    .map((b) => {
      const product = productMap.get(b.product_id);
      const warehouse = warehouseMap.get(b.warehouse_id);
      const section = b.section_id ? sectionMap.get(b.section_id) : null;

      return {
        batch_id: b.id,
        product_id: b.product_id,
        product_name: product?.product_name ?? "—",
        product_code: product?.product_code ?? "",
        category: product?.category ?? null,
        warehouse_name: warehouse?.warehouse_name ?? "—",
        section_name: section?.section_name ?? null,
        batch_number: b.batch_number,
        expiry_date: b.expiry_date,
        quantity_base_unit: b.quantity_base_unit,
      };
    });

  if (filters.warehouse_id) rows = rows.filter((r) => r.warehouse_id === filters.warehouse_id);
  if (filters.product_id) rows = rows.filter((r) => r.product_id === filters.product_id);
  if (filters.category) rows = rows.filter((r) => r.category === filters.category);

  return rows.sort((a, b) => {
    const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
    const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
    return aExp - bExp;
  });
}

// ---------- Export helpers ----------
export function exportToExcel(rows: Record<string, unknown>[], filename: string, sheet = "Report") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function printPage() {
  if (typeof window !== "undefined") window.print();
}
