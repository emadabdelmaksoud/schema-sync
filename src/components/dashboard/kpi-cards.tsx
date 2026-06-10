import { useQuery } from "@tanstack/react-query";
import { Boxes, Layers, PackageCheck, Warehouse, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getOverviewKpis } from "@/lib/reports";

export function KpiCards() {
  const { data, isLoading } = useQuery({ queryKey: ["overview_kpis"], queryFn: getOverviewKpis });

  const items = [
    {
      title: "Total products",
      value: data?.totalProducts ?? 0,
      icon: PackageCheck,
      tint: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400",
      ring: "ring-sky-500/20",
      hint: "Catalog SKUs",
    },
    {
      title: "Active warehouses",
      value: data?.totalWarehouses ?? 0,
      icon: Warehouse,
      tint: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
      ring: "ring-emerald-500/20",
      hint: "Operational sites",
    },
    {
      title: "Active batches",
      value: data?.totalBatches ?? 0,
      icon: Layers,
      tint: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400",
      ring: "ring-violet-500/20",
      hint: "With stock on hand",
    },
    {
      title: "Stock (base units)",
      value: Math.round(data?.totalStockBaseUnits ?? 0).toLocaleString(),
      icon: Boxes,
      tint: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
      ring: "ring-amber-500/20",
      hint: "Across all warehouses",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <Card
          key={it.title}
          className="relative overflow-hidden border-border/60 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${it.tint} opacity-60`} />
          <CardContent className="relative p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {it.title}
                </p>
                {isLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <div className="text-3xl font-semibold tracking-tight tabular-nums">
                    {it.value}
                  </div>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> {it.hint}
                </p>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-background/60 ring-1 ${it.ring} backdrop-blur-sm`}
              >
                <it.icon className={`h-5 w-5 ${it.tint.split(" ").find((c) => c.startsWith("text-")) ?? ""}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
