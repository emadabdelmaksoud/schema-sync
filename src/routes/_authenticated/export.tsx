import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/export")({
  component: ExportPage,
});

function ExportPage() {
  const [storeId, setStoreId] = useState<string>("all");
  const [type, setType] = useState<"balance" | "transactions">("balance");
  const [department, setDepartment] = useState<string>("all");

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => (await supabase.from("stores").select("id, name").order("name")).data ?? [],
  });

  async function download() {
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));
    let rows: any[] = [];
    if (type === "balance") {
      let q = supabase.from("items").select("*").order("name");
      if (storeId !== "all") q = q.eq("store_id", storeId);
      if (department !== "all") q = q.eq("department", department as any);
      const { data } = await q;
      rows = (data ?? []).map((it, i) => ({
        "S.No": i + 1,
        "Name": it.name,
        "Quantity": Number(it.current_quantity),
        "Unit": it.unit,
        "Exp Date": it.expiry_date ?? "",
        "Department": it.department,
        "Store": storeMap.get(it.store_id) ?? "",
      }));
    } else {
      let q = supabase.from("transactions").select("*, items(name, unit)").order("created_at", { ascending: false });
      if (storeId !== "all") q = q.eq("store_id", storeId);
      if (department !== "all") q = q.eq("department", department as any);
      const { data } = await q;
      rows = (data ?? []).map((t: any) => ({
        "S.No": t.serial_no,
        "Date": new Date(t.created_at).toLocaleString(),
        "Name": t.items?.name,
        "Quantity": Number(t.quantity),
        "Unit": t.items?.unit,
        "Status": t.status,
        "Staff": t.staff_name_snapshot,
        "Store": t.store_name_snapshot,
        "Department": t.department,
      }));
    }
    if (rows.length === 0) return toast.error("Nothing to export");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    XLSX.writeFile(wb, `storectrl_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Export to Excel</h1>
        <p className="text-muted-foreground">Download current balance or transaction history</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Options</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance">Current balance</SelectItem>
                  <SelectItem value="transactions">Transactions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Store</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pharmacy">Pharmacy</SelectItem>
                  <SelectItem value="supplies">Supplies</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={download}><Download className="h-4 w-4 mr-2" />Download .xlsx</Button>
        </CardContent>
      </Card>
    </div>
  );
}