import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProductForm } from "@/components/products/product-form";
import { createProduct } from "@/lib/products";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/products/new")({
  component: NewProduct,
  head: () => ({ meta: [{ title: "New product — Clinic Inventory Hub" }] }),
});

function NewProduct() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader><CardTitle>New product</CardTitle></CardHeader>
        <CardContent>
          <ProductForm
            submitLabel="Create"
            onSubmit={async (values) => {
              try {
                const p = await createProduct(values, user?.id);
                toast.success(`Created ${p.product_code}`);
                navigate({ to: "/products/$id", params: { id: p.id } });
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
