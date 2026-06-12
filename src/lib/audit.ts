import { supabase } from "@/integrations/supabase/client";

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

/**
 * Persist an audit log entry. Safe to call from anywhere on the client.
 * Errors are swallowed (logging shouldn't break the action that triggered it).
 */
export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    // Insert via SECURITY DEFINER RPC so users cannot forge user_id/user_email.
    await supabase.rpc("log_audit", {
      _action_type: input.action_type,
      _entity_type: input.entity_type,
      _entity_id: input.entity_id ?? null,
      _old_values: (input.old_values as never) ?? null,
      _new_values: (input.new_values as never) ?? null,
      _metadata: (input.metadata as never) ?? null,
      _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[audit] failed to write log", err);
  }
}

export interface AuditQuery {
  userId?: string;
  actionType?: string;
  entityType?: string;
  search?: string;
  from?: string; // ISO date
  to?: string;   // ISO date
  limit?: number;
}

export async function listAuditLogs(q: AuditQuery = {}): Promise<AuditLogRow[]> {
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(q.limit ?? 500);

  if (q.userId) query = query.eq("user_id", q.userId);
  if (q.actionType) query = query.eq("action_type", q.actionType);
  if (q.entityType) query = query.eq("entity_type", q.entityType);
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);
  if (q.search) {
    const s = q.search.trim();
    if (s) query = query.or(`user_email.ilike.%${s}%,entity_id.ilike.%${s}%,action_type.ilike.%${s}%,entity_type.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}
