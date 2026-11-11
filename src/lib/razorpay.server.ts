/**
 * Razorpay server configuration and credentials helper.
 * Reads keys from environment variables and provides automatic .env loading in dev.
 */

export function getRazorpayCredentials() {
  if (!process.env.RAZORPAY_KEY_ID && typeof (process as any).loadEnvFile === "function") {
    try {
      (process as any).loadEnvFile();
    } catch {}
  }

  const keyId =
    process.env.RAZORPAY_KEY_ID ||
    process.env.VITE_RAZORPAY_KEY_ID ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_RAZORPAY_KEY_ID);

  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your environment.");
  }

  return { keyId, keySecret };
}
