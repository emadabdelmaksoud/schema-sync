import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const productUnitSchema = z
  .object({
    unit_name: z.string().trim().min(1, "Unit name is required").max(50),
    factor_to_base: z.coerce
      .number()
      .positive("Factor must be greater than 0")
      .finite(),
    is_base: z.boolean(),
    barcode: z.string().trim().max(64),
    sort_order: z.coerce.number().int().min(0),
  })
  .strict()
  .refine((v) => !v.is_base || v.factor_to_base === 1, {
    message: "Base unit must have factor = 1",
    path: ["factor_to_base"],
  });

export type ProductUnitInput = z.infer<typeof productUnitSchema>;

export interface ProductUnit {
  id: string;
  product_id: string;
  unit_name: string;
  factor_to_base: number;
  is_base: boolean;
  barcode: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Convert a quantity expressed in `from` units to `to` units (same product). */
export function convertUnits(
  qty: number,
  from: Pick<ProductUnit, "factor_to_base" | "product_id">,
  to: Pick<ProductUnit, "factor_to_base" | "product_id">,
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

export async function listProductUnits(productId: string) {
  const { data, error } = await supabase
    .from("product_units")
    .select("*")
    .eq("product_id", productId)
    .order("is_base", { ascending: false })
    .order("factor_to_base", { ascending: true });
  if (error) throw error;
  return data as ProductUnit[];
}

export async function createProductUnit(productId: string, input: ProductUnitInput) {
  const payload = { product_id: productId, ...clean(input) };
  const { data, error } = await supabase
    .from("product_units")
    .insert(payload)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("A unit with this name or barcode already exists for this product.");
    }
    throw error;
  }
  return data as ProductUnit;
}

export async function updateProductUnit(id: string, input: ProductUnitInput) {
  const { data, error } = await supabase
    .from("product_units")
    .update(clean(input))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductUnit;
}

export async function deleteProductUnit(id: string) {
  const { error } = await supabase.from("product_units").delete().eq("id", id);
  if (error) throw error;
}

/** Find a product unit by scanned barcode (any unit). */
export async function findUnitByBarcode(barcode: string) {
  const { data, error } = await supabase
    .from("product_units")
    .select("*, product:products(*)")
    .eq("barcode", barcode.trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}
