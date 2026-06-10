import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { createWarehouse, type WarehouseInput } from "@/lib/warehouses";
import { WarehouseForm } from "@/components/warehouses/warehouse-form";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warehouses/new")({
  component: NewWarehousePage,
  head: () => ({ meta: [{ title: "New warehouse — Clinic Inventory Hub" }] }),
});

function NewWarehousePage() {
  const router = useRouter();
  const { user } = useAuth();

  const create = useMutation({
    mutationFn: (v: WarehouseInput) => createWarehouse(v, user?.id),
    onSuccess: (w) => {
      toast.success("Warehouse created");
      router.navigate({ to: "/warehouses/$id", params: { id: w.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New warehouse</h1>
      <WarehouseForm onSubmit={async (v) => { await create.mutateAsync(v); }} submitLabel="Create" />
    </div>
  );
}
