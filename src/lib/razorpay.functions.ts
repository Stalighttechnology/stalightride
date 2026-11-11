import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Create a Razorpay order for a confirmed booking. Called by the renter. */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getRazorpayCredentials } = await import("@/lib/razorpay.server");
    const { keyId, keySecret } = getRazorpayCredentials();

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, customer_id, status, payment_status, total_price, razorpay_order_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw error;
    if (!booking) throw new Error("Booking not found");
    if (booking.customer_id !== userId) throw new Error("Not your booking");
    if (booking.status !== "confirmed") throw new Error("Host has not accepted this booking yet");
    if (booking.payment_status === "paid") throw new Error("Already paid");

    const amountPaise = Math.round(Number(booking.total_price) * 100);
    const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: auth },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: booking.id,
        notes: { booking_id: booking.id, customer_id: userId },
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Razorpay order failed [${res.status}]: ${body}`);
    const order = JSON.parse(body) as { id: string; amount: number; currency: string };

    // Payment columns are locked from end-user writes; use the privileged client after ownership checks.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("bookings").update({ razorpay_order_id: order.id }).eq("id", booking.id);
    } catch {
      await supabase.from("bookings").update({ razorpay_order_id: order.id }).eq("id", booking.id);
    }

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId };
  });

/** Verify Razorpay signature and mark the booking as paid. */
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      bookingId: z.string().uuid(),
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().min(1),
    }).parse(input),
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
      .from("bookings")
      .select("id, customer_id, razorpay_order_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw error;
    if (!booking) throw new Error("Booking not found");
    if (booking.customer_id !== userId) throw new Error("Not your booking");
    if (booking.razorpay_order_id !== data.razorpay_order_id) throw new Error("Order mismatch");

    let updated = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: upErr } = await supabaseAdmin
        .from("bookings")
        .update({
          payment_status: "paid",
          payment_method: "razorpay",
          razorpay_payment_id: data.razorpay_payment_id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
      if (!upErr) updated = true;
    } catch (e) {
      console.warn("supabaseAdmin unavailable, falling back to context.supabase", e);
    }

    if (!updated) {
      const { error: upErr2 } = await supabase
        .from("bookings")
        .update({
          payment_status: "paid",
          payment_method: "razorpay",
          razorpay_payment_id: data.razorpay_payment_id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
      if (upErr2) throw upErr2;
    }

    return { ok: true };
  });
