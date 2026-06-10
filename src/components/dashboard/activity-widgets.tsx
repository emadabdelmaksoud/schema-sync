import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listTransactionsFull } from "@/lib/reports";
import type { InventoryTxnType } from "@/lib/inventory";
import { format } from "date-fns";

const TYPE_TONE: Record<string, string> = {
  stock_in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  dispensing: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  transfer_in: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  transfer_out: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  disposal: "bg-destructive/15 text-destructive",
  adjustment: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  inventory_count: "bg-muted text-foreground",
};

function ActivityCard({ title, type }: { title: string; type?: InventoryTxnType }) {
  const { data } = useQuery({
    queryKey: ["recent_txns", type ?? "all"],
    queryFn: () => listTransactionsFull(type ? { transaction_type: type } : {}, 8),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(r.created_at), "MMM d, HH:mm")}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={TYPE_TONE[r.transaction_type] ?? ""}>
                    {r.transaction_type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.products?.product_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.products?.product_code ?? ""}</div>
                </TableCell>
                <TableCell className="text-sm">{r.warehouses?.warehouse_name ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {Number(r.quantity)} {r.product_units?.unit_name ?? ""}
                </TableCell>
              </TableRow>
            ))}
            {!data?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No activity yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ActivityWidgets() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ActivityCard title="Recent transactions (all)" />
      <ActivityCard title="Recent dispensing" type="dispensing" />
      <ActivityCard title="Recent transfers" type="transfer_out" />
      <ActivityCard title="Recent disposals" type="disposal" />
    </div>
  );
}
