import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Upload, Settings as SettingsIcon, Loader2 } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_SETTINGS,
  loadAllSettings,
  saveSettingsCategory,
  uploadClinicLogo,
  type AllSettings,
  type SettingsCategory,
} from "@/lib/settings";
import { listWarehouses, type Warehouse } from "@/lib/warehouses";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RoleGuard adminOnly>
      <SettingsContent />
    </RoleGuard>
  );
}

function SettingsContent() {
  const [settings, setSettings] = useState<AllSettings>(DEFAULT_SETTINGS);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SettingsCategory | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, w] = await Promise.all([loadAllSettings(), listWarehouses().catch(() => [])]);
        setSettings(s);
        setWarehouses(w);
      } catch (e) {
        toast.error("Failed to load settings", { description: (e as Error).message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function update<C extends SettingsCategory>(category: C, patch: Partial<AllSettings[C]>) {
    setSettings((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }));
  }

  async function save<C extends SettingsCategory>(category: C) {
    setSaving(category);
    try {
      await saveSettingsCategory(category, settings[category]);
      toast.success(`${category} settings saved`);
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setSaving(null);
    }
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadClinicLogo(file);
      update("clinic", { logo_url: url });
      toast.success("Logo uploaded — remember to save");
    } catch (err) {
      toast.error("Upload failed", { description: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-bold">System Settings</h1>
      </div>

      <Tabs defaultValue="clinic" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="barcode">Barcode</TabsTrigger>
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        {/* CLINIC */}
        <TabsContent value="clinic">
          <Card>
            <CardHeader>
              <CardTitle>Clinic Information</CardTitle>
              <CardDescription>Identity shown on receipts, reports, and headers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Clinic name">
                  <Input
                    value={settings.clinic.name}
                    onChange={(e) => update("clinic", { name: e.target.value })}
                    maxLength={200}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={settings.clinic.phone}
                    onChange={(e) => update("clinic", { phone: e.target.value })}
                    maxLength={50}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={settings.clinic.email}
                    onChange={(e) => update("clinic", { email: e.target.value })}
                    maxLength={200}
                  />
                </Field>
                <Field label="Address">
                  <Textarea
                    value={settings.clinic.address}
                    onChange={(e) => update("clinic", { address: e.target.value })}
                    maxLength={500}
                    rows={2}
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex items-center gap-4">
                  {settings.clinic.logo_url ? (
                    <img
                      src={settings.clinic.logo_url}
                      alt="Clinic logo"
                      className="h-16 w-16 rounded border object-contain"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                      No logo
                    </div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onLogoChange}
                      disabled={uploading}
                    />
                  </label>
                  {settings.clinic.logo_url && (
                    <Button variant="ghost" size="sm" onClick={() => update("clinic", { logo_url: null })}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              <SaveBar saving={saving === "clinic"} onSave={() => save("clinic")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVENTORY */}
        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Settings</CardTitle>
              <CardDescription>Thresholds and defaults for stock management.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Low stock threshold (units)">
                  <Input
                    type="number"
                    min={0}
                    value={settings.inventory.low_stock_threshold}
                    onChange={(e) =>
                      update("inventory", { low_stock_threshold: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Near expiry threshold (days)">
                  <Input
                    type="number"
                    min={1}
                    value={settings.inventory.near_expiry_days}
                    onChange={(e) =>
                      update("inventory", { near_expiry_days: Number(e.target.value) || 1 })
                    }
                  />
                </Field>
                <Field label="Default warehouse">
                  <Select
                    value={settings.inventory.default_warehouse_id ?? "__none__"}
                    onValueChange={(v) =>
                      update("inventory", { default_warehouse_id: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.warehouse_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <ToggleField
                label="Enable FIFO dispensing"
                description="First-In-First-Out: dispense the oldest batch first."
                checked={settings.inventory.fifo_enabled}
                onChange={(v) => update("inventory", { fifo_enabled: v })}
              />
              <ToggleField
                label="Strict expiry priority"
                description="Prefer the nearest expiry over the oldest receive date."
                checked={settings.inventory.fifo_strict_expiry}
                onChange={(v) => update("inventory", { fifo_strict_expiry: v })}
              />

              <SaveBar saving={saving === "inventory"} onSave={() => save("inventory")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BARCODE */}
        <TabsContent value="barcode">
          <Card>
            <CardHeader>
              <CardTitle>Barcode Settings</CardTitle>
              <CardDescription>Format and label preferences for printed barcodes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Barcode format">
                  <Select
                    value={settings.barcode.format}
                    onValueChange={(v) => update("barcode", { format: v as AllSettings["barcode"]["format"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CODE128">CODE128</SelectItem>
                      <SelectItem value="EAN13">EAN-13</SelectItem>
                      <SelectItem value="CODE39">CODE39</SelectItem>
                      <SelectItem value="UPC">UPC</SelectItem>
                      <SelectItem value="QR">QR Code</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Label template">
                  <Select
                    value={settings.barcode.label_template}
                    onValueChange={(v) =>
                      update("barcode", { label_template: v as AllSettings["barcode"]["label_template"] })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (40×20mm)</SelectItem>
                      <SelectItem value="medium">Medium (60×30mm)</SelectItem>
                      <SelectItem value="large">Large (80×40mm)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Labels per row (print)">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.barcode.labels_per_row}
                    onChange={(e) =>
                      update("barcode", { labels_per_row: Number(e.target.value) || 1 })
                    }
                  />
                </Field>
              </div>

              <ToggleField
                label="Include price on label"
                checked={settings.barcode.include_price}
                onChange={(v) => update("barcode", { include_price: v })}
              />
              <ToggleField
                label="Show barcode text under bars"
                checked={settings.barcode.include_barcode_text}
                onChange={(v) => update("barcode", { include_barcode_text: v })}
              />

              <SaveBar saving={saving === "barcode"} onSave={() => save("barcode")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* APPLICATION */}
        <TabsContent value="application">
          <Card>
            <CardHeader>
              <CardTitle>Application Settings</CardTitle>
              <CardDescription>Locale, appearance and formatting preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Language">
                  <Select
                    value={settings.application.language}
                    onValueChange={(v) =>
                      update("application", { language: v as AllSettings["application"]["language"] })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar">العربية (Arabic)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Theme">
                  <Select
                    value={settings.application.theme}
                    onValueChange={(v) =>
                      update("application", { theme: v as AllSettings["application"]["theme"] })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Date format">
                  <Select
                    value={settings.application.date_format}
                    onValueChange={(v) =>
                      update("application", {
                        date_format: v as AllSettings["application"]["date_format"],
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Time zone">
                  <Input
                    value={settings.application.time_zone}
                    onChange={(e) => update("application", { time_zone: e.target.value })}
                    placeholder="e.g. UTC, Asia/Riyadh, Africa/Cairo"
                    maxLength={100}
                  />
                </Field>
              </div>

              <SaveBar saving={saving === "application"} onSave={() => save("application")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BACKUP */}
        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle>Backup Settings</CardTitle>
              <CardDescription>Retention and default preferences for backups.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Retention (days)">
                  <Input
                    type="number"
                    min={1}
                    value={settings.backup.retention_days}
                    onChange={(e) =>
                      update("backup", { retention_days: Number(e.target.value) || 1 })
                    }
                  />
                </Field>
                <Field label="Default format">
                  <Select
                    value={settings.backup.format}
                    onValueChange={(v) =>
                      update("backup", { format: v as AllSettings["backup"]["format"] })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="excel">Excel</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <ToggleField
                label="Enable auto backups"
                description="Placeholder for scheduled backups."
                checked={settings.backup.auto_backup_enabled}
                onChange={(v) => update("backup", { auto_backup_enabled: v })}
              />
              <ToggleField
                label="Include audit logs in backups"
                checked={settings.backup.include_audit_logs}
                onChange={(v) => update("backup", { include_audit_logs: v })}
              />

              <SaveBar saving={saving === "backup"} onSave={() => save("backup")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end pt-2">
      <Button onClick={onSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save changes
      </Button>
    </div>
  );
}
