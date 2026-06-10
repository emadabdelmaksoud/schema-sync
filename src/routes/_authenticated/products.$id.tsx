import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProduct, updateProduct } from "@/lib/products";
import { ProductForm } from "@/components/products/product-form";
import { ProductUnitsManager } from "@/components/products/product-units-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/products/$id")({
  component: ProductDetails,
  head: () => ({ meta: [{ title: "Product — Clinic Inventory Hub" }] }),
});

function ProductDetails() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["product", id],
    queryFn: () => getProduct(id),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-destructive">Product not found.</p>;

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            {data.image_url ? (
              <img src={data.image_url} alt="" className="h-10 w-10 rounded object-cover border" />
            ) : null}
            <span dir="auto">{data.product_name}</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{data.product_code}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm
            submitLabel="Save changes"
            initial={{
              product_code: data.product_code,
              product_name: data.product_name,
              barcode: data.barcode ?? "",
              category: data.category ?? "",
              manufacturer: data.manufacturer ?? "",
              base_unit: data.base_unit,
              reorder_level: data.reorder_level,
              notes: data.notes ?? "",
              image_url: data.image_url ?? "",
            }}
            onSubmit={async (values) => {
              try {
                await updateProduct(id, values);
                toast.success("Saved");
                qc.invalidateQueries({ queryKey: ["product", id] });
                qc.invalidateQueries({ queryKey: ["products"] });
                navigate({ to: "/products" });
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        </CardContent>
      </Card>

      <ProductUnitsManager productId={id} />
    </div>
  );
}
