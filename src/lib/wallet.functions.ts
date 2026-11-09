import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Create a Razorpay order to add money to the signed-in user's wallet. */
export const createWalletTopupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ amount: z.number().positive().max(200000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { getRazorpayCredentials } = await import("@/lib/razorpay.server");
    const { keyId, keySecret } = getRazorpayCredentials();

    const amount = Math.round(data.amount);
    if (amount < 1) throw new Error("Enter a valid amount");
    const amountPaise = amount * 100;

    const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: auth },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        notes: { purpose: "wallet_topup", user_id: userId },
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Could not start top-up [${res.status}]: ${body}`);
    const order = JSON.parse(body) as { id: string; amount: number; currency: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("wallet_topups").insert({
      user_id: userId,
      amount,
      status: "created",
      razorpay_order_id: order.id,
    });
    if (error) throw error;

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
  });

/** Verify a wallet top-up payment and credit the wallet. */
export const verifyWalletTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        razorpay_order_id: z.string().min(1),
        razorpay_payment_id: z.string().min(1),
        razorpay_signature: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { getRazorpayCredentials } = await import("@/lib/razorpay.server");
    const { keySecret } = getRazorpayCredentials();

    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = createHmac("sha256", keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest("hex");
    const sig = Buffer.from(data.razorpay_signature);
    const exp = Buffer.from(expected);
    if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) throw new Error("Invalid payment signature");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: topup, error } = await supabaseAdmin
      .from("wallet_topups")
      .select("id, user_id, amount, status")
      .eq("razorpay_order_id", data.razorpay_order_id)
      .maybeSingle();
    if (error) throw error;
    if (!topup) throw new Error("Top-up not found");
    if (topup.user_id !== userId) throw new Error("Not your top-up");
    if (topup.status === "paid") return { ok: true, alreadyCredited: true };

    const { error: upErr } = await supabaseAdmin
      .from("wallet_topups")
      .update({ status: "paid", razorpay_payment_id: data.razorpay_payment_id })
      .eq("id", topup.id)
      .eq("status", "created");
    if (upErr) throw upErr;

    const { error: rpcErr } = await supabaseAdmin.rpc("wallet_apply", {
      _user_id: userId,
      _amount: Number(topup.amount),
      _kind: "topup",
      _booking_id: undefined,
      _reference: data.razorpay_payment_id,
      _description: "Money added to wallet",
    });
    if (rpcErr) throw rpcErr;

    return { ok: true, alreadyCredited: false };
  });
