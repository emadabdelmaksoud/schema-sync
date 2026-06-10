import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportToExcel, printPage } from "@/lib/reports";

export interface ReportColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
}

interface Props<T> {
  title: string;
  description?: string;
  rows: T[];
  columns: ReportColumn<T>[];
  isLoading?: boolean;
  filename?: string;
}

export function ReportTable<T>({
  title,
  description,
  rows,
  columns,
  isLoading,
  filename,
}: Props<T>) {
  const handleExport = () => {
    const data = rows.map((r) => {
      const obj: Record<string, unknown> = {};
      for (const c of columns) {
        obj[c.header] = c.accessor
          ? c.accessor(r)
          : (r as unknown as Record<string, unknown>)[c.key];
      }
      return obj;
    });
    exportToExcel(data, filename ?? title.toLowerCase().replace(/\s+/g, "_"), title);
  };
  return (
    <Card className="print:shadow-none print:border-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-0.5">{rows.length} row(s)</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows.length}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={printPage}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-6">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((r, idx) => (
                <TableRow key={(r as { id?: string })?.id ?? idx}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.align === "right" ? "text-right" : ""}>
                      {c.render
                        ? c.render(r)
                        : (((r as unknown as Record<string, unknown>)[c.key] as React.ReactNode) ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-6">
                  No data matching filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
