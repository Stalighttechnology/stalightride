/**
 * Server actions that run on the Django backend (backend/payments/views.py):
 * Razorpay orders and signature checks, wallet top-up, QR lookup, handover
 * and trip inspection. Each throws an Error with the server's message on failure.
 */
import { api } from "@/lib/api";

type Input<T> = { data: T };
type RazorpayOrder = { orderId: string; amount: number; currency: string; keyId: string };
type PaymentProof = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type HandoverPhase = "pickup" | "return";

const action =
  <I, O = any>(name: string) =>
  (input: Input<I>) =>
    api.fn<O>(name, input.data);

export const createRazorpayOrder = action<{ bookingId: string }, RazorpayOrder>(
  "createRazorpayOrder",
);
export const verifyRazorpayPayment = action<{ bookingId: string } & PaymentProof, { ok: true }>(
  "verifyRazorpayPayment",
);
export const createDriverRazorpayOrder = action<{ driverBookingId: string }, RazorpayOrder>(
  "createDriverRazorpayOrder",
);
export const verifyDriverRazorpayPayment = action<
  { driverBookingId: string } & PaymentProof,
  { ok: true }
>("verifyDriverRazorpayPayment");
export const createWashRazorpayOrder = action<{ washBookingId: string }, RazorpayOrder>(
  "createWashRazorpayOrder",
);
export const verifyWashRazorpayPayment = action<
  { washBookingId: string } & PaymentProof,
  { ok: true }
>("verifyWashRazorpayPayment");
export const createWalletTopupOrder = action<{ amount: number }, RazorpayOrder>(
  "createWalletTopupOrder",
);
export const verifyWalletTopup = action<
  PaymentProof,
  { ok: true; alreadyCredited: boolean; newBalance: number }
>("verifyWalletTopup");
export const getBookingByQr = action<{ code: string }>("getBookingByQr");
export const resolveHandoverCode = action<{ code: string }>("resolveHandoverCode");
export const confirmHandover = action<
  { code: string; phase: HandoverPhase },
  { ok: true; phase: HandoverPhase; bookingId: string }
>("confirmHandover");
export const submitInspection = action<
  {
    bookingId: string;
    phase: HandoverPhase;
    fuel: number;
    odo: number;
    photoPaths: string[];
    notes?: string | null;
    damage: { area: string; condition: "ok" | "minor" | "major"; note?: string }[];
  },
  { ok: true; phase: HandoverPhase }
>("submitInspection");
