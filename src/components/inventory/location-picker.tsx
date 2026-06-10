import { useQuery } from "@tanstack/react-query";
import { listSections, listWarehouses } from "@/lib/warehouses";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  warehouseId: string;
  sectionId: string;
  onChange: (next: { warehouseId: string; sectionId: string }) => void;
  warehouseLabel?: string;
  sectionLabel?: string;
  required?: boolean;
}

export function LocationPicker({
  warehouseId,
  sectionId,
  onChange,
  warehouseLabel = "Warehouse",
  sectionLabel = "Section",
}: Props) {
  const warehouses = useQuery({
    queryKey: ["warehouses", "active"],
    queryFn: () => listWarehouses(),
  });
  const sections = useQuery({
    queryKey: ["warehouse_sections", warehouseId],
    queryFn: () => listSections(warehouseId),
    enabled: !!warehouseId,
  });

  const whs = (warehouses.data ?? []).filter((w) => w.is_active);
  const secs = (sections.data ?? []).filter((s) => s.is_active);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{warehouseLabel}</Label>
        <Select
          value={warehouseId || undefined}
          onValueChange={(v) => onChange({ warehouseId: v, sectionId: "" })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select warehouse…" />
          </SelectTrigger>
          <SelectContent>
            {whs.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.warehouse_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{sectionLabel}</Label>
        <Select
          value={sectionId || undefined}
          onValueChange={(v) =>
            onChange({ warehouseId, sectionId: v === "__none__" ? "" : v })
          }
          disabled={!warehouseId}
        >
          <SelectTrigger>
            <SelectValue placeholder={warehouseId ? "Select section…" : "Pick a warehouse first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— No section —</SelectItem>
            {secs.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.section_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
