import * as XLSX from "xlsx";

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
    "Products"
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
  const { getDB } = await import("./local-db");
  const db = await getDB();
  const existing = await db.getAll("products");

  const codes = new Set(existing.map((p) => p.product_code?.toLowerCase()).filter(Boolean));
  const barcodes = new Set(existing.map((p) => p.barcode?.toLowerCase()).filter(Boolean));
  const nameMan = new Set(existing.map((p) => `${(p.product_name ?? "").toLowerCase()}|${(p.manufacturer ?? "").toLowerCase()}`));

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
    if (Number.isNaN(reorder_level) || reorder_level < 0) errors.push("reorder_level must be a non-negative number");
    if (product_code && codes.has(product_code.toLowerCase())) errors.push(`product_code "${product_code}" already exists`);
    if (barcode && barcodes.has(barcode.toLowerCase())) warnings.push(`barcode "${barcode}" already used`);

    const key = `${product_name.toLowerCase()}|${manufacturer.toLowerCase()}`;
    if (product_name && nameMan.has(key)) errors.push(`duplicate: "${product_name}" + "${manufacturer}" already exists`);
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

export async function importProductRows(rows: ProductImportRow[], onProgress?: (done: number, total: number) => void) {
  const { createProduct } = await import("./products");
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
    "StockIn"
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
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

export async function validateInventoryRows(raw: Record<string, unknown>[]): Promise<InventoryImportRow[]> {
  const { getDB } = await import("./local-db");
  const db = await getDB();
  const [products, warehouses, sections, units] = await Promise.all([
    db.getAll("products"),
    db.getAll("warehouses"),
    db.getAll("warehouse_sections"),
    db.getAll("product_units"),
  ]);

  const pMap = new Map(products.map((p) => [p.product_code?.toLowerCase(), p]));
  const wMap = new Map(warehouses.map((w) => [w.warehouse_code?.toLowerCase(), w]));

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
    if (expiry_date && new Date(expiry_date) < new Date()) warnings.push(`expiry_date ${expiry_date} is in the past`);

    const product = pMap.get(product_code.toLowerCase());
    const warehouse = wMap.get(warehouse_code.toLowerCase());
    if (product_code && !product) errors.push(`unknown product_code "${product_code}"`);
    if (warehouse_code && !warehouse) errors.push(`unknown warehouse_code "${warehouse_code}"`);

    let section_id: string | null = null;
    if (warehouse && section_name) {
      const s = sections.find(
        (x) => x.warehouse_id === warehouse.id && x.section_name.toLowerCase() === section_name.toLowerCase()
      );
      if (!s) errors.push(`unknown section "${section_name}" in warehouse "${warehouse_code}"`);
      else section_id = s.id;
    }

    let unit_id = "";
    if (product && unit_name) {
      const u = units.find((x) => x.product_id === product.id && x.unit_name.toLowerCase() === unit_name.toLowerCase());
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
      resolved: product && warehouse && unit_id ? { product_id: product.id, warehouse_id: warehouse.id, section_id, unit_id } : undefined,
      errors,
      warnings,
    });
  });
  return out;
}

export async function importInventoryRows(rows: InventoryImportRow[], onProgress?: (done: number, total: number) => void) {
  const { performStockIn } = await import("./inventory-ops");
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
  const { getDB } = await import("./local-db");
  const db = await getDB();
  const [batches, products, warehouses, sections] = await Promise.all([
    db.getAll("inventory_batches"),
    db.getAll("products"),
    db.getAll("warehouses"),
    db.getAll("warehouse_sections"),
  ]);

  const pMap = new Map(products.map((p) => [p.id, p]));
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  const sMap = new Map(sections.map((s) => [s.id, s]));

  const rows = batches
    .filter((b) => b.quantity_base_unit > 0)
    .map((b) => {
      const p = pMap.get(b.product_id);
      const w = wMap.get(b.warehouse_id);
      const s = b.section_id ? sMap.get(b.section_id) : null;
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
  const { getDB } = await import("./local-db");
  const db = await getDB();
  const [txns, products, warehouses, sections, units, batches] = await Promise.all([
    db.getAll("inventory_transactions"),
    db.getAll("products"),
    db.getAll("warehouses"),
    db.getAll("warehouse_sections"),
    db.getAll("product_units"),
    db.getAll("inventory_batches"),
  ]);

  const pMap = new Map(products.map((p) => [p.id, p]));
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  const sMap = new Map(sections.map((s) => [s.id, s]));
  const uMap = new Map(units.map((u) => [u.id, u]));
  const bMap = new Map(batches.map((b) => [b.id, b]));

  const rows = txns
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((t) => {
      const p = pMap.get(t.product_id);
      const w = wMap.get(t.warehouse_id);
      const s = t.section_id ? sMap.get(t.section_id) : null;
      const u = uMap.get(t.unit_id);
      const b = t.batch_id ? bMap.get(t.batch_id) : null;
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
  const { getDB } = await import("./local-db");
  const db = await getDB();
  const [batches, products, warehouses, sections] = await Promise.all([
    db.getAll("inventory_batches"),
    db.getAll("products"),
    db.getAll("warehouses"),
    db.getAll("warehouse_sections"),
  ]);

  const today = new Date();
  const horizon = new Date();
  horizon.setDate(today.getDate() + daysAhead);

  const pMap = new Map(products.map((p) => [p.id, p]));
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  const sMap = new Map(sections.map((s) => [s.id, s]));

  const rows = batches
    .filter((b) => b.quantity_base_unit > 0 && b.expiry_date && new Date(b.expiry_date) <= horizon)
    .map((b) => {
      const p = pMap.get(b.product_id);
      const w = wMap.get(b.warehouse_id);
      const s = b.section_id ? sMap.get(b.section_id) : null;
      const days = b.expiry_date ? Math.ceil((new Date(b.expiry_date).getTime() - today.getTime()) / 86400000) : null;
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
  const { getDB } = await import("./local-db");
  const db = await getDB();
  const [products, batches] = await Promise.all([db.getAll("products"), db.getAll("inventory_batches")]);

  const totals = new Map<string, number>();
  for (const b of batches) {
    totals.set(b.product_id, (totals.get(b.product_id) ?? 0) + b.quantity_base_unit);
  }

  const rows = products
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
