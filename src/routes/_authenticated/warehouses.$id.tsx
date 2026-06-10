import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWarehouse, updateWarehouse, type WarehouseInput } from "@/lib/warehouses";
import { WarehouseForm } from "@/components/warehouses/warehouse-form";
import { SectionsManager } from "@/components/warehouses/sections-manager";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warehouses/$id")({
  component: WarehouseDetailPage,
  head: () => ({ meta: [{ title: "Warehouse — Clinic Inventory Hub" }] }),
});

function WarehouseDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["warehouse", id],
    queryFn: () => getWarehouse(id),
  });

  const update = useMutation({
    mutationFn: (v: WarehouseInput) => updateWarehouse(id, v),
    onSuccess: () => {
      toast.success("Warehouse updated");
      qc.invalidateQueries({ queryKey: ["warehouse", id] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-muted-foreground">Warehouse not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link to="/warehouses"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
          <h1 className="text-2xl font-semibold" dir="auto">{data.warehouse_name}</h1>
          <p className="font-mono text-xs text-muted-foreground">{data.warehouse_code}</p>
        </div>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Details</h2>
        <WarehouseForm
          initial={data}
          onSubmit={async (v) => { await update.mutateAsync(v); }}
          submitLabel="Update"
        />
      </section>

      <section className="rounded-lg border p-4">
        <SectionsManager warehouseId={id} />
      </section>
    </div>
  );
}
