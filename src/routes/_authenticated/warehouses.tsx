import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteWarehouse,
  listWarehouses,
  setWarehouseActive,
  type Warehouse,
} from "@/lib/warehouses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warehouses")({
  component: WarehousesPage,
  head: () => ({ meta: [{ title: "Warehouses — Clinic Inventory Hub" }] }),
});

function WarehousesPage() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["warehouses", search],
    queryFn: () => listWarehouses(search),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["warehouses"] });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setWarehouseActive(id, active),
    onSuccess: inv,
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: () => { toast.success("Warehouse deleted"); inv(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const list: Warehouse[] = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6" /> Warehouses
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage storage locations and their sections.
          </p>
        </div>
        <Button asChild>
          <Link to="/warehouses/new">
            <Plus className="h-4 w-4" /> New warehouse
          </Link>
        </Button>
      </div>

      <Input
        dir="auto"
        placeholder="Search warehouses by name, code, or description…"
        className="max-w-md"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : list.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No warehouses yet.</TableCell></TableRow>
            ) : (
              list.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.warehouse_code}</TableCell>
                  <TableCell className="font-medium" dir="auto">
                    <Link to="/warehouses/$id" params={{ id: w.id }} className="hover:underline">
                      {w.warehouse_name}
                    </Link>
                  </TableCell>
                  <TableCell dir="auto" className="text-muted-foreground max-w-md truncate">
                    {w.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={w.is_active ? "default" : "secondary"}>
                      {w.is_active ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggle.mutate({ id: w.id, active: !w.is_active })}
                      >
                        {w.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to="/warehouses/$id" params={{ id: w.id }}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete "${w.warehouse_name}" and all its sections?`)) remove.mutate(w.id);
                        }}
                      >
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
    </div>
  );
}
