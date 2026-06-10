import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { searchProductsAutocomplete } from "@/lib/products";
import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function ProductSearch({ value, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<Array<{ id: string; product_code: string; product_name: string; manufacturer: string | null }>>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await searchProductsAutocomplete(value);
        setSuggestions(res);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }, [value]);

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          dir="auto"
          placeholder="Search products / ابحث عن المنتجات…"
          className="pl-9"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && suggestions.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <Link
              key={s.id}
              to="/products/$id"
              params={{ id: s.id }}
              className="block px-3 py-2 text-sm hover:bg-accent"
            >
              <div className="font-medium">{s.product_name}</div>
              <div className="text-xs text-muted-foreground">
                {s.product_code}
                {s.manufacturer ? ` · ${s.manufacturer}` : ""}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
