import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { warehouseSchema, type WarehouseInput, type Warehouse } from "@/lib/warehouses";
import { toast } from "sonner";

interface Props {
  initial?: Warehouse;
  onSubmit: (values: WarehouseInput) => Promise<void> | void;
  submitLabel?: string;
}

export function WarehouseForm({ initial, onSubmit, submitLabel = "Save" }: Props) {
  const [values, setValues] = useState<WarehouseInput>({
    warehouse_code: initial?.warehouse_code ?? "",
    warehouse_name: initial?.warehouse_name ?? "",
    description: initial?.description ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = warehouseSchema.safeParse(values);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
          return;
        }
        setBusy(true);
        try {
          await onSubmit(parsed.data);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="warehouse_code">Warehouse code</Label>
          <Input
            id="warehouse_code"
            placeholder="Auto-generated if empty"
            value={values.warehouse_code}
            onChange={(e) => setValues((v) => ({ ...v, warehouse_code: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="warehouse_name">Warehouse name *</Label>
          <Input
            id="warehouse_name"
            dir="auto"
            required
            value={values.warehouse_name}
            onChange={(e) => setValues((v) => ({ ...v, warehouse_name: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          dir="auto"
          rows={3}
          value={values.description ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="is_active"
          checked={values.is_active}
          onCheckedChange={(c) => setValues((v) => ({ ...v, is_active: c }))}
        />
        <Label htmlFor="is_active">Active</Label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
