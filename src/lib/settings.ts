import { getDB, generateId, now, type SystemSetting } from "./local-db";
import { logAudit } from "./audit";

export type SettingsCategory = "clinic" | "inventory" | "barcode" | "application" | "backup";

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

export async function loadAllSettings(): Promise<AllSettings> {
  const db = await getDB();
  const settings = await db.getAll("system_settings");
  const result: AllSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  for (const row of settings) {
    const cat = row.category as SettingsCategory;
    if (cat in result) {
      (result[cat] as Record<string, unknown>)[row.key] = row.value;
    }
  }

  return result;
}

export async function saveSettingsCategory<C extends SettingsCategory>(
  category: C,
  values: AllSettings[C]
): Promise<void> {
  const db = await getDB();
  const stored = localStorage.getItem("local-auth-user");
  const user = stored ? JSON.parse(stored) : null;
  const userId = user?.id ?? null;

  const existing = (await db.getAll("system_settings")).filter((s) => s.category === category);
  const existingKeys = new Set(existing.map((s) => s.key));

  for (const [key, value] of Object.entries(values)) {
    const id = existing.find((s) => s.key === key)?.id ?? generateId();
    const setting: SystemSetting = {
      id,
      category,
      key,
      value: value as Record<string, unknown>,
      updated_by: userId,
      created_at: existingKeys.has(key) ? (existing.find((s) => s.key === key)?.created_at ?? now()) : now(),
      updated_at: now(),
    };
    await db.put("system_settings", setting);
  }

  await logAudit({
    action_type: "update",
    entity_type: "settings",
    entity_id: category,
    new_values: values,
  });
}

export async function uploadClinicLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
