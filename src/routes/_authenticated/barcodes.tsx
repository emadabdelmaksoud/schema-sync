import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Printer, Package, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2 } from "lucide-react";
import { BarcodeScanner } from "@/components/barcode/barcode-scanner";
import { BarcodeImage } from "@/components/barcode/barcode-image";
import { lookupBarcode, beep, type BarcodeMatch } from "@/lib/barcode";
import { getDB } from "@/lib/local-db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/barcodes")({
  component: BarcodesPage,
});

function BarcodesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ScanLine className="h-6 w-6" /> Barcode & QR / الباركود
        </h1>
      </div>

      <Tabs defaultValue="scan" className="w-full">
        <TabsList>
          <TabsTrigger value="scan">Scan & Lookup</TabsTrigger>
          <TabsTrigger value="labels">Print Labels</TabsTrigger>
        </TabsList>
        <TabsContent value="scan" className="mt-4">
          <ScanLookupPanel />
        </TabsContent>
        <TabsContent value="labels" className="mt-4">
          <LabelsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------- Scan & Lookup ------------------------- */

function ScanLookupPanel() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ code: string; match: BarcodeMatch; at: string }>>([]);

  async function handle(code: string) {
    setOpen(false);
    const match = await lookupBarcode(code);
    if (match.kind === "none") {
      beep(false);
      toast.error(`Unknown barcode: ${code}`);
    } else {
      beep(true);
      toast.success(`Found ${match.kind}`);
    }
    setHistory((h) => [{ code, match, at: new Date().toLocaleTimeString() }, ...h].slice(0, 20));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Scanner</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={() => setOpen(true)} size="lg">
            <ScanLine className="h-5 w-5 mr-2" /> Open Scanner
          </Button>
          <p className="text-sm text-muted-foreground">
            Supports USB barcode readers and device camera. Sounds confirm scans.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scans yet.</p>
          ) : (
            <ul className="divide-y">
              {history.map((h, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {h.match.kind === "none" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-sm truncate">{h.code}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {h.match.kind === "product" && `Product: ${h.match.product?.product_name}`}
                        {h.match.kind === "unit" &&
                          `Unit ${h.match.unit?.unit_name} of ${h.match.product?.product_name}`}
                        {h.match.kind === "batch" &&
                          `Batch ${h.match.batch?.batch_number} of ${h.match.product?.product_name}`}
                        {h.match.kind === "none" && "Unknown"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{h.match.kind}</Badge>
                    {(h.match.kind === "product" || h.match.kind === "unit") && (
                      <Link
                        to="/products/$id"
                        params={{
                          id:
                            h.match.kind === "product"
                              ? h.match.product.id
                              : h.match.product.id,
                        }}
                      >
                        <Button size="sm" variant="outline">
                          <Package className="h-3.5 w-3.5 mr-1" /> Open
                        </Button>
                      </Link>
                    )}
                    <span className="text-xs text-muted-foreground">{h.at}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <BarcodeScanner open={open} onClose={() => setOpen(false)} onDetected={handle} />
    </div>
  );
}

/* --------------------------- Labels --------------------------- */

interface LabelRow {
  id: string;
  title: string;
  subtitle?: string;
  code: string;
}

function LabelsPanel() {
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [symbology, setSymbology] = useState<"code128" | "qrcode" | "ean13">("code128");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    getDB().then(async (db) => {
      const data = await db.getAll("products");
      const sorted = data.sort((a, b) => a.product_name.localeCompare(b.product_name));
      setProducts(sorted.slice(0, 500));
    });
  }, []);

  const filtered = products.filter(
    (p) =>
      !filter ||
      p.product_name?.toLowerCase().includes(filter.toLowerCase()) ||
      p.product_code?.toLowerCase().includes(filter.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(filter.toLowerCase()),
  );

  const labelRows: LabelRow[] = [];
  for (const p of products) {
    const n = selected[p.id] ?? 0;
    if (n > 0) {
      const code = p.barcode || p.product_code;
      for (let i = 0; i < n; i++) {
        labelRows.push({
          id: `${p.id}-${i}`,
          title: p.product_name,
          subtitle: p.manufacturer ?? p.product_code,
          code,
        });
      }
    }
  }

  if (showPreview) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 print:hidden">
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" onClick={() => setShowPreview(false)}>
            Back
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3 print:grid-cols-3">
          {labelRows.map((r) => (
            <div
              key={r.id}
              className="border rounded-md p-3 flex flex-col items-center justify-center text-center break-inside-avoid"
            >
              <div className="text-xs font-medium truncate w-full">{r.title}</div>
              {r.subtitle ? (
                <div className="text-[10px] text-muted-foreground truncate w-full mb-1">
                  {r.subtitle}
                </div>
              ) : null}
              <BarcodeImage text={r.code} bcid={symbology} scale={2} height={10} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate printable labels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label>Search products</Label>
            <Input
              dir="auto"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Name / code / barcode"
            />
          </div>
          <div>
            <Label>Symbology</Label>
            <select
              value={symbology}
              onChange={(e) => setSymbology(e.target.value as any)}
              className="block h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="code128">Code 128</option>
              <option value="ean13">EAN-13</option>
              <option value="qrcode">QR Code</option>
            </select>
          </div>
          <Button
            disabled={labelRows.length === 0}
            onClick={() => setShowPreview(true)}
          >
            Preview ({labelRows.length})
          </Button>
        </div>

        <div className="border rounded-md max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left p-2">Product</th>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Barcode</th>
                <th className="text-right p-2 w-32">Qty labels</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{p.product_name}</div>
                    {p.manufacturer ? (
                      <div className="text-xs text-muted-foreground">{p.manufacturer}</div>
                    ) : null}
                  </td>
                  <td className="p-2 font-mono text-xs">{p.product_code}</td>
                  <td className="p-2 font-mono text-xs">
                    {p.barcode ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      max={200}
                      className="h-8 w-20 ml-auto text-right"
                      value={selected[p.id] ?? 0}
                      onChange={(e) =>
                        setSelected((s) => ({
                          ...s,
                          [p.id]: Math.max(0, Math.min(200, Number(e.target.value) || 0)),
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                    No products match
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
