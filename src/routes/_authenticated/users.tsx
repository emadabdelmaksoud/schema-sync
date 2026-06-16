import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users, Shield } from "lucide-react";
import { toast } from "sonner";
import { getDB } from "@/lib/local-db";
import { RoleGuard } from "@/components/auth/role-guard";
import { logAudit } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppRole } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/users")({
  component: () => (
    <RoleGuard adminOnly>
      <UsersPage />
    </RoleGuard>
  ),
  head: () => ({ meta: [{ title: "Users — Clinic Inventory Hub" }] }),
});

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const db = await getDB();
      const users = await db.getAll("users");
      return users.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role as AppRole,
        created_at: u.created_at,
      }));
    },
  });

  const updateRole = async (userId: string, role: AppRole) => {
    const db = await getDB();
    const user = await db.get("users", userId);
    if (!user) throw new Error("User not found");
    user.role = role;
    await db.put("users", user);
    await logAudit({
      action_type: "role_change",
      entity_type: "user_role",
      entity_id: userId,
      new_values: { role },
    });
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["users"] });
  };

  const filtered = (users ?? []).filter((u) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return u.email.toLowerCase().includes(s) || (u.full_name ?? "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">User Management</h1>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Current role</TableHead>
              <TableHead>Change role</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-6">Loading...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No users found.</TableCell></TableRow>
            )}
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                    <Shield className="mr-1 h-3 w-3" /> {u.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Select value={u.role} onValueChange={(v) => updateRole(u.id, v as AppRole)}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Assign role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="nurse">Nursing Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Role changes are recorded in the audit log. Admin role grants full access; Nursing Staff is limited to day-to-day inventory operations.
      </p>
    </div>
  );
}
