import { getDB } from "./local-db";

export type BarcodeMatch =
  | { kind: "product"; product: unknown; unit?: unknown }
  | { kind: "unit"; product: unknown; unit: unknown }
  | { kind: "batch"; batch: unknown; product: unknown }
  | { kind: "none" };

export async function lookupBarcode(code: string): Promise<BarcodeMatch> {
  const trimmed = code.trim();
  if (!trimmed) return { kind: "none" };

  const db = await getDB();

  // 1) product barcode
  const products = await db.getAll("products");
  const prod = products.find((p) => p.barcode === trimmed);
  if (prod) return { kind: "product", product: prod };

  // 2) unit barcode
  const units = await db.getAll("product_units");
  const unit = units.find((u) => u.barcode === trimmed);
  if (unit) {
    const product = products.find((p) => p.id === unit.product_id);
    return { kind: "unit", product, unit };
  }

  // 3) batch number
  const batches = await db.getAll("inventory_batches");
  const batch = batches.find((b) => b.batch_number === trimmed);
  if (batch) {
    const product = products.find((p) => p.id === batch.product_id);
    return { kind: "batch", batch, product };
  }

  return { kind: "none" };
}

export async function isBarcodeTaken(
  code: string,
  ignore?: { productId?: string; unitId?: string }
): Promise<{ taken: boolean; where?: "product" | "unit" }> {
  const trimmed = code.trim();
  if (!trimmed) return { taken: false };

  const db = await getDB();
  const products = await db.getAll("products");
  const units = await db.getAll("product_units");

  const p = products.find((p) => p.barcode === trimmed);
  if (p && p.id !== ignore?.productId) return { taken: true, where: "product" };

  const u = units.find((u) => u.barcode === trimmed);
  if (u && u.id !== ignore?.unitId) return { taken: true, where: "unit" };

  return { taken: false };
}

export async function renderBarcode(
  canvas: HTMLCanvasElement,
  text: string,
  opts: { bcid?: string; scale?: number; height?: number; includetext?: boolean } = {}
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
    console.error("barcode render failed", e);
  }
}

export function beep(ok = true) {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
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
  } catch {}
}
