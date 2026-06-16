import { getDB, generateId, now, type AuditLog, type User } from "./local-db";

export type AuditActionType =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "stock_in"
  | "dispensing"
  | "transfer_in"
  | "transfer_out"
  | "disposal"
  | "adjustment"
  | "inventory_count"
  | "import"
  | "export"
  | "barcode_scan"
  | "barcode_print"
  | "role_change";

export type AuditEntityType =
  | "product"
  | "inventory_batch"
  | "inventory_transaction"
  | "warehouse"
  | "warehouse_section"
  | "user"
  | "user_role"
  | "barcode"
  | "import_export"
  | "auth";

export interface AuditLogInput {
  action_type: AuditActionType | string;
  entity_type: AuditEntityType | string;
  entity_id?: string | null;
  old_values?: unknown;
  new_values?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  old_values: unknown;
  new_values: unknown;
  ip_address: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
}

function getCurrentUser(): User | null {
  try {
    const stored = localStorage.getItem("local-auth-user");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    const db = await getDB();
    const user = getCurrentUser();

    const entry: AuditLog = {
      id: generateId(),
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      action_type: input.action_type,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      old_values: (input.old_values as Record<string, unknown>) ?? null,
      new_values: (input.new_values as Record<string, unknown>) ?? null,
      ip_address: null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      metadata: (input.metadata as Record<string, unknown>) ?? null,
      created_at: now(),
    };

    await db.put("audit_logs", entry);
  } catch (err) {
    console.warn("[audit] failed to write log", err);
  }
}

export interface AuditQuery {
  userId?: string;
  actionType?: string;
  entityType?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listAuditLogs(q: AuditQuery = {}): Promise<AuditLogRow[]> {
  const db = await getDB();
  let logs = await db.getAll("audit_logs");

  if (q.userId) logs = logs.filter((l) => l.user_id === q.userId);
  if (q.actionType) logs = logs.filter((l) => l.action_type === q.actionType);
  if (q.entityType) logs = logs.filter((l) => l.entity_type === q.entityType);
  if (q.from) logs = logs.filter((l) => l.created_at >= q.from!);
  if (q.to) logs = logs.filter((l) => l.created_at <= q.to!);
  if (q.search) {
    const s = q.search.toLowerCase();
    logs = logs.filter(
      (l) =>
        (l.user_email && l.user_email.toLowerCase().includes(s)) ||
        (l.entity_id && l.entity_id.toLowerCase().includes(s)) ||
        l.action_type.toLowerCase().includes(s) ||
        l.entity_type.toLowerCase().includes(s)
    );
  }

  return logs
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, q.limit ?? 500);
}
