import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/print/dispensing/$storeId")({
  component: PrintDispensing,
});

function PrintDispensing() {
  const { storeId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["print-dispensing", storeId],
    queryFn: async () => {
      const [s, txs] = await Promise.all([
        supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
        supabase.from("transactions").select("*, items(name, unit)").eq("store_id", storeId).eq("status", "dispensing").order("created_at", { ascending: false }),
      ]);
      return { store: s.data, txs: txs.data ?? [] };
    },
  });

  useEffect(() => { if (data) setTimeout(() => window.print(), 300); }, [data]);

  return (
    <div className="p-8 bg-white text-black">
      <style>{`@media print { @page { size: A4; margin: 12mm; } button { display: none } }`}</style>
      <div className="flex justify-between items-end border-b pb-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Dispensing Report</h1>
          <div>Store: <strong>{data?.store?.name ?? ""}</strong></div>
        </div>
        <div>{new Date().toLocaleString()}</div>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="border-b">
          <th className="text-left p-1">S.No</th><th className="text-left p-1">Date</th>
          <th className="text-left p-1">Item</th><th className="text-right p-1">Qty</th>
          <th className="text-left p-1">Unit</th><th className="text-left p-1">Staff</th>
        </tr></thead>
        <tbody>
          {(data?.txs ?? []).map((t: any) => (
            <tr key={t.id} className="border-b">
              <td className="p-1">{t.serial_no}</td>
              <td className="p-1">{new Date(t.created_at).toLocaleDateString()}</td>
              <td className="p-1">{t.items?.name}</td>
              <td className="p-1 text-right">{Number(t.quantity)}</td>
              <td className="p-1">{t.items?.unit}</td>
              <td className="p-1">{t.staff_name_snapshot}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="mt-6 px-4 py-2 border rounded" onClick={() => window.print()}>Print again</button>
    </div>
  );
}