import { supabase } from "@/integrations/supabase/client";
import type { InventoryTxnType } from "./inventory";
import * as XLSX from "xlsx";

// ---------- Shared filter type ----------
export interface ReportFilters {
  from?: string | null; // ISO date
  to?: string | null;   // ISO date
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
  totalStockBaseUnits: number; // proxy for stock value
}

export async function getOverviewKpis(): Promise<OverviewKpis> {
  const [p, b, w, s] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("inventory_batches").select("id", { count: "exact", head: true }).gt("quantity_base_unit", 0),
    supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("inventory_batches").select("quantity_base_unit"),
  ]);
  const totalStockBaseUnits = (s.data ?? []).reduce(
    (sum, r) => sum + Number(r.quantity_base_unit ?? 0),
    0,
  );
  return {
    totalProducts: p.count ?? 0,
    totalBatches: b.count ?? 0,
    totalWarehouses: w.count ?? 0,
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
  products: { product_name: string; product_code: string; category: string | null } | null;
  warehouses: { warehouse_name: string } | null;
  warehouse_sections: { section_name: string } | null;
  product_units: { unit_name: string } | null;
  inventory_batches: { batch_number: string | null; expiry_date: string | null } | null;
}

const TXN_SELECT =
  "*, products:product_id(product_name,product_code,category), warehouses:warehouse_id(warehouse_name), warehouse_sections:section_id(section_name), product_units:unit_id(unit_name), inventory_batches:batch_id(batch_number,expiry_date)";

export async function listTransactionsFull(
  filters: ReportFilters = {},
  limit = 500,
): Promise<TxnRow[]> {
  let q = supabase.from("inventory_transactions").select(TXN_SELECT);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to + "T23:59:59");
  if (filters.warehouse_id) q = q.eq("warehouse_id", filters.warehouse_id);
  if (filters.product_id) q = q.eq("product_id", filters.product_id);
  if (filters.transaction_type) q = q.eq("transaction_type", filters.transaction_type);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  let rows = (data ?? []) as unknown as TxnRow[];
  if (filters.category) {
    rows = rows.filter((r) => r.products?.category === filters.category);
  }
  return rows;
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
  topN = 10,
): Promise<ProductRanking[]> {
  const rows = await listTransactionsFull({ ...filters, transaction_type: type }, 5000);
  const map = new Map<string, ProductRanking>();
  for (const r of rows) {
    const cur = map.get(r.product_id) ?? {
      product_id: r.product_id,
      product_name: r.products?.product_name ?? "—",
      product_code: r.products?.product_code ?? "",
      total_base: 0,
      txn_count: 0,
    };
    cur.total_base += Number(r.quantity_base_unit);
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
  topN = 10,
): Promise<WarehouseRanking[]> {
  const rows = await listTransactionsFull(filters, 5000);
  const map = new Map<string, WarehouseRanking>();
  for (const r of rows) {
    const cur = map.get(r.warehouse_id) ?? {
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouses?.warehouse_name ?? "—",
      txn_count: 0,
      total_base: 0,
    };
    cur.txn_count += 1;
    cur.total_base += Number(r.quantity_base_unit);
    map.set(r.warehouse_id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.txn_count - a.txn_count).slice(0, topN);
}

/** Slow movers: products with stock but few/no dispensing in the period. */
export interface MovementRow {
  product_id: string;
  product_name: string;
  product_code: string;
  on_hand_base: number;
  dispensed_base: number;
}
export async function listMovement(filters: ReportFilters = {}): Promise<MovementRow[]> {
  const [{ data: batches }, { data: products }, dispRows] = await Promise.all([
    supabase.from("inventory_batches").select("product_id, quantity_base_unit"),
    supabase.from("products").select("id, product_name, product_code"),
    listTransactionsFull({ ...filters, transaction_type: "dispensing" }, 10000),
  ]);
  const onHand = new Map<string, number>();
  for (const b of batches ?? []) {
    onHand.set(b.product_id as string, (onHand.get(b.product_id as string) ?? 0) + Number(b.quantity_base_unit));
  }
  const disp = new Map<string, number>();
  for (const r of dispRows) {
    disp.set(r.product_id, (disp.get(r.product_id) ?? 0) + Number(r.quantity_base_unit));
  }
  return (products ?? []).map((p) => ({
    product_id: p.id as string,
    product_name: p.product_name as string,
    product_code: p.product_code as string,
    on_hand_base: onHand.get(p.id as string) ?? 0,
    dispensed_base: disp.get(p.id as string) ?? 0,
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
  let q = supabase
    .from("inventory_batches")
    .select(
      "id, product_id, batch_number, expiry_date, quantity_base_unit, warehouse_id, section_id, products:product_id(product_name,product_code,category), warehouses:warehouse_id(warehouse_name), warehouse_sections:section_id(section_name)",
    )
    .gt("quantity_base_unit", 0);
  if (filters.warehouse_id) q = q.eq("warehouse_id", filters.warehouse_id);
  if (filters.product_id) q = q.eq("product_id", filters.product_id);
  const { data, error } = await q.order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  let rows = (data ?? []).map((r) => {
    const prod = r.products as unknown as { product_name?: string; product_code?: string; category?: string | null } | null;
    const wh = r.warehouses as unknown as { warehouse_name?: string } | null;
    const sec = r.warehouse_sections as unknown as { section_name?: string } | null;
    return {
      batch_id: r.id as string,
      product_id: r.product_id as string,
      product_name: prod?.product_name ?? "—",
      product_code: prod?.product_code ?? "",
      category: prod?.category ?? null,
      warehouse_name: wh?.warehouse_name ?? "—",
      section_name: sec?.section_name ?? null,
      batch_number: (r.batch_number as string | null) ?? null,
      expiry_date: (r.expiry_date as string | null) ?? null,
      quantity_base_unit: Number(r.quantity_base_unit),
    };
  });
  if (filters.category) rows = rows.filter((r) => r.category === filters.category);
  return rows;
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
