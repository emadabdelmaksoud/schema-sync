import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Package, AlertTriangle, Clock, ArrowLeftRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const COLORS = ["hsl(var(--primary))", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444"];

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [items, txs, transfers, stores] = await Promise.all([
        supabase.from("items").select("id, name, current_quantity, expiry_date, department, store_id"),
        supabase.from("transactions").select("id, status, quantity, department, created_at, store_id"),
        supabase.from("transfer_requests").select("id, status"),
        supabase.from("stores").select("id, name"),
      ]);
      return {
        items: items.data ?? [],
        txs: txs.data ?? [],
        transfers: transfers.data ?? [],
        stores: stores.data ?? [],
      };
    },
  });

  const items = stats?.items ?? [];
  const txs = stats?.txs ?? [];
  const transfers = stats?.transfers ?? [];
  const stores = stats?.stores ?? [];
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400000);
  const lowStock = items.filter((i) => Number(i.current_quantity) <= 10).length;
  const expiring = items.filter((i) => i.expiry_date && new Date(i.expiry_date) <= soon && new Date(i.expiry_date) >= now).length;
  const pending = transfers.filter((t) => t.status === "pending").length;

  const byDept = ["pharmacy", "supplies"].map((d) => ({
    name: d,
    items: items.filter((i) => i.department === d).length,
    dispensed: txs.filter((t) => t.department === d && t.status === "dispensing").reduce((a, t) => a + Number(t.quantity), 0),
    added: txs.filter((t) => t.department === d && t.status === "added").reduce((a, t) => a + Number(t.quantity), 0),
  }));

  const byStatus = ["added", "dispensing", "transferred", "expired"].map((s) => ({
    name: s,
    value: txs.filter((t) => t.status === s).length,
  }));

  const byStore = stores.map((s) => ({
    name: s.name,
    items: items.filter((i) => i.store_id === s.id).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview across all stores and departments</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Items" value={items.length} icon={Package} />
        <StatCard label="Low Stock (≤10)" value={lowStock} icon={AlertTriangle} accent="text-orange-500" />
        <StatCard label="Expiring < 30d" value={expiring} icon={Clock} accent="text-red-500" />
        <StatCard label="Pending Transfers" value={pending} icon={ArrowLeftRight} accent="text-blue-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>By Department</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDept}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="items" fill="hsl(var(--primary))" />
                <Bar dataKey="added" fill="#10b981" />
                <Bar dataKey="dispensed" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Transactions by Status</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" outerRadius={90} label>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Items per Store</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStore}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="items" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-bold">{value}</div>
        </div>
        <Icon className={`h-8 w-8 ${accent ?? "text-primary"}`} />
      </CardContent>
    </Card>
  );
}