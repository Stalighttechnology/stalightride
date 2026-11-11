import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * Renders an "Install app" button when the browser fires the PWA install prompt.
 * Silently hides otherwise (unsupported browsers, already installed, iOS Safari).
 */
export function InstallPwaButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        deferred.prompt();
        try { await deferred.userChoice; } catch { /* ignore */ }
        setDeferred(null);
      }}
    >
      <Download className="mr-1.5 h-4 w-4" /> Install app
    </Button>
  );
}
