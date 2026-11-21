import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { api } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { calculateRentalPrice, currency, rentalDurationHours } from "@/lib/format";
import { formatWhen } from "@/lib/trip-window";
import {
  type BookedRange,
  toIsoDate,
  isPickupDateFullyBlocked,
  isPickupSlotBlocked,
  getAvailablePickupSlots,
  getVehicleReturnInfoOnDate,
  getNextBookingAfterPickup,
  isReturnDateBlocked,
  isDropoffSlotBlocked,
  validateBookingAgainstRanges,
} from "@/lib/vehicle-availability";
import { useSignedUrls } from "@/hooks/use-signed-urls";
import { VehicleMap } from "@/components/vehicle-map";
import { ChargeLines, CouponField, type AppliedCoupon } from "@/components/charges-summary";
import { SAVED_VEHICLES_EVENT } from "@/hooks/use-saved-items";
import { toast } from "sonner";
import {
  Star,
  MapPin,
  Users,
  Fuel,
  Cog,
  Gauge,
  Heart,
  ShieldCheck,
  Clock,
  CalendarDays,
  CircleAlert,
  Loader2,
  ArrowRight,
  QrCode,
  Navigation,
  ImageOff,
  MessageSquareQuote,
  Trash2,
  Crown,
  CheckCircle2,
  Zap,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/hooks/use-session";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";

const vehicleSearch = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  pickupTime: z.string().optional(),
  dropoffTime: z.string().optional(),
});

