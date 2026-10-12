import { CityPicker } from "@/components/city-picker";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/format";
import { useSelectedCity } from "@/components/city-selector";
import { toast } from "sonner";
import { Droplets, Clock, ShieldCheck, MapPin, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/wash")({
  component: WashPage,
  head: () => ({
    meta: [
      { title: "Vehicle wash & detailing at your doorstep — Synchoo" },
      {
        name: "description",
        content:
          "Book a doorstep bike, scooter, car or EV wash slot in minutes. Our team confirms a washer partner for your slot, then you pay by wallet or card.",
      },
      { property: "og:title", content: "Vehicle wash & detailing — Synchoo" },
      { property: "og:description", content: "Doorstep vehicle wash slots, confirmed by our team before you pay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

const CATEGORY_LABEL: Record<string, string> = {
  bike: "Bike",
  motorcycle: "Motorcycle",
  scooter: "Scooter",
  car: "Car",
  ev: "Electric",
};

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function WashPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const { city: selectedCity } = useSelectedCity();
  const [services, setServices] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    city: "",
    address: "",
    vehicle_label: "",
    slot_date: todayISO(),
    slot_time: "10:00",
    notes: "",
  });

  // Prefill the city from the top-bar city selector, then from the saved profile city.
  useEffect(() => {
    if (selectedCity) setForm((f) => (f.city ? f : { ...f, city: selectedCity }));
  }, [selectedCity]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("city")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.city) setForm((f) => (f.city ? f : { ...f, city: data.city as string }));
      });
  }, [user]);

  useEffect(() => {
    supabase
      .from("wash_services")
      .select("id,name,description,vehicle_category,price,duration_minutes,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setServices(data ?? []);
      });
  }, []);

  const service = useMemo(() => (services ?? []).find((s) => s.id === selected) ?? null, [services, selected]);

  const submit = async () => {
    if (!user) return navigate({ to: "/auth" });
    if (!service) return toast.error("Choose a wash package");
    if (!form.city.trim() || !form.address.trim()) return toast.error("Add your city and address");
    if (!form.slot_date || !form.slot_time) return toast.error("Pick a slot date and time");

    setSaving(true);
    const { error } = await supabase.from("wash_bookings").insert({
      customer_id: user.id,
      service_id: service.id,
      city: form.city.trim(),
      address: form.address.trim(),
      vehicle_label: form.vehicle_label.trim() || null,
      slot_date: form.slot_date,
      slot_time: form.slot_time,
      notes: form.notes.trim() || null,
      price: service.price,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Slot requested — our team will confirm a washer partner shortly");
    navigate({ to: "/washes" });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-border bg-muted/40">
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <Badge variant="outline" className="mb-3 gap-1.5">
            <Droplets className="h-3.5 w-3.5" /> Doorstep service
          </Badge>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Vehicle wash & detailing</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Pick a package and a slot. Our team assigns a verified washer partner and confirms availability — you only pay
            after the slot is approved.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: CalendarClock, t: "1. Request a slot", d: "Choose package, date, time and address." },
              { icon: ShieldCheck, t: "2. Team approval", d: "We assign a washer partner and approve it." },
              { icon: Droplets, t: "3. Pay & relax", d: "Pay by wallet or card, then we clean it." },
            ].map((s) => (
              <div key={s.t} className="rounded-2xl border border-border bg-card p-4">
                <s.icon className="h-5 w-5 text-primary" />
                <p className="mt-2 text-sm font-medium">{s.t}</p>
                <p className="text-xs text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="font-display text-xl font-semibold">Choose a package</h2>
          {!services && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          )}
          {services && services.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">No wash packages are available right now.</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(services ?? []).map((s) => {
              const active = selected === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  aria-pressed={active}
                  className={`rounded-2xl border p-4 text-left transition-all hover:shadow-md ${
                    active ? "border-primary ring-2 ring-primary/30" : "border-border"
                  } bg-card`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.name}</p>
                    <Badge variant="secondary">{CATEGORY_LABEL[s.vehicle_category] ?? s.vehicle_category}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="font-semibold">{currency(s.price)}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {s.duration_minutes} min
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-semibold">Book your slot</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {service ? `${service.name} · ${currency(service.price)}` : "Select a package to continue"}
            </p>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wash-city">City</Label>
                <CityPicker id="wash-city" value={form.city} onChange={(c) => setForm({ ...form, city: c })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wash-address">Address where we should come</Label>
                <Textarea
                  id="wash-address"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Flat / building, street, landmark"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wash-vehicle">Vehicle (optional)</Label>
                <Input
                  id="wash-vehicle"
                  value={form.vehicle_label}
                  onChange={(e) => setForm({ ...form, vehicle_label: e.target.value })}
                  placeholder="Hyundai i20 · KA01AB1234"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1.5 min-w-0">
                  <Label htmlFor="wash-date">Date</Label>
                  <Input
                    id="wash-date"
                    type="date"
                    min={todayISO()}
                    value={form.slot_date}
                    onChange={(e) => setForm({ ...form, slot_date: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wash-time">Slot</Label>
                  <select
                    id="wash-time"
                    value={form.slot_time}
                    onChange={(e) => setForm({ ...form, slot_time: e.target.value })}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {SLOTS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wash-notes">Notes (optional)</Label>
                <Textarea
                  id="wash-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Parking level, gate code, pet hair, etc."
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              <MapPin className="mb-1 h-3.5 w-3.5" />
              No payment now. Once our team confirms a washer partner for your slot, pay from your wallet or by card on the
              “My washes” page.
            </div>

            {user ? (
              <Button className="mt-4 w-full" disabled={saving || !service} onClick={submit}>
                {saving ? "Requesting…" : "Request this slot"}
              </Button>
            ) : (
              <Button asChild className="mt-4 w-full">
                <Link to="/auth">Sign in to book a wash</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
