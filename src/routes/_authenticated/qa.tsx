import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RoleGuard } from "@/components/auth/role-guard";
import {
  generateSampleData, purgeQaData, runValidationReport,
  type SeedSummary, type ValidationReport,
} from "@/lib/qa";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/qa")({
  component: QaPage,
});

function QaPage() {
  return (
    <RoleGuard adminOnly>
      <QaInner />
    </RoleGuard>
  );
}

function QaInner() {
  const [productCount, setProductCount] = useState(8);
  const [warehouseCount, setWarehouseCount] = useState(2);
  const [batchesPerProduct, setBatchesPerProduct] = useState(3);
  const [seeding, setSeeding] = useState(false);
  const [purging, setPurging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [summary, setSummary] = useState<SeedSummary | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);

  async function handleSeed() {
    setSeeding(true);
    try {
      const s = await generateSampleData({ productCount, warehouseCount, batchesPerProduct });
      setSummary(s);
      toast.success(`Generated ${s.products} products, ${s.batches} batches.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate test data");
    } finally {
      setSeeding(false);
    }
  }

  async function handlePurge() {
    if (!confirm("Delete all QA-tagged sample data? This cannot be undone.")) return;
    setPurging(true);
    try {
      const r = await purgeQaData();
      toast.success(`Purged ${r.products} products, ${r.warehouses} warehouses, ${r.transactions} transactions.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to purge");
    } finally {
      setPurging(false);
    }
  }

  async function handleValidate() {
    setValidating(true);
    try {
      setReport(await runValidationReport());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FlaskConical className="h-6 w-6" /> QA &amp; Test Data
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate realistic sample data and run validation reports. Admin-only.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Generate sample data</CardTitle>
            <CardDescription>
              Creates QA-tagged products, warehouses, batches, and transactions including expired,
              near-expiry, and low-stock scenarios.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="pc">Products</Label>
                <Input id="pc" type="number" min={1} max={50}
                  value={productCount} onChange={(e) => setProductCount(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="wc">Warehouses</Label>
                <Input id="wc" type="number" min={1} max={10}
                  value={warehouseCount} onChange={(e) => setWarehouseCount(Number(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="bc">Batches / product</Label>
                <Input id="bc" type="number" min={1} max={10}
                  value={batchesPerProduct} onChange={(e) => setBatchesPerProduct(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSeed} disabled={seeding}>
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                Generate
              </Button>
              <Button variant="destructive" onClick={handlePurge} disabled={purging}>
                {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Purge QA data
              </Button>
            </div>
            {summary && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="grid grid-cols-2 gap-1">
                  <span>Products:</span><span className="text-right font-mono">{summary.products}</span>
                  <span>Warehouses:</span><span className="text-right font-mono">{summary.warehouses}</span>
                  <span>Batches:</span><span className="text-right font-mono">{summary.batches}</span>
                  <span>Transactions:</span><span className="text-right font-mono">{summary.transactions}</span>
                  <span>Expired batches:</span><span className="text-right font-mono">{summary.expired}</span>
                  <span>Near-expiry batches:</span><span className="text-right font-mono">{summary.nearExpiry}</span>
                  <span>Low-stock batches:</span><span className="text-right font-mono">{summary.lowStock}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validation report</CardTitle>
            <CardDescription>
              Scans the database for expired stock, near-expiry items, negative balances,
              missing units, and low-stock products.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleValidate} disabled={validating} variant="outline">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Run validation
            </Button>

            {report && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  {(["products", "warehouses", "batches", "transactions"] as const).map((k) => (
                    <div key={k} className="rounded-md border bg-muted/30 p-2">
                      <div className="font-mono text-lg">{report.totals[k]}</div>
                      <div className="capitalize text-muted-foreground">{k}</div>
                    </div>
                  ))}
                </div>
                <ul className="space-y-2">
                  {report.issues.map((i, idx) => (
                    <li key={idx} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                      {i.severity === "error" ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                      ) : i.severity === "warning" ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-600" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{i.category}</span>
                          <Badge variant={i.severity === "error" ? "destructive" : "secondary"}>
                            {i.count}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">{i.message}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Generated {new Date(report.generatedAt).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
