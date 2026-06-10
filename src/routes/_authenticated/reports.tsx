import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ReportFiltersBar } from "@/components/reports/report-filters";
import { ReportTable, type ReportColumn } from "@/components/reports/report-table";
import {
  listCurrentInventory,
  listTransactionsFull,
  type CurrentInventoryRow,
  type ReportFilters,
  type TxnRow,
} from "@/lib/reports";
import {
  listExpiredBatches,
  listLowStock,
  listNearExpiryBatches,
  type BatchWithRefs,
  type LowStockRow,
  daysUntil,
} from "@/lib/fifo";
import { format } from "date-fns";
import type { InventoryTxnType } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — Clinic Inventory Hub" }] }),
});

function ReportsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <FileBarChart className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Reports</h1>
      </div>
      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto print:hidden">
          <TabsTrigger value="inventory">Current inventory</TabsTrigger>
          <TabsTrigger value="expiry">Expired</TabsTrigger>
          <TabsTrigger value="near">Near expiry</TabsTrigger>
          <TabsTrigger value="low">Low stock</TabsTrigger>
          <TabsTrigger value="txn">Transactions</TabsTrigger>
          <TabsTrigger value="disp">Dispensing</TabsTrigger>
          <TabsTrigger value="tr">Transfers</TabsTrigger>
          <TabsTrigger value="dis">Disposal</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory"><CurrentInventoryReport /></TabsContent>
        <TabsContent value="expiry"><ExpiryReport mode="expired" /></TabsContent>
        <TabsContent value="near"><ExpiryReport mode="near" /></TabsContent>
        <TabsContent value="low"><LowStockReport /></TabsContent>
        <TabsContent value="txn"><TransactionsReport title="Transaction history" /></TabsContent>
        <TabsContent value="disp"><TransactionsReport title="Dispensing report" forcedType="dispensing" /></TabsContent>
        <TabsContent value="tr"><TransactionsReport title="Transfer report" forcedType="transfer_out" /></TabsContent>
        <TabsContent value="dis"><TransactionsReport title="Disposal report" forcedType="disposal" /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Current Inventory ----------
function CurrentInventoryReport() {
  const [filters, setFilters] = useState<ReportFilters>({});
  const { data, isLoading } = useQuery({
    queryKey: ["report_inventory", filters],
    queryFn: () => listCurrentInventory(filters),
  });
  const cols: ReportColumn<CurrentInventoryRow>[] = [
    { key: "product_code", header: "Code" },
    { key: "product_name", header: "Product" },
    { key: "category", header: "Category", render: (r) => r.category ?? "—" },
    { key: "warehouse_name", header: "Warehouse" },
    { key: "section_name", header: "Section", render: (r) => r.section_name ?? "—" },
    { key: "batch_number", header: "Batch", render: (r) => r.batch_number ?? "—" },
    { key: "expiry_date", header: "Expiry", render: (r) => r.expiry_date ?? "—" },
    { key: "quantity_base_unit", header: "Qty (base)", align: "right", accessor: (r) => r.quantity_base_unit },
  ];
  return (
    <div className="space-y-3">
      <ReportFiltersBar value={filters} onChange={setFilters} />
      <ReportTable
        title="Current inventory report"
        description="On-hand batches across all warehouses"
        rows={data ?? []}
        columns={cols}
        isLoading={isLoading}
        filename="current_inventory"
      />
    </div>
  );
}

