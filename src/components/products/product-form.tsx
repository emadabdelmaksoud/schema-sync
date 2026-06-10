import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput, uploadProductImage } from "@/lib/products";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  initial?: Partial<ProductInput>;
  onSubmit: (values: ProductInput) => Promise<void>;
  submitLabel?: string;
}

export function ProductForm({ initial, onSubmit, submitLabel = "Save" }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      product_code: "",
      product_name: "",
      barcode: "",
      category: "",
      manufacturer: "",
      base_unit: "unit",
      reorder_level: 0,
      notes: "",
      image_url: "",
      ...initial,
    },
  });
  const [uploading, setUploading] = useState(false);
  const imageUrl = watch("image_url");

  const handleImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setValue("image_url", url, { shouldDirty: true });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Product code" hint="Leave empty to auto-generate" error={errors.product_code?.message}>
          <Input dir="auto" placeholder="Auto" {...register("product_code")} />
        </Field>
        <Field label="Product name *" error={errors.product_name?.message}>
          <Input dir="auto" {...register("product_name")} />
        </Field>
        <Field label="Barcode" error={errors.barcode?.message}>
          <Input dir="auto" {...register("barcode")} />
        </Field>
        <Field label="Category" error={errors.category?.message}>
          <Input dir="auto" {...register("category")} />
        </Field>
        <Field label="Manufacturer" error={errors.manufacturer?.message}>
          <Input dir="auto" {...register("manufacturer")} />
        </Field>
        <Field label="Base unit *" error={errors.base_unit?.message}>
          <Input dir="auto" {...register("base_unit")} placeholder="unit, box, ml…" />
        </Field>
        <Field label="Reorder level" error={errors.reorder_level?.message}>
          <Input type="number" min={0} {...register("reorder_level")} />
        </Field>
        <Field label="Image" error={errors.image_url?.message}>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-12 w-12 rounded object-cover border" />
            ) : null}
            <Input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImage(f);
              }}
            />
          </div>
        </Field>
      </div>
      <Field label="Notes" error={errors.notes?.message}>
        <Textarea dir="auto" rows={3} {...register("notes")} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting || uploading}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
