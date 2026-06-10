import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchProductsAutocomplete } from "@/lib/products";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PickedProduct {
  id: string;
  product_code: string;
  product_name: string;
  manufacturer: string | null;
}

interface Props {
  value: PickedProduct | null;
  onChange: (p: PickedProduct | null) => void;
  placeholder?: string;
}

export function ProductPicker({ value, onChange, placeholder }: Props) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PickedProduct[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!term.trim()) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await searchProductsAutocomplete(term);
        setSuggestions(res as PickedProduct[]);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }, [term]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" dir="auto">{value.product_name}</div>
          <div className="truncate text-xs text-muted-foreground font-mono">
            {value.product_code}
            {value.manufacturer ? ` · ${value.manufacturer}` : ""}
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          dir="auto"
          placeholder={placeholder ?? "Search product / ابحث عن المنتج…"}
          className="pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && suggestions.length > 0 ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s);
                setTerm("");
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <div className="font-medium" dir="auto">{s.product_name}</div>
              <div className="text-xs text-muted-foreground">
                {s.product_code}
                {s.manufacturer ? ` · ${s.manufacturer}` : ""}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type { PickedProduct };