// ---------- Expiry / Near-Expiry ----------
function ExpiryReport({ mode }: { mode: "expired" | "near" }) {
  const [filters, setFilters] = useState<ReportFilters>({});
  const { data, isLoading } = useQuery({
    queryKey: ["report_expiry", mode],
    queryFn: () => (mode === "expired" ? listExpiredBatches() : listNearExpiryBatches(90)),
  });
  const filtered = (data ?? []).filter((b) => {
    if (filters.warehouse_id && b.warehouse_id !== filters.warehouse_id) return false;
    if (filters.product_id && b.product_id !== filters.product_id) return false;
    return true;
  });
  const cols: ReportColumn<BatchWithRefs>[] = [
    { key: "product_code", header: "Code", render: (r) => r.products?.product_code ?? "—", accessor: (r) => r.products?.product_code },
    { key: "product_name", header: "Product", render: (r) => r.products?.product_name ?? "—", accessor: (r) => r.products?.product_name },
    { key: "warehouse", header: "Warehouse", render: (r) => r.warehouses?.warehouse_name ?? "—", accessor: (r) => r.warehouses?.warehouse_name },
    { key: "batch", header: "Batch", render: (r) => r.batch_number ?? "—", accessor: (r) => r.batch_number },
    {
      key: "expiry",
      header: "Expiry",
      accessor: (r) => r.expiry_date,
      render: (r) => {
        const d = daysUntil(r.expiry_date);
        return (
          <span className="flex items-center gap-2">
            {r.expiry_date ?? "—"}
            {d !== null ? (
              <Badge variant={mode === "expired" ? "destructive" : "secondary"}>
                {d < 0 ? `${Math.abs(d)}d ago` : `${d}d left`}
              </Badge>
            ) : null}
          </span>
        );
      },
    },
    { key: "qty", header: "Qty (base)", align: "right", accessor: (r) => r.quantity_base_unit, render: (r) => Number(r.quantity_base_unit) },
  ];
  return (
    <div className="space-y-3">
      <ReportFiltersBar value={filters} onChange={setFilters} showCategory={false} />
      <ReportTable
        title={mode === "expired" ? "Expired inventory report" : "Near-expiry inventory report (≤ 90 days)"}
        rows={filtered}
        columns={cols}
        isLoading={isLoading}
        filename={mode === "expired" ? "expired_inventory" : "near_expiry_inventory"}
      />
    </div>
  );
}

// ---------- Low stock ----------
function LowStockReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report_low"], queryFn: listLowStock });
  const cols: ReportColumn<LowStockRow>[] = [
    { key: "product_code", header: "Code" },
    { key: "product_name", header: "Product" },
    { key: "on_hand_base", header: "On hand (base)", align: "right" },
    { key: "reorder_level", header: "Reorder level", align: "right" },
    {
      key: "deficit",
      header: "Deficit",
      align: "right",
      accessor: (r) => r.reorder_level - r.on_hand_base,
      render: (r) => (
        <Badge variant="destructive">{r.reorder_level - r.on_hand_base}</Badge>
      ),
    },
  ];
  return (
    <ReportTable
      title="Low stock report"
      description="Products below their configured reorder level"
      rows={data ?? []}
      columns={cols}
      isLoading={isLoading}
      filename="low_stock"
    />
  );
}

// ---------- Transactions / Dispensing / Transfers / Disposal ----------
function TransactionsReport({
  title,
  forcedType,
}: {
  title: string;
  forcedType?: InventoryTxnType;
}) {
  const [filters, setFilters] = useState<ReportFilters>({});
  const effective: ReportFilters = forcedType
    ? { ...filters, transaction_type: forcedType }
    : filters;
  const { data, isLoading } = useQuery({
    queryKey: ["report_txn", effective],
    queryFn: () => listTransactionsFull(effective, 1000),
  });
  const cols: ReportColumn<TxnRow>[] = [
    {
      key: "created_at",
      header: "Date",
      accessor: (r) => r.created_at,
      render: (r) => format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
    },
    { key: "type", header: "Type", accessor: (r) => r.transaction_type, render: (r) => r.transaction_type },
    { key: "product", header: "Product", accessor: (r) => r.products?.product_name, render: (r) => r.products?.product_name ?? "—" },
    { key: "warehouse", header: "Warehouse", accessor: (r) => r.warehouses?.warehouse_name, render: (r) => r.warehouses?.warehouse_name ?? "—" },
    { key: "section", header: "Section", accessor: (r) => r.warehouse_sections?.section_name, render: (r) => r.warehouse_sections?.section_name ?? "—" },
    { key: "batch", header: "Batch", accessor: (r) => r.inventory_batches?.batch_number, render: (r) => r.inventory_batches?.batch_number ?? "—" },
    { key: "qty", header: "Qty", align: "right", accessor: (r) => Number(r.quantity), render: (r) => `${Number(r.quantity)} ${r.product_units?.unit_name ?? ""}` },
    { key: "base", header: "Qty (base)", align: "right", accessor: (r) => Number(r.quantity_base_unit) },
    { key: "notes", header: "Notes", accessor: (r) => r.notes ?? "", render: (r) => r.notes ?? "—" },
  ];
  return (
    <div className="space-y-3">
      <ReportFiltersBar value={filters} onChange={setFilters} showType={!forcedType} />
      <ReportTable
        title={title}
        rows={data ?? []}
        columns={cols}
        isLoading={isLoading}
        filename={title.toLowerCase().replace(/\s+/g, "_")}
      />
    </div>
  );
}
