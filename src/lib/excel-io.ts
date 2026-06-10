import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { createProduct } from "./products";
import { performStockIn } from "./inventory-ops";

// ---------- Generic helpers ----------
export function downloadWorkbook(rows: Record<string, unknown>[], filename: string, sheet = "Sheet1") {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
}

function normHeader(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}
function pick(row: Record<string, unknown>, ...keys: string[]) {
  const lc: Record<string, unknown> = {};
  for (const k of Object.keys(row)) lc[normHeader(k)] = row[k];
  for (const k of keys) {
    const v = lc[normHeader(k)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// ---------- Product Import ----------
export const PRODUCT_TEMPLATE_HEADERS = [
  "product_code",
  "product_name",
  "barcode",
  "category",
  "manufacturer",
  "base_unit",
  "reorder_level",
  "notes",
];

export function downloadProductTemplate() {
  downloadWorkbook(
    [
      {
        product_code: "P-0001",
        product_name: "Paracetamol 500mg",
        barcode: "1234567890",
        category: "Analgesic",
        manufacturer: "Acme Pharma",
        base_unit: "tablet",
        reorder_level: 100,
        notes: "Optional notes",
      },
    ],
    "products_template",
    "Products",
  );
}

export interface ProductImportRow {
  row: number;
  data: {
    product_code?: string;
    product_name: string;
    barcode?: string;
    category?: string;
    manufacturer?: string;
    base_unit: string;
    reorder_level: number;
    notes?: string;
  };
  errors: string[];
  warnings: string[];
}

export async function validateProductRows(raw: Record<string, unknown>[]): Promise<ProductImportRow[]> {
  // Pre-fetch existing names + codes to flag duplicates.
  const { data: existing } = await supabase
    .from("products")
    .select("product_name,product_code,barcode,manufacturer");
  const codes = new Set((existing ?? []).map((p) => p.product_code?.toLowerCase()).filter(Boolean));
  const barcodes = new Set((existing ?? []).map((p) => p.barcode?.toLowerCase()).filter(Boolean));
  const nameMan = new Set(
    (existing ?? []).map((p) => `${(p.product_name ?? "").toLowerCase()}|${(p.manufacturer ?? "").toLowerCase()}`),
  );

  const out: ProductImportRow[] = [];
  const seenInFile = new Set<string>();
  raw.forEach((row, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const product_name = pick(row, "product_name", "name");
    const product_code = pick(row, "product_code", "code");
    const barcode = pick(row, "barcode");
    const category = pick(row, "category");
    const manufacturer = pick(row, "manufacturer");
    const base_unit = pick(row, "base_unit", "unit") || "unit";
    const reorder_level = Number(pick(row, "reorder_level", "reorder") || 0);
    const notes = pick(row, "notes");

    if (!product_name) errors.push("product_name is required");
    if (product_name.length > 255) errors.push("product_name too long");
    if (Number.isNaN(reorder_level) || reorder_level < 0)
      errors.push("reorder_level must be a non-negative number");
    if (product_code && codes.has(product_code.toLowerCase()))
      errors.push(`product_code "${product_code}" already exists`);
    if (barcode && barcodes.has(barcode.toLowerCase()))
      warnings.push(`barcode "${barcode}" already used`);
    const key = `${product_name.toLowerCase()}|${manufacturer.toLowerCase()}`;
    if (product_name && nameMan.has(key))
      errors.push(`duplicate: "${product_name}" + "${manufacturer}" already exists`);
    if (seenInFile.has(key)) errors.push("duplicate row within file");
    seenInFile.add(key);

    out.push({
      row: i + 2,
      data: {
        product_code: product_code || undefined,
        product_name,
        barcode: barcode || undefined,
        category: category || undefined,
        manufacturer: manufacturer || undefined,
        base_unit,
        reorder_level,
        notes: notes || undefined,
      },
      errors,
      warnings,
    });
  });
  return out;
}

export async function importProductRows(
  rows: ProductImportRow[],
  onProgress?: (done: number, total: number) => void,
) {
  const valid = rows.filter((r) => r.errors.length === 0);
  let done = 0;
  const failures: { row: number; reason: string }[] = [];
  for (const r of valid) {
    try {
      await createProduct({
        product_code: r.data.product_code ?? "",
        product_name: r.data.product_name,
        barcode: r.data.barcode ?? "",
        category: r.data.category ?? "",
        manufacturer: r.data.manufacturer ?? "",
        base_unit: r.data.base_unit,
        reorder_level: r.data.reorder_level,
        notes: r.data.notes ?? "",
        image_url: "",
      });
    } catch (e) {
      failures.push({ row: r.row, reason: (e as Error).message });
    }
    done++;
    onProgress?.(done, valid.length);
  }
  return { inserted: valid.length - failures.length, failures, skipped: rows.length - valid.length };
}

// ---------- Inventory (Stock-In) Import ----------
export function downloadInventoryTemplate() {
  downloadWorkbook(
    [
      {
        product_code: "P-0001",
        warehouse_code: "WH-01",
        section_name: "Shelf A",
        batch_number: "B-2025-01",
        expiry_date: "2026-12-31",
        unit_name: "tablet",
        quantity: 500,
        notes: "Initial stock",
      },
    ],
    "inventory_stockin_template",
    "StockIn",
  );
}

export interface InventoryImportRow {
  row: number;
  raw: {
    product_code: string;
    warehouse_code: string;
    section_name?: string;
    batch_number?: string;
    expiry_date?: string;
    unit_name: string;
    quantity: number;
    notes?: string;
  };
  resolved?: {
    product_id: string;
    warehouse_id: string;
    section_id: string | null;
    unit_id: string;
  };
  errors: string[];
  warnings: string[];
}

function parseDate(v: string): string | undefined {
  if (!v) return undefined;
  // Accept yyyy-mm-dd or dd/mm/yyyy or Date strings
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

export async function validateInventoryRows(raw: Record<string, unknown>[]): Promise<InventoryImportRow[]> {
  const [{ data: products }, { data: warehouses }, { data: sections }, { data: units }] = await Promise.all([
    supabase.from("products").select("id,product_code,product_name"),
    supabase.from("warehouses").select("id,warehouse_code,warehouse_name"),
    supabase.from("warehouse_sections").select("id,section_name,warehouse_id"),
    supabase.from("product_units").select("id,unit_name,product_id"),
  ]);
  const pMap = new Map((products ?? []).map((p) => [p.product_code?.toLowerCase(), p]));
  const wMap = new Map((warehouses ?? []).map((w) => [w.warehouse_code?.toLowerCase(), w]));

  const out: InventoryImportRow[] = [];
  raw.forEach((row, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const product_code = pick(row, "product_code");
    const warehouse_code = pick(row, "warehouse_code");
    const section_name = pick(row, "section_name", "section");
    const batch_number = pick(row, "batch_number", "batch");
    const expiry_raw = pick(row, "expiry_date", "expiry");
    const expiry_date = parseDate(expiry_raw);
    const unit_name = pick(row, "unit_name", "unit");
    const quantity = Number(pick(row, "quantity", "qty") || 0);
    const notes = pick(row, "notes");

    if (!product_code) errors.push("product_code required");
    if (!warehouse_code) errors.push("warehouse_code required");
    if (!unit_name) errors.push("unit_name required");
    if (!quantity || quantity <= 0) errors.push("quantity must be > 0");
    if (expiry_raw && !expiry_date) errors.push(`invalid expiry_date "${expiry_raw}"`);
    if (expiry_date && new Date(expiry_date) < new Date())
      warnings.push(`expiry_date ${expiry_date} is in the past`);

    const product = pMap.get(product_code.toLowerCase());
    const warehouse = wMap.get(warehouse_code.toLowerCase());
    if (product_code && !product) errors.push(`unknown product_code "${product_code}"`);
    if (warehouse_code && !warehouse) errors.push(`unknown warehouse_code "${warehouse_code}"`);

    let section_id: string | null = null;
    if (warehouse && section_name) {
      const s = (sections ?? []).find(
        (x) => x.warehouse_id === warehouse.id && x.section_name.toLowerCase() === section_name.toLowerCase(),
      );
      if (!s) errors.push(`unknown section "${section_name}" in warehouse "${warehouse_code}"`);
      else section_id = s.id;
    }

    let unit_id = "";
    if (product && unit_name) {
      const u = (units ?? []).find(
        (x) => x.product_id === product.id && x.unit_name.toLowerCase() === unit_name.toLowerCase(),
      );
      if (!u) errors.push(`unit "${unit_name}" not defined for product "${product_code}"`);
      else unit_id = u.id;
    }

    out.push({
      row: i + 2,
      raw: {
        product_code,
        warehouse_code,
        section_name: section_name || undefined,
        batch_number: batch_number || undefined,
        expiry_date,
        unit_name,
        quantity,
        notes: notes || undefined,
      },
      resolved:
        product && warehouse && unit_id
          ? { product_id: product.id, warehouse_id: warehouse.id, section_id, unit_id }
          : undefined,
      errors,
      warnings,
    });
  });
  return out;
}

export async function importInventoryRows(
  rows: InventoryImportRow[],
  onProgress?: (done: number, total: number) => void,
) {
  const valid = rows.filter((r) => r.errors.length === 0 && r.resolved);
  const failures: { row: number; reason: string }[] = [];
  let done = 0;
  for (const r of valid) {
    try {
      await performStockIn({
        product_id: r.resolved!.product_id,
        warehouse_id: r.resolved!.warehouse_id,
        section_id: r.resolved!.section_id,
        batch_number: r.raw.batch_number ?? null,
        expiry_date: r.raw.expiry_date ?? null,
        unit_id: r.resolved!.unit_id,
        quantity: r.raw.quantity,
        notes: r.raw.notes ?? null,
      });
    } catch (e) {
      failures.push({ row: r.row, reason: (e as Error).message });
    }
    done++;
    onProgress?.(done, valid.length);
  }
  return { inserted: valid.length - failures.length, failures, skipped: rows.length - valid.length };
}

// ---------- Exports ----------
export async function exportCurrentInventory() {
  const { data } = await supabase
    .from("inventory_batches")
    .select(
      "id,quantity_base_unit,batch_number,expiry_date,created_at,products:product_id(product_code,product_name,base_unit,category),warehouses:warehouse_id(warehouse_code,warehouse_name),warehouse_sections:section_id(section_name)",
    )
    .gt("quantity_base_unit", 0);
  const rows = (data ?? []).map((b) => {
    const p = b.products as { product_code?: string; product_name?: string; base_unit?: string; category?: string } | null;
    const w = b.warehouses as { warehouse_code?: string; warehouse_name?: string } | null;
    const s = b.warehouse_sections as { section_name?: string } | null;
    return {
      product_code: p?.product_code,
      product_name: p?.product_name,
      category: p?.category,
      warehouse: w?.warehouse_name,
      section: s?.section_name,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      quantity: b.quantity_base_unit,
      base_unit: p?.base_unit,
    };
  });
  downloadWorkbook(rows, "current_inventory", "Inventory");
}

export async function exportTransactions(limit = 5000) {
  const { data } = await supabase
    .from("inventory_transactions")
    .select(
      "id,created_at,transaction_type,quantity,quantity_base_unit,notes,products:product_id(product_code,product_name),warehouses:warehouse_id(warehouse_name),warehouse_sections:section_id(section_name),product_units:unit_id(unit_name),inventory_batches:batch_id(batch_number,expiry_date)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []).map((t) => {
    const p = t.products as { product_code?: string; product_name?: string } | null;
    const w = t.warehouses as { warehouse_name?: string } | null;
    const s = t.warehouse_sections as { section_name?: string } | null;
    const u = t.product_units as { unit_name?: string } | null;
    const b = t.inventory_batches as { batch_number?: string; expiry_date?: string } | null;
    return {
      date: t.created_at,
      type: t.transaction_type,
      product_code: p?.product_code,
      product_name: p?.product_name,
      warehouse: w?.warehouse_name,
      section: s?.section_name,
      batch_number: b?.batch_number,
      expiry_date: b?.expiry_date,
      unit: u?.unit_name,
      quantity: t.quantity,
      quantity_base: t.quantity_base_unit,
      notes: t.notes,
    };
  });
  downloadWorkbook(rows, "transactions_history", "Transactions");
}

export async function exportExpiryReport(daysAhead = 90) {
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(today.getDate() + daysAhead);
  const { data } = await supabase
    .from("inventory_batches")
    .select(
      "quantity_base_unit,batch_number,expiry_date,products:product_id(product_code,product_name),warehouses:warehouse_id(warehouse_name),warehouse_sections:section_id(section_name)",
    )
    .gt("quantity_base_unit", 0)
    .not("expiry_date", "is", null)
    .lte("expiry_date", horizon.toISOString().slice(0, 10));
  const rows = (data ?? []).map((b) => {
    const p = b.products as { product_code?: string; product_name?: string } | null;
    const w = b.warehouses as { warehouse_name?: string } | null;
    const s = b.warehouse_sections as { section_name?: string } | null;
    const days =
      b.expiry_date ? Math.ceil((new Date(b.expiry_date).getTime() - today.getTime()) / 86400000) : null;
    return {
      product_code: p?.product_code,
      product_name: p?.product_name,
      warehouse: w?.warehouse_name,
      section: s?.section_name,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      days_to_expiry: days,
      status: days !== null && days < 0 ? "EXPIRED" : "NEAR EXPIRY",
      quantity: b.quantity_base_unit,
    };
  });
  downloadWorkbook(rows, "expiry_report", "Expiry");
}

export async function exportLowStockReport() {
  const [{ data: products }, { data: batches }] = await Promise.all([
    supabase.from("products").select("id,product_code,product_name,base_unit,reorder_level"),
    supabase.from("inventory_batches").select("product_id,quantity_base_unit"),
  ]);
  const totals = new Map<string, number>();
  for (const b of batches ?? []) {
    totals.set(b.product_id, (totals.get(b.product_id) ?? 0) + Number(b.quantity_base_unit ?? 0));
  }
  const rows = (products ?? [])
    .map((p) => ({
      product_code: p.product_code,
      product_name: p.product_name,
      base_unit: p.base_unit,
      on_hand: totals.get(p.id) ?? 0,
      reorder_level: p.reorder_level,
      status: (totals.get(p.id) ?? 0) === 0 ? "OUT OF STOCK" : "LOW",
    }))
    .filter((r) => r.on_hand <= r.reorder_level);
  downloadWorkbook(rows, "low_stock_report", "LowStock");
}
