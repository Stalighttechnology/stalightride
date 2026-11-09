import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { CityPicker } from "@/components/city-picker";
import { useSelectedCity } from "@/components/city-selector";
import {
  ShieldCheck,
  MapPin,
  Clock,
  ArrowRight,
  Car,
  UserRound,
  Droplets,
  Wallet,
  Navigation,
  QrCode,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { HeroIllustration } from "@/components/hero-illustration";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Synchoo — Premium car, bike & EV rentals near you" },
      { name: "description", content: "Book cars, motorcycles, scooters and EVs from verified local hosts. Instant confirmation, QR handover, live GPS tracking and secure wallet payments." },
      { property: "og:title", content: "Synchoo — Premium car, bike & EV rentals near you" },
      { property: "og:description", content: "Book cars, motorcycles, scooters and EVs from verified local hosts. Instant confirmation, QR handover, live GPS tracking and secure wallet payments." },
      { property: "og:url", content: "https://stalightride.lovable.app/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://stalightride.lovable.app/" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Synchoo",
        url: "https://stalightride.lovable.app/",
        slogan: "Ride. Share. Explore.",
      }),
    }],
  }),
});

const CATS = [
  { key: "car", label: "Cars", desc: "Sedans & SUVs" },
  { key: "ev", label: "Electric", desc: "Zero-emission rides" },
  { key: "motorcycle", label: "Motorcycles", desc: "Cruisers & sport" },
  { key: "scooter", label: "Scooters", desc: "Zip through the city" },
] as const;

