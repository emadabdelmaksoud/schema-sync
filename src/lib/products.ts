import { z } from "zod";
import { getDB, generateId, generateCode, now, type Product, type ProductUnit } from "./local-db";

export const productSchema = z
  .object({
    product_code: z.string().trim().max(50).optional().or(z.literal("")),
    product_name: z.string().trim().min(1, "Product name is required").max(255),
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
export type { Product };

function blankToNull(v: string | undefined): string | null {
  return v && v.length ? v : null;
}

function clean(input: ProductInput) {
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

export async function listProducts(search?: string): Promise<Product[]> {
  const db = await getDB();
  let products = await db.getAll("products");

  if (search && search.trim()) {
    const s = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.product_name.toLowerCase().includes(s) ||
        (p.product_code && p.product_code.toLowerCase().includes(s)) ||
        (p.barcode && p.barcode.toLowerCase().includes(s)) ||
        (p.manufacturer && p.manufacturer.toLowerCase().includes(s)) ||
        (p.category && p.category.toLowerCase().includes(s))
    );
  }

  return products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function searchProductsAutocomplete(term: string, limit = 8): Promise<Pick<Product, "id" | "product_code" | "product_name" | "manufacturer">[]> {
  if (!term.trim()) return [];
  const db = await getDB();
  const products = await db.getAll("products");
  const s = term.toLowerCase();
  const filtered = products.filter(
    (p) =>
      p.product_name.toLowerCase().includes(s) ||
      (p.product_code && p.product_code.toLowerCase().includes(s)) ||
      (p.barcode && p.barcode.toLowerCase().includes(s))
  );
  return filtered.slice(0, limit);
}

export async function getProduct(id: string): Promise<Product> {
  const db = await getDB();
  const product = await db.get("products", id);
  if (!product) throw new Error("Product not found");
  return product;
}

export async function createProduct(input: ProductInput, createdBy?: string): Promise<Product> {
  const db = await getDB();
  const cleaned = clean(input);

  // Check for duplicates
  const existing = await db.getAll("products");
  const duplicate = existing.find(
    (p) =>
      p.product_name.toLowerCase() === cleaned.product_name.toLowerCase() &&
      p.manufacturer?.toLowerCase() === cleaned.manufacturer?.toLowerCase()
  );
  if (duplicate) {
    throw new Error("A product with this name + manufacturer already exists.");
  }

  const product: Product = {
    id: generateId(),
    product_code: cleaned.product_code || generateCode("PRD"),
    product_name: cleaned.product_name,
    barcode: cleaned.barcode,
    category: cleaned.category,
    manufacturer: cleaned.manufacturer,
    base_unit: cleaned.base_unit,
    reorder_level: cleaned.reorder_level,
    notes: cleaned.notes,
    image_url: cleaned.image_url,
    created_by: createdBy ?? null,
    created_at: now(),
    updated_at: now(),
  };

  await db.put("products", product);

  // Create base product unit
  const baseUnit: ProductUnit = {
    id: generateId(),
    product_id: product.id,
    unit_name: product.base_unit,
    factor_to_base: 1,
    is_base: true,
    barcode: null,
    sort_order: 0,
    created_at: now(),
    updated_at: now(),
  };
  await db.put("product_units", baseUnit);

  return product;
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const db = await getDB();
  const existing = await db.get("products", id);
  if (!existing) throw new Error("Product not found");

  const cleaned = clean(input);
  const updated: Product = {
    ...existing,
    product_name: cleaned.product_name,
    barcode: cleaned.barcode,
    category: cleaned.category,
    manufacturer: cleaned.manufacturer,
    base_unit: cleaned.base_unit,
    reorder_level: cleaned.reorder_level,
    notes: cleaned.notes,
    image_url: cleaned.image_url,
    updated_at: now(),
  };

  if (cleaned.product_code) {
    updated.product_code = cleaned.product_code;
  }

  await db.put("products", updated);
  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  const db = await getDB();

  // Check for related inventory
  const batches = await db.getAll("inventory_batches");
  const hasBatches = batches.some((b) => b.product_id === id);
  if (hasBatches) {
    throw new Error("This product can't be deleted because it has inventory linked to it. Remove its stock first.");
  }

  // Delete related product units
  const units = await db.getAllFromIndex("product_units", "by-product", id);
  for (const unit of units) {
    await db.delete("product_units", unit.id);
  }

  await db.delete("products", id);
}

export async function uploadProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
