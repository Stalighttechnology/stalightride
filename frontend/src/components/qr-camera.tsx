import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

/**
 * Live camera QR reader. Decodes frames with jsQR and reports the raw text.
 * Falls back to a clear message when camera access is unavailable.
 */
export function QrCamera({ onResult, active = true }: { onResult: (text: string) => void; active?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setRunning(true);

      const jsQR = (await import("jsqr")).default;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      const tick = () => {
        if (!videoRef.current || !streamRef.current) return;
        const v = videoRef.current;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (found?.data) {
            onResult(found.data);
            stop();
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setError(e?.message ?? "Camera unavailable on this device.");
      stop();
    }
  };

  useEffect(() => {
    if (active) start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-brand/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
        {!running && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Starting camera…</div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center gap-2 p-6 text-center">
            <CameraOff className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
      </div>
      {!running && (
        <Button variant="outline" className="w-full" onClick={start}>
          <Camera className="mr-2 h-4 w-4" />
          {error ? "Retry camera" : "Enable camera"}
        </Button>
      )}
    </div>
  );
}
