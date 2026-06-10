import { useQuery } from "@tanstack/react-query";
import { Calendar, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listWarehouses } from "@/lib/warehouses";
import { listProducts } from "@/lib/products";
import type { ReportFilters } from "@/lib/reports";
import { TRANSACTION_TYPES } from "@/lib/inventory";

interface Props {
  value: ReportFilters;
  onChange: (next: ReportFilters) => void;
  showType?: boolean;
  showProduct?: boolean;
  showCategory?: boolean;
}

export function ReportFiltersBar({
  value,
  onChange,
  showType = false,
  showProduct = true,
  showCategory = true,
}: Props) {
  const warehouses = useQuery({ queryKey: ["wh_list"], queryFn: () => listWarehouses() });
  const products = useQuery({ queryKey: ["prod_list"], queryFn: () => listProducts() });
  const categories = Array.from(
    new Set((products.data ?? []).map((p) => p.category).filter(Boolean) as string[]),
  ).sort();

  const set = (k: keyof ReportFilters, v: string | null) =>
    onChange({ ...value, [k]: v || null });

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1">
          <Calendar className="h-3 w-3" /> From
        </Label>
        <Input
          type="date"
          className="h-9 w-36"
          value={value.from ?? ""}
          onChange={(e) => set("from", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1">
          <Calendar className="h-3 w-3" /> To
        </Label>
        <Input
          type="date"
          className="h-9 w-36"
          value={value.to ?? ""}
          onChange={(e) => set("to", e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Warehouse</Label>
        <Select
          value={value.warehouse_id ?? "all"}
          onValueChange={(v) => set("warehouse_id", v === "all" ? null : v)}
        >
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All warehouses</SelectItem>
            {(warehouses.data ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.warehouse_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showProduct ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Product</Label>
          <Select
            value={value.product_id ?? "all"}
            onValueChange={(v) => set("product_id", v === "all" ? null : v)}
          >
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {(products.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {showCategory ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select
            value={value.category ?? "all"}
            onValueChange={(v) => set("category", v === "all" ? null : v)}
          >
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {showType ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select
            value={value.transaction_type ?? "all"}
            onValueChange={(v) =>
              onChange({
                ...value,
                transaction_type: v === "all" ? null : (v as ReportFilters["transaction_type"]),
              })
            }
          >
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TRANSACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({ from: null, to: null, warehouse_id: null, product_id: null, category: null, transaction_type: null })
        }
      >
        <FilterX className="h-4 w-4" /> Clear
      </Button>
    </div>
  );
}
