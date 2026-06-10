import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ProductPicker, type PickedProduct } from "./product-picker";
import { LocationPicker } from "./location-picker";
import { listProductUnits, toBase, fromBase } from "@/lib/product-units";
import {
  classifyExpiry,
  daysUntil,
  DEFAULT_NEAR_EXPIRY_DAYS,
  dispenseFifo,
  fetchFifoBatches,
  planFifoAllocation,
} from "@/lib/fifo";

export function FifoDispenseForm() {
  const qc = useQueryClient();
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [nearDays, setNearDays] = useState(DEFAULT_NEAR_EXPIRY_DAYS);

  useEffect(() => {
    setUnitId("");
    setQuantity("");
  }, [product?.id]);

  const units = useQuery({
    queryKey: ["product_units", product?.id],
    queryFn: () => listProductUnits(product!.id),
    enabled: !!product?.id,
  });
  useEffect(() => {
    const list = units.data ?? [];
    if (list.length && !list.find((u) => u.id === unitId)) {
      const base = list.find((u) => u.is_base) ?? list[0];
      setUnitId(base?.id ?? "");
    }
  }, [units.data, unitId]);

  const fifo = useQuery({
    queryKey: ["fifo_batches", product?.id, warehouseId, sectionId || null],
    queryFn: () => fetchFifoBatches(product!.id, warehouseId, sectionId || null),
    enabled: !!product?.id && !!warehouseId,
  });

  const unit = useMemo(
    () => (units.data ?? []).find((u) => u.id === unitId) ?? null,
    [units.data, unitId],
  );
  const qtyNum = Number(quantity);
  const qtyBase = unit && qtyNum > 0 ? toBase(qtyNum, unit) : 0;

  const totalAvailableBase = useMemo(
    () => (fifo.data ?? []).reduce((s, b) => s + Number(b.quantity_base_unit), 0),
    [fifo.data],
  );

  const plan = useMemo(() => {
    if (!fifo.data || qtyBase <= 0) return [];
    try {
      return planFifoAllocation(fifo.data, qtyBase);
    } catch {
      return [];
    }
  }, [fifo.data, qtyBase]);

  const shortfall = qtyBase > 0 && qtyBase > totalAvailableBase;
  const hasNearExpiry = plan.some(
    (p) => classifyExpiry(p.batch.expiry_date, nearDays) === "near",
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Select a product");
      if (!warehouseId) throw new Error("Select a warehouse");
      if (!unit) throw new Error("Select a unit");
      if (qtyNum <= 0) throw new Error("Quantity must be > 0");
      return dispenseFifo({
        product_id: product.id,
        warehouse_id: warehouseId,
        section_id: sectionId || null,
        unit,
        quantity: qtyNum,
        notes: notes.trim() || null,
      });
    },
    onSuccess: (rows) => {
      toast.success(`FIFO dispense recorded across ${rows.length} batch${rows.length === 1 ? "" : "es"}`);
      qc.invalidateQueries({ queryKey: ["inv_batches"] });
      qc.invalidateQueries({ queryKey: ["inv_transactions"] });
      qc.invalidateQueries({ queryKey: ["fifo_batches"] });
      setQuantity("");
      setNotes("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasNearExpiry) {
          if (!confirm("Some batches are within the near-expiry window. Continue?")) return;
        }
        submit.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label>Product</Label>
        <ProductPicker value={product} onChange={setProduct} />
      </div>
      <LocationPicker
        warehouseId={warehouseId}
        sectionId={sectionId}
        onChange={({ warehouseId: w, sectionId: s }) => {
          setWarehouseId(w);
          setSectionId(s);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Unit</Label>
          <Select value={unitId || undefined} onValueChange={setUnitId} disabled={!product}>
            <SelectTrigger>
              <SelectValue placeholder={product ? "Select unit…" : "Pick product first"} />
            </SelectTrigger>
            <SelectContent>
              {(units.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.unit_name}
                  {u.is_base ? " (base)" : ""} · ×{u.factor_to_base}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Quantity to dispense</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
          {unit && qtyNum > 0 ? (
            <p className="text-xs text-muted-foreground">
              = {qtyBase} base unit{qtyBase === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Near-expiry threshold (days)</Label>
          <Input
            type="number"
            min="0"
            value={nearDays}
            onChange={(e) => setNearDays(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea dir="auto" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {fifo.data && fifo.data.length === 0 && product && warehouseId ? (
        <p className="text-sm text-muted-foreground">No dispensable (non-expired) batches at this location.</p>
      ) : null}

      {plan.length > 0 ? (
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" /> FIFO allocation preview
          </div>
          <ul className="divide-y text-sm">
            {plan.map((step) => {
              const status = classifyExpiry(step.batch.expiry_date, nearDays);
              const d = daysUntil(step.batch.expiry_date);
              return (
                <li key={step.batch.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{step.batch.batch_number ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      exp {step.batch.expiry_date ?? "—"}
                      {d !== null ? ` (${d}d)` : ""}
                    </span>
                    {status === "near" ? (
                      <Badge variant="secondary" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> near expiry
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs">
                    take <strong>{step.takeBase}</strong> base
                    {unit ? ` (${fromBase(step.takeBase, unit)} ${unit.unit_name})` : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {shortfall ? (
        <p className="text-sm text-destructive">
          Insufficient stock: need {qtyBase} base, only {totalAvailableBase} available.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submit.isPending || shortfall || qtyBase <= 0}>
          {submit.isPending ? "Dispensing…" : "Dispense (FIFO)"}
        </Button>
      </div>
    </form>
  );
}
