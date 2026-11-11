/** Ensures the Razorpay Checkout script is loaded on the page. */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    const w = window as any;
    if (w.Razorpay) return resolve(true);
    const existing = document.getElementById("razorpay-checkout-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = "razorpay-checkout-js";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export interface RazorpayCheckoutOptions {
  keyId: string;
  amount: number; // in paise
  currency: string;
  orderId: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  onDismiss?: () => void;
}

export async function openRazorpayCheckout(opts: RazorpayCheckoutOptions) {
  const ok = await loadRazorpayScript();
  if (!ok) throw new Error("Failed to load Razorpay Checkout");
  const w = window as any;
  const key = opts.keyId || (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_RAZORPAY_KEY_ID) || "";
  const rzp = new w.Razorpay({
    key,
    amount: opts.amount,
    currency: opts.currency,
    order_id: opts.orderId,
    name: opts.name,
    description: opts.description,
    prefill: opts.prefill,
    theme: { color: "#000000" },
    handler: (resp: any) => opts.onSuccess(resp),
    modal: { ondismiss: () => opts.onDismiss?.() },
  });
  rzp.open();
}
