import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/import/file-dropzone";
import {
  downloadInventoryTemplate,
  downloadProductTemplate,
  exportCurrentInventory,
  exportExpiryReport,
  exportLowStockReport,
  exportTransactions,
  importInventoryRows,
  importProductRows,
  parseExcelFile,
  validateInventoryRows,
  validateProductRows,
  type InventoryImportRow,
  type ProductImportRow,
} from "@/lib/excel-io";

export const Route = createFileRoute("/_authenticated/import-export")({
  component: ImportExportPage,
});

function ImportExportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Import / Export</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-load products and stock from Excel, or export reports and history.
        </p>
      </div>
      <Tabs defaultValue="import-products">
        <TabsList>
          <TabsTrigger value="import-products">Import Products</TabsTrigger>
          <TabsTrigger value="import-inventory">Import Stock-In</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
        </TabsList>
        <TabsContent value="import-products" className="mt-4">
          <ProductImportPanel />
        </TabsContent>
        <TabsContent value="import-inventory" className="mt-4">
          <InventoryImportPanel />
        </TabsContent>
        <TabsContent value="exports" className="mt-4">
          <ExportsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Products ----------
function ProductImportPanel() {
  const [rows, setRows] = useState<ProductImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setParsing(true);
    setRows([]);
    try {
      const raw = await parseExcelFile(file);
      const validated = await validateProductRows(raw);
      setRows(validated);
      toast.success(`Parsed ${validated.length} row(s)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const errorCount = rows.length - validCount;

  const doImport = async () => {
    setImporting(true);
    setProgress(0);
    const res = await importProductRows(rows, (d, t) => setProgress(t ? (d / t) * 100 : 100));
    setImporting(false);
    if (res.failures.length) {
      toast.error(`Imported ${res.inserted}; ${res.failures.length} failed, ${res.skipped} skipped`);
    } else {
      toast.success(`Imported ${res.inserted} product(s). ${res.skipped} skipped.`);
    }
    setRows([]);
    setFilename(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Bulk Product Import</CardTitle>
          <CardDescription>
            Upload an Excel file. Rows are validated before any database write.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={downloadProductTemplate}>
          <Download className="h-4 w-4" /> Template
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDropzone onFile={handleFile} />
        {filename && (
          <p className="text-xs text-muted-foreground">
            <FileSpreadsheet className="inline h-3 w-3" /> {filename}
          </p>
        )}
        {parsing && <p className="text-sm text-muted-foreground">Parsing…</p>}
        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="default">{validCount} valid</Badge>
              {errorCount > 0 && <Badge variant="destructive">{errorCount} error(s)</Badge>}
              <Button size="sm" onClick={doImport} disabled={importing || validCount === 0}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Import {validCount} row(s)
              </Button>
            </div>
            {importing && <Progress value={progress} />}
            <div className="max-h-[420px] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Reorder</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.row} className={r.errors.length ? "bg-destructive/10" : ""}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.data.product_name || <em className="text-muted-foreground">—</em>}</TableCell>
                      <TableCell>{r.data.product_code || "—"}</TableCell>
                      <TableCell>{r.data.base_unit}</TableCell>
                      <TableCell className="text-right">{r.data.reorder_level}</TableCell>
                      <TableCell>
                        {r.errors.length ? (
                          <span className="text-destructive text-xs">{r.errors.join("; ")}</span>
                        ) : r.warnings.length ? (
                          <span className="text-amber-600 text-xs">⚠ {r.warnings.join("; ")}</span>
                        ) : (
                          <span className="text-emerald-600 text-xs">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Inventory ----------
function InventoryImportPanel() {
  const [rows, setRows] = useState<InventoryImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setParsing(true);
    setRows([]);
    try {
      const raw = await parseExcelFile(file);
      const validated = await validateInventoryRows(raw);
      setRows(validated);
      toast.success(`Parsed ${validated.length} row(s)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const errorCount = rows.length - validCount;

  const doImport = async () => {
    setImporting(true);
    setProgress(0);
    const res = await importInventoryRows(rows, (d, t) => setProgress(t ? (d / t) * 100 : 100));
    setImporting(false);
    if (res.failures.length) {
      toast.error(`Posted ${res.inserted}; ${res.failures.length} failed, ${res.skipped} skipped`);
    } else {
      toast.success(`Posted ${res.inserted} stock-in transaction(s). ${res.skipped} skipped.`);
    }
    setRows([]);
    setFilename(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Bulk Stock-In Import</CardTitle>
          <CardDescription>
            Each row posts a stock-in transaction. Batches are auto-created from (product, warehouse, batch#, expiry).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={downloadInventoryTemplate}>
          <Download className="h-4 w-4" /> Template
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDropzone onFile={handleFile} />
        {filename && (
          <p className="text-xs text-muted-foreground">
            <FileSpreadsheet className="inline h-3 w-3" /> {filename}
          </p>
        )}
        {parsing && <p className="text-sm text-muted-foreground">Parsing…</p>}
        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="default">{validCount} valid</Badge>
              {errorCount > 0 && <Badge variant="destructive">{errorCount} error(s)</Badge>}
              <Button size="sm" onClick={doImport} disabled={importing || validCount === 0}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Post {validCount} stock-in
              </Button>
            </div>
            {importing && <Progress value={progress} />}
            <div className="max-h-[420px] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.row} className={r.errors.length ? "bg-destructive/10" : ""}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.raw.product_code}</TableCell>
                      <TableCell>{r.raw.warehouse_code}</TableCell>
                      <TableCell>{r.raw.section_name ?? "—"}</TableCell>
                      <TableCell>{r.raw.batch_number ?? "—"}</TableCell>
                      <TableCell>{r.raw.expiry_date ?? "—"}</TableCell>
                      <TableCell>{r.raw.unit_name}</TableCell>
                      <TableCell className="text-right">{r.raw.quantity}</TableCell>
                      <TableCell>
                        {r.errors.length ? (
                          <span className="text-destructive text-xs">{r.errors.join("; ")}</span>
                        ) : r.warnings.length ? (
                          <span className="text-amber-600 text-xs">⚠ {r.warnings.join("; ")}</span>
                        ) : (
                          <span className="text-emerald-600 text-xs">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Exports ----------
function ExportsPanel() {
  const tiles: { title: string; description: string; action: () => Promise<void> | void }[] = [
    {
      title: "Current Inventory",
      description: "All batches with quantity > 0 across warehouses.",
      action: exportCurrentInventory,
    },
    {
      title: "Transaction History",
      description: "Last 5,000 inventory transactions (all types).",
      action: () => exportTransactions(5000),
    },
    {
      title: "Expiry Report (90 days)",
      description: "Expired or expiring within 90 days.",
      action: () => exportExpiryReport(90),
    },
    {
      title: "Low Stock Report",
      description: "Products at or below reorder level.",
      action: exportLowStockReport,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tiles.map((t) => (
        <Card key={t.title}>
          <CardHeader>
            <CardTitle className="text-base">{t.title}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await t.action();
                  toast.success("Export ready");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Download className="h-4 w-4" /> Download Excel
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
