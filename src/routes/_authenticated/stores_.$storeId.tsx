import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Printer, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/stores_/$storeId")({
  component: StoreDetail,
});

function StoreDetail() {
  const { storeId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    queryFn: async () => (await supabase.from("stores").select("*").eq("id", storeId).maybeSingle()).data,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items", storeId],
    queryFn: async () => (await supabase.from("items").select("*").eq("store_id", storeId).order("name")).data ?? [],
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["txs", storeId],
    queryFn: async () =>
      (await supabase
        .from("transactions")
        .select("*, items(name, unit)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(500)).data ?? [],
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => (await supabase.from("stores").select("id, name")).data ?? [],
  });

  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(
    () => items.filter((i) => deptFilter === "all" || i.department === deptFilter),
    [items, deptFilter]
  );
  const filteredTxs = useMemo(
    () =>
      txs.filter(
        (t) =>
          (deptFilter === "all" || t.department === deptFilter) &&
          (statusFilter === "all" || t.status === statusFilter)
      ),
    [txs, deptFilter, statusFilter]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/stores" className="text-sm text-muted-foreground hover:underline">← All stores</Link>
          <h1 className="text-3xl font-bold">{store?.name ?? "Store"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/print/balance/$storeId" params={{ storeId }} target="_blank"><Printer className="h-4 w-4 mr-2" />Balance</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/print/dispensing/$storeId" params={{ storeId }} target="_blank"><Printer className="h-4 w-4 mr-2" />Dispensed</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="transactions">Transactions ({txs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                <SelectItem value="pharmacy">Pharmacy</SelectItem>
                <SelectItem value="supplies">Supplies</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto"><NewItemDialog storeId={storeId} onCreated={() => qc.invalidateQueries({ queryKey: ["items", storeId] })} /></div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S.No</TableHead><TableHead>Name</TableHead><TableHead>Dept</TableHead>
                    <TableHead>Qty</TableHead><TableHead>Unit</TableHead><TableHead>Expiry</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((it, i) => (
                    <TableRow key={it.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell><Badge variant="secondary">{it.department}</Badge></TableCell>
                      <TableCell>
                        <span className={Number(it.current_quantity) <= 10 ? "text-orange-600 font-semibold" : ""}>
                          {Number(it.current_quantity)}
                        </span>
                      </TableCell>
                      <TableCell>{it.unit}</TableCell>
                      <TableCell>{it.expiry_date ?? "—"}</TableCell>
                      <TableCell>
                        <NewTxDialog item={it} storeId={storeId} stores={stores} userId={user!.id} userEmail={user!.email!} role={role}
                          onDone={() => { qc.invalidateQueries({ queryKey: ["items", storeId] }); qc.invalidateQueries({ queryKey: ["txs", storeId] }); }} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No items</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                <SelectItem value="pharmacy">Pharmacy</SelectItem>
                <SelectItem value="supplies">Supplies</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="added">Added</SelectItem>
                <SelectItem value="dispensing">Dispensing</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S.No</TableHead><TableHead>Date</TableHead><TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead><TableHead>Status</TableHead><TableHead>Staff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTxs.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.serial_no}</TableCell>
                      <TableCell>{new Date(t.created_at).toLocaleString()}</TableCell>
                      <TableCell>{t.items?.name}</TableCell>
                      <TableCell>{Number(t.quantity)} {t.items?.unit}</TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell>{t.staff_name_snapshot}</TableCell>
                    </TableRow>
                  ))}
                  {filteredTxs.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No transactions</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    added: "bg-green-100 text-green-700",
    dispensing: "bg-orange-100 text-orange-700",
    transferred: "bg-blue-100 text-blue-700",
    expired: "bg-red-100 text-red-700",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status]}`}>{status}</span>;
}

function NewItemDialog({ storeId, onCreated }: { storeId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [department, setDepartment] = useState("pharmacy");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("0");
  const { user } = useAuth();

  async function save() {
    if (!name) return;
    const { data: item, error } = await supabase
      .from("items")
      .insert({ name, unit, department: department as any, store_id: storeId, expiry_date: expiry || null })
      .select().single();
    if (error) return toast.error(error.message);
    const initial = Number(qty);
    if (initial > 0) {
      const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).single();
      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).maybeSingle();
      await supabase.from("transactions").insert({
        item_id: item.id, store_id: storeId, department: department as any,
        quantity: initial, status: "added", staff_user_id: user!.id,
        staff_name_snapshot: profile?.full_name ?? profile?.email ?? user!.email,
        store_name_snapshot: store?.name,
      });
    }
    toast.success("Item added");
    setOpen(false); setName(""); setQty("0"); setExpiry("");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Item</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pharmacy">Pharmacy</SelectItem>
                  <SelectItem value="supplies">Supplies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Unit</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Initial qty</Label><Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><Label>Expiry date</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTxDialog({ item, storeId, stores, userId, userEmail, role, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("dispensing");
  const [qty, setQty] = useState("1");
  const [toStore, setToStore] = useState<string>("");

  async function submit() {
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) return toast.error("Quantity required");
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
    const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).single();
    const staffName = profile?.full_name ?? profile?.email ?? userEmail;

    if (status === "transfer_request") {
      if (!toStore) return toast.error("Pick a destination store");
      const { error } = await supabase.from("transfer_requests").insert({
        from_store_id: storeId, to_store_id: toStore, item_id: item.id, quantity, requested_by: userId,
      });
      if (error) return toast.error(error.message);
      toast.success("Transfer request submitted for admin approval");
    } else {
      const { error } = await supabase.from("transactions").insert({
        item_id: item.id, store_id: storeId, department: item.department, quantity,
        status: status as "added" | "dispensing" | "expired" | "transferred",
        staff_user_id: userId, staff_name_snapshot: staffName, store_name_snapshot: store?.name,
      });
      if (error) return toast.error(error.message);
      toast.success("Recorded");
    }
    setOpen(false); setQty("1"); setToStore("");
    onDone();
  }

  const otherStores = stores.filter((s: any) => s.id !== storeId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Action</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{item.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Action</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="added">Add stock</SelectItem>
                <SelectItem value="dispensing">Dispense</SelectItem>
                <SelectItem value="expired">Mark expired</SelectItem>
                <SelectItem value="transfer_request">Request transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Quantity</Label><Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          {status === "transfer_request" && (
            <div><Label>To store</Label>
              <Select value={toStore} onValueChange={setToStore}>
                <SelectTrigger><SelectValue placeholder="Pick store" /></SelectTrigger>
                <SelectContent>
                  {otherStores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}