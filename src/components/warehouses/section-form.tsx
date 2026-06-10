import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { sectionSchema, type SectionInput, type WarehouseSection } from "@/lib/warehouses";
import { toast } from "sonner";

interface Props {
  warehouseId: string;
  initial?: WarehouseSection;
  onSubmit: (values: SectionInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function SectionForm({ warehouseId, initial, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const [values, setValues] = useState<SectionInput>({
    warehouse_id: warehouseId,
    section_name: initial?.section_name ?? "",
    description: initial?.description ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = sectionSchema.safeParse(values);
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="section_name">Section name *</Label>
          <Input
            id="section_name"
            dir="auto"
            required
            value={values.section_name}
            onChange={(e) => setValues((v) => ({ ...v, section_name: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch
            id="section_active"
            checked={values.is_active}
            onCheckedChange={(c) => setValues((v) => ({ ...v, is_active: c }))}
          />
          <Label htmlFor="section_active">Active</Label>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="section_description">Description</Label>
        <Textarea
          id="section_description"
          dir="auto"
          rows={2}
          value={values.description ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
