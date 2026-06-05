import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const { role } = useAuth();
  const qc = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at")).data ?? [],
    enabled: role === "admin",
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("*")).data ?? [],
    enabled: role === "admin",
  });
  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => (await supabase.from("stores").select("id, name").order("name")).data ?? [],
    enabled: role === "admin",
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["store_staff"],
    queryFn: async () => (await supabase.from("store_staff").select("*")).data ?? [],
    enabled: role === "admin",
  });

  if (role !== "admin") return <div className="text-muted-foreground">Admin only.</div>;

  function roleOf(uid: string) {
    return roles.find((r) => r.user_id === uid)?.role ?? "staff";
  }

  async function setRole(uid: string, newRole: "admin" | "staff") {
    await supabase.from("user_roles").delete().eq("user_id", uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: newRole });
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  }

  async function toggleStore(uid: string, sid: string, on: boolean) {
    if (on) {
      const { error } = await supabase.from("store_staff").insert({ user_id: uid, store_id: sid });
      if (error) return toast.error(error.message);
    } else {
      await supabase.from("store_staff").delete().eq("user_id", uid).eq("store_id", sid);
    }
    qc.invalidateQueries({ queryKey: ["store_staff"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Users & Roles</h1>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>User</TableHead><TableHead>Role</TableHead>
            {stores.map((s) => <TableHead key={s.id}>{s.name}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </TableCell>
                <TableCell>
                  <Select value={roleOf(p.id)} onValueChange={(v: any) => setRole(p.id, v)}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                {stores.map((s) => {
                  const on = assignments.some((a) => a.user_id === p.id && a.store_id === s.id);
                  return (
                    <TableCell key={s.id}>
                      <Checkbox checked={on} onCheckedChange={(c) => toggleStore(p.id, s.id, !!c)} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {profiles.length === 0 && <TableRow><TableCell colSpan={2 + stores.length} className="text-center text-muted-foreground py-8">No users yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Admins always have access to every store regardless of assignment.</p>
    </div>
  );
}