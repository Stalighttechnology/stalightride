import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getHandoverGate } from "@/lib/trip-window";

const damageSchema = z.array(
  z.object({
    area: z.string().min(1).max(120),
    condition: z.enum(["ok", "minor", "major"]),
    note: z.string().max(500).optional(),
  }),
);

const schema = z.object({
  bookingId: z.string().uuid(),
  phase: z.enum(["pickup", "return"]),
  fuel: z.number().int().min(0).max(100),
  odo: z.number().int().min(0).max(3_000_000),
  photoPaths: z.array(z.string().min(1).max(500)).max(20),
  notes: z.string().max(2000).nullable().optional(),
  damage: damageSchema,
});

/**
 * Record a pickup or return inspection and stamp the handover time.
 * Handover timestamps are locked from end-user writes at the database level,
 * so the write happens with elevated privileges after verifying the caller is
 * the rider, the host, or an admin, and that the phase is actually open.
 */
export const submitInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => schema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        "id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, customer_id, vendor_id, pickup_checked_at, return_checked_at, pickup_odometer, return_odometer",
      )
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found.");

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const isParty = booking.customer_id === userId || booking.vendor_id === userId;
    if (!isParty && isAdmin !== true) throw new Error("You don't have access to this trip.");

    const gate = getHandoverGate(booking);
    // A QR scan may already have stamped the handover; the checklist is still due then.
    const pickupScanned = !!booking.pickup_checked_at && booking.pickup_odometer == null;
    const returnScanned = !!booking.return_checked_at && booking.return_odometer == null;
    if (data.phase === "pickup" && booking.pickup_odometer != null) throw new Error("Pickup checklist already recorded.");
    if (data.phase === "return" && booking.return_odometer != null) throw new Error("Return checklist already recorded.");
    if (data.phase === "return" && booking.pickup_odometer != null && data.odo < booking.pickup_odometer) {
      throw new Error("Return odometer can't be lower than the pickup reading.");
    }
    const isPaid = (booking.payment_status === "paid" || !!(booking as any).paid_at) && booking.status === "confirmed";
    if (data.phase === "pickup" && !gate.canCheckin && !pickupScanned && !isPaid) {
      throw new Error(gate.checkinReason ?? "Check-in is not available yet.");
    }
    if (data.phase === "return" && !gate.canCheckout && !returnScanned) {
      throw new Error(gate.checkoutReason ?? "Check-out is not available yet.");
    }

    const patch =
      data.phase === "pickup"
        ? {
            pickup_fuel_pct: data.fuel,
            pickup_odometer: data.odo,
            pickup_photos: data.photoPaths,
            pickup_notes: data.notes || null,
            pickup_damage: data.damage,
            pickup_checked_at: booking.pickup_checked_at ?? new Date().toISOString(),
          }
        : {
            return_fuel_pct: data.fuel,
            return_odometer: data.odo,
            return_photos: data.photoPaths,
            return_notes: data.notes || null,
            return_damage: data.damage,
            return_checked_at: booking.return_checked_at ?? new Date().toISOString(),
            status: "completed" as const,
          };

    let updated = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: upErr } = await supabaseAdmin.from("bookings").update(patch as any).eq("id", booking.id);
      if (!upErr) updated = true;
    } catch (e) {
      console.warn("supabaseAdmin unavailable, using context.supabase", e);
    }

    if (!updated) {
      const { error: upErr2 } = await supabase.from("bookings").update(patch as any).eq("id", booking.id);
      if (upErr2) throw new Error(upErr2.message);
    }

    return { ok: true as const, phase: data.phase };
  });
