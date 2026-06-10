import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransactionForm } from "@/components/inventory/transaction-form";
import { TransferForm } from "@/components/inventory/transfer-form";
import { TransactionsTable } from "@/components/inventory/transactions-table";
import { FifoDispenseForm } from "@/components/inventory/fifo-dispense-form";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ClipboardList,
  History,
  Pill,
  Trash2,
  Boxes,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory Operations — Clinic Inventory Hub" }] }),
});

function InventoryPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Boxes className="h-6 w-6" /> Inventory Operations
        </h1>
        <p className="text-sm text-muted-foreground">
          Record stock movements. Quantities are derived from transactions —
          never edited directly.
        </p>
      </div>

      <Tabs defaultValue="stock_in" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="stock_in" className="gap-1.5">
            <ArrowDownToLine className="h-4 w-4" /> Stock In
          </TabsTrigger>
          <TabsTrigger value="dispensing" className="gap-1.5">
            <Pill className="h-4 w-4" /> Dispensing
          </TabsTrigger>
          <TabsTrigger value="fifo" className="gap-1.5">
            <Zap className="h-4 w-4" /> FIFO Dispense
          </TabsTrigger>
          <TabsTrigger value="transfer" className="gap-1.5">
            <ArrowLeftRight className="h-4 w-4" /> Transfer
          </TabsTrigger>
          <TabsTrigger value="disposal" className="gap-1.5">
            <Trash2 className="h-4 w-4" /> Disposal
          </TabsTrigger>
          <TabsTrigger value="count" className="gap-1.5">
            <ClipboardList className="h-4 w-4" /> Inventory Count
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock_in">
          <FormCard
            title="Stock In"
            description="Receive new stock. Different expiry dates create separate batches automatically."
          >
            <TransactionForm type="stock_in" />
          </FormCard>
        </TabsContent>
        <TabsContent value="dispensing">
          <FormCard title="Dispensing" description="Issue stock from a chosen batch. Expired batches are blocked.">
            <TransactionForm type="dispensing" />
          </FormCard>
        </TabsContent>
        <TabsContent value="fifo">
          <FormCard
            title="FIFO Dispense"
            description="Automatically allocate across batches by earliest expiry. Skips expired batches and supports partial allocation."
          >
            <FifoDispenseForm />
          </FormCard>
        </TabsContent>
        <TabsContent value="transfer">
          <FormCard
            title="Transfer between locations"
            description="Move stock between warehouses or sections. Posts a transfer-out at source and transfer-in at destination."
          >
            <TransferForm />
          </FormCard>
        </TabsContent>
        <TabsContent value="disposal">
          <FormCard title="Disposal" description="Write-off damaged, expired, or otherwise unusable stock.">
            <TransactionForm type="disposal" />
          </FormCard>
        </TabsContent>
        <TabsContent value="count">
          <FormCard
            title="Inventory Count"
            description="Set the absolute on-hand quantity for a batch after a physical count."
          >
            <TransactionForm type="inventory_count" />
          </FormCard>
        </TabsContent>
        <TabsContent value="history">
          <FormCard title="Transaction history" description="Full audit trail across all warehouses.">
            <TransactionsTable />
          </FormCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FormCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
