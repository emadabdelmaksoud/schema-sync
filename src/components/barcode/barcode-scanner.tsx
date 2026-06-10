import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Keyboard, X } from "lucide-react";
import { beep } from "@/lib/barcode";
import type { IScannerControls } from "@zxing/browser";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
}

/**
 * Combined camera + USB scanner.
 * - USB barcode scanners emit fast keystrokes ending with Enter; the hidden input captures them.
 * - Camera mode uses ZXing for live decoding.
 */
export function BarcodeScanner({ open, onClose, onDetected, title }: Props) {
  const [mode, setMode] = useState<"camera" | "usb">("usb");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const usbInputRef = useRef<HTMLInputElement>(null);

  // USB / manual input — autofocus when active
  useEffect(() => {
    if (open && mode === "usb") {
      const t = setTimeout(() => usbInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, mode]);

  // Camera scanning
  useEffect(() => {
    if (!open || mode !== "camera") return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const deviceId =
          devices.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ??
          devices[0]?.deviceId;
        if (!deviceId) {
          setError("No camera found");
          return;
        }
        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText();
              beep(true);
              controls.stop();
              onDetected(text);
            }
          },
        );
        controlsRef.current = controls;
      } catch (e: any) {
        setError(e?.message ?? "Camera error");
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, mode, onDetected]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manual.trim()) {
      beep(true);
      onDetected(manual.trim());
      setManual("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? "Scan barcode / مسح الباركود"}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "usb" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("usb")}
            className="flex-1"
          >
            <Keyboard className="h-4 w-4 mr-1" /> USB / Manual
          </Button>
          <Button
            type="button"
            variant={mode === "camera" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("camera")}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-1" /> Camera
          </Button>
        </div>

        {mode === "usb" ? (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <Label htmlFor="usb-input">
              Scan with USB reader or type then press Enter
            </Label>
            <Input
              ref={usbInputRef}
              id="usb-input"
              dir="auto"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Barcode / QR…"
              autoComplete="off"
            />
            <Button type="submit" className="w-full">
              Submit
            </Button>
          </form>
        ) : (
          <div className="space-y-2">
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-1/3 w-3/4 border-2 border-primary/70 rounded-md" />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <p className="text-xs text-muted-foreground">
              Point camera at barcode/QR. Detection is automatic.
            </p>
          </div>
        )}

        <Button variant="ghost" onClick={onClose} className="mt-2">
          <X className="h-4 w-4 mr-1" /> Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