function Index() {
  const navigate = useNavigate();
  const { city: savedCity, select: saveCity } = useSelectedCity();
  const [city, setCity] = useState(savedCity ?? "");
  const [service, setService] = useState<"rental" | "driver" | "wash">("rental");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("10:00");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("10:00");

  useEffect(() => {
    if (savedCity && !city) {
      setCity(savedCity);
    }
  }, [savedCity]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (service === "rental") {
      navigate({
        to: "/browse",
        search: {
          city: city || undefined,
          start: pickupDate || undefined,
          end: returnDate || undefined,
        } as any,
      });
    } else if (service === "driver") {
      navigate({ to: "/drivers", search: { city: city || undefined } as any });
    } else {
      navigate({ to: "/wash" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* ————— Hero ————— */}
      <section className="aurora relative overflow-hidden">
        <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.05fr_1fr] md:items-center md:py-28">
          <div className="rise flex flex-col justify-center">
            <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight text-foreground sm:text-6xl md:text-[4.2rem]">
              Move like the
              <br />
              <span className="text-gradient">future arrived.</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Cars, motorcycles, scooters and EVs from verified local hosts — booked in seconds,
              unlocked with a QR scan, tracked in real time.
            </p>

            {/* Service selector + Shadcn Date/Time Search Form */}
            <div className="mt-8 flex w-full max-w-xl flex-col gap-3 rounded-3xl border border-border/80 bg-card/75 p-3.5 shadow-xl backdrop-blur-xl">
              <div className="flex gap-1.5 rounded-2xl bg-muted/70 p-1">
                <button
                  type="button"
                  onClick={() => setService("rental")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all sm:text-sm ${
                    service === "rental"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Car className="h-4 w-4" /> Vehicle Rental
                </button>
                <button
                  type="button"
                  onClick={() => setService("driver")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all sm:text-sm ${
                    service === "driver"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UserRound className="h-4 w-4" /> Hire Driver
                </button>
                <button
                  type="button"
                  onClick={() => setService("wash")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all sm:text-sm ${
                    service === "wash"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Droplets className="h-4 w-4" /> Doorstep Wash
                </button>
              </div>

              <form onSubmit={search} className="flex flex-col gap-2.5">
                <div className="relative min-w-0">
                  <CityPicker
                    id="hero-city"
                    value={city}
                    onChange={(nextCity) => {
                      setCity(nextCity);
                      if (nextCity) {
                        saveCity(nextCity);
                      } else {
                        saveCity(null);
                      }
                    }}
                    allowClear
                    placeholder={
                      service === "rental"
                        ? "Where are you riding? (e.g. Bangalore, Mumbai)"
                        : service === "driver"
                        ? "City where you need a driver"
                        : "City for doorstep wash"
                    }
                    className="h-11 rounded-xl border-border/70 bg-background/90 px-3.5 text-sm shadow-xs hover:bg-background/95 transition-colors"
                  />
                </div>

                {service === "rental" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-[11px] font-medium text-muted-foreground">Pickup</label>
                      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-1.5 min-w-0">
                        <DatePicker
                          value={pickupDate}
                          onChange={setPickupDate}
                          minDate={new Date()}
                          placeholder="dd-mm-yyyy"
                          className="h-10 rounded-xl px-2.5 text-xs sm:text-xs"
                        />
                        <TimePicker
                          value={pickupTime}
                          onChange={setPickupTime}
                          placeholder="Time"
                          className="h-10 rounded-xl px-2.5 text-xs sm:text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-[11px] font-medium text-muted-foreground">Return</label>
                      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-1.5 min-w-0">
                        <DatePicker
                          value={returnDate}
                          onChange={setReturnDate}
                          minDate={pickupDate || new Date()}
                          placeholder="dd-mm-yyyy"
                          className="h-10 rounded-xl px-2.5 text-xs sm:text-xs"
                        />
                        <TimePicker
                          value={returnTime}
                          onChange={setReturnTime}
                          placeholder="Time"
                          className="h-10 rounded-xl px-2.5 text-xs sm:text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {service === "driver" && (
                  <div className="space-y-1.5 text-xs min-w-0">
                    <label className="text-[11px] font-medium text-muted-foreground">When do you need the driver?</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                      <DatePicker
                        value={pickupDate}
                        onChange={setPickupDate}
                        minDate={new Date()}
                        placeholder="dd-mm-yyyy"
                        className="h-10 rounded-xl px-2.5 text-xs sm:text-xs"
                      />
                      <TimePicker
                        value={pickupTime}
                        onChange={setPickupTime}
                        placeholder="Reporting time"
                        className="h-10 rounded-xl px-2.5 text-xs sm:text-xs"
                      />
                    </div>
                  </div>
                )}

                <Button type="submit" size="lg" className="btn-gradient mt-1 h-12 gap-2 rounded-xl text-sm font-semibold">
                  {service === "rental" ? "Find a ride" : service === "driver" ? "Find drivers" : "Book wash slot"}{" "}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {CATS.map((c) => (
                <Link
                  key={c.key}
                  to="/browse"
                  search={{ category: c.key } as any}
                  className="glass group inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <CategoryIcon name={c.key} className="h-4 w-4" />
                  {c.label}
                </Link>
              ))}
            </div>

            <dl className="mt-11 grid max-w-lg grid-cols-3 gap-2 text-left sm:gap-4">
              {[
                { k: "QR", v: "Pickup & return" },
                { k: "GPS", v: "Active-trip sharing" },
                { k: "Wallet", v: "Booking payments" },
              ].map((s) => (
                <div key={s.v} className="glass min-w-0 px-2.5 py-2 sm:px-4 sm:py-3">
                  <dt className="flex items-center gap-1 font-display text-lg font-bold text-foreground sm:text-2xl">
                    {s.k}
                  </dt>
                  <dd className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="glow-border glass-strong floaty relative p-5 sm:p-7">
              <HeroIllustration className="mx-auto h-auto w-full max-w-xl" />
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="glass flex items-center gap-2 px-3 py-2.5">
                  <QrCode className="h-4 w-4 text-cyan" aria-hidden />
                  QR handover
                </div>
                <div className="glass flex items-center gap-2 px-3 py-2.5">
                  <Navigation className="h-4 w-4 text-emerald" aria-hidden />
                  Live GPS trip
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ————— Services ————— */}
      <section className="cv-auto relative py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Everything mobility, one platform</h2>
            <p className="mt-3 text-base text-muted-foreground">
              Rent a vehicle, hire a verified driver, or book a doorstep wash — pay by card or Synchoo wallet.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: "/browse", icon: Car, title: "Rent a vehicle", body: "Cars, bikes, scooters and EVs by hour, day or week.", cta: "Browse rides", tint: "text-brand" },
              { to: "/drivers", icon: UserRound, title: "Hire a driver", body: "Licence-verified drivers on hourly or daily rates.", cta: "Find drivers", tint: "text-cyan" },
              { to: "/wash", icon: Droplets, title: "Vehicle wash", body: "Pick a slot at your address — approved by our team.", cta: "Book a wash", tint: "text-violet" },
              { to: "/wallet", icon: Wallet, title: "Synchoo wallet", body: "Top up once, pay instantly, refunds back in seconds.", cta: "Open wallet", tint: "text-emerald" },
            ].map((s, i) => (
              <Link
                key={s.title}
                to={s.to}
                className="glass lift group flex flex-col p-6"
                style={{ animation: `sy-rise 620ms ${i * 90}ms both` }}
              >
                <div className="glass grid h-12 w-12 place-items-center rounded-xl">
                  <s.icon className={`h-5 w-5 ${s.tint}`} aria-hidden />
                </div>
                <div className="mt-5 flex-1">
                  <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {s.cta} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ————— How it works ————— */}
      <section className="cv-auto relative py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { n: "01", title: "Find your ride", body: "Search by city and category. Compare verified vehicles with real photos and ratings." },
              { n: "02", title: "Book in seconds", body: "Pick your dates, pay by card or wallet, and get instant confirmation." },
              { n: "03", title: "Check in & go", body: "Meet your host, scan the QR to confirm handover, and complete the pickup inspection." },
            ].map((s, i) => (
              <div
                key={s.n}
                className="glass glow-border relative p-7"
                style={{ animation: `sy-rise 620ms ${i * 110}ms both` }}
              >
                <div className="font-display text-5xl font-bold text-gradient">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ————— Trust ————— */}
      <section className="cv-auto relative py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Verified hosts", body: "Every host completes ID & document checks before going live.", tint: "text-emerald" },
              { icon: MapPin, title: "Precise pickup", body: "Live map pin with the exact vehicle location — no guesswork.", tint: "text-brand" },
              { icon: Clock, title: "Flexible pricing", body: "Rent by the hour, day, or week — pay only for what you use.", tint: "text-cyan" },
            ].map((f) => (
              <div key={f.title} className="glass lift group p-7">
                <div className="glass grid h-12 w-12 place-items-center rounded-xl">
                  <f.icon className={`h-5 w-5 ${f.tint}`} />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ————— Host CTA ————— */}
      <section className="cv-auto py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="aurora glow-border glass-strong relative overflow-hidden p-8 sm:p-14">
            <div className="relative grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div>
                <h2 className="font-display text-3xl font-bold sm:text-4xl">Turn your idle vehicle into income</h2>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
                  List your car, bike, or scooter in minutes. You control availability and pricing — we handle
                  payments, verification, and support.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="btn-gradient h-12 rounded-2xl px-7">
                    <Link to="/vendor">Become a host</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12 rounded-2xl border-border/70 bg-card/40 px-7 backdrop-blur">
                    <Link to="/browse">Browse rides</Link>
                  </Button>
                </div>
              </div>
              <ul className="grid gap-3 text-sm">
                {["Control pricing and availability", "Booking payment records", "Vehicle document review", "Trip evidence and dispute tools"].map((t) => (
                  <li key={t} className="glass flex items-center gap-2.5 px-4 py-3">
                    <ShieldCheck className="h-4 w-4 text-emerald" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
