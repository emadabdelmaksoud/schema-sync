import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
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
import { ProductPicker, type PickedProduct } from "./product-picker";
import { LocationPicker } from "./location-picker";
import { listProductUnits, fromBase, toBase } from "@/lib/product-units";
import { listLocationBatches, performOutOrCount, performStockIn } from "@/lib/inventory-ops";
import type { InventoryTxnType } from "@/lib/inventory";
import { classifyExpiry, daysUntil } from "@/lib/fifo";

type SupportedType = Extract<
  InventoryTxnType,
  "stock_in" | "dispensing" | "disposal" | "inventory_count"
>;

interface Props {
  type: SupportedType;
  onSuccess?: () => void;
}

const baseSchema = z.object({
  unit_id: z.string().uuid("Select a unit"),
  quantity: z.coerce.number().positive("Quantity must be > 0"),
  notes: z.string().max(2000).optional(),
});

export function TransactionForm({ type, onSuccess }: Props) {
  const qc = useQueryClient();
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  // stock_in fields
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  // out / count: pick a batch
  const [batchId, setBatchId] = useState("");

  // Reset when type changes
  useEffect(() => {
    setProduct(null);
    setWarehouseId("");
    setSectionId("");
    setUnitId("");
    setQuantity("");
    setNotes("");
    setBatchNumber("");
    setExpiryDate("");
    setBatchId("");
  }, [type]);

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

  const needsBatchPick = type !== "stock_in";

  const batches = useQuery({
    queryKey: ["inv_batches", product?.id, warehouseId, sectionId || null],
    queryFn: () => listLocationBatches(product!.id, warehouseId, sectionId || null),
    enabled: !!product?.id && !!warehouseId && needsBatchPick,
  });

  // Auto-select first batch when list loads
  useEffect(() => {
    const list = batches.data ?? [];
    if (needsBatchPick && list.length && !list.find((b) => b.id === batchId)) {
      const firstWithStock = list.find((b) => Number(b.quantity_base_unit) > 0) ?? list[0];
      setBatchId(firstWithStock?.id ?? "");
    }
    if (needsBatchPick && !list.length) setBatchId("");
  }, [batches.data, batchId, needsBatchPick]);

  const selectedUnit = useMemo(
    () => (units.data ?? []).find((u) => u.id === unitId) ?? null,
    [units.data, unitId],
  );
  const selectedBatch = useMemo(
    () => (batches.data ?? []).find((b) => b.id === batchId) ?? null,
    [batches.data, batchId],
  );

  const qtyNum = Number(quantity);
  const qtyBase = selectedUnit && qtyNum > 0 ? toBase(qtyNum, selectedUnit) : 0;
  const stockBase = selectedBatch ? Number(selectedBatch.quantity_base_unit) : 0;
  const stockInUnit =
    selectedBatch && selectedUnit ? fromBase(stockBase, selectedUnit) : 0;

  const overStock =
    (type === "dispensing" || type === "disposal") &&
    !!selectedBatch &&
    qtyBase > stockBase;

  const batchExpiryStatus = selectedBatch ? classifyExpiry(selectedBatch.expiry_date) : "no-expiry";
  const isExpired = batchExpiryStatus === "expired";
  const isNearExpiry = batchExpiryStatus === "near";
  const blockForExpiry = type === "dispensing" && isExpired;

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Select a product");
      if (!warehouseId) throw new Error("Select a warehouse");
      baseSchema.parse({ unit_id: unitId, quantity, notes });
      if (type === "stock_in") {
        return performStockIn({
          product_id: product.id,
          warehouse_id: warehouseId,
          section_id: sectionId || null,
          batch_number: batchNumber.trim() || null,
          expiry_date: expiryDate || null,
          unit_id: unitId,
          quantity: qtyNum,
          notes: notes.trim() || null,
        });
      }
      if (!batchId) throw new Error("Select a batch");
      if (overStock) throw new Error("Quantity exceeds available stock");
      if (blockForExpiry) throw new Error("Cannot dispense an expired batch — use disposal instead");
      if (type === "dispensing" && isNearExpiry) {
        if (!confirm(`This batch expires in ${daysUntil(selectedBatch?.expiry_date ?? null)} days. Continue?`)) {
          throw new Error("Cancelled");
        }
      }
      return performOutOrCount({
        type,
        product_id: product.id,
        batch_id: batchId,
        warehouse_id: warehouseId,
        section_id: sectionId || null,
        unit_id: unitId,
        quantity: qtyNum,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(labelFor(type) + " recorded");
      qc.invalidateQueries({ queryKey: ["inv_batches"] });
      qc.invalidateQueries({ queryKey: ["inv_transactions"] });
      setQuantity("");
      setNotes("");
      setBatchNumber("");
      setExpiryDate("");
      onSuccess?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
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

      {type === "stock_in" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Batch number</Label>
            <Input
              dir="auto"
              placeholder="e.g. LOT-2026-001"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry date</Label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Batch</Label>
          <Select value={batchId || undefined} onValueChange={setBatchId} disabled={!product || !warehouseId}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !product || !warehouseId
                    ? "Pick product and warehouse first"
                    : (batches.data ?? []).length
                      ? "Select batch…"
                      : "No batches at this location"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(batches.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {(b.batch_number ?? "—")} ·{" "}
                  {b.expiry_date ? `exp ${b.expiry_date}` : "no expiry"} · stock{" "}
                  {Number(b.quantity_base_unit)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            Quantity
            {type === "inventory_count" ? " (absolute on-hand)" : ""}
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
          {selectedUnit && qtyNum > 0 ? (
            <p className="text-xs text-muted-foreground">
              = {qtyBase} base unit{qtyBase === 1 ? "" : "s"}
            </p>
          ) : null}
          {needsBatchPick && selectedBatch ? (
            <p className={`text-xs ${overStock ? "text-destructive" : "text-muted-foreground"}`}>
              Available: {stockBase} base
              {selectedUnit ? ` · ${stockInUnit} ${selectedUnit.unit_name}` : ""}
            </p>
          ) : null}
          {selectedBatch && isExpired ? (
            <p className="text-xs text-destructive">⚠ Batch expired {Math.abs(daysUntil(selectedBatch.expiry_date) ?? 0)} days ago.</p>
          ) : null}
          {selectedBatch && isNearExpiry ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Near expiry: {daysUntil(selectedBatch.expiry_date)} days remaining.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          dir="auto"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes / ملاحظات"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submit.isPending || overStock || blockForExpiry}>
          {submit.isPending ? "Saving…" : `Record ${labelFor(type)}`}
        </Button>
      </div>
    </form>
  );
}

function labelFor(t: SupportedType) {
  switch (t) {
    case "stock_in":
      return "Stock In";
    case "dispensing":
      return "Dispensing";
    case "disposal":
      return "Disposal";
    case "inventory_count":
      return "Inventory Count";
  }
}
