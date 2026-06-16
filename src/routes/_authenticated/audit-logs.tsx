import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { ScrollText, Search } from "lucide-react";
import { listAuditLogs } from "@/lib/audit";
import { getDB } from "@/lib/local-db";
import { RoleGuard } from "@/components/auth/role-guard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/audit-logs")({
  component: () => (
    <RoleGuard adminOnly>
      <AuditLogsPage />
    </RoleGuard>
  ),
  head: () => ({ meta: [{ title: "Audit Logs — Clinic Inventory Hub" }] }),
});

const ACTION_OPTIONS = [
  "create", "update", "delete", "login", "logout",
  "stock_in", "dispensing", "transfer_in", "transfer_out", "disposal",
  "adjustment", "inventory_count", "import", "export",
  "barcode_scan", "barcode_print", "role_change",
];

const ENTITY_OPTIONS = [
  "product", "inventory_batch", "inventory_transaction",
  "warehouse", "warehouse_section", "user", "user_role",
  "barcode", "import_export", "auth",
];

function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data: users } = useQuery({
    queryKey: ["audit", "users"],
    queryFn: async () => {
      const db = await getDB();
      const users = await db.getAll("users");
      return users.map((u) => ({ id: u.id, email: u.email, full_name: u.full_name }));
    },
  });

  const { data: logs, isFetching, refetch } = useQuery({
    queryKey: ["audit-logs", { search, actionType, entityType, userId, from, to }],
    queryFn: () => listAuditLogs({
      search: search || undefined,
      actionType: actionType !== "all" ? actionType : undefined,
      entityType: entityType !== "all" ? entityType : undefined,
      userId: userId !== "all" ? userId : undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      limit: 1000,
    }),
  });

  const counts = useMemo(() => {
    const total = logs?.length ?? 0;
    const byAction: Record<string, number> = {};
    logs?.forEach((l) => { byAction[l.action_type] = (byAction[l.action_type] ?? 0) + 1; });
    return { total, byAction };
  }, [logs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <Badge variant="secondary" className="ml-2">{counts.total} entries</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-6">
        <div className="md:col-span-2 relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search email, action, entity…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTION_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {ENTITY_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger><SelectValue placeholder="User" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users?.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.email ?? u.full_name ?? u.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 md:col-span-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-2 md:col-span-4">
          <Button variant="outline" onClick={() => {
            setSearch(""); setActionType("all"); setEntityType("all");
            setUserId("all"); setFrom(""); setTo("");
          }}>Reset</Button>
          <Button onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No audit entries match these filters.
                </TableCell>
              </TableRow>
            )}
            {logs?.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss")}
                </TableCell>
                <TableCell className="text-xs">{l.user_email ?? l.user_id ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{l.action_type}</Badge></TableCell>
                <TableCell className="text-xs">{l.entity_type}</TableCell>
                <TableCell className="text-xs font-mono">{l.entity_id ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-xl">
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">view</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px]">
{JSON.stringify({ old: l.old_values, new: l.new_values, meta: l.metadata }, null, 2)}
                    </pre>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
