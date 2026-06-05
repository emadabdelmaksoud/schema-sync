import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Store as StoreIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/stores")({
  component: StoresPage,
});

function StoresPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>("none");

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => (await supabase.from("stores").select("*").order("created_at")).data ?? [],
  });

  const tops = stores.filter((s) => !s.parent_store_id);
  const subs = (pid: string) => stores.filter((s) => s.parent_store_id === pid);

  async function create() {
    if (!name) return;
    const { error } = await supabase.from("stores").insert({
      name,
      parent_store_id: parent === "none" ? null : parent,
    });
    if (error) return toast.error(error.message);
    toast.success("Store created");
    setOpen(false);
    setName("");
    setParent("none");
    qc.invalidateQueries({ queryKey: ["stores"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this store and its sub-stores?")) return;
    const { error } = await supabase.from("stores").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["stores"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Stores</h1>
          <p className="text-muted-foreground">Manage stores and sub-stores</p>
        </div>
        {role === "admin" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Store</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create store</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div>
                  <Label>Parent store (optional)</Label>
                  <Select value={parent} onValueChange={setParent}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None (top-level) —</SelectItem>
                      {tops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tops.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><StoreIcon className="h-5 w-5" />{s.name}</CardTitle>
              {role === "admin" && (
                <Button size="icon" variant="ghost" onClick={() => remove(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/stores/$storeId" params={{ storeId: s.id }} className="text-primary hover:underline text-sm">
                Open inventory →
              </Link>
              {subs(s.id).length > 0 && (
                <div className="border-l-2 pl-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Sub-stores</div>
                  {subs(s.id).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between">
                      <Link to="/stores/$storeId" params={{ storeId: sub.id }} className="text-sm hover:underline">{sub.name}</Link>
                      {role === "admin" && (
                        <Button size="icon" variant="ghost" onClick={() => remove(sub.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {tops.length === 0 && (
          <Card className="md:col-span-3"><CardContent className="p-12 text-center text-muted-foreground">
            No stores yet. {role === "admin" ? "Create one to get started." : "Ask an admin to create one."}
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}