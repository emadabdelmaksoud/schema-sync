import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

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

export interface Warehouse {
  id: string;
  warehouse_code: string;
  warehouse_name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface WarehouseSection {
  id: string;
  warehouse_id: string;
  section_name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const blank = (v?: string) => (v && v.length ? v : null);

export async function listWarehouses(search?: string) {
  let q = supabase.from("warehouses").select("*").order("created_at", { ascending: false });
  if (search?.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`warehouse_name.ilike.${s},warehouse_code.ilike.${s},description.ilike.${s}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data as Warehouse[];
}

export async function getWarehouse(id: string) {
  const { data, error } = await supabase.from("warehouses").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Warehouse;
}

export async function createWarehouse(input: WarehouseInput, createdBy?: string) {
  const payload = {
    warehouse_name: input.warehouse_name,
    description: blank(input.description),
    is_active: input.is_active ?? true,
    created_by: createdBy ?? null,
    ...(input.warehouse_code ? { warehouse_code: input.warehouse_code } : {}),
  };
  const { data, error } = await supabase
    .from("warehouses" as never)
    .insert(payload as never)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A warehouse with this name or code already exists.");
    throw error;
  }
  return data as Warehouse;
}

export async function updateWarehouse(id: string, input: WarehouseInput) {
  const payload = {
    warehouse_name: input.warehouse_name,
    description: blank(input.description),
    is_active: input.is_active,
    ...(input.warehouse_code ? { warehouse_code: input.warehouse_code } : {}),
  };
  const { data, error } = await supabase
    .from("warehouses" as never)
    .update(payload as never)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A warehouse with this name or code already exists.");
    throw error;
  }
  return data as Warehouse;
}

export async function setWarehouseActive(id: string, is_active: boolean) {
  const { error } = await supabase
    .from("warehouses" as never)
    .update({ is_active } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteWarehouse(id: string) {
  const { error } = await supabase.from("warehouses" as never).delete().eq("id", id);
  if (error) throw error;
}

// ===== Sections =====

export async function listSections(warehouseId: string, search?: string) {
  let q = supabase
    .from("warehouse_sections")
    .select("*")
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false });
  if (search?.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`section_name.ilike.${s},description.ilike.${s}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data as WarehouseSection[];
}

export async function createSection(input: SectionInput, createdBy?: string) {
  const payload = {
    warehouse_id: input.warehouse_id,
    section_name: input.section_name,
    description: blank(input.description),
    is_active: input.is_active ?? true,
    created_by: createdBy ?? null,
  };
  const { data, error } = await supabase
    .from("warehouse_sections" as never)
    .insert(payload as never)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A section with this name already exists in this warehouse.");
    throw error;
  }
  return data as WarehouseSection;
}

export async function updateSection(id: string, input: SectionInput) {
  const payload = {
    section_name: input.section_name,
    description: blank(input.description),
    is_active: input.is_active,
  };
  const { data, error } = await supabase
    .from("warehouse_sections" as never)
    .update(payload as never)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A section with this name already exists in this warehouse.");
    throw error;
  }
  return data as WarehouseSection;
}

export async function setSectionActive(id: string, is_active: boolean) {
  const { error } = await supabase
    .from("warehouse_sections" as never)
    .update({ is_active } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSection(id: string) {
  const { error } = await supabase.from("warehouse_sections" as never).delete().eq("id", id);
  if (error) throw error;
}
