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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
}

export type ConfirmFn = (options: string | ConfirmOptions) => Promise<boolean>;

export interface PromptOptions {
  title?: string;
  description?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;
  variant?: "destructive" | "default";
}

export type PromptFn = (options: string | PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const PromptContext = createContext<PromptFn | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConfirmOptions>({});
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptConfig, setPromptConfig] = useState<PromptOptions>({});
  const [promptValue, setPromptValue] = useState("");
  const promptResolveRef = useRef<((value: string | null) => void) | null>(null);

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

  const prompt = useCallback<PromptFn>((opts) => {
    if (promptResolveRef.current) {
      promptResolveRef.current(null);
      promptResolveRef.current = null;
    }

    return new Promise<string | null>((resolve) => {
      promptResolveRef.current = resolve;
      if (typeof opts === "string") {
        setPromptConfig({
          title: opts,
          placeholder: "Enter details…",
          confirmText: "Submit",
          cancelText: "Cancel",
          required: true,
          variant: "default",
        });
        setPromptValue("");
      } else {
        setPromptConfig({
          title: opts.title ?? "Enter details",
          description: opts.description,
          label: opts.label,
          placeholder: opts.placeholder ?? "Enter details…",
          confirmText: opts.confirmText ?? "Submit",
          cancelText: opts.cancelText ?? "Cancel",
          required: opts.required ?? true,
          variant: opts.variant ?? "default",
        });
        setPromptValue(opts.defaultValue ?? "");
      }
      setPromptOpen(true);
    });
  }, []);

  const handlePromptClose = (result: string | null) => {
    setPromptOpen(false);
    const cb = promptResolveRef.current;
    promptResolveRef.current = null;
    if (cb) cb(result);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
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

      <Dialog
        open={promptOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) handlePromptClose(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-card border-border/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = promptValue.trim();
              if (promptConfig.required !== false && !trimmed) return;
              handlePromptClose(trimmed);
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle className="text-base font-bold">{promptConfig.title}</DialogTitle>
              {promptConfig.description && (
                <DialogDescription className="text-xs text-muted-foreground">
                  {promptConfig.description}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-1.5">
              {promptConfig.label && (
                <Label htmlFor="global-prompt-input" className="text-xs font-medium">
                  {promptConfig.label}
                </Label>
              )}
              <Input
                id="global-prompt-input"
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={promptConfig.placeholder}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePromptClose(null)}
              >
                {promptConfig.cancelText || "Cancel"}
              </Button>
              <Button
                type="submit"
                size="sm"
                variant={promptConfig.variant === "destructive" ? "destructive" : "default"}
                disabled={promptConfig.required !== false && !promptValue.trim()}
              >
                {promptConfig.confirmText || "Submit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </PromptContext.Provider>
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

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) {
    return (opts) => {
      const msg = typeof opts === "string" ? opts : (opts.title ?? "Enter details");
      return Promise.resolve(
        typeof window !== "undefined" && typeof window.prompt === "function"
          ? window.prompt(msg)
          : null,
      );
    };
  }
  return ctx;
}
