import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
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
    products: any[];
    product_units: any[];
    warehouses: any[];
    warehouse_sections: any[];
    inventory_batches: any[];
    inventory_transactions: any[];
    audit_logs: any[];
  };
}

const HISTORY_KEY = "clinic_inventory_backup_history_v1";
const BLOB_PREFIX = "clinic_inventory_backup_blob_";

/** Read all tables. Bypasses 1000-row default via paging. */
async function fetchAll(table: string): Promise<any[]> {
  const PAGE = 1000;
  let from = 0;
  const out: any[] = [];
  for (;;) {
    const { data, error } = await supabase.from(table as any).select("*").range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function buildSnapshot(): Promise<BackupSnapshot> {
  const [products, product_units, warehouses, warehouse_sections, inventory_batches, inventory_transactions, audit_logs] =
    await Promise.all([
      fetchAll("products"),
      fetchAll("product_units"),
      fetchAll("warehouses"),
      fetchAll("warehouse_sections"),
      fetchAll("inventory_batches"),
      fetchAll("inventory_transactions"),
      fetchAll("audit_logs"),
    ]);
  const { data: u } = await supabase.auth.getUser();
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: u?.user?.email ?? null,
    tables: {
      products, product_units, warehouses, warehouse_sections,
      inventory_batches, inventory_transactions, audit_logs,
    },
  };
}

export function snapshotCounts(s: BackupSnapshot): Record<string, number> {
  const c: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.tables)) c[k] = (v as any[]).length;
  return c;
}

function listHistory(): BackupMetadata[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as BackupMetadata[]) : [];
  } catch { return []; }
}

function writeHistory(items: BackupMetadata[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export function getBackupHistory(): BackupMetadata[] {
  return listHistory().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function deleteBackupRecord(id: string) {
  writeHistory(listHistory().filter((b) => b.id !== id));
  try { localStorage.removeItem(BLOB_PREFIX + id); } catch { /* ignore */ }
}

export function getStoredBlob(id: string): string | null {
  try { return localStorage.getItem(BLOB_PREFIX + id); } catch { return null; }
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

/** Create a JSON backup, download it, and store metadata + a copy in localStorage (best-effort). */
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
  // Try to keep a copy for re-download; ignore quota errors silently.
  try { localStorage.setItem(BLOB_PREFIX + id, json); } catch { /* ignore */ }

  await logAudit({
    action_type: "export",
    entity_type: "backup",
    entity_id: id,
    metadata: { kind: "json", counts: meta.counts, notes },
  });
  return meta;
}

/** Create an Excel backup with one sheet per table. */
export async function createExcelBackup(notes?: string): Promise<BackupMetadata> {
  const snap = await buildSnapshot();
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(snap.tables)) {
    const ws = XLSX.utils.json_to_sheet((rows as any[]).length ? (rows as any[]) : [{}]);
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
  if (!blob) throw new Error("Backup file is no longer cached. Use a freshly downloaded file to restore.");
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

export function validateSnapshot(snap: any): RestoreValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  if (!snap || typeof snap !== "object") {
    return { ok: false, errors: ["Invalid backup file."], warnings, counts };
  }
  if (snap.schema_version !== 1) errors.push(`Unsupported schema_version: ${snap.schema_version}`);
  if (!snap.tables || typeof snap.tables !== "object") errors.push("Missing tables block.");
  const required = [
    "products", "product_units", "warehouses", "warehouse_sections",
    "inventory_batches", "inventory_transactions",
  ];
  for (const t of required) {
    const rows = snap?.tables?.[t];
    if (!Array.isArray(rows)) { errors.push(`Missing or invalid table: ${t}`); continue; }
    counts[t] = rows.length;
  }
  if (Array.isArray(snap?.tables?.audit_logs)) counts["audit_logs"] = snap.tables.audit_logs.length;
  if (counts.inventory_transactions > 50000) warnings.push("Very large transaction set — restore may be slow.");
  return { ok: errors.length === 0, errors, warnings, counts, snapshot: errors.length === 0 ? snap : undefined };
}

export interface RestoreOptions {
  /** Tables to restore. Defaults to all available. */
  tables?: Array<keyof BackupSnapshot["tables"]>;
  /** Wipe existing rows in the target tables before insert. ADMIN ONLY. */
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

async function deleteAll(table: string) {
  const { error } = await supabase.from(table as any).delete().not("id", "is", null);
  if (error) throw new Error(`Wipe ${table}: ${error.message}`);
}

async function bulkInsert(table: string, rows: any[]) {
  if (!rows.length) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table as any).insert(slice as any);
    if (error) throw new Error(`Insert ${table} (chunk ${i / CHUNK + 1}): ${error.message}`);
  }
}

export async function restoreSnapshot(snap: BackupSnapshot, opts: RestoreOptions = {}): Promise<void> {
  const targets = opts.tables ?? RESTORE_ORDER;
  const ordered = RESTORE_ORDER.filter((t) => targets.includes(t));
  const total = ordered.length * 2;
  let step = 0;
  const tick = (msg: string) => opts.onProgress?.(msg, Math.round((++step / total) * 100));

  if (opts.wipe) {
    for (const t of [...ordered].reverse()) {
      tick(`Wiping ${t}…`);
      await deleteAll(t);
    }
  } else {
    step += ordered.length;
  }
  for (const t of ordered) {
    tick(`Restoring ${t}…`);
    await bulkInsert(t, (snap.tables as any)[t] ?? []);
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
