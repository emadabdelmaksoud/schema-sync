import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "./audit";

export type SettingsCategory =
  | "clinic"
  | "inventory"
  | "barcode"
  | "application"
  | "backup";

export interface ClinicSettings {
  name: string;
  logo_url: string | null;
  address: string;
  phone: string;
  email: string;
}

export interface InventorySettings {
  low_stock_threshold: number;
  near_expiry_days: number;
  default_warehouse_id: string | null;
  fifo_enabled: boolean;
  fifo_strict_expiry: boolean;
}

export interface BarcodeSettings {
  format: "CODE128" | "EAN13" | "CODE39" | "UPC" | "QR";
  label_template: "small" | "medium" | "large";
  labels_per_row: number;
  include_price: boolean;
  include_barcode_text: boolean;
}

export interface ApplicationSettings {
  language: "en" | "ar";
  theme: "light" | "dark" | "system";
  date_format: "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
  time_zone: string;
}

export interface BackupSettings {
  retention_days: number;
  auto_backup_enabled: boolean;
  include_audit_logs: boolean;
  format: "json" | "excel";
}

export interface AllSettings {
  clinic: ClinicSettings;
  inventory: InventorySettings;
  barcode: BarcodeSettings;
  application: ApplicationSettings;
  backup: BackupSettings;
}

export const DEFAULT_SETTINGS: AllSettings = {
  clinic: { name: "", logo_url: null, address: "", phone: "", email: "" },
  inventory: {
    low_stock_threshold: 10,
    near_expiry_days: 30,
    default_warehouse_id: null,
    fifo_enabled: true,
    fifo_strict_expiry: true,
  },
  barcode: {
    format: "CODE128",
    label_template: "medium",
    labels_per_row: 3,
    include_price: false,
    include_barcode_text: true,
  },
  application: {
    language: "en",
    theme: "system",
    date_format: "YYYY-MM-DD",
    time_zone: "UTC",
  },
  backup: {
    retention_days: 30,
    auto_backup_enabled: false,
    include_audit_logs: true,
    format: "json",
  },
};

interface SettingsRow {
  category: string;
  key: string;
  value: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export async function loadAllSettings(): Promise<AllSettings> {
  const { data, error } = await sb
    .from("system_settings")
    .select("category,key,value");
  if (error) throw error;
  const result: AllSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const row of ((data ?? []) as SettingsRow[])) {
    const cat = row.category as SettingsCategory;
    if (cat in result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result[cat] as any)[row.key] = row.value;
    }
  }
  return result;
}

export async function saveSettingsCategory<C extends SettingsCategory>(
  category: C,
  values: AllSettings[C],
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id ?? null;

  const rows = Object.entries(values).map(([key, value]) => ({
    category,
    key,
    value: value as never,
    updated_by: userId,
  }));

  const { error } = await sb
    .from("system_settings")
    .upsert(rows, { onConflict: "category,key" });
  if (error) throw error;

  await logAudit({
    action_type: "update",
    entity_type: "settings",
    entity_id: category,
    new_values: values,
  });
}

export async function uploadClinicLogo(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `clinic/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("clinic-assets")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("clinic-assets").getPublicUrl(path);
  return data.publicUrl;
}
