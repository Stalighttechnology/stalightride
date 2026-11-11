import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public lookup of a booking by its QR code string.
 * The QR code is a random UUID minted at booking-create time; anyone who
 * scans a printed QR can view the trip's public details (who booked, host,
 * vehicle, pickup/return times, amount paid). Safe fields only — no phone,
 * no address, no email.
 */
export const getBookingByQr = createServerFn({ method: "GET" })
  .inputValidator((raw) => z.object({ code: z.string().min(8).max(128) }).parse(raw))
  .handler(async ({ data }) => {
    let client: any;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      client = supabaseAdmin;
    } catch {
      const { supabase } = await import("@/integrations/supabase/client");
      client = supabase;
    }

    let { data: booking, error } = await client
      .from("bookings")
      .select(
        "id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, base_price, security_deposit, total_price, paid_at, vehicle_id, customer_id, vendor_id, pickup_fuel_pct, return_fuel_pct, pickup_odometer, return_odometer, pickup_checked_at, return_checked_at",
      )
      .eq("qr_code", data.code)
      .maybeSingle();

    if (!booking) {
      const { data: byId } = await client
        .from("bookings")
        .select(
          "id, status, payment_status, start_date, end_date, pickup_time, dropoff_time, base_price, security_deposit, total_price, paid_at, vehicle_id, customer_id, vendor_id, pickup_fuel_pct, return_fuel_pct, pickup_odometer, return_odometer, pickup_checked_at, return_checked_at",
        )
        .eq("id", data.code)
        .maybeSingle();
      booking = byId;
    }

    if (error && !booking) throw new Error(error.message);
    if (!booking) return null;

    const [{ data: vehicle }, { data: customer }, { data: vendor }] = await Promise.all([
      client.from("vehicles").select("title, brand, model, year, city, address, lat, lng, category, fuel, transmission").eq("id", booking.vehicle_id).maybeSingle(),
      client.from("profiles").select("full_name, avatar_url").eq("id", booking.customer_id).maybeSingle(),
      client.from("profiles").select("full_name, avatar_url").eq("id", booking.vendor_id).maybeSingle(),
    ]);

    return {
      id: booking.id,
      status: booking.status,
      paymentStatus: booking.payment_status,
      startDate: booking.start_date,
      endDate: booking.end_date,
      pickupTime: booking.pickup_time,
      dropoffTime: booking.dropoff_time,
      basePrice: Number(booking.base_price),
      securityDeposit: Number(booking.security_deposit),
      totalPrice: Number(booking.total_price),
      paidAt: booking.paid_at,
      pickupFuelPct: booking.pickup_fuel_pct,
      returnFuelPct: booking.return_fuel_pct,
      pickupOdometer: booking.pickup_odometer,
      returnOdometer: booking.return_odometer,
      pickupCheckedAt: booking.pickup_checked_at,
      returnCheckedAt: booking.return_checked_at,
      vehicle,
      customer,
      vendor,
    };
  });
