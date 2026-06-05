import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transfers")({
  component: Transfers,
});

function Transfers() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const [{ data: trs }, { data: stores }, { data: items }, { data: profiles }] = await Promise.all([
        supabase.from("transfer_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("stores").select("id, name"),
        supabase.from("items").select("id, name, unit, department"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      const sm = new Map((stores ?? []).map((s) => [s.id, s]));
      const im = new Map((items ?? []).map((i) => [i.id, i]));
      const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (trs ?? []).map((t) => ({
        ...t,
        items: im.get(t.item_id),
        from: sm.get(t.from_store_id),
        to: sm.get(t.to_store_id),
        requester: pm.get(t.requested_by),
      }));
    },
  });

  async function decide(id: string, decision: "approved" | "rejected", row: any) {
    if (decision === "approved") {
      // Log a transferred tx in source and added tx in destination
      const item = row.items;
      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).maybeSingle();
      const staffName = profile?.full_name ?? profile?.email ?? user!.email!;
      const { error: e1 } = await supabase.from("transactions").insert({
        item_id: row.item_id, store_id: row.from_store_id, department: item.department,
        quantity: row.quantity, status: "transferred",
        staff_user_id: user!.id, staff_name_snapshot: staffName, store_name_snapshot: row.from?.name,
        transfer_to_store_id: row.to_store_id,
      });
      if (e1) return toast.error(e1.message);
      // Find or create matching item in destination store
      const { data: existing } = await supabase.from("items").select("id")
        .eq("store_id", row.to_store_id).eq("name", item.name).eq("department", item.department).maybeSingle();
      let destItemId = existing?.id;
      if (!destItemId) {
        const { data: created, error: ce } = await supabase.from("items").insert({
          store_id: row.to_store_id, department: item.department, name: item.name, unit: item.unit,
        }).select().single();
        if (ce) return toast.error(ce.message);
        destItemId = created.id;
      }
      await supabase.from("transactions").insert({
        item_id: destItemId, store_id: row.to_store_id, department: item.department,
        quantity: row.quantity, status: "added",
        staff_user_id: user!.id, staff_name_snapshot: staffName, store_name_snapshot: row.to?.name,
      });
    }
    const { error } = await supabase
      .from("transfer_requests")
      .update({ status: decision, approved_by: user!.id, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Transfer ${decision}`);
    qc.invalidateQueries({ queryKey: ["transfers"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Transfer Requests</h1>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead>
            <TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Requester</TableHead>
            <TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{r.items?.name}</TableCell>
                <TableCell>{Number(r.quantity)} {r.items?.unit}</TableCell>
                <TableCell>{r.from?.name}</TableCell>
                <TableCell>{r.to?.name}</TableCell>
                <TableCell>{r.requester?.full_name ?? r.requester?.email}</TableCell>
                <TableCell><span className="capitalize">{r.status}</span></TableCell>
                <TableCell className="space-x-2">
                  {role === "admin" && r.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => decide(r.id, "approved", r)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected", r)}>Reject</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No transfer requests</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}