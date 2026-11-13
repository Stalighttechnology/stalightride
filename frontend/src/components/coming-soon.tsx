import { Clock } from "lucide-react";
import { toast } from "sonner";

/** For preview-only pages: nothing on them is saved, charged or credited yet. */
export function ComingSoonBanner({ feature }: { feature: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <Clock className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold">{feature} is coming soon</p>
        <p className="text-xs opacity-90">
          This is a preview. The figures shown are examples, and nothing here is saved, charged or
          credited yet.
        </p>
      </div>
    </div>
  );
}

export const comingSoon = () => toast.info("Coming soon. This feature isn't live yet.");
