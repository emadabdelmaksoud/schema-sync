import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Boxes, DatabaseBackup, FileBarChart, FileSpreadsheet, FlaskConical,
  LayoutDashboard, Package, ScanLine, ScrollText, Settings, Users, Warehouse,
  Bell,
} from "lucide-react";

type Item = { label: string; to: string; icon: React.ComponentType<{ className?: string }>; group: string };

const ITEMS: Item[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "Navigation" },
  { label: "Products", to: "/products", icon: Package, group: "Navigation" },
  { label: "Warehouses", to: "/warehouses", icon: Warehouse, group: "Navigation" },
  { label: "Inventory", to: "/inventory", icon: Boxes, group: "Navigation" },
  { label: "Reports", to: "/reports", icon: FileBarChart, group: "Navigation" },
  { label: "Import / Export", to: "/import-export", icon: FileSpreadsheet, group: "Tools" },
  { label: "Barcodes", to: "/barcodes", icon: ScanLine, group: "Tools" },
  { label: "Notifications", to: "/notifications", icon: Bell, group: "Tools" },
  { label: "Users", to: "/users", icon: Users, group: "Admin" },
  { label: "Audit logs", to: "/audit-logs", icon: ScrollText, group: "Admin" },
  { label: "Backups", to: "/backups", icon: DatabaseBackup, group: "Admin" },
  { label: "Settings", to: "/settings", icon: Settings, group: "Admin" },
  { label: "QA", to: "/qa", icon: FlaskConical, group: "Admin" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = Array.from(new Set(ITEMS.map((i) => i.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions…  (⌘K)" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {groups.map((g, idx) => (
          <div key={g}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {ITEMS.filter((i) => i.group === g).map((i) => (
                <CommandItem
                  key={i.to}
                  value={`${i.label} ${i.to}`}
                  onSelect={() => {
                    setOpen(false);
                    router.navigate({ to: i.to });
                  }}
                >
                  <i.icon className="mr-2 h-4 w-4" />
                  <span>{i.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{i.to}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
