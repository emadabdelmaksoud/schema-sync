import { useEffect, useRef } from "react";
import { renderBarcode } from "@/lib/barcode";

interface Props {
  text: string;
  bcid?: string; // e.g. "code128", "qrcode", "ean13"
  scale?: number;
  height?: number;
  includetext?: boolean;
  className?: string;
}

export function BarcodeImage({ text, bcid = "code128", scale = 3, height = 12, includetext = true, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && text) renderBarcode(ref.current, text, { bcid, scale, height, includetext });
  }, [text, bcid, scale, height, includetext]);
  return <canvas ref={ref} className={className} />;
}
