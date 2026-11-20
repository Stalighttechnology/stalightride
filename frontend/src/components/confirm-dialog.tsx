import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
}

export type ConfirmFn = (options: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConfirmOptions>({});
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;

      if (typeof opts === "string") {
        const qIndex = opts.indexOf("?");
        if (qIndex !== -1 && qIndex < opts.length - 1) {
          const title = opts.slice(0, qIndex + 1).trim();
          const description = opts.slice(qIndex + 1).trim();
          setConfig({
            title,
            description,
            confirmText: "Yes, proceed",
            cancelText: "Cancel",
            variant: "destructive",
          });
        } else {
          setConfig({
            title: opts.endsWith("?") ? opts : "Are you sure?",
            description: opts.endsWith("?") ? "" : opts,
            confirmText: "Confirm",
            cancelText: "Cancel",
            variant: "destructive",
          });
        }
      } else {
        setConfig({
          title: opts.title ?? "Are you sure?",
          description: opts.description,
          confirmText: opts.confirmText ?? "Confirm",
          cancelText: opts.cancelText ?? "Cancel",
          variant: opts.variant ?? "destructive",
        });
      }

      setOpen(true);
    });
  }, []);

  const handleClose = (result: boolean) => {
    setOpen(false);
    const cb = resolveRef.current;
    resolveRef.current = null;
    if (cb) cb(result);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleClose(false);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold tracking-tight">
              {config.title}
            </AlertDialogTitle>
            {config.description ? (
              <AlertDialogDescription className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {config.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
            <AlertDialogCancel
              onClick={(e) => {
                e.preventDefault();
                handleClose(false);
              }}
            >
              {config.cancelText || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleClose(true);
              }}
              className={
                config.variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {config.confirmText || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function fallbackConfirm(opts: string | ConfirmOptions): Promise<boolean> {
  const msg =
    typeof opts === "string"
      ? opts
      : [opts.title, opts.description].filter(Boolean).join("\n\n");
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(msg) : true,
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return fallbackConfirm;
  }
  return ctx;
}
