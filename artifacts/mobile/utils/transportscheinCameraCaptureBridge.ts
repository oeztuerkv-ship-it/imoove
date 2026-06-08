import type { PickTransportImageOptions } from "@/utils/medicalScanCapture";

type CaptureListener = (open: boolean) => void;

let pendingResolve: ((dataUrl: string | null) => void) | null = null;
let pendingOpts: PickTransportImageOptions | undefined;
const listeners = new Set<CaptureListener>();

export function subscribeTransportscheinCameraCapture(listener: CaptureListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingTransportscheinCaptureOpts(): PickTransportImageOptions | undefined {
  return pendingOpts;
}

/** Öffnet die deutsche Kamera-Vorschau (Neu aufnehmen / Foto verwenden). */
export function requestTransportscheinCameraCapture(
  opts?: PickTransportImageOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    pendingResolve = resolve;
    pendingOpts = opts;
    for (const listener of listeners) listener(true);
  });
}

export function completeTransportscheinCameraCapture(dataUrl: string | null): void {
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingOpts = undefined;
  for (const listener of listeners) listener(false);
  resolve?.(dataUrl);
}

export function isTransportscheinCameraCaptureOpen(): boolean {
  return pendingResolve != null;
}
