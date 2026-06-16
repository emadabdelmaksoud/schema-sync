import { z } from "zod";
import { getDB, generateId, generateCode, now, type Warehouse, type WarehouseSection } from "./local-db";

export const warehouseSchema = z
  .object({
    warehouse_code: z.string().trim().max(50).optional().or(z.literal("")),
    warehouse_name: z.string().trim().min(1, "Warehouse name is required").max(255),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    is_active: z.boolean().default(true),
  })
  .strict();
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const sectionSchema = z
  .object({
    warehouse_id: z.string().uuid(),
    section_name: z.string().trim().min(1, "Section name is required").max(255),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    is_active: z.boolean().default(true),
  })
  .strict();
export type SectionInput = z.infer<typeof sectionSchema>;

export type { Warehouse, WarehouseSection };

const blank = (v?: string) => (v && v.length ? v : null);

export async function listWarehouses(search?: string): Promise<Warehouse[]> {
  const db = await getDB();
  let warehouses = await db.getAll("warehouses");

  if (search?.trim()) {
    const s = search.toLowerCase();
    warehouses = warehouses.filter(
      (w) =>
        w.warehouse_name.toLowerCase().includes(s) ||
        (w.warehouse_code && w.warehouse_code.toLowerCase().includes(s)) ||
        (w.description && w.description.toLowerCase().includes(s))
    );
  }

  return warehouses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getWarehouse(id: string): Promise<Warehouse> {
  const db = await getDB();
  const warehouse = await db.get("warehouses", id);
  if (!warehouse) throw new Error("Warehouse not found");
  return warehouse;
}

export async function createWarehouse(input: WarehouseInput, createdBy?: string): Promise<Warehouse> {
  const db = await getDB();
  const existing = await db.getAll("warehouses");
  const duplicate = existing.find(
    (w) => w.warehouse_name.toLowerCase() === input.warehouse_name.toLowerCase()
  );
  if (duplicate) {
    throw new Error("A warehouse with this name already exists.");
  }

  const warehouse: Warehouse = {
    id: generateId(),
    warehouse_code: input.warehouse_code || generateCode("WH"),
    warehouse_name: input.warehouse_name,
    description: blank(input.description),
    is_active: input.is_active ?? true,
    created_by: createdBy ?? null,
    created_at: now(),
    updated_at: now(),
  };

  await db.put("warehouses", warehouse);
  return warehouse;
}

export async function updateWarehouse(id: string, input: WarehouseInput): Promise<Warehouse> {
  const db = await getDB();
  const existing = await db.get("warehouses", id);
  if (!existing) throw new Error("Warehouse not found");

  const updated: Warehouse = {
    ...existing,
    warehouse_name: input.warehouse_name,
    description: blank(input.description),
    is_active: input.is_active,
    updated_at: now(),
    ...(input.warehouse_code ? { warehouse_code: input.warehouse_code } : {}),
  };

  await db.put("warehouses", updated);
  return updated;
}

export async function setWarehouseActive(id: string, is_active: boolean): Promise<void> {
  const db = await getDB();
  const warehouse = await db.get("warehouses", id);
  if (!warehouse) return;
  warehouse.is_active = is_active;
  warehouse.updated_at = now();
  await db.put("warehouses", warehouse);
}

export async function deleteWarehouse(id: string): Promise<void> {
  const db = await getDB();

  // Check for related inventory
  const batches = await db.getAll("inventory_batches");
  const hasBatches = batches.some((b) => b.warehouse_id === id);
  if (hasBatches) {
    throw new Error(
      "This warehouse can't be deleted because it has inventory linked to it. Deactivate it instead."
    );
  }

  // Delete related sections
  const sections = await db.getAllFromIndex("warehouse_sections", "by-warehouse", id);
  for (const section of sections) {
    await db.delete("warehouse_sections", section.id);
  }

  await db.delete("warehouses", id);
}

// ===== Sections =====

export async function listSections(warehouseId: string, search?: string): Promise<WarehouseSection[]> {
  const db = await getDB();
  let sections = await db.getAllFromIndex("warehouse_sections", "by-warehouse", warehouseId);

  if (search?.trim()) {
    const s = search.toLowerCase();
    sections = sections.filter(
      (sec) =>
        sec.section_name.toLowerCase().includes(s) ||
        (sec.description && sec.description.toLowerCase().includes(s))
    );
  }

  return sections.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createSection(input: SectionInput, createdBy?: string): Promise<WarehouseSection> {
  const db = await getDB();
  const existing = await db.getAllFromIndex("warehouse_sections", "by-warehouse", input.warehouse_id);
  const duplicate = existing.find(
    (s) => s.section_name.toLowerCase() === input.section_name.toLowerCase()
  );
  if (duplicate) {
    throw new Error("A section with this name already exists in this warehouse.");
  }

  const section: WarehouseSection = {
    id: generateId(),
    warehouse_id: input.warehouse_id,
    section_name: input.section_name,
    description: blank(input.description),
    is_active: input.is_active ?? true,
    created_by: createdBy ?? null,
    created_at: now(),
    updated_at: now(),
  };

  await db.put("warehouse_sections", section);
  return section;
}

export async function updateSection(id: string, input: SectionInput): Promise<WarehouseSection> {
  const db = await getDB();
  const existing = await db.get("warehouse_sections", id);
  if (!existing) throw new Error("Section not found");

  const updated: WarehouseSection = {
    ...existing,
    section_name: input.section_name,
    description: blank(input.description),
    is_active: input.is_active,
    updated_at: now(),
  };

  await db.put("warehouse_sections", updated);
  return updated;
}

export async function setSectionActive(id: string, is_active: boolean): Promise<void> {
  const db = await getDB();
  const section = await db.get("warehouse_sections", id);
  if (!section) return;
  section.is_active = is_active;
  section.updated_at = now();
  await db.put("warehouse_sections", section);
}

export async function deleteSection(id: string): Promise<void> {
  const db = await getDB();

  // Check for related inventory
  const batches = await db.getAll("inventory_batches");
  const hasBatches = batches.some((b) => b.section_id === id);
  if (hasBatches) {
    throw new Error("This section can't be deleted because it has inventory linked to it.");
  }

  await db.delete("warehouse_sections", id);
}
