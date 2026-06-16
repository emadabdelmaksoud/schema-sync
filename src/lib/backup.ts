import * as XLSX from "xlsx";
import { getDB, type AuditLog, type Product, type ProductUnit, type Warehouse, type WarehouseSection, type InventoryBatch, type InventoryTransaction } from "./local-db";
import { logAudit } from "./audit";

export type BackupKind = "json" | "excel";

export interface BackupMetadata {
  id: string;
  name: string;
  kind: BackupKind;
  created_at: string;
  created_by_email: string | null;
  size_bytes: number;
  counts: Record<string, number>;
  notes?: string;
}

export interface BackupSnapshot {
  schema_version: 1;
  generated_at: string;
  generated_by: string | null;
  tables: {
    products: Product[];
    product_units: ProductUnit[];
    warehouses: Warehouse[];
    warehouse_sections: WarehouseSection[];
    inventory_batches: InventoryBatch[];
    inventory_transactions: InventoryTransaction[];
    audit_logs: AuditLog[];
  };
}

const HISTORY_KEY = "clinic_inventory_backup_history_v1";
const BLOB_PREFIX = "clinic_inventory_backup_blob_";

export async function buildSnapshot(): Promise<BackupSnapshot> {
  const db = await getDB();
  const [products, product_units, warehouses, warehouse_sections, inventory_batches, inventory_transactions, audit_logs] =
    await Promise.all([
      db.getAll("products"),
      db.getAll("product_units"),
      db.getAll("warehouses"),
      db.getAll("warehouse_sections"),
      db.getAll("inventory_batches"),
      db.getAll("inventory_transactions"),
      db.getAll("audit_logs"),
    ]);

  const stored = localStorage.getItem("local-auth-user");
  const user = stored ? JSON.parse(stored) : null;

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: user?.email ?? null,
    tables: {
      products,
      product_units,
      warehouses,
      warehouse_sections,
      inventory_batches,
      inventory_transactions,
      audit_logs,
    },
  };
}

export function snapshotCounts(s: BackupSnapshot): Record<string, number> {
  const c: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.tables)) c[k] = v.length;
  return c;
}

