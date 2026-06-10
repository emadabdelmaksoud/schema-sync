import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createProductUnit,
  deleteProductUnit,
  listProductUnits,
  productUnitSchema,
  updateProductUnit,
  convertUnits,
  type ProductUnit,
  type ProductUnitInput,
} from "@/lib/product-units";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Pencil, Plus, X } from "lucide-react";

export function ProductUnitsManager({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProductUnit | null>(null);

  const { data: units = [], isLoading } = useQuery({
    queryKey: ["product-units", productId],
    queryFn: () => listProductUnits(productId),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["product-units", productId] });

  const create = useMutation({
    mutationFn: (v: ProductUnitInput) => createProductUnit(productId, v),
    onSuccess: () => {
      toast.success("Unit added");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const update = useMutation({
    mutationFn: ({ id, v }: { id: string; v: ProductUnitInput }) => updateProductUnit(id, v),
    onSuccess: () => {
      toast.success("Unit updated");
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteProductUnit(id),
    onSuccess: () => {
      toast.success("Unit deleted");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const hasBase = units.some((u) => u.is_base);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Units & conversions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <UnitTable
          units={units}
          loading={isLoading}
          onEdit={setEditing}
          onDelete={(u) => {
            if (confirm(`Delete unit "${u.unit_name}"?`)) del.mutate(u.id);
          }}
        />

        {editing ? (
          <UnitForm
            key={editing.id}
            title="Edit unit"
            initial={{
              unit_name: editing.unit_name,
              factor_to_base: editing.factor_to_base,
              is_base: editing.is_base,
              barcode: editing.barcode ?? "",
              sort_order: editing.sort_order,
            }}
            submitLabel="Update unit"
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => update.mutate({ id: editing.id, v })}
          />
        ) : (
          <UnitForm
            title="Add unit"
            submitLabel="Add unit"
            submitDisabled={create.isPending}
            initial={{
              unit_name: "",
              factor_to_base: hasBase ? 0 : 1,
              is_base: !hasBase,
              barcode: "",
              sort_order: units.length,
            }}
            onSubmit={async (v) => create.mutate(v)}
          />
        )}

        <ConversionCalculator units={units} />
      </CardContent>
    </Card>
  );
}

function UnitTable({
  units,
  loading,
  onEdit,
  onDelete,
}: {
  units: ProductUnit[];
  loading: boolean;
  onEdit: (u: ProductUnit) => void;
  onDelete: (u: ProductUnit) => void;
}) {
  const base = units.find((u) => u.is_base);
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Factor → base</TableHead>
            <TableHead>Equals</TableHead>
            <TableHead>Barcode</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : units.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No units yet. Add a base unit first.
              </TableCell>
            </TableRow>
          ) : (
            units.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium" dir="auto">
                  {u.unit_name}
                  {u.is_base ? (
                    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      base
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-mono">{u.factor_to_base}</TableCell>
                <TableCell className="text-muted-foreground" dir="auto">
                  {base
                    ? `1 ${u.unit_name} = ${u.factor_to_base} ${base.unit_name}`
                    : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">{u.barcode ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(u)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function UnitForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  submitDisabled,
}: {
  title: string;
  initial: ProductUnitInput;
  submitLabel: string;
  onSubmit: (v: ProductUnitInput) => Promise<void> | void;
  onCancel?: () => void;
  submitDisabled?: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductUnitInput>({
    resolver: zodResolver(productUnitSchema),
    defaultValues: initial,
  });
  const isBase = watch("is_base");

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        await onSubmit(v);
        if (!onCancel) reset({ ...initial, unit_name: "", barcode: "", factor_to_base: 0, is_base: false });
      })}
      className="space-y-3 rounded-md border p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onCancel ? (
          <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Unit name *</Label>
          <Input dir="auto" placeholder="Tablet, Strip, Box…" {...register("unit_name")} />
          {errors.unit_name ? (
            <p className="text-xs text-destructive">{errors.unit_name.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Factor to base *</Label>
          <Input
            type="number"
            step="any"
            min={0}
            disabled={isBase}
            {...register("factor_to_base")}
          />
          <p className="text-xs text-muted-foreground">
            How many base units equal 1 of this unit. Base unit = 1.
          </p>
          {errors.factor_to_base ? (
            <p className="text-xs text-destructive">{errors.factor_to_base.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Barcode</Label>
          <Input dir="auto" {...register("barcode")} />
        </div>
        <div className="space-y-1.5">
          <Label>Sort order</Label>
          <Input type="number" min={0} {...register("sort_order")} />
        </div>
        <div className="flex items-center gap-2 md:col-span-2">
          <Switch
            checked={!!isBase}
            onCheckedChange={(v) => {
              setValue("is_base", v, { shouldDirty: true });
              if (v) setValue("factor_to_base", 1, { shouldDirty: true });
            }}
          />
          <Label>Mark as base unit (only one per product)</Label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting || submitDisabled}>
          <Plus className="h-4 w-4" /> {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ConversionCalculator({ units }: { units: ProductUnit[] }) {
  const [qty, setQty] = useState<number>(1);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");

  const fromUnit = useMemo(() => units.find((u) => u.id === fromId), [units, fromId]);
  const toUnit = useMemo(() => units.find((u) => u.id === toId), [units, toId]);

  const result = useMemo(() => {
    if (!fromUnit || !toUnit) return null;
    try {
      return convertUnits(qty, fromUnit, toUnit);
    } catch {
      return null;
    }
  }, [qty, fromUnit, toUnit]);

  if (units.length < 2) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <h3 className="mb-3 text-sm font-semibold">Conversion calculator</h3>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Quantity</Label>
          <Input
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>From</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.unit_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.unit_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Result</Label>
          <div className="rounded-md border bg-background px-3 py-2 font-mono text-sm">
            {result === null ? "—" : `${result.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${toUnit?.unit_name ?? ""}`}
          </div>
        </div>
      </div>
    </div>
  );
}
