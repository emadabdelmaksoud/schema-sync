import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertTriangle, Database, Download, FileJson, FileSpreadsheet, History,
  RotateCcw, ShieldAlert, Trash2, UploadCloud,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import {
  BackupMetadata, BackupSnapshot, createExcelBackup, createJsonBackup,
  deleteBackupRecord, getBackupHistory, parseBackupFile, reDownloadJson,
  restoreSnapshot, RestoreValidation, validateSnapshot,
} from "@/lib/backup";

export const Route = createFileRoute("/_authenticated/backups")({
  component: BackupsPage,
});

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function BackupsPage() {
  const { role } = useAuth();
  if (!isAdmin(role)) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6" dir="auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Database className="h-6 w-6" /> Backup &amp; Restore
          </h1>
          <p className="text-sm text-muted-foreground">
            Snapshot the database, download Excel/JSON archives, and restore from a previous backup.
          </p>
        </div>
      </header>

      <Tabs defaultValue="create" className="space-y-4">
        <TabsList>
          <TabsTrigger value="create"><Download className="h-4 w-4 mr-1" /> Create Backup</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> History</TabsTrigger>
          <TabsTrigger value="restore"><RotateCcw className="h-4 w-4 mr-1" /> Restore</TabsTrigger>
        </TabsList>

        <TabsContent value="create"><CreateBackupCard /></TabsContent>
        <TabsContent value="history"><HistoryCard /></TabsContent>
        <TabsContent value="restore"><RestoreCard /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============= Create =============

function CreateBackupCard() {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"json" | "excel" | null>(null);

  const handleCreate = async (kind: "json" | "excel") => {
    setBusy(kind);
    try {
      const meta = kind === "json" ? await createJsonBackup(notes) : await createExcelBackup(notes);
      toast.success(`Backup created: ${meta.name}`);
      setNotes("");
    } catch (e: any) {
      toast.error(e?.message ?? "Backup failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileJson className="h-5 w-5" /> JSON Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Full structured snapshot of every table. This is the only format that can be restored back into the system.
          </p>
          <div className="space-y-2">
            <Label htmlFor="notes-json">Notes (optional)</Label>
            <Textarea id="notes-json" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. End-of-month snapshot" rows={2} />
          </div>
          <Button onClick={() => handleCreate("json")} disabled={busy !== null} className="w-full">
            <Download className="h-4 w-4 mr-1" />
            {busy === "json" ? "Building…" : "Create JSON Backup"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Excel Workbook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Human-readable workbook with one sheet per table (products, inventory, transactions, audit logs).
          </p>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
            Excel exports are for reporting/archival. Use JSON for restoring.
          </div>
          <Button onClick={() => handleCreate("excel")} disabled={busy !== null} className="w-full" variant="secondary">
            <Download className="h-4 w-4 mr-1" />
            {busy === "excel" ? "Building…" : "Create Excel Backup"}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Scheduled Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Scheduled backups are not enabled in this environment. As an admin you can manually create a backup
            on demand, or trigger one before any risky operation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============= History =============

function HistoryCard() {
  const [items, setItems] = useState<BackupMetadata[]>([]);
  const reload = () => setItems(getBackupHistory());
  useEffect(reload, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backup History</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No backups recorded yet on this device.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b) => {
                const totalRows = Object.values(b.counts).reduce((a, c) => a + c, 0);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{b.name}</TableCell>
                    <TableCell><Badge variant="outline">{b.kind.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-xs">{b.created_by_email ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatBytes(b.size_bytes)}</TableCell>
                    <TableCell className="text-right">{totalRows.toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {b.kind === "json" && (
                        <Button size="sm" variant="ghost"
                          onClick={() => { try { reDownloadJson(b); } catch (e: any) { toast.error(e.message); } }}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost"
                        onClick={() => { deleteBackupRecord(b.id); reload(); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============= Restore =============

function RestoreCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [snap, setSnap] = useState<BackupSnapshot | null>(null);
  const [validation, setValidation] = useState<RestoreValidation | null>(null);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [running, setRunning] = useState(false);

  const canRestore = useMemo(() => {
    if (!validation?.ok || !snap || running) return false;
    return confirmText.trim().toUpperCase() === "RESTORE";
  }, [validation, snap, running, confirmText]);

  const onPick = async (f: File | null) => {
    setFile(f);
    setSnap(null);
    setValidation(null);
    if (!f) return;
    try {
      const parsed = await parseBackupFile(f);
      const v = validateSnapshot(parsed);
      setValidation(v);
      if (v.ok && v.snapshot) setSnap(v.snapshot);
    } catch (e: any) {
      setValidation({ ok: false, errors: [`Could not parse file: ${e.message}`], warnings: [], counts: {} });
    }
  };

  const onRestore = async () => {
    if (!snap || !canRestore) return;
    setRunning(true);
    setProgress(0);
    try {
      await restoreSnapshot(snap, {
        wipe,
        onProgress: (msg, pct) => { setProgressMsg(msg); setProgress(pct); },
      });
      toast.success("Restore complete");
      setConfirmText("");
    } catch (e: any) {
      toast.error(`Restore failed: ${e?.message ?? e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="h-5 w-5" /> Restore From Backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <ShieldAlert className="h-4 w-4" /> Destructive operation
          </div>
          <p className="mt-1 text-muted-foreground">
            Restoring inserts rows from the backup file. Enable <em>Wipe target tables</em> to remove existing rows first.
            This action is audited. Admin only.
          </p>
        </div>

        <div>
          <Label>Backup file (.json)</Label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files?.[0] ?? null); }}
            className="mt-1 cursor-pointer rounded-md border border-dashed p-6 text-center text-sm hover:bg-accent/50"
          >
            <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" />
            <div className="mt-2">{file ? file.name : "Drop a .json backup here or click to browse"}</div>
            <input ref={inputRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        {validation && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={validation.ok ? "default" : "destructive"}>
                {validation.ok ? "Valid" : "Invalid"}
              </Badge>
              {snap && (
                <span className="text-xs text-muted-foreground">
                  Generated {new Date(snap.generated_at).toLocaleString()} by {snap.generated_by ?? "—"}
                </span>
              )}
            </div>
            {validation.errors.length > 0 && (
              <ul className="text-sm text-destructive list-disc ml-5">
                {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {validation.warnings.length > 0 && (
              <ul className="text-sm text-yellow-600 list-disc ml-5">
                {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {Object.keys(validation.counts).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(validation.counts).map(([t, n]) => (
                  <div key={t} className="rounded border bg-muted/30 px-2 py-1">
                    <div className="text-muted-foreground">{t}</div>
                    <div className="font-mono">{n.toLocaleString()} rows</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {validation?.ok && (
          <>
            <div className="flex items-start gap-2">
              <Checkbox id="wipe" checked={wipe} onCheckedChange={(v) => setWipe(!!v)} />
              <Label htmlFor="wipe" className="text-sm leading-snug">
                Wipe target tables before restore (delete existing rows, then insert from backup).
                Leave unchecked to <em>append</em> rows.
              </Label>
            </div>

            <div>
              <Label htmlFor="confirm">
                Type <span className="font-mono font-semibold">RESTORE</span> to confirm
              </Label>
              <Input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE" className="max-w-xs mt-1" />
            </div>

            {running && (
              <div className="space-y-1">
                <Progress value={progress} />
                <div className="text-xs text-muted-foreground">{progressMsg} ({progress}%)</div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={onRestore} disabled={!canRestore} variant="destructive">
                <RotateCcw className="h-4 w-4 mr-1" />
                {running ? "Restoring…" : wipe ? "Wipe & Restore" : "Append & Restore"}
              </Button>
              <Button variant="outline" onClick={() => { setFile(null); setSnap(null); setValidation(null); setConfirmText(""); }}
                disabled={running}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