function listHistory(): BackupMetadata[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHistory(items: BackupMetadata[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export function getBackupHistory(): BackupMetadata[] {
  return listHistory().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function deleteBackupRecord(id: string) {
  writeHistory(listHistory().filter((b) => b.id !== id));
  try {
    localStorage.removeItem(BLOB_PREFIX + id);
  } catch {}
}

export function getStoredBlob(id: string): string | null {
  try {
    return localStorage.getItem(BLOB_PREFIX + id);
  } catch {
    return null;
  }
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function createJsonBackup(notes?: string): Promise<BackupMetadata> {
  const snap = await buildSnapshot();
  const json = JSON.stringify(snap, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const id = crypto.randomUUID();
  const filename = `clinic-backup-${ts()}.json`;
  triggerDownload(filename, blob);

  const meta: BackupMetadata = {
    id,
    name: filename,
    kind: "json",
    created_at: snap.generated_at,
    created_by_email: snap.generated_by,
    size_bytes: blob.size,
    counts: snapshotCounts(snap),
    notes,
  };
  const history = listHistory();
  history.push(meta);
  writeHistory(history);
  try {
    localStorage.setItem(BLOB_PREFIX + id, json);
  } catch {}

  await logAudit({
    action_type: "export",
    entity_type: "backup",
    entity_id: id,
    metadata: { kind: "json", counts: meta.counts, notes },
  });
  return meta;
}

export async function createExcelBackup(notes?: string): Promise<BackupMetadata> {
  const snap = await buildSnapshot();
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(snap.tables)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const id = crypto.randomUUID();
  const filename = `clinic-backup-${ts()}.xlsx`;
  triggerDownload(filename, blob);

  const meta: BackupMetadata = {
    id,
    name: filename,
    kind: "excel",
    created_at: snap.generated_at,
    created_by_email: snap.generated_by,
    size_bytes: blob.size,
    counts: snapshotCounts(snap),
    notes,
  };
  const history = listHistory();
  history.push(meta);
  writeHistory(history);

  await logAudit({
    action_type: "export",
    entity_type: "backup",
    entity_id: id,
    metadata: { kind: "excel", counts: meta.counts, notes },
  });
  return meta;
}

export function reDownloadJson(meta: BackupMetadata) {
  const blob = getStoredBlob(meta.id);
  if (!blob) throw new Error("Backup file is no longer cached.");
  triggerDownload(meta.name, new Blob([blob], { type: "application/json" }));
}

// -------------------- Restore --------------------

export interface RestoreValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: Record<string, number>;
  snapshot?: BackupSnapshot;
}

export async function parseBackupFile(file: File): Promise<BackupSnapshot> {
  const text = await file.text();
  const obj = JSON.parse(text);
  return obj as BackupSnapshot;
}

export function validateSnapshot(snap: unknown): RestoreValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};

  if (!snap || typeof snap !== "object") {
    return { ok: false, errors: ["Invalid backup file."], warnings, counts };
  }
  const s = snap as Record<string, unknown>;
  if (s.schema_version !== 1) errors.push(`Unsupported schema_version: ${s.schema_version}`);
  if (!s.tables || typeof s.tables !== "object") errors.push("Missing tables block.");

  const required = ["products", "product_units", "warehouses", "warehouse_sections", "inventory_batches", "inventory_transactions"];
  for (const t of required) {
    const rows = (s.tables as Record<string, unknown>)?.[t];
    if (!Array.isArray(rows)) {
      errors.push(`Missing or invalid table: ${t}`);
      continue;
    }
    counts[t] = rows.length;
  }
  if (Array.isArray((s.tables as Record<string, unknown>)?.audit_logs)) counts.audit_logs = (s.tables as Record<string, unknown>).audit_logs.length;
  if (counts.inventory_transactions > 50000) warnings.push("Very large transaction set — restore may be slow.");

  return { ok: errors.length === 0, errors, warnings, counts, snapshot: errors.length === 0 ? (snap as BackupSnapshot) : undefined };
}

export interface RestoreOptions {
  tables?: Array<keyof BackupSnapshot["tables"]>;
  wipe?: boolean;
  onProgress?: (msg: string, pct: number) => void;
}

const RESTORE_ORDER: Array<keyof BackupSnapshot["tables"]> = [
  "warehouses",
  "warehouse_sections",
  "products",
  "product_units",
  "inventory_batches",
  "inventory_transactions",
  "audit_logs",
];

export async function restoreSnapshot(snap: BackupSnapshot, opts: RestoreOptions = {}): Promise<void> {
  const db = await getDB();
  const targets = opts.tables ?? RESTORE_ORDER;
  const ordered = RESTORE_ORDER.filter((t) => targets.includes(t));
  const total = ordered.length * 2;
  let step = 0;
  const tick = (msg: string) => opts.onProgress?.(msg, Math.round((++step / total) * 100));

  if (opts.wipe) {
    for (const t of [...ordered].reverse()) {
      tick(`Clearing ${t}...`);
      const all = await db.getAll(t as "products" | "product_units" | "warehouses" | "warehouse_sections" | "inventory_batches" | "inventory_transactions" | "audit_logs");
      for (const row of all) {
        await db.delete(t as "products" | "product_units" | "warehouses" | "warehouse_sections" | "inventory_batches" | "inventory_transactions" | "audit_logs", row.id);
      }
    }
  } else {
    step += ordered.length;
  }

  for (const t of ordered) {
    tick(`Restoring ${t}...`);
    const rows = snap.tables[t] ?? [];
    const storeName = t as "products" | "product_units" | "warehouses" | "warehouse_sections" | "inventory_batches" | "inventory_transactions" | "audit_logs";
    for (const row of rows) {
      await db.put(storeName, row as never);
    }
  }
  opts.onProgress?.("Done", 100);

  await logAudit({
    action_type: "import",
    entity_type: "backup",
    metadata: {
      restored_from: snap.generated_at,
      tables: ordered,
      wipe: !!opts.wipe,
    },
  });
}
