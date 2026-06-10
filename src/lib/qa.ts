import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "./audit";

/**
 * Test data generator & QA validation utilities. Admin-only by UI gating.
 * All inserts are tagged with notes/descriptions containing the marker
 * `[QA-SEED]` so they can be safely identified and purged later.
 */
export const QA_MARKER = "[QA-SEED]";

const SAMPLE_CATEGORIES = ["Analgesic", "Antibiotic", "Antiseptic", "Vitamin", "Supplement"];
const SAMPLE_MANUFACTURERS = ["Pfizer", "GSK", "Novartis", "Sanofi", "Bayer"];
const SAMPLE_PRODUCT_NAMES = [
  "Paracetamol 500mg", "Amoxicillin 250mg", "Ibuprofen 200mg",
  "Vitamin C 1000mg", "Aspirin 100mg", "Cetirizine 10mg",
  "Omeprazole 20mg", "Metformin 500mg", "Loratadine 10mg",
  "Diclofenac 50mg",
];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pad(n: number) { return String(n).padStart(2, "0"); }
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

  // 1. Warehouses
  const warehouseIds: string[] = [];
  for (let i = 0; i < warehouseCount; i++) {
    const name = `QA Warehouse ${Date.now().toString(36)}-${i + 1}`;
    const { data, error } = await supabase
      .from("warehouses")
      .insert({ warehouse_name: name, description: `${QA_MARKER} sample warehouse`, is_active: true } as never)
      .select("id")
      .single();
    if (error) throw error;
    warehouseIds.push(data.id);
    summary.warehouses++;
  }

  // 2. Products + base units
  const products: Array<{ id: string; unit_id: string; reorder: number }> = [];
  for (let i = 0; i < productCount; i++) {
    const name = `${rand(SAMPLE_PRODUCT_NAMES)} #${Date.now().toString(36)}-${i}`;
    const reorder = 50;
    const { data: prod, error: pErr } = await supabase
      .from("products")
      .insert({
        product_name: name,
        manufacturer: rand(SAMPLE_MANUFACTURERS),
        category: rand(SAMPLE_CATEGORIES),
        base_unit: "tablet",
        reorder_level: reorder,
        notes: `${QA_MARKER} sample product`,
      } as never)
      .select("id")
      .single();
    if (pErr) throw pErr;

    const { data: unit, error: uErr } = await supabase
      .from("product_units")
      .insert({
        product_id: prod.id,
        unit_name: "tablet",
        factor_to_base: 1,
        is_base: true,
        sort_order: 0,
      })
      .select("id")
      .single();
    if (uErr) throw uErr;
    products.push({ id: prod.id, unit_id: unit.id, reorder });
    summary.products++;
  }

  // 3. Batches + initial stock-in transactions (mixed expired / near-expiry / healthy / low-stock)
  for (let pi = 0; pi < products.length; pi++) {
    const p = products[pi];
    for (let bi = 0; bi < batchesPerProduct; bi++) {
      const warehouseId = rand(warehouseIds);

      // Distribute scenarios across batches
      let expiryOffset: number;
      let qty: number;
      let scenario: "expired" | "near" | "low" | "ok";
      const r = (pi * batchesPerProduct + bi) % 4;
      if (r === 0) { expiryOffset = -10; qty = 100; scenario = "expired"; }
      else if (r === 1) { expiryOffset = 15; qty = 80; scenario = "near"; }
      else if (r === 2) { expiryOffset = 365; qty = 10; scenario = "low"; }
      else { expiryOffset = 365; qty = 500; scenario = "ok"; }

      const { data: batch, error: bErr } = await supabase
        .from("inventory_batches")
        .insert({
          product_id: p.id,
          warehouse_id: warehouseId,
          batch_number: `QA-${Date.now().toString(36)}-${pi}-${bi}`,
          expiry_date: isoDateOffset(expiryOffset),
          quantity_base_unit: 0,
        })
        .select("id")
        .single();
      if (bErr) throw bErr;
      summary.batches++;

      const { error: tErr } = await supabase.from("inventory_transactions").insert({
        transaction_type: "stock_in",
        product_id: p.id,
        batch_id: batch.id,
        warehouse_id: warehouseId,
        quantity: qty,
        unit_id: p.unit_id,
        quantity_base_unit: qty,
        notes: `${QA_MARKER} initial stock (${scenario})`,
      });
      if (tErr) throw tErr;
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
  const summary = { products: 0, warehouses: 0, batches: 0, transactions: 0 };

  // Transactions referencing QA-tagged batches/products
  const { data: qaTx } = await supabase
    .from("inventory_transactions")
    .select("id")
    .ilike("notes", `%${QA_MARKER}%`);
  if (qaTx?.length) {
    await supabase.from("inventory_transactions").delete().in("id", qaTx.map((t) => t.id));
    summary.transactions = qaTx.length;
  }

  // QA products → cascades batches & units via FK if configured; otherwise delete explicitly.
  const { data: qaProducts } = await supabase
    .from("products")
    .select("id")
    .ilike("notes", `%${QA_MARKER}%`);
  if (qaProducts?.length) {
    const ids = qaProducts.map((p) => p.id);
    const { count: bCount } = await supabase
      .from("inventory_batches")
      .delete({ count: "exact" })
      .in("product_id", ids);
    summary.batches = bCount ?? 0;
    await supabase.from("product_units").delete().in("product_id", ids);
    await supabase.from("products").delete().in("id", ids);
    summary.products = ids.length;
  }

  const { data: qaWh } = await supabase
    .from("warehouses")
    .select("id")
    .ilike("description", `%${QA_MARKER}%`);
  if (qaWh?.length) {
    await supabase.from("warehouses").delete().in("id", qaWh.map((w) => w.id));
    summary.warehouses = qaWh.length;
  }

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
  const issues: ValidationIssue[] = [];
  const today = isoDateOffset(0);
  const in30 = isoDateOffset(30);

  const [prodC, whC, batchC, txC] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("warehouses").select("id", { count: "exact", head: true }),
    supabase.from("inventory_batches").select("id", { count: "exact", head: true }),
    supabase.from("inventory_transactions").select("id", { count: "exact", head: true }),
  ]);

  // Expired batches with remaining stock
  const { data: expired } = await supabase
    .from("inventory_batches")
    .select("id")
    .lt("expiry_date", today)
    .gt("quantity_base_unit", 0);
  if (expired?.length) {
    issues.push({
      severity: "error",
      category: "Expired stock",
      message: "Batches past expiry date still hold positive stock.",
      count: expired.length,
    });
  }

  // Near-expiry (next 30 days)
  const { data: near } = await supabase
    .from("inventory_batches")
    .select("id")
    .gte("expiry_date", today)
    .lte("expiry_date", in30)
    .gt("quantity_base_unit", 0);
  if (near?.length) {
    issues.push({
      severity: "warning",
      category: "Near expiry",
      message: "Batches will expire within 30 days.",
      count: near.length,
    });
  }

  // Negative stock
  const { data: neg } = await supabase
    .from("inventory_batches")
    .select("id")
    .lt("quantity_base_unit", 0);
  if (neg?.length) {
    issues.push({
      severity: "error",
      category: "Negative stock",
      message: "Batches with negative quantities — investigate transactions.",
      count: neg.length,
    });
  }

  // Products without units
  const { data: prods } = await supabase.from("products").select("id");
  const { data: units } = await supabase.from("product_units").select("product_id");
  if (prods && units) {
    const withUnits = new Set(units.map((u) => u.product_id));
    const missing = prods.filter((p) => !withUnits.has(p.id));
    if (missing.length) {
      issues.push({
        severity: "warning",
        category: "Missing units",
        message: "Products without any unit definition cannot record transactions.",
        count: missing.length,
      });
    }
  }

  // Low-stock products (sum base units < reorder_level)
  if (prods) {
    const { data: stock } = await supabase
      .from("inventory_batches")
      .select("product_id, quantity_base_unit");
    const totals = new Map<string, number>();
    (stock ?? []).forEach((b) => {
      totals.set(b.product_id, (totals.get(b.product_id) ?? 0) + Number(b.quantity_base_unit));
    });
    const { data: full } = await supabase.from("products").select("id, reorder_level");
    const low = (full ?? []).filter((p) =>
      (totals.get(p.id) ?? 0) < Number(p.reorder_level ?? 0),
    );
    if (low.length) {
      issues.push({
        severity: "warning",
        category: "Low stock",
        message: "Products with on-hand quantity below their reorder level.",
        count: low.length,
      });
    }
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      category: "All clear",
      message: "No data quality issues detected.",
      count: 0,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      products: prodC.count ?? 0,
      warehouses: whC.count ?? 0,
      batches: batchC.count ?? 0,
      transactions: txC.count ?? 0,
    },
    issues,
  };
}
