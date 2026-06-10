import { supabase } from "@/integrations/supabase/client";

export type BarcodeMatch =
  | { kind: "product"; product: any; unit?: any }
  | { kind: "unit"; product: any; unit: any }
  | { kind: "batch"; batch: any; product: any }
  | { kind: "none" };

/** Lookup a scanned barcode across products, product_units, and batches (by batch_number). */
export async function lookupBarcode(code: string): Promise<BarcodeMatch> {
  const trimmed = code.trim();
  if (!trimmed) return { kind: "none" };

  // 1) product barcode
  const { data: prod } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", trimmed)
    .maybeSingle();
  if (prod) return { kind: "product", product: prod };

  // 2) unit barcode
  const { data: unit } = await supabase
    .from("product_units")
    .select("*")
    .eq("barcode", trimmed)
    .maybeSingle();
  if (unit) {
    const { data: p } = await supabase
      .from("products")
      .select("*")
      .eq("id", unit.product_id)
      .maybeSingle();
    return { kind: "unit", product: p, unit };
  }

  // 3) batch number
  const { data: batch } = await supabase
    .from("inventory_batches")
    .select("*")
    .eq("batch_number", trimmed)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (batch) {
    const { data: p } = await supabase
      .from("products")
      .select("*")
      .eq("id", batch.product_id)
      .maybeSingle();
    return { kind: "batch", batch, product: p };
  }

  return { kind: "none" };
}

/** Check if a barcode is already in use (products or product_units). */
export async function isBarcodeTaken(
  code: string,
  ignore?: { productId?: string; unitId?: string },
): Promise<{ taken: boolean; where?: "product" | "unit" }> {
  const trimmed = code.trim();
  if (!trimmed) return { taken: false };
  const { data: p } = await supabase
    .from("products")
    .select("id")
    .eq("barcode", trimmed)
    .maybeSingle();
  if (p && p.id !== ignore?.productId) return { taken: true, where: "product" };
  const { data: u } = await supabase
    .from("product_units")
    .select("id")
    .eq("barcode", trimmed)
    .maybeSingle();
  if (u && u.id !== ignore?.unitId) return { taken: true, where: "unit" };
  return { taken: false };
}

/** Render a barcode/QR onto a canvas via bwip-js. */
export async function renderBarcode(
  canvas: HTMLCanvasElement,
  text: string,
  opts: { bcid?: string; scale?: number; height?: number; includetext?: boolean } = {},
) {
  const bwipjs = (await import("bwip-js/browser")).default;
  try {
    bwipjs.toCanvas(canvas, {
      bcid: opts.bcid ?? "code128",
      text,
      scale: opts.scale ?? 3,
      height: opts.height ?? 12,
      includetext: opts.includetext ?? true,
      textxalign: "center",
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("barcode render failed", e);
  }
}

/** Short beep using WebAudio — no asset needed. */
export function beep(ok = true) {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 120);
  } catch {
    /* ignore */
  }
}
