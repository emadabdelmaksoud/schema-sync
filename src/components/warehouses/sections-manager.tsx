import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSection,
  deleteSection,
  listSections,
  setSectionActive,
  updateSection,
  type SectionInput,
  type WarehouseSection,
} from "@/lib/warehouses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SectionForm } from "./section-form";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export function SectionsManager({ warehouseId }: { warehouseId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WarehouseSection | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["warehouse-sections", warehouseId, search],
    queryFn: () => listSections(warehouseId, search),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["warehouse-sections", warehouseId] });

  const create = useMutation({
    mutationFn: (v: SectionInput) => createSection(v),
    onSuccess: () => { toast.success("Section added"); setAdding(false); inv(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const update = useMutation({
    mutationFn: ({ id, v }: { id: string; v: SectionInput }) => updateSection(id, v),
    onSuccess: () => { toast.success("Section updated"); setEditing(null); inv(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setSectionActive(id, active),
    onSuccess: inv,
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteSection(id),
    onSuccess: () => { toast.success("Section deleted"); inv(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Sections</h2>
        <div className="flex items-center gap-2">
          <Input
            dir="auto"
            placeholder="Search sections…"
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button size="sm" onClick={() => { setAdding(true); setEditing(null); }}>
            <Plus className="h-4 w-4" /> Add section
          </Button>
        </div>
      </div>

      {adding && (
        <div className="rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium">New section</h3>
            <Button variant="ghost" size="icon" onClick={() => setAdding(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SectionForm
            warehouseId={warehouseId}
            onSubmit={async (v) => { await create.mutateAsync(v); }}
            onCancel={() => setAdding(false)}
            submitLabel="Add"
          />
        </div>
      )}

      {editing && (
        <div className="rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium">Edit section</h3>
            <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SectionForm
            warehouseId={warehouseId}
            initial={editing}
            onSubmit={async (v) => { await update.mutateAsync({ id: editing.id, v }); }}
            onCancel={() => setEditing(null)}
            submitLabel="Update"
          />
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No sections yet.</TableCell></TableRow>
            ) : (
              data!.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium" dir="auto">{s.section_name}</TableCell>
                  <TableCell dir="auto" className="text-muted-foreground">{s.description ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "default" : "secondary"}>
                      {s.is_active ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggle.mutate({ id: s.id, active: !s.is_active })}
                      >
                        {s.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setAdding(false); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { if (confirm(`Delete section "${s.section_name}"?`)) remove.mutate(s.id); }}
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
