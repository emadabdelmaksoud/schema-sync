import { z } from "zod";
import { getDB, generateId, now, type ProductUnit } from "./local-db";

export const productUnitSchema = z
  .object({
    unit_name: z.string().trim().min(1, "Unit name is required").max(50),
    factor_to_base: z.coerce.number().positive("Factor must be greater than 0").finite(),
    is_base: z.boolean(),
    barcode: z.string().trim().max(64).optional().or(z.literal("")),
    sort_order: z.coerce.number().int().min(0),
  })
  .strict()
  .refine((v) => !v.is_base || v.factor_to_base === 1, {
    message: "Base unit must have factor = 1",
    path: ["factor_to_base"],
  });

export type ProductUnitInput = z.infer<typeof productUnitSchema>;
export type { ProductUnit } from "./local-db";

/** Convert a quantity expressed in `from` units to `to` units (same product). */
export function convertUnits(
  qty: number,
  from: Pick<ProductUnit, "factor_to_base" | "product_id">,
  to: Pick<ProductUnit, "factor_to_base" | "product_id">
): number {
  if (from.product_id !== to.product_id) {
    throw new Error("Cannot convert between units of different products");
  }
  if (to.factor_to_base <= 0) throw new Error("Invalid target unit factor");
  return qty * (from.factor_to_base / to.factor_to_base);
}

/** Quantity expressed in the product's base unit. */
export function toBase(qty: number, unit: Pick<ProductUnit, "factor_to_base">) {
  return qty * unit.factor_to_base;
}

/** Quantity in base units expressed in `unit`. */
export function fromBase(qtyBase: number, unit: Pick<ProductUnit, "factor_to_base">) {
  if (unit.factor_to_base <= 0) throw new Error("Invalid unit factor");
  return qtyBase / unit.factor_to_base;
}

function clean(input: ProductUnitInput) {
  return {
    unit_name: input.unit_name.trim(),
    factor_to_base: input.factor_to_base,
    is_base: input.is_base,
    barcode: input.barcode && input.barcode.length ? input.barcode.trim() : null,
    sort_order: input.sort_order ?? 0,
  };
}

export async function listProductUnits(productId: string): Promise<ProductUnit[]> {
  const db = await getDB();
  const units = await db.getAllFromIndex("product_units", "by-product", productId);
  return units.sort((a, b) => {
    if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
    return a.factor_to_base - b.factor_to_base;
  });
}

export async function createProductUnit(productId: string, input: ProductUnitInput): Promise<ProductUnit> {
  const db = await getDB();
  const cleaned = clean(input);

  // Check for duplicate unit name for this product
  const existing = await db.getAllFromIndex("product_units", "by-product", productId);
  const duplicate = existing.find((u) => u.unit_name.toLowerCase() === cleaned.unit_name.toLowerCase());
  if (duplicate) {
    throw new Error("A unit with this name already exists for this product.");
  }

  const unit: ProductUnit = {
    id: generateId(),
    product_id: productId,
    ...cleaned,
    created_at: now(),
    updated_at: now(),
  };

  await db.put("product_units", unit);
  return unit;
}

export async function updateProductUnit(id: string, input: ProductUnitInput): Promise<ProductUnit> {
  const db = await getDB();
  const existing = await db.get("product_units", id);
  if (!existing) throw new Error("Unit not found");

  const cleaned = clean(input);
  const updated: ProductUnit = {
    ...existing,
    ...cleaned,
    updated_at: now(),
  };

  await db.put("product_units", updated);
  return updated;
}

export async function deleteProductUnit(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("product_units", id);
}

/** Find a product unit by scanned barcode (any unit). */
export async function findUnitByBarcode(barcode: string): Promise<(ProductUnit & { product: unknown }) | null> {
  const db = await getDB();
  const units = await db.getAll("product_units");
  const unit = units.find((u) => u.barcode === barcode.trim());
  if (!unit) return null;

  const product = await db.get("products", unit.product_id);
  return { ...unit, product };
}
