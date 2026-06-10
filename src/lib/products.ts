import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

// MASTER catalog fields ONLY.
// Expiry dates, batch numbers, and quantities live in `inventory_batches`,
// NOT here. `.strict()` rejects any such field at the validation boundary.
export const productSchema = z
  .object({
    product_code: z.string().trim().max(50).optional().or(z.literal("")),
    product_name: z
      .string()
      .trim()
      .min(1, "Product name is required")
      .max(255),
    barcode: z.string().trim().max(64).optional().or(z.literal("")),
    category: z.string().trim().max(100).optional().or(z.literal("")),
    manufacturer: z.string().trim().max(255).optional().or(z.literal("")),
    base_unit: z.string().trim().min(1).max(50),
    reorder_level: z.coerce.number().int().min(0),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    image_url: z.string().url().optional().or(z.literal("")),
  })
  .strict();

export type ProductInput = z.infer<typeof productSchema>;

export interface Product {
  id: string;
  product_code: string;
  product_name: string;
  barcode: string | null;
  category: string | null;
  manufacturer: string | null;
  base_unit: string;
  reorder_level: number;
  notes: string | null;
  image_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function clean(input: ProductInput) {
  const blankToNull = (v: string | undefined) => (v && v.length ? v : null);
  return {
    product_code: blankToNull(input.product_code),
    product_name: input.product_name,
    barcode: blankToNull(input.barcode),
    category: blankToNull(input.category),
    manufacturer: blankToNull(input.manufacturer),
    base_unit: input.base_unit || "unit",
    reorder_level: input.reorder_level ?? 0,
    notes: blankToNull(input.notes),
    image_url: blankToNull(input.image_url),
  };
}

export async function listProducts(search?: string) {
  let q = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(
      `product_name.ilike.${s},product_code.ilike.${s},barcode.ilike.${s},manufacturer.ilike.${s},category.ilike.${s}`,
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  return data as Product[];
}

export async function searchProductsAutocomplete(term: string, limit = 8) {
  if (!term.trim()) return [];
  const s = `%${term.trim()}%`;
  const { data, error } = await supabase
    .from("products")
    .select("id, product_code, product_name, manufacturer")
    .or(`product_name.ilike.${s},product_code.ilike.${s},barcode.ilike.${s}`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getProduct(id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Product;
}

export async function createProduct(input: ProductInput, createdBy?: string) {
  const base = clean(input);
  const { product_code, ...rest } = base;
  // Omit product_code entirely when blank so the DB trigger auto-generates it.
  const payload = {
    ...rest,
    ...(product_code ? { product_code } : {}),
    created_by: createdBy ?? null,
  };
  const { data, error } = await supabase
    .from("products")
    .insert(payload as never)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "A product with this name + manufacturer (or code/barcode) already exists.",
      );
    }
    throw error;
  }
  return data as Product;
}

export async function updateProduct(id: string, input: ProductInput) {
  const base = clean(input);
  const { product_code, ...rest } = base;
  const payload = { ...rest, ...(product_code ? { product_code } : {}) };
  const { data, error } = await supabase
    .from("products")
    .update(payload as never)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadProductImage(file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}
