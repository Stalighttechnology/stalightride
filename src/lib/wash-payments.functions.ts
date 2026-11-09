import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Create a Razorpay order for an admin-approved wash booking. Called by the customer. */
export const createWashRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ washBookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getRazorpayCredentials } = await import("@/lib/razorpay.server");
    const { keyId, keySecret } = getRazorpayCredentials();

    const { data: booking, error } = await supabase
      .from("wash_bookings")
      .select("id, customer_id, status, payment_status, price")
      .eq("id", data.washBookingId)
      .maybeSingle();
    if (error) throw error;
    if (!booking) throw new Error("Wash booking not found");
    if (booking.customer_id !== userId) throw new Error("Not your booking");
    if (booking.status !== "confirmed") throw new Error("Admin has not approved this wash yet");
    if (booking.payment_status === "paid") throw new Error("Already paid");

    const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: auth },
      body: JSON.stringify({
        amount: Math.round(Number(booking.price) * 100),
        currency: "INR",
        receipt: booking.id,
        notes: { wash_booking_id: booking.id, customer_id: userId },
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Razorpay order failed [${res.status}]: ${body}`);
    const order = JSON.parse(body) as { id: string; amount: number; currency: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("wash_bookings")
      .update({ razorpay_order_id: order.id })
      .eq("id", booking.id);
    if (upErr) throw upErr;

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
  });

/** Verify the Razorpay signature and mark the wash booking as paid. */
export const verifyWashRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        washBookingId: z.string().uuid(),
        razorpay_order_id: z.string().min(1),
        razorpay_payment_id: z.string().min(1),
        razorpay_signature: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getRazorpayCredentials } = await import("@/lib/razorpay.server");
    const { keySecret } = getRazorpayCredentials();

    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = createHmac("sha256", keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest("hex");
    const sig = Buffer.from(data.razorpay_signature);
    const exp = Buffer.from(expected);
    if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) throw new Error("Invalid payment signature");

    const { data: booking, error } = await supabase
      .from("wash_bookings")
      .select("id, customer_id, status, payment_status, razorpay_order_id")
      .eq("id", data.washBookingId)
      .maybeSingle();
    if (error) throw error;
    if (!booking) throw new Error("Wash booking not found");
    if (booking.customer_id !== userId) throw new Error("Not your booking");
    if (booking.status !== "confirmed") throw new Error("This wash is not approved");
    if (booking.razorpay_order_id !== data.razorpay_order_id) throw new Error("Order mismatch");
    if (booking.payment_status === "paid") return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("wash_bookings")
      .update({
        payment_status: "paid",
        payment_method: "razorpay",
        razorpay_payment_id: data.razorpay_payment_id,
        paid_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("customer_id", userId);
    if (upErr) throw upErr;

    return { ok: true };
  });
