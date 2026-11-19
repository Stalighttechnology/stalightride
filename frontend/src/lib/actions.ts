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
  (input?: Input<I> | I) => {
    const payload =
      input && typeof input === "object" && "data" in input
        ? (input as Input<I>).data
        : input;
    return api.fn<O>(name, payload as any);
  };

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

export const createMembershipOrder = action<
  { plan: string; cycle: "monthly" | "annual" },
  RazorpayOrder
>("createMembershipOrder");

export const subscribeMembership = action<
  {
    plan: string;
    cycle?: "monthly" | "annual";
    immediate?: boolean;
    payment_method?: "wallet" | "razorpay";
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  },
  {
    ok: boolean;
    plan: string;
    cycle?: string;
    expiresAt?: string | null;
    paymentReference?: string;
    message: string;
  }
>("subscribeMembership");

export const cancelMembership = action<
  {},
  { ok: boolean; message: string }
>("cancelMembership");

export const resumeMembership = action<
  {},
  { ok: boolean; message: string }
>("resumeMembership");

export const getMembershipStatus = action<
  {},
  {
    plan: string;
    cycle: string;
    active: boolean;
    startedAt: string | null;
    expiresAt: string | null;
    autoRenew: boolean;
  }
>("getMembershipStatus");

export interface RewardVoucherItem {
  id: string;
  voucherId?: string;
  title: string;
  code: string;
  category: string;
  pointsCost: number;
  terms?: string;
  claimedAt: string;
  expiresAt: string;
  status?: string;
}

export interface RewardActivityItem {
  id: string;
  amount: number;
  type: "earned" | "redeemed";
  title: string;
  description: string;
  date: string;
}

export interface RewardsSummaryResponse {
  pointsBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  currentTier: "Explorer" | "Silver" | "Gold" | "Platinum VIP";
  claimedVouchers: RewardVoucherItem[];
  activity: RewardActivityItem[];
  walletBalance: number;
}

export const getRewardsSummary = action<
  {},
  RewardsSummaryResponse
>("getRewardsSummary");

export const redeemRewardVoucher = action<
  {
    voucherId: string;
    pointsCost: number;
    title: string;
    category: string;
    codePrefix: string;
    terms?: string;
    service?: "rental" | "driver" | "wash" | "partner" | string;
    discountAmount?: number;
  },
  {
    ok: boolean;
    pointsBalance: number;
    voucher: RewardVoucherItem;
  }
>("redeemRewardVoucher");

export const convertPointsToWallet = action<
  {
    amount: number;
  },
  {
    ok: boolean;
    pointsBalance: number;
    walletBalance: number;
    amountConverted: number;
  }
>("convertPointsToWallet");

