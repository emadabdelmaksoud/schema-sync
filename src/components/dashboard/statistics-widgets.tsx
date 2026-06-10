import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  listMovement,
  rankProductsByTxnType,
  rankWarehousesByActivity,
} from "@/lib/reports";

export function StatisticsWidgets() {
  const mostDispensed = useQuery({
    queryKey: ["stats_most_dispensed"],
    queryFn: () => rankProductsByTxnType("dispensing", {}, 8),
  });
  const stockIn = useQuery({
    queryKey: ["stats_fast_stockin"],
    queryFn: () => rankProductsByTxnType("stock_in", {}, 8),
  });
  const warehouses = useQuery({
    queryKey: ["stats_warehouses"],
    queryFn: () => rankWarehousesByActivity({}, 8),
  });
  const movement = useQuery({ queryKey: ["stats_movement"], queryFn: () => listMovement({}) });

  const fastMovers = (movement.data ?? [])
    .filter((m) => m.dispensed_base > 0)
    .sort((a, b) => b.dispensed_base - a.dispensed_base)
    .slice(0, 8);
  const slowMovers = (movement.data ?? [])
    .filter((m) => m.on_hand_base > 0)
    .sort((a, b) => a.dispensed_base - b.dispensed_base)
    .slice(0, 8);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard
        title="Most dispensed products"
        data={(mostDispensed.data ?? []).map((r) => ({
          name: r.product_name,
          value: r.total_base,
        }))}
        bar="#0ea5e9"
      />
      <ChartCard
        title="Top stock-in products (fast restock)"
        data={(stockIn.data ?? []).map((r) => ({ name: r.product_name, value: r.total_base }))}
        bar="#10b981"
      />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Most active warehouses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Total volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(warehouses.data ?? []).map((w) => (
                <TableRow key={w.warehouse_id}>
                  <TableCell>{w.warehouse_name}</TableCell>
                  <TableCell className="text-right">{w.txn_count}</TableCell>
                  <TableCell className="text-right">{Math.round(w.total_base)}</TableCell>
                </TableRow>
              ))}
              {!warehouses.data?.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    No activity yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Fast vs slow movers</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-3">
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">Fast movers</div>
            <ul className="text-sm space-y-1">
              {fastMovers.map((m) => (
                <li key={m.product_id} className="flex justify-between gap-2">
                  <span className="truncate">{m.product_name}</span>
                  <span className="text-emerald-600 font-medium">{Math.round(m.dispensed_base)}</span>
                </li>
              ))}
              {!fastMovers.length ? <li className="text-muted-foreground">—</li> : null}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">Slow movers</div>
            <ul className="text-sm space-y-1">
              {slowMovers.map((m) => (
                <li key={m.product_id} className="flex justify-between gap-2">
                  <span className="truncate">{m.product_name}</span>
                  <span className="text-amber-600 font-medium">{Math.round(m.dispensed_base)}</span>
                </li>
              ))}
              {!slowMovers.length ? <li className="text-muted-foreground">—</li> : null}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({
  title,
  data,
  bar,
}: {
  title: string;
  data: { name: string; value: number }[];
  bar: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill={bar} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No data.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
