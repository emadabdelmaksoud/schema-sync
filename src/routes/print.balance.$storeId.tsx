import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/print/balance/$storeId")({
  component: PrintBalance,
});

function PrintBalance() {
  const { storeId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["print-balance", storeId],
    queryFn: async () => {
      const [s, items] = await Promise.all([
        supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
        supabase.from("items").select("*").eq("store_id", storeId).order("name"),
      ]);
      return { store: s.data, items: items.data ?? [] };
    },
  });

  useEffect(() => {
    if (data) setTimeout(() => window.print(), 300);
  }, [data]);

  return (
    <div className="p-8 bg-white text-black">
      <style>{`@media print { @page { size: A4; margin: 12mm; } button { display: none } }`}</style>
      <div className="flex justify-between items-end border-b pb-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Current Balance</h1>
          <div>Store: <strong>{data?.store?.name ?? ""}</strong></div>
        </div>
        <div>{new Date().toLocaleString()}</div>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="border-b">
          <th className="text-left p-1">S.No</th><th className="text-left p-1">Name</th>
          <th className="text-left p-1">Department</th><th className="text-right p-1">Quantity</th>
          <th className="text-left p-1">Unit</th><th className="text-left p-1">Expiry</th>
        </tr></thead>
        <tbody>
          {(data?.items ?? []).map((it, i) => (
            <tr key={it.id} className="border-b">
              <td className="p-1">{i + 1}</td>
              <td className="p-1">{it.name}</td>
              <td className="p-1 capitalize">{it.department}</td>
              <td className="p-1 text-right">{Number(it.current_quantity)}</td>
              <td className="p-1">{it.unit}</td>
              <td className="p-1">{it.expiry_date ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-12 grid grid-cols-2 gap-12 text-sm">
        <div>__________________________<br />Prepared by</div>
        <div>__________________________<br />Verified by</div>
      </div>
      <button className="mt-6 px-4 py-2 border rounded" onClick={() => window.print()}>Print again</button>
    </div>
  );
}