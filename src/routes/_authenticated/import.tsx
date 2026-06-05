import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type Row = { name: string; quantity: number; unit: string; department: string; expiry_date?: string | null; _err?: string };

function ImportPage() {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => (await supabase.from("stores").select("id, name").order("name")).data ?? [],
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target!.result, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
      const parsed: Row[] = json.map((r) => {
        const name = String(r.Name ?? r.name ?? "").trim();
        const quantity = Number(r.Quantity ?? r.quantity ?? 0);
        const unit = String(r.Unit ?? r.unit ?? "pcs").trim() || "pcs";
        const department = String(r.Department ?? r.department ?? "pharmacy").toLowerCase().trim();
        const expiry_date = r["Exp Date"] || r.expiry_date || r["Expiry"] || null;
        let _err;
        if (!name) _err = "Missing name";
        else if (!quantity || quantity < 0) _err = "Invalid quantity";
        else if (!["pharmacy", "supplies"].includes(department)) _err = "Department must be pharmacy/supplies";
        return { name, quantity, unit, department, expiry_date: expiry_date || null, _err };
      });
      setRows(parsed);
    };
    reader.readAsBinaryString(f);
  }

  async function commit() {
    if (!storeId) return toast.error("Pick a store");
    setBusy(true);
    const valid = rows.filter((r) => !r._err);
    const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).single();
    const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).maybeSingle();
    const staffName = profile?.full_name ?? profile?.email ?? user!.email!;
    let ok = 0, fail = 0;
    for (const r of valid) {
      const { data: item, error } = await supabase.from("items").insert({
        store_id: storeId, department: r.department as any, name: r.name, unit: r.unit, expiry_date: r.expiry_date,
      }).select().single();
      if (error || !item) { fail++; continue; }
      const { error: te } = await supabase.from("transactions").insert({
        item_id: item.id, store_id: storeId, department: r.department as any,
        quantity: r.quantity, status: "added",
        staff_user_id: user!.id, staff_name_snapshot: staffName, store_name_snapshot: store?.name,
      });
      if (te) fail++; else ok++;
    }
    setBusy(false);
    toast.success(`Imported ${ok}, failed ${fail}`);
    setRows([]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import from Excel</h1>
        <p className="text-muted-foreground">Columns: Name, Quantity, Unit, Department (pharmacy/supplies), Exp Date</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Upload</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Target store</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Pick store" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Excel file (.xlsx, .csv)</Label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="block w-full text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>
      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Preview ({rows.length})</CardTitle>
            <Button onClick={commit} disabled={busy || !storeId}>Import {rows.filter((r) => !r._err).length} items</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Qty</TableHead><TableHead>Unit</TableHead>
                <TableHead>Dept</TableHead><TableHead>Expiry</TableHead><TableHead>Issue</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i} className={r._err ? "bg-destructive/10" : ""}>
                    <TableCell>{r.name}</TableCell><TableCell>{r.quantity}</TableCell>
                    <TableCell>{r.unit}</TableCell><TableCell>{r.department}</TableCell>
                    <TableCell>{r.expiry_date ?? "—"}</TableCell>
                    <TableCell className="text-destructive text-xs">{r._err ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}