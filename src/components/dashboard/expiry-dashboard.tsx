import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, PackageX, TrendingDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  daysUntil,
  DEFAULT_NEAR_EXPIRY_DAYS,
  listExpiredBatches,
  listLowStock,
  listNearExpiryBatches,
  type BatchWithRefs,
} from "@/lib/fifo";

export function ExpiryDashboard() {
  const [days, setDays] = useState(DEFAULT_NEAR_EXPIRY_DAYS);

  const expired = useQuery({ queryKey: ["alerts_expired"], queryFn: listExpiredBatches });
  const near = useQuery({
    queryKey: ["alerts_near", days],
    queryFn: () => listNearExpiryBatches(days),
  });
  const low = useQuery({ queryKey: ["alerts_low"], queryFn: listLowStock });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Near-expiry threshold (days)</Label>
          <Input
            type="number"
            min="0"
            className="w-32"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          title="Expired batches"
          icon={<PackageX className="h-4 w-4" />}
          value={expired.data?.length ?? 0}
          tone="destructive"
          hint="Visible but blocked from dispensing"
        />
        <StatCard
          title={`Near expiry (≤ ${days}d)`}
          icon={<AlertTriangle className="h-4 w-4" />}
          value={near.data?.length ?? 0}
          tone="warning"
          hint="Dispense soon to avoid waste"
        />
        <StatCard
          title="Low stock products"
          icon={<TrendingDown className="h-4 w-4" />}
          value={low.data?.length ?? 0}
          tone="warning"
          hint="Below configured reorder level"
        />
      </div>

      <BatchSection title="Expired inventory" data={expired.data} tone="destructive" />
      <BatchSection title={`Near-expiry inventory (≤ ${days} days)`} data={near.data} tone="warning" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Low stock report</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">On hand (base)</TableHead>
                <TableHead className="text-right">Reorder level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(low.data ?? []).map((r) => (
                <TableRow key={r.product_id}>
                  <TableCell className="font-mono text-xs">{r.product_code}</TableCell>
                  <TableCell>{r.product_name}</TableCell>
                  <TableCell className="text-right">{r.on_hand_base}</TableCell>
                  <TableCell className="text-right">{r.reorder_level}</TableCell>
                </TableRow>
              ))}
              {!low.data?.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    All products are above reorder level.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  icon,
  value,
  tone,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  value: number;
  tone: "destructive" | "warning";
  hint?: string;
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : "text-amber-600 dark:text-amber-400";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm font-medium flex items-center gap-2 ${color}`}>
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function BatchSection({
  title,
  data,
  tone,
}: {
  title: string;
  data: BatchWithRefs[] | undefined;
  tone: "destructive" | "warning";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Qty (base)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((b) => {
              const d = daysUntil(b.expiry_date);
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-medium">{b.products?.product_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {b.products?.product_code ?? ""}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{b.batch_number ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{b.expiry_date ?? "—"}</span>
                      {d !== null ? (
                        <Badge variant={tone === "destructive" ? "destructive" : "secondary"}>
                          {d < 0 ? `${Math.abs(d)}d ago` : `${d}d`}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {b.warehouses?.warehouse_name ?? "—"}
                    {b.warehouse_sections ? ` · ${b.warehouse_sections.section_name}` : ""}
                  </TableCell>
                  <TableCell className="text-right">{Number(b.quantity_base_unit)}</TableCell>
                </TableRow>
              );
            })}
            {!data?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  None.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
