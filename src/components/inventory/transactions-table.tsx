import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDB } from "@/lib/local-db";
import { listTransactions, TRANSACTION_TYPES, type InventoryTransaction, type InventoryTxnType } from "@/lib/inventory";
import { listWarehouses } from "@/lib/warehouses";

const TYPE_LABEL: Record<InventoryTxnType, string> = {
  stock_in: "Stock In",
  dispensing: "Dispensing",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  disposal: "Disposal",
  adjustment: "Adjustment",
  inventory_count: "Inventory Count",
};

const TYPE_TONE: Record<InventoryTxnType, "default" | "secondary" | "destructive" | "outline"> = {
  stock_in: "default",
  transfer_in: "default",
  inventory_count: "outline",
  adjustment: "outline",
  dispensing: "secondary",
  transfer_out: "secondary",
  disposal: "destructive",
};

export function TransactionsTable() {
  const [type, setType] = useState<InventoryTxnType | "all">("all");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => listWarehouses() });

  const txns = useQuery({
    queryKey: ["inv_transactions", type, warehouseId],
    queryFn: () =>
      listTransactions({
        transaction_type: type === "all" ? undefined : type,
        warehouse_id: warehouseId === "all" ? undefined : warehouseId,
        limit: 300,
      }),
  });

  const productIds = useMemo(() => Array.from(new Set((txns.data ?? []).map((t) => t.product_id))), [txns.data]);

  const productMap = useQuery({
    queryKey: ["products_for_txns", productIds],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const db = await getDB();
      const products = await db.getAll("products");
      const map = new Map<string, { product_name: string; product_code: string }>();
      products.forEach((p) => map.set(p.id, { product_name: p.product_name, product_code: p.product_code }));
      return map;
    },
  });

  const warehouseMap = useMemo(() => {
    const m = new Map<string, string>();
    (warehouses.data ?? []).forEach((w) => m.set(w.id, w.warehouse_name));
    return m;
  }, [warehouses.data]);

  const rows: InventoryTransaction[] = (txns.data ?? []).filter((t) => {
    if (!productSearch.trim()) return true;
    const p = productMap.data?.get(t.product_id);
    const hay = `${p?.product_name ?? ""} ${p?.product_code ?? ""}`.toLowerCase();
    return hay.includes(productSearch.trim().toLowerCase());
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Input dir="auto" placeholder="Filter by product name or code..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
        <Select value={type} onValueChange={(v) => setType(v as InventoryTxnType | "all")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TRANSACTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger><SelectValue placeholder="Warehouse..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All warehouses</SelectItem>
            {(warehouses.data ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Qty (base)</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txns.isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No transactions.</TableCell></TableRow>
            ) : (
              rows.map((t) => {
                const p = productMap.data?.get(t.product_id);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={TYPE_TONE[t.transaction_type]}>{TYPE_LABEL[t.transaction_type]}</Badge>
                    </TableCell>
                    <TableCell dir="auto">
                      <div className="font-medium">{p?.product_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p?.product_code ?? ""}</div>
                    </TableCell>
                    <TableCell>{warehouseMap.get(t.warehouse_id) ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{t.quantity_base_unit}</TableCell>
                    <TableCell dir="auto" className="max-w-xs truncate text-muted-foreground">{t.notes ?? ""}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
