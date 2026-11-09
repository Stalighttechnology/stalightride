import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getHandoverGate } from "@/lib/trip-window";

const codeSchema = z.object({ code: z.string().min(8).max(200) });
const confirmSchema = z.object({
  code: z.string().min(8).max(200),
  phase: z.enum(["pickup", "return"]),
});

/**
 * Look up a booking from a scanned QR payload. Only the trip's host,
 * the rider, or an admin can resolve it (RLS enforces this).
 */
export const resolveHandoverCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => codeSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let { data: booking, error } = await supabase
      .from("bookings")
      .select(
        "id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, total_price, pickup_checked_at, return_checked_at, customer_id, vendor_id, vehicle_id",
      )
      .eq("qr_code", data.code)
      .maybeSingle();

    if (!booking) {
      const { data: byId } = await supabase
        .from("bookings")
        .select(
          "id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, total_price, pickup_checked_at, return_checked_at, customer_id, vendor_id, vehicle_id",
        )
        .eq("id", data.code)
        .maybeSingle();
      booking = byId;
    }

    if (error && !booking) throw new Error(error.message);
    if (!booking) return { found: false as const };

    const [{ data: vehicle }, { data: rider }, { data: isAdmin }] = await Promise.all([
      supabase.from("vehicles").select("title, brand, model, city").eq("id", booking.vehicle_id).maybeSingle(),
      supabase.from("public_profiles").select("full_name, avatar_url").eq("id", booking.customer_id).maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);

    const gate = getHandoverGate(booking);

    return {
      found: true as const,
      booking,
      vehicle,
      rider,
      canConfirm: booking.vendor_id === userId || isAdmin === true,
      isRider: booking.customer_id === userId,
      gate: {
        canCheckin: gate.canCheckin,
        canCheckout: gate.canCheckout,
        checkinReason: gate.checkinReason,
        checkoutReason: gate.checkoutReason,
        opensAt: gate.opensAt?.toISOString() ?? null,
      },
    };
  });

/**
 * Confirm the physical handover at pickup or return. Host (or admin) only.
 */
export const confirmHandover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => confirmSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let { data: booking, error } = await supabase
      .from("bookings")
      .select("id, status, payment_status, vendor_id, start_date, end_date, pickup_time, dropoff_time, pickup_checked_at, return_checked_at")
      .eq("qr_code", data.code)
      .maybeSingle();

    if (!booking) {
      const { data: byId } = await supabase
        .from("bookings")
        .select("id, status, payment_status, vendor_id, start_date, end_date, pickup_time, dropoff_time, pickup_checked_at, return_checked_at")
        .eq("id", data.code)
        .maybeSingle();
      booking = byId;
    }

    if (error && !booking) throw new Error(error.message);
    if (!booking) throw new Error("This QR code does not match any booking.");

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (booking.vendor_id !== userId && isAdmin !== true) {
      throw new Error("Only the vehicle host can confirm the handover.");
    }
    if (booking.status !== "confirmed" || (booking.payment_status !== "paid" && !(booking as any).paid_at)) {
      throw new Error("This booking is not paid and confirmed yet.");
    }

    // Enforce the same timing rules as the trip page: check-in opens
    // 30 minutes before pickup; check-out needs a recorded pickup.
    const gate = getHandoverGate(booking);
    if (data.phase === "pickup") {
      if (booking.pickup_checked_at) throw new Error("Pickup was already confirmed.");
      if (!gate.canCheckin) {
        throw new Error(gate.checkinReason ?? "Check-in is not open yet.");
      }
    }
    if (data.phase === "return") {
      if (!booking.pickup_checked_at) throw new Error("Confirm the pickup first.");
      if (booking.return_checked_at) throw new Error("Return was already confirmed.");
      if (!gate.canCheckout) {
        throw new Error(gate.checkoutReason ?? "Check-out is not available yet.");
      }
    }

    const patch =
      data.phase === "pickup"
        ? { pickup_checked_at: new Date().toISOString() }
        : { return_checked_at: new Date().toISOString() };

    // Handover timestamps are locked from end-user writes; write them after the host/admin check above.
    let updated = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: upErr } = await supabaseAdmin.from("bookings").update(patch).eq("id", booking.id);
      if (!upErr) updated = true;
    } catch (e) {
      console.warn("supabaseAdmin unavailable, using context.supabase", e);
    }

    if (!updated) {
      const { error: upErr2 } = await supabase.from("bookings").update(patch).eq("id", booking.id);
      if (upErr2) throw new Error(upErr2.message);
    }

    return { ok: true as const, phase: data.phase, bookingId: booking.id };
  });