export const Route = createFileRoute("/vehicle/$id")({
  validateSearch: vehicleSearch,
  component: VehiclePage,
  head: () => ({
    meta: [
      { title: "Vehicle rental details — Synchoo" },
      {
        name: "description",
        content:
          "View verified vehicle details, pricing, pickup location, reviews, and secure booking options on Synchoo.",
      },
      { property: "og:title", content: "Vehicle rental details — Synchoo" },
      {
        property: "og:description",
        content:
          "Check vehicle photos, verified host details, exact pickup map, and rental rates before booking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function formatResponseTime(minutes: number | null): string {
  if (minutes == null) return "a few hours";
  if (minutes <= 1) return "1 minute";
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour";
  if (hours < 24) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function VehiclePage() {
  const { id } = Route.useParams();
  const searchParams = Route.useSearch();
  const { user } = useSession();
  const navigate = useNavigate();
  const [v, setV] = useState<any>(null);
  const [vendor, setVendor] = useState<any>(null);
  const [vendorProfile, setVendorProfile] = useState<any>(null);
  const [reviews, setReviews] = useState<any[] | null>(null);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [start, setStart] = useState(() => searchParams.from || searchParams.start || "");
  const [end, setEnd] = useState(() => searchParams.to || searchParams.end || "");
  const [pickupTime, setPickupTime] = useState(() => searchParams.pickupTime || "10:00");
  const [dropoffTime, setDropoffTime] = useState(() => searchParams.dropoffTime || "10:00");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [booking, setBooking] = useState(false);
  const [wished, setWished] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [airportMeet, setAirportMeet] = useState(false);
  const [flightInfo, setFlightInfo] = useState("");
  const [bookedRanges, setBookedRanges] = useState<BookedRange[]>([]);
  const [hostStats, setHostStats] = useState<{
    response_rate: number | null;
    median_response_minutes: number | null;
    request_count: number;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await api.rpc("vehicle_booked_ranges", { _vehicle_id: id });
        if (!error && Array.isArray(data)) {
          setBookedRanges(data);
          return;
        }
      } catch {}
      try {
        const [{ data: blocks }, { data: bks }] = await Promise.all([
          api.from("availability_blocks").select("start_date, end_date").eq("vehicle_id", id),
          api
            .from("bookings")
            .select("start_date, end_date, pickup_time, dropoff_time, status")
            .eq("vehicle_id", id)
            .in("status", ["pending", "confirmed"]),
        ]);
        const ranges: BookedRange[] = [
          ...(bks || []).map((b: any) => ({
            start_date: b.start_date,
            end_date: b.end_date,
            pickup_time: b.pickup_time || "10:00",
            dropoff_time: b.dropoff_time || "10:00",
          })),
          ...(blocks || []).map((bl: any) => ({
            start_date: bl.start_date,
            end_date: bl.end_date,
            pickup_time: "00:00",
            dropoff_time: "23:59",
          })),
        ];
        setBookedRanges(ranges);
      } catch {}
    })();
  }, [id]);

  useEffect(() => {
    if (searchParams.from || searchParams.start) {
      setStart(searchParams.from || searchParams.start || "");
    }
    if (searchParams.to || searchParams.end) {
      setEnd(searchParams.to || searchParams.end || "");
    }
    if (searchParams.pickupTime) {
      setPickupTime(searchParams.pickupTime);
    }
    if (searchParams.dropoffTime) {
      setDropoffTime(searchParams.dropoffTime);
    }
  }, [
    searchParams.from,
    searchParams.start,
    searchParams.to,
    searchParams.end,
    searchParams.pickupTime,
    searchParams.dropoffTime,
  ]);

  // The database returns the exact pickup point only to the host, admins and customers with a confirmed booking.
  const [exactLocation, setExactLocation] = useState<{ address: string | null; lat: number | null; lng: number | null } | null>(null);
  useEffect(() => {
    if (!id || !user?.id) return setExactLocation(null);
    api
      .from("vehicle_locations")
      .select("address, lat, lng")
      .eq("vehicle_id", id)
      .maybeSingle()
      .then(({ data }) => setExactLocation(data ?? null));
  }, [id, user?.id]);

  // Auto-apply pending reward coupon from rewards page
  useEffect(() => {
    const pending = sessionStorage.getItem("synchoo_pending_coupon");
    if (!pending || coupon) return;
    const trimmed = pending.trim();
    api.rpc("validate_coupon", { _code: trimmed }).then(({ data, error }) => {
      const res = data as {
        valid?: boolean;
        code?: string;
        percent_off?: number | null;
        amount_off?: number | null;
      } | null;
      if (!error && res?.valid) {
        setCoupon({
          code: res.code ?? trimmed.toUpperCase(),
          percent_off: res.percent_off ?? null,
          amount_off: res.amount_off ?? null,
        });
        toast.success(`Reward voucher ${trimmed} applied to your rental!`);
      }
    });
  }, [coupon]);

  useEffect(() => {
    (async () => {
      const { data } = await api
        .from("vehicles")
        .select("*, vehicle_images(url,sort_order)")
        .eq("id", id)
        .maybeSingle();
      setV(data);
      if (data) {
        const { data: vend } = await api
          .from("public_vendors" as any)
          .select("*")
          .eq("id", data.vendor_id)
          .maybeSingle();
        setVendor(vend);
        const { data: prof } = await api
          .from("public_profiles" as any)
          .select("*")
          .eq("id", data.vendor_id)
          .maybeSingle();
        setVendorProfile(prof);
        if (data.vendor_id) {
          api
            .rpc("host_response_stats", { _vendor_id: data.vendor_id })
            .then(({ data: stats }) => {
              if (stats) setHostStats(stats as any);
            })
            .catch(() => {});
        }
        const { data: r, count } = await api
          .from("reviews")
          .select("*", { count: "exact" })
          .eq("vehicle_id", id)
          .order("created_at", { ascending: false })
          .range(0, 9);
        const rows = r ?? [];
        setReviewsTotal(count ?? 0);
        const authorIds = Array.from(new Set(rows.map((x: any) => x.customer_id)));
        let authorsById: Record<string, any> = {};
        if (authorIds.length) {
          const { data: authors } = await api
            .from("public_profiles" as any)
            .select("id,full_name,avatar_url")
            .in("id", authorIds);
          authorsById = Object.fromEntries((authors ?? []).map((a: any) => [a.id, a]));
        }
        setReviews(rows.map((x: any) => ({ ...x, profiles: authorsById[x.customer_id] ?? null })));
      }
    })();
  }, [id]);

  const loadMoreReviews = async () => {
    if (!id || !reviews || loadingMoreReviews) return;
    const n = reviews.length;
    setLoadingMoreReviews(true);
    try {
      const { data: r, count } = await api
        .from("reviews")
        .select("*", { count: "exact" })
        .eq("vehicle_id", id)
        .order("created_at", { ascending: false })
        .range(n, n + 9);
      if (count != null) setReviewsTotal(count);
      const rows = r ?? [];
      const authorIds = Array.from(new Set(rows.map((x: any) => x.customer_id)));
      let authorsById: Record<string, any> = {};
      if (authorIds.length) {
        const { data: authors } = await api
          .from("public_profiles" as any)
          .select("id,full_name,avatar_url")
          .in("id", authorIds);
        authorsById = Object.fromEntries((authors ?? []).map((a: any) => [a.id, a]));
      }
      const newReviews = rows.map((x: any) => ({
        ...x,
        profiles: authorsById[x.customer_id] ?? null,
      }));
      setReviews((prev) => [...(prev ?? []), ...newReviews]);
    } finally {
      setLoadingMoreReviews(false);
    }
  };

  useEffect(() => {
    if (!user || !id) return;
    const checkWished = () => {
      api
        .from("wishlists")
        .select("id")
        .eq("user_id", user.id)
        .eq("vehicle_id", id)
        .maybeSingle()
        .then(({ data }) => setWished(!!data));
    };

    checkWished();
    window.addEventListener(SAVED_VEHICLES_EVENT, checkWished);

    api
      .from("profiles")
      .select("dl_status,dl_expiry,membership_plan")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setMyProfile(data as any));

    return () => {
      window.removeEventListener(SAVED_VEHICLES_EVENT, checkWished);
    };
  }, [user, id]);

  const images = (v?.vehicle_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order);
  const urls = useSignedUrls(
    "vehicle-images",
    images.map((im: any) => im.url),
  );
  const imgUrl = images[activeImg] ? urls[images[activeImg].url] : null;

  const rentalHours = useMemo(
    () => rentalDurationHours(start, end, pickupTime, dropoffTime),
    [dropoffTime, end, pickupTime, start],
  );
  const priceBreakdown = useMemo(
    () =>
      v
        ? calculateRentalPrice({
            startDate: start,
            endDate: end,
            pickupTime,
            dropoffTime,
            priceHourly: v.price_hourly,
            priceDaily: v.price_daily,
            priceWeekly: v.price_weekly,
          })
        : calculateRentalPrice({ startDate: "", endDate: "", pickupTime: "", dropoffTime: "" }),
    [dropoffTime, end, pickupTime, start, v],
  );
  const subtotal = priceBreakdown.subtotal;

  const handleStartChange = (d: string) => {
    setStart(d);
    if (!d) return;
    if (isPickupSlotBlocked(d, pickupTime, bookedRanges)) {
      const available = getAvailablePickupSlots(d, bookedRanges);
      if (available.length > 0) {
        setPickupTime(available[0]);
      }
    }
    if (end && (end < d || isReturnDateBlocked(end, d, pickupTime, bookedRanges))) {
      setEnd("");
    }
  };

  const returnInfo = useMemo(() => {
    return start ? getVehicleReturnInfoOnDate(start, bookedRanges) : null;
  }, [start, bookedRanges]);

  const scheduleConflict = useMemo(() => {
    if (!start || !end) return null;
    const pickupDate = new Date(`${start}T${(pickupTime || "10:00").slice(0, 5)}:00+05:30`);
    if (pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
      return "Pickup must be at least 2 hours from now";
    }
    return validateBookingAgainstRanges(start, pickupTime, end, dropoffTime, bookedRanges);
  }, [start, pickupTime, end, dropoffTime, bookedRanges]);

  const dlOk = myProfile?.dl_status === "approved";
  const isOwner = user?.id === v?.vendor_id;

  const book = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!dlOk) {
      toast.error("Verify your driving licence in your profile before booking");
      navigate({ to: "/profile" });
      return;
    }
    if (!start || !end) {
      toast.error("Pick dates first");
      return;
    }
    if (rentalHours <= 0) {
      toast.error("Drop-off must be after pickup");
      return;
    }
    const pickupDate = new Date(`${start}T${(pickupTime || "10:00").slice(0, 5)}:00+05:30`);
    if (pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
      toast.error("Pickup must be at least 2 hours from now");
      return;
    }
    const conflictErr = validateBookingAgainstRanges(
      start,
      pickupTime,
      end,
      dropoffTime,
      bookedRanges,
    );
    if (conflictErr) {
      toast.error(conflictErr);
      return;
    }
    setBooking(true);

    try {
      const qrPayload = crypto.randomUUID();
      let finalNotes = notes || "";
      if (airportMeet) {
        const meetTag = `[VIP Airport Meet & Greet${flightInfo.trim() ? `: Flight ${flightInfo.trim()}` : ""}]`;
        finalNotes = finalNotes ? `${meetTag} ${finalNotes}` : meetTag;
      }
      const { data: created, error } = await api
        .from("bookings")
        .insert({
          vehicle_id: v.id,
          vendor_id: v.vendor_id,
          customer_id: user.id,
          start_date: start,
          end_date: end,
          pickup_time: pickupTime,
          dropoff_time: dropoffTime,
          base_price: subtotal,
          security_deposit: v.security_deposit,
          // Money columns are recalculated by the database (tg_price_booking).
          total_price: subtotal + Number(v.security_deposit),
          coupon_code: coupon?.code ?? null,
          status: "pending",
          qr_code: qrPayload,
          notes: finalNotes || null,
        } as any)
        .select("id, status, respond_by, pay_by")
        .single();
      if (error) throw error;
      if (coupon?.code) {
        try {
          sessionStorage.removeItem("synchoo_pending_coupon");
          const sKey = user.id ? `synchoo_rewards_${user.id}` : "synchoo_rewards_guest";
          const saved = localStorage.getItem(`${sKey}_vouchers`);
          if (saved) {
            const list = JSON.parse(saved);
            const updated = list.map((item: any) =>
              item.code.toUpperCase() === coupon.code.toUpperCase()
                ? {
                    ...item,
                    used: true,
                    usedAt: new Date().toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }),
                  }
                : item,
            );
            localStorage.setItem(`${sKey}_vouchers`, JSON.stringify(updated));
          }
        } catch {}
      }
      if (created?.status === "confirmed" || v.instant_book) {
        const payMsg = created?.pay_by
          ? ` Please complete payment by ${formatWhen(new Date(created.pay_by))}.`
          : " Please complete payment to secure your ride.";
        toast.success(`Booking confirmed instantly!${payMsg}`);
      } else {
        const respondMsg = created?.respond_by
          ? `Host will respond by ${formatWhen(new Date(created.respond_by))}`
          : "The host will confirm shortly";
        toast.success(`Booking requested! ${respondMsg}.`);
      }
      navigate({ to: "/bookings" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not book");
    } finally {
      setBooking(false);
    }
  };

  const toggleWish = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (wished) {
      await api.from("wishlists").delete().eq("user_id", user.id).eq("vehicle_id", id);
      setWished(false);
      window.dispatchEvent(new Event(SAVED_VEHICLES_EVENT));
      toast.success(v?.title ? `Removed ${v.title} from saved` : "Removed from saved rides");
    } else {
      await api.from("wishlists").insert({ user_id: user.id, vehicle_id: id });
      setWished(true);
      window.dispatchEvent(new Event(SAVED_VEHICLES_EVENT));
      toast.success(v?.title ? `Saved ${v.title} to favorites!` : "Saved to favorites!");
    }
  };

  const handleDeleteVehicle = async () => {
    if (!v) return;
    setIsDeleting(true);
    try {
      const { data: activeBookings, error: bErr } = await api
        .from("bookings")
        .select("id, status")
        .eq("vehicle_id", v.id)
        .in("status", ["pending", "confirmed"]);

      if (bErr) throw bErr;

      if (activeBookings && activeBookings.length > 0) {
        toast.error(
          "Cannot delete vehicle with active or upcoming reservations. Please complete or cancel them first.",
        );
        return;
      }

      const imagePaths = v.vehicle_images?.map((img: any) => img.url).filter(Boolean);
      if (imagePaths && imagePaths.length > 0) {
        try {
          await api.storage.from("vehicle-images").remove(imagePaths);
        } catch {
          // non-blocking
        }
      }

      const { error: delErr } = await api.from("vehicles").delete().eq("id", v.id);
      if (delErr) {
        if (
          delErr.code === "23503" ||
          delErr.message?.includes("foreign key") ||
          delErr.message?.includes("violates foreign key constraint")
        ) {
          // Soft-delete: update status to paused and persist to deleted registry so it disappears permanently from host's dashboard
          await api.from("vehicles").update({ status: "paused" }).eq("id", v.id);
          if (user?.id) {
            const storeKey = `synchoo_deleted_vehicles_${user.id}`;
            try {
              const currentDeleted: string[] = JSON.parse(localStorage.getItem(storeKey) || "[]");
              if (!currentDeleted.includes(v.id)) {
                currentDeleted.push(v.id);
                localStorage.setItem(storeKey, JSON.stringify(currentDeleted));
              }
            } catch {}
          }
          toast.success("Vehicle deleted successfully");
          navigate({ to: "/vendor" });
          return;
        } else {
          throw delErr;
        }
      }

      if (user?.id) {
        const storeKey = `synchoo_deleted_vehicles_${user.id}`;
        try {
          const currentDeleted: string[] = JSON.parse(localStorage.getItem(storeKey) || "[]");
          if (!currentDeleted.includes(v.id)) {
            currentDeleted.push(v.id);
            localStorage.setItem(storeKey, JSON.stringify(currentDeleted));
          }
        } catch {}
      }

      toast.success("Vehicle deleted successfully");
      navigate({ to: "/vendor" });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete vehicle");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!v)
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="mb-4 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-8 w-2/3 max-w-md" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <Skeleton className="aspect-[16/10] rounded-2xl" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="aspect-[16/9] rounded-2xl" />
            </div>
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    );

  // v.address is only the area (e.g. "Indiranagar") since migration 0036.
  const pickupArea = [v.address, v.city].filter(Boolean).join(", ");
  const exactAddress = [exactLocation?.address, v.city].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {v.city}
              <span>·</span>
              <Star className="h-3.5 w-3.5 fill-foreground text-foreground" />
              {Number(v.avg_rating).toFixed(1)} ({v.review_count})
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="mt-1 font-display text-3xl font-semibold">{v.title}</h1>
              {v.instant_book && (
                <Badge variant="secondary" className="mt-1 gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Zap className="h-3.5 w-3.5 fill-current text-emerald-500" />
                  Instant Book
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {v.brand} {v.model} · {v.year}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleWish}
              className={`transition-all duration-200 ${
                wished
                  ? "border-rose-300 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400"
                  : "hover:border-rose-300 hover:text-rose-500"
              }`}
            >
              <Heart
                className={`mr-2 h-4 w-4 transition-transform duration-200 ${
                  wished ? "fill-rose-500 text-rose-500 scale-110" : ""
                }`}
              />
              {wished ? "Saved" : "Save"}
            </Button>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete Vehicle
              </Button>
            )}
          </div>
        </div>

        {isOwner && v.verification_status !== "approved" && (
          <div
            className={`mb-4 rounded-lg border p-3 text-sm ${v.verification_status === "rejected" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-amber-300 bg-amber-50 text-amber-900"}`}
          >
            {v.verification_status === "rejected" ? (
              <>Listing rejected: {v.rejection_reason ?? "Please update your documents."}</>
            ) : (
              "Listing under verification — it will be visible to renters once approved."
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card">
              <div className="relative aspect-[16/10] bg-muted">
                {imgUrl ? (
                  <img
                    key={imgUrl}
                    src={imgUrl}
                    alt={`${v.brand} ${v.model} for rent in ${v.city}`}
                    className="h-full w-full animate-fade-in object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center gap-2 text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                    <span className="text-sm">Photos coming soon</span>
                  </div>
                )}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent"
                />
                <div className="absolute left-4 top-4 flex items-center gap-1.5">
                  <Badge className="rounded-full bg-background/85 capitalize text-foreground backdrop-blur">
                    {v.category === "bike" ? "Motorcycle" : v.category}
                  </Badge>
                  {v.instant_book && (
                    <Badge className="rounded-full bg-emerald-600 text-white shadow-sm flex items-center gap-1 border-0">
                      <Zap className="h-3 w-3 fill-current" />
                      Instant Book
                    </Badge>
                  )}
                </div>
                {images.length > 1 && (
                  <span className="absolute bottom-4 right-4 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                    {activeImg + 1} / {images.length}
                  </span>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar inapp-scroll p-3">
                  {images.map((im: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      aria-label={`View photo ${i + 1}`}
                      className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                        i === activeImg
                          ? "border-brand opacity-100 shadow-glow"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      {urls[im.url] && (
                        <img src={urls[im.url]} alt="" className="h-full w-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Spec icon={Cog} label="Transmission" value={v.transmission} />
              <Spec icon={Fuel} label="Fuel" value={v.fuel} />
              <Spec icon={Users} label="Seats" value={v.seats ?? "—"} />
              <Spec
                icon={Gauge}
                label="Mileage"
                value={v.mileage_kmpl ? `${v.mileage_kmpl} kmpl` : "—"}
              />
            </div>

            <section className="mt-6 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">About this ride</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {v.description || "No description provided."}
              </p>
              {pickupArea && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {exactLocation ? exactAddress : pickupArea}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">Pickup location</h2>
              <div className="mt-2 flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground pin-drop" />
                <div>
                  <p className="font-medium">{exactLocation ? exactLocation.address || v.city : pickupArea}</p>
                  {exactLocation?.address && <p className="text-xs text-muted-foreground">{v.city}</p>}
                  {!exactLocation && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      The exact address, map and directions appear here once the host confirms your booking.
                    </p>
                  )}
                </div>
              </div>
              {exactLocation && (
                <VehicleMap
                  query={exactAddress}
                  lat={exactLocation.lat}
                  lng={exactLocation.lng}
                  className="mt-4 aspect-[16/9] animate-fade-in"
                />
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={vendorProfile?.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(vendorProfile?.full_name || vendor?.business_name || "H").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">
                      {vendor?.business_name || vendorProfile?.full_name || "Host"}
                    </p>
                    {vendor?.kyc_status === "approved" && (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  {hostStats && hostStats.request_count > 0 && hostStats.response_rate != null && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-brand shrink-0" />
                      <span>
                        Responds to{" "}
                        {hostStats.response_rate <= 1
                          ? Math.round(hostStats.response_rate * 100)
                          : Math.round(hostStats.response_rate)}
                        % of requests, usually within{" "}
                        {formatResponseTime(hostStats.median_response_minutes)}
                      </span>
                    </p>
                  )}
                  {vendor?.bio && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{vendor.bio}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold">Reviews</h2>
              {user && !isOwner && (
                <WriteReviewBox
                  vehicleId={id}
                  userId={user.id}
                  reviews={reviews}
                  onCreated={(row) => {
                    setReviews((prev) => [row, ...(prev ?? [])]);
                    setReviewsTotal((t) => t + 1);
                  }}
                />
              )}
              {!reviews && <Skeleton className="mt-3 h-16" />}
              {reviews && reviews.length === 0 && (
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-8 text-center">
                  <MessageSquareQuote className="mx-auto h-5 w-5 text-brand" />
                  <p className="mt-2 text-sm font-medium">No reviews yet</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Be the first to ride and rate this vehicle.
                  </p>
                </div>
              )}
              {reviews && reviews.length > 0 && (
                <>
                  <ul className="mt-4 space-y-4">
                    {reviews.map((r: any) => (
                      <ReviewItem
                        key={r.id}
                        r={r}
                        isOwner={isOwner}
                        userId={user?.id}
                        onChange={(patch) =>
                          setReviews(
                            (prev) =>
                              prev?.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) ?? null,
                          )
                        }
                      />
                    ))}
                  </ul>
                  {reviews.length < reviewsTotal && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreReviews}
                        disabled={loadingMoreReviews}
                      >
                        {loadingMoreReviews ? "Loading reviews…" : "Show more reviews"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="glass-strong overflow-hidden rounded-3xl border-border/70 p-0 shadow-float">
              <div className="relative overflow-hidden border-b border-border/60 px-6 py-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-brand/20 blur-3xl"
                />
                <div className="relative flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-3xl font-bold leading-none">
                        {currency(v.price_daily)}
                      </span>
                      <span className="text-sm text-muted-foreground">/ day</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      {v.price_hourly && <span>{currency(v.price_hourly)} / hour</span>}
                      {v.price_weekly && <span>{currency(v.price_weekly)} / week</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-semibold">
                    <Star className="h-3.5 w-3.5 fill-brand text-brand" />
                    {Number(v.avg_rating).toFixed(1)}
                  </div>
                </div>
              </div>

              <CardContent className="space-y-5 p-6">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-brand-foreground">
                      1
                    </span>
                    Trip schedule
                  </div>
                  <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card/60">
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/70">
                      <SlotField icon={CalendarDays} label="Pickup date">
                        <DatePicker
                          value={start}
                          onChange={handleStartChange}
                          minDate={new Date()}
                          isDateDisabled={(d) =>
                            isPickupDateFullyBlocked(toIsoDate(d), bookedRanges)
                          }
                          placeholder="dd-mm-yyyy"
                          className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0 hover:bg-transparent"
                        />
                      </SlotField>
                      <SlotField icon={CalendarDays} label="Return date">
                        <DatePicker
                          value={end}
                          onChange={(d) => setEnd(d)}
                          minDate={start || new Date()}
                          maxDate={
                            start
                              ? getNextBookingAfterPickup(start, pickupTime, bookedRanges)
                                  ?.start_date || undefined
                              : undefined
                          }
                          isDateDisabled={(d) =>
                            isReturnDateBlocked(toIsoDate(d), start, pickupTime, bookedRanges)
                          }
                          placeholder="dd-mm-yyyy"
                          className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0 hover:bg-transparent"
                        />
                      </SlotField>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/70">
                      <SlotField icon={Clock} label="Pickup time">
                        <TimePicker
                          value={pickupTime}
                          onChange={(t) => setPickupTime(t)}
                          isTimeDisabled={(t) =>
                            start ? isPickupSlotBlocked(start, t, bookedRanges) : false
                          }
                          placeholder="Select time"
                          className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0 hover:bg-transparent"
                        />
                      </SlotField>
                      <SlotField icon={Clock} label="Drop-off time">
                        <TimePicker
                          value={dropoffTime}
                          onChange={(t) => setDropoffTime(t)}
                          isTimeDisabled={(t) =>
                            end
                              ? isDropoffSlotBlocked(
                                  end,
                                  t,
                                  start,
                                  pickupTime,
                                  bookedRanges,
                                )
                              : false
                          }
                          placeholder="Select time"
                          className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0 hover:bg-transparent"
                        />
                      </SlotField>
                    </div>
                  </div>
                  {returnInfo && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs text-brand animate-fade-in font-medium">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Vehicle returned at {returnInfo.returnTime} — pickup available from {returnInfo.availableFrom}.
                      </span>
                    </div>
                  )}
                  {scheduleConflict && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive animate-fade-in font-medium">
                      <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                      {scheduleConflict}
                    </p>
                  )}
                  {start && end && !scheduleConflict && rentalHours <= 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive animate-fade-in">
                      <CircleAlert className="h-3.5 w-3.5" />
                      Drop-off must be after pickup.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-muted text-[9px] font-bold text-foreground">
                      2
                    </span>
                    Note for the host
                  </div>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Pickup landmark, delivery request, anything else…"
                    className="resize-none rounded-2xl bg-card/60 text-sm"
                  />
                </div>

                {rentalHours > 0 ? (
                  <div className="animate-fade-in rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      <span>Fare breakdown</span>
                      <span className="rounded-full bg-card px-2 py-0.5 text-[10px] normal-case tracking-normal text-foreground">
                        {rentalHours.toFixed(rentalHours % 1 === 0 ? 0 : 1)} h
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {priceBreakdown.lines.map((line, i) => (
                        <div
                          key={line.label}
                          className="animate-fade-in"
                          style={{ animationDelay: `${i * 45}ms` }}
                        >
                          <Row label={line.label} value={currency(line.value)} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5">
                      <ChargeLines
                        base={subtotal}
                        deposit={Number(v.security_deposit)}
                        coupon={coupon}
                        membershipPlan={myProfile?.membership_plan}
                      />
                    </div>
                    <div className="mt-3">
                      <CouponField value={coupon} onChange={setCoupon} service="rental" />
                    </div>
                    {myProfile?.membership_plan === "black" && (
                      <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 space-y-2 text-left">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                            <Crown className="h-3.5 w-3.5 text-violet-500" />
                            <span>Executive VIP Privileges Active</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] border-violet-400 text-violet-600 bg-violet-500/10">
                            Black VIP
                          </Badge>
                        </div>
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          <p className="flex items-center gap-1 text-foreground">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            <span>15% Flat VIP Discount & ₹0 Security Deposit applied</span>
                          </p>
                          <p className="flex items-center gap-1 text-foreground">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            <span>Guaranteed Model Availability (Free auto-upgrade if model unavailable)</span>
                          </p>
                        </div>
                        <div className="pt-2 border-t border-violet-500/20">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                            <input
                              type="checkbox"
                              checked={airportMeet}
                              onChange={(e) => setAirportMeet(e.target.checked)}
                              className="rounded border-border text-brand focus:ring-brand h-3.5 w-3.5"
                            />
                            <span>Request 24/7 Airport Meet & Greet</span>
                          </label>
                          {airportMeet && (
                            <Input
                              placeholder="Arrival Flight No. & Terminal (e.g. 6E 405, T2)"
                              value={flightInfo}
                              onChange={(e) => setFlightInfo(e.target.value)}
                              className="mt-2 text-xs h-8 bg-background"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-center">
                    <CalendarDays className="mx-auto h-5 w-5 text-brand" />
                    <p className="mt-2 text-sm font-medium">Pick your dates to see the fare</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Hourly, daily and weekly rates apply automatically.
                    </p>
                  </div>
                )}

                {user && !dlOk && (
                  <div className="flex items-start gap-2 rounded-2xl border border-ember/40 bg-ember/10 p-3 text-xs">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                    <span>
                      Your driving licence needs approval before booking.{" "}
                      <Link to="/profile" className="font-semibold underline">
                        Verify now
                      </Link>
                    </span>
                  </div>
                )}

                <Button
                  onClick={book}
                  disabled={
                    booking ||
                    !start ||
                    !end ||
                    rentalHours <= 0 ||
                    !!scheduleConflict ||
                    (!!user && !dlOk)
                  }
                  className="btn-gradient group h-12 w-full rounded-2xl text-base"
                >
                  {booking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {v?.instant_book ? "Booking…" : "Sending request…"}
                    </>
                  ) : user ? (
                    dlOk ? (
                      <>
                        {v?.instant_book ? "Book now" : "Request to book"}
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    ) : (
                      "Verify licence to book"
                    )
                  ) : (
                    <>
                      Sign in to book
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {v?.instant_book
                    ? "Instant confirmation — pay within 30 minutes to secure your ride."
                    : "No charge until the host accepts your request."}
                </p>

                <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-center">
                  <Assurance icon={ShieldCheck} label="Verified host" />
                  <Assurance icon={QrCode} label="QR handover" />
                  <Assurance icon={Navigation} label="Live tracking" />
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => !open && !isDeleting && setShowDeleteDialog(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete Vehicle Listing?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">{v.title}</span>?
              </p>
              <p className="text-xs text-muted-foreground">
                This will permanently delete this vehicle from your fleet, including all photos,
                documents, and specifications. This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleDeleteVehicle();
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? "Deleting..." : "Delete Vehicle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SlotField({
  icon: Icon,
  label,
  children,
}: {
  icon: any;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5 transition-colors focus-within:bg-brand/5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0 text-brand" />
        {label}
      </div>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  );
}

function Assurance({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="group flex flex-col items-center gap-1.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted/70 text-brand transition-transform duration-300 group-hover:-translate-y-0.5">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[10px] font-medium leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function Spec({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="lift rounded-2xl border border-border/70 bg-card/70 p-3.5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-brand" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold capitalize">{String(value)}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ReviewItem({
  r,
  isOwner,
  userId,
  onChange,
}: {
  r: any;
  isOwner: boolean;
  userId?: string;
  onChange: (patch: any) => void;
}) {
  const [reply, setReply] = useState(r.vendor_response ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const submitReply = async () => {
    if (!reply.trim()) return;
    setSaving(true);
    const { error } = await api
      .from("reviews")
      .update({
        vendor_response: reply.trim(),
        vendor_response_at: new Date().toISOString(),
      } as any)
      .eq("id", r.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    onChange({ vendor_response: reply.trim(), vendor_response_at: new Date().toISOString() });
    setEditing(false);
    toast.success("Response posted");
  };

  const reportReview = async () => {
    const reason = window.prompt("Why are you reporting this review?");
    if (!reason?.trim()) return;
    const { error } = await api.rpc("report_review" as any, {
      _review_id: r.id,
      _reason: reason.trim(),
    });
    if (error) return toast.error(error.message);
    onChange({ reported: true });
    toast.success("Reported to admins");
  };

  return (
    <li className="border-t border-border pt-4 first:border-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarImage src={r.profiles?.avatar_url} />
          <AvatarFallback>{(r.profiles?.full_name || "U").charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{r.profiles?.full_name || "User"}</span>
        <span className="ml-2 flex items-center text-xs text-muted-foreground">
          <Star className="mr-1 h-3 w-3 fill-foreground text-foreground" />
          {r.rating}
        </span>
        {userId && !isOwner && r.customer_id !== userId && !r.reported && (
          <button
            onClick={reportReview}
            className="ml-auto text-[11px] text-muted-foreground hover:text-destructive"
          >
            Report
          </button>
        )}
        {r.reported && <span className="ml-auto text-[11px] text-muted-foreground">Reported</span>}
      </div>
      {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
      {r.vendor_response && !editing && (
        <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-sm">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">Host reply</p>
          <p className="mt-0.5">{r.vendor_response}</p>
        </div>
      )}
      {isOwner && (
        <div className="mt-2">
          {editing || !r.vendor_response ? (
            <div className="space-y-2">
              <Textarea
                rows={2}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply as the host…"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={submitReply} disabled={saving}>
                  {saving ? "Posting…" : "Post reply"}
                </Button>
                {editing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setReply(r.vendor_response ?? "");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit reply
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function WriteReviewBox({
  vehicleId,
  userId,
  reviews,
  onCreated,
}: {
  vehicleId: string;
  userId: string;
  reviews: any[] | null;
  onCreated: (row: any) => void;
}) {
  const [eligibleBooking, setEligibleBooking] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: bookings } = await api
        .from("bookings")
        .select("id,status,payment_status")
        .eq("vehicle_id", vehicleId)
        .eq("customer_id", userId)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      const unreviewed = (bookings ?? []).find(
        (b) => !reviews?.some((r) => r.booking_id === b.id),
      );
      setEligibleBooking(unreviewed ?? null);
    })();
  }, [vehicleId, userId, reviews]);

  if (!eligibleBooking) return null;

  const submit = async () => {
    setSubmitting(true);
    const { data, error } = await api
      .from("reviews")
      .insert({
        vehicle_id: vehicleId,
        customer_id: userId,
        booking_id: eligibleBooking.id,
        rating,
        comment: comment.trim() || null,
      } as any)
      .select("*")
      .maybeSingle();
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setComment("");
    if (data) {
      const { data: profile } = await api
        .from("public_profiles" as any)
        .select("id,full_name,avatar_url")
        .eq("id", userId)
        .maybeSingle();
      onCreated({ ...data, profiles: profile ?? null });
    }
    toast.success("Thanks for your review!");
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Rate your experience</p>
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star`}>
            <Star
              className={`h-6 w-6 ${n <= rating ? "fill-foreground text-foreground" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>
      <Textarea
        rows={3}
        className="mt-2"
        placeholder="Share how the ride went…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={submit} disabled={submitting}>
          {submitting ? "Posting…" : "Post review"}
        </Button>
      </div>
    </div>
  );
}
