import { getDB, generateId, now } from "./local-db";
import { logAudit } from "./audit";

export const QA_MARKER = "[QA-SEED]";

const SAMPLE_CATEGORIES = ["Analgesic", "Antibiotic", "Antiseptic", "Vitamin", "Supplement"];
const SAMPLE_MANUFACTURERS = ["Pfizer", "GSK", "Novartis", "Sanofi", "Bayer"];
const SAMPLE_PRODUCT_NAMES = [
  "Paracetamol 500mg", "Amoxicillin 250mg", "Ibuprofen 200mg",
  "Vitamin C 1000mg", "Aspirin 100mg", "Cetirizine 10mg",
  "Omeprazole 20mg", "Metformin 500mg", "Loratadine 10mg",
  "Diclofenac 50mg",
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDateOffset(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface SeedSummary {
  products: number;
  warehouses: number;
  batches: number;
  transactions: number;
  expired: number;
  nearExpiry: number;
  lowStock: number;
}

export async function generateSampleData(opts: {
  productCount?: number;
  warehouseCount?: number;
  batchesPerProduct?: number;
} = {}): Promise<SeedSummary> {
  const productCount = opts.productCount ?? 8;
  const warehouseCount = opts.warehouseCount ?? 2;
  const batchesPerProduct = opts.batchesPerProduct ?? 3;

  const summary: SeedSummary = {
    products: 0, warehouses: 0, batches: 0,
    transactions: 0, expired: 0, nearExpiry: 0, lowStock: 0,
  };

  const db = await getDB();
  const timestamp = Date.now().toString(36);

  // 1. Warehouses
  const warehouseIds: string[] = [];
  for (let i = 0; i < warehouseCount; i++) {
    const id = generateId();
    await db.put("warehouses", {
      id,
      warehouse_code: `QA-WH-${timestamp}-${i + 1}`,
      warehouse_name: `QA Warehouse ${timestamp}-${i + 1}`,
      description: `${QA_MARKER} sample warehouse`,
      is_active: true,
      created_by: null,
      created_at: now(),
      updated_at: now(),
    });
    warehouseIds.push(id);
    summary.warehouses++;
  }

  // 2. Products + base units
  const products: Array<{ id: string; unit_id: string; reorder: number }> = [];
  for (let i = 0; i < productCount; i++) {
    const productId = generateId();
    const unitId = generateId();
    const reorder = 50;

    await db.put("products", {
      id: productId,
      product_code: `QA-P-${timestamp}-${i + 1}`,
      product_name: `${rand(SAMPLE_PRODUCT_NAMES)} #${timestamp}-${i + 1}`,
      barcode: null,
      category: rand(SAMPLE_CATEGORIES),
      manufacturer: rand(SAMPLE_MANUFACTURERS),
      base_unit: "tablet",
      reorder_level: reorder,
      notes: `${QA_MARKER} sample product`,
      image_url: null,
      created_by: null,
      created_at: now(),
      updated_at: now(),
    });

    await db.put("product_units", {
      id: unitId,
      product_id: productId,
      unit_name: "tablet",
      factor_to_base: 1,
      is_base: true,
      barcode: null,
      sort_order: 0,
      created_at: now(),
      updated_at: now(),
    });

    products.push({ id: productId, unit_id: unitId, reorder });
    summary.products++;
  }

  // 3. Batches + initial stock-in transactions
  for (let pi = 0; pi < products.length; pi++) {
    const p = products[pi];
    for (let bi = 0; bi < batchesPerProduct; bi++) {
      const warehouseId = rand(warehouseIds);
      const batchId = generateId();
      const txnId = generateId();

      let expiryOffset: number;
      let qty: number;
      let scenario: "expired" | "near" | "low" | "ok";
      const r = (pi * batchesPerProduct + bi) % 4;
      if (r === 0) { expiryOffset = -10; qty = 100; scenario = "expired"; }
      else if (r === 1) { expiryOffset = 15; qty = 80; scenario = "near"; }
      else if (r === 2) { expiryOffset = 365; qty = 10; scenario = "low"; }
      else { expiryOffset = 365; qty = 500; scenario = "ok"; }

      await db.put("inventory_batches", {
        id: batchId,
        product_id: p.id,
        warehouse_id: warehouseId,
        section_id: null,
        batch_number: `QA-${timestamp}-${pi}-${bi}`,
        expiry_date: isoDateOffset(expiryOffset),
        quantity_base_unit: qty,
        created_at: now(),
        updated_at: now(),
      });
      summary.batches++;

      await db.put("inventory_transactions", {
        id: txnId,
        transaction_type: "stock_in",
        product_id: p.id,
        batch_id: batchId,
        warehouse_id: warehouseId,
        section_id: null,
        quantity: qty,
        unit_id: p.unit_id,
        quantity_base_unit: qty,
        performed_by: null,
        notes: `${QA_MARKER} initial stock (${scenario})`,
        created_at: now(),
      });
      summary.transactions++;

      if (scenario === "expired") summary.expired++;
      else if (scenario === "near") summary.nearExpiry++;
      else if (scenario === "low") summary.lowStock++;
    }
  }

  await logAudit({
    action_type: "qa_seed",
    entity_type: "qa",
    entity_id: null,
    new_values: summary as unknown as Record<string, unknown>,
  });

  return summary;
}

export async function purgeQaData() {
  const db = await getDB();
  const summary = { products: 0, warehouses: 0, batches: 0, transactions: 0 };

  // Delete QA-tagged transactions
  const txns = await db.getAll("inventory_transactions");
  const qaTxns = txns.filter((t) => t.notes?.includes(QA_MARKER));
  for (const t of qaTxns) {
    await db.delete("inventory_transactions", t.id);
  }
  summary.transactions = qaTxns.length;

  // Delete QA batches
  const batches = await db.getAll("inventory_batches");
  const qaBatches = batches.filter((b) => b.batch_number?.includes("QA-"));
  for (const b of qaBatches) {
    await db.delete("inventory_batches", b.id);
  }
  summary.batches = qaBatches.length;

  // Delete QA products
  const products = await db.getAll("products");
  const qaProducts = products.filter((p) => p.notes?.includes(QA_MARKER));
  for (const p of qaProducts) {
    // Delete related units
    const units = await db.getAllFromIndex("product_units", "by-product", p.id);
    for (const u of units) {
      await db.delete("product_units", u.id);
    }
    await db.delete("products", p.id);
  }
  summary.products = qaProducts.length;

  // Delete QA warehouses
  const warehouses = await db.getAll("warehouses");
  const qaWarehouses = warehouses.filter((w) => w.description?.includes(QA_MARKER));
  for (const w of qaWarehouses) {
    await db.delete("warehouses", w.id);
  }
  summary.warehouses = qaWarehouses.length;

  await logAudit({
    action_type: "qa_purge",
    entity_type: "qa",
    entity_id: null,
    new_values: summary as unknown as Record<string, unknown>,
  });

  return summary;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  count: number;
}

export interface ValidationReport {
  generatedAt: string;
  totals: {
    products: number;
    warehouses: number;
    batches: number;
    transactions: number;
  };
  issues: ValidationIssue[];
}

export async function runValidationReport(): Promise<ValidationReport> {
  const db = await getDB();
  const issues: ValidationIssue[] = [];
  const today = isoDateOffset(0);
  const in30 = isoDateOffset(30);

  const [products, warehouses, batches, txns, units] = await Promise.all([
    db.getAll("products"),
    db.getAll("warehouses"),
    db.getAll("inventory_batches"),
    db.getAll("inventory_transactions"),
    db.getAll("product_units"),
  ]);

  // Expired batches with remaining stock
  const expired = batches.filter((b) => b.expiry_date && b.expiry_date < today && b.quantity_base_unit > 0);
  if (expired.length) {
    issues.push({ severity: "error", category: "Expired stock", message: "Batches past expiry date still hold positive stock.", count: expired.length });
  }

  // Near-expiry
  const near = batches.filter(
    (b) => b.expiry_date && b.expiry_date >= today && b.expiry_date <= in30 && b.quantity_base_unit > 0
  );
  if (near.length) {
    issues.push({ severity: "warning", category: "Near expiry", message: "Batches will expire within 30 days.", count: near.length });
  }

  // Negative stock
  const neg = batches.filter((b) => b.quantity_base_unit < 0);
  if (neg.length) {
    issues.push({ severity: "error", category: "Negative stock", message: "Batches with negative quantities.", count: neg.length });
  }

  // Products without units
  const withUnits = new Set(units.map((u) => u.product_id));
  const missingUnits = products.filter((p) => !withUnits.has(p.id));
  if (missingUnits.length) {
    issues.push({ severity: "warning", category: "Missing units", message: "Products without any unit definition.", count: missingUnits.length });
  }

  // Low-stock products
  const totals = new Map<string, number>();
  for (const b of batches) {
    totals.set(b.product_id, (totals.get(b.product_id) ?? 0) + b.quantity_base_unit);
  }
  const low = products.filter((p) => (totals.get(p.id) ?? 0) < (p.reorder_level ?? 0));
  if (low.length) {
    issues.push({ severity: "warning", category: "Low stock", message: "Products with on-hand quantity below reorder level.", count: low.length });
  }

  if (issues.length === 0) {
    issues.push({ severity: "info", category: "All clear", message: "No data quality issues detected.", count: 0 });
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      products: products.length,
      warehouses: warehouses.length,
      batches: batches.length,
      transactions: txns.length,
    },
    issues,
  };
}
