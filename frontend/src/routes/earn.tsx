import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  CarFront,
  Droplets,
  Building2,
  Sparkles,
  Bike,
  Wrench,
  ArrowLeftRight,
  Sun,
  Sofa,
  CalendarRange,
  ShieldCheck,
  Wallet,
  Clock,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { useProviderStatus } from "@/hooks/use-provider-status";

export const Route = createFileRoute("/earn")({
  component: EarnPage,
  head: () => ({
    meta: [
      { title: "Earn with Synchoo — Host, drive, clean & partner" },
      {
        name: "description",
        content:
          "Earn on Synchoo: list your vehicle, drive for customers, become a doorstep car cleaner at ₹249 per car, or enroll your vehicle washing center.",
      },
      { property: "og:title", content: "Earn with Synchoo — Host, drive, clean & partner" },
      {
        property: "og:description",
        content:
          "Four ways to earn on Synchoo: host a vehicle, drive, clean cars at the doorstep, or enroll your washing center.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const PRIMARY = [
  {
    id: "host",
    icon: LayoutDashboard,
    title: "Host your vehicle",
    tag: "Most popular",
    payout: "Up to ₹28,000 / month",
    blurb:
      "List a car, bike or scooter and earn while it sits idle. You set the price, calendar and pickup point.",
    points: [
      "You control pricing & availability",
      "Verified renters with licence checks",
      "Weekly wallet payouts",
    ],
    cta: "Open host dashboard",
    to: "/vendor",
  },
  {
    id: "driver",
    icon: CarFront,
    title: "Drive for customers",
    tag: "Flexible hours",
    payout: "₹180 / hour · ₹1,400 / day",
    blurb: "Get hired by the hour or the day for outstation trips, city drives and events.",
    points: [
      "Accept only the hires you want",
      "Licence verified badge on your profile",
      "Instant payout after each trip",
    ],
    cta: "Open driver dashboard",
    to: "/driver-dashboard",
  },
  {
    id: "cleaner",
    icon: Droplets,
    title: "Become a car cleaner",
    tag: "New",
    payout: "₹249 per car",
    blurb:
      "Visit the customer's home or apartment parking and clean their vehicle. No shop or setup needed.",
    points: [
      "Customer keeps water, car shampoo & cleaning cloth ready",
      "Jobs assigned near your locality",
      "Paid per car, settled same day",
    ],
    cta: "Join as a cleaner",
    to: "/cleaner-dashboard",
  },
  {
    id: "center",
    icon: Building2,
    title: "Enroll your washing center",
    tag: "For businesses",
    payout: "Zero joining fee",
    blurb:
      "Showcase your washing center and take bookings from customers discovering you on Synchoo.",
    points: [
      "Center name, location, logo & photos",
      "Services, pricing, packages & working hours",
      "Contact details and slot-wise bookings",
    ],
    cta: "Enroll your center",
    to: "/wash-center-dashboard",
  },
];

const EXTRA = [
  {
    icon: Sparkles,
    title: "Car detailing",
    price: "₹1,499+",
    desc: "Deep exterior + interior detailing for premium cars.",
  },
  {
    icon: Bike,
    title: "Bike washing",
    price: "₹149",
    desc: "Quick doorstep bike and scooter wash.",
  },
  {
    icon: Wrench,
    title: "Doorstep servicing",
    price: "₹899+",
    desc: "Basic service, oil top-up and checks at home.",
  },
  {
    icon: ArrowLeftRight,
    title: "Pickup & drop",
    price: "₹199",
    desc: "Collect and return vehicles for service or handover.",
  },
  {
    icon: Sun,
    title: "Polishing & wax",
    price: "₹799",
    desc: "Paint polish, wax coating and headlight restore.",
  },
  {
    icon: Sofa,
    title: "Interior cleaning",
    price: "₹599",
    desc: "Vacuum, seat shampoo and dashboard care.",
  },
  {
    icon: CalendarRange,
    title: "Subscription wash",
    price: "₹899 / month",
    desc: "4 washes a month — steady, repeat income.",
  },
];

const STEPS = [
  {
    icon: CheckCircle2,
    title: "Create your profile",
    desc: "Add your details, service area and pricing in under 5 minutes.",
  },
  {
    icon: ShieldCheck,
    title: "Get verified",
    desc: "Upload ID, licence or business proof. Our team reviews it quickly.",
  },
  {
    icon: Clock,
    title: "Go live & accept jobs",
    desc: "Turn your status to Available and start receiving bookings.",
  },
  {
    icon: Wallet,
    title: "Get paid",
    desc: "Earnings land in your Synchoo wallet — withdraw anytime.",
  },
];

function EarnPage() {
  const { isHost, driverStatus, cleanerStatus, washCenterStatus, hasAnyVerifiedRole } =
    useProviderStatus();

  const getStatusInfo = (id: string, fallbackTag: string, fallbackCta: string) => {
    if (id === "host") {
      if (isHost) {
        return {
          badge: (
            <Badge className="bg-emerald-600 text-white gap-1">
              <ShieldCheck className="h-3 w-3" />
              Verified Host
            </Badge>
          ),
          cta: "Open host dashboard",
        };
      }
      return {
        badge: <Badge variant="outline">{fallbackTag}</Badge>,
        cta: "Register vehicle to host",
      };
    }
    if (id === "driver") {
      if (driverStatus === "approved") {
        return {
          badge: (
            <Badge className="bg-emerald-600 text-white gap-1">
              <ShieldCheck className="h-3 w-3" />
              Verified Driver
            </Badge>
          ),
          cta: "Open driver dashboard",
        };
      }
      if (driverStatus === "pending") {
        return {
          badge: (
            <Badge variant="outline" className="border-amber-300 text-amber-600 gap-1">
              <Clock className="h-3 w-3" />
              Under review
            </Badge>
          ),
          cta: "Check driver status",
        };
      }
      if (driverStatus === "rejected") {
        return {
          badge: (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              Needs revision
            </Badge>
          ),
          cta: "Update driver details",
        };
      }
      return { badge: <Badge variant="outline">{fallbackTag}</Badge>, cta: fallbackCta };
    }
    if (id === "cleaner") {
      if (cleanerStatus === "approved") {
        return {
          badge: (
            <Badge className="bg-emerald-600 text-white gap-1">
              <ShieldCheck className="h-3 w-3" />
              Verified Cleaner
            </Badge>
          ),
          cta: "Open cleaner dashboard",
        };
      }
      if (cleanerStatus === "pending") {
        return {
          badge: (
            <Badge variant="outline" className="border-amber-300 text-amber-600 gap-1">
              <Clock className="h-3 w-3" />
              Under review
            </Badge>
          ),
          cta: "Check cleaner status",
        };
      }
      if (cleanerStatus === "rejected") {
        return {
          badge: (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              Needs revision
            </Badge>
          ),
          cta: "Update cleaner profile",
        };
      }
      return { badge: <Badge variant="outline">{fallbackTag}</Badge>, cta: fallbackCta };
    }
    if (id === "center") {
      if (washCenterStatus === "approved") {
        return {
          badge: (
            <Badge className="bg-emerald-600 text-white gap-1">
              <ShieldCheck className="h-3 w-3" />
              Verified Center
            </Badge>
          ),
          cta: "Open center dashboard",
        };
      }
      if (washCenterStatus === "pending") {
        return {
          badge: (
            <Badge variant="outline" className="border-amber-300 text-amber-600 gap-1">
              <Clock className="h-3 w-3" />
              Under review
            </Badge>
          ),
          cta: "Check center status",
        };
      }
      if (washCenterStatus === "rejected") {
        return {
          badge: (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              Needs revision
            </Badge>
          ),
          cta: "Update center profile",
        };
      }
      return { badge: <Badge variant="outline">{fallbackTag}</Badge>, cta: fallbackCta };
    }
    return { badge: <Badge variant="outline">{fallbackTag}</Badge>, cta: fallbackCta };
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pb-16">
        <header className="max-w-2xl">
          <Badge variant="secondary" className="mb-3">
            Earn with us
          </Badge>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Four ways to earn on Synchoo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Whether you own one vehicle, drive for a living, clean cars, or run a washing center —
            pick a path, get verified, and start earning with transparent payouts.
          </p>
        </header>

        {hasAnyVerifiedRole && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-4 dark:bg-emerald-950/20">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Verified Provider Active</p>
                <p className="text-xs text-muted-foreground">
                  You are verified for provider services on Synchoo. Access your active dashboard(s)
                  below.
                </p>
              </div>
            </div>
          </div>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {PRIMARY.map((p) => {
            const statusInfo = getStatusInfo(p.id, p.tag, p.cta);
            return (
              <Card key={p.title} className="rounded-2xl">
                <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                        <p.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-lg font-semibold">{p.title}</h2>
                        <p className="text-sm font-medium text-primary">{p.payout}</p>
                      </div>
                    </div>
                    {statusInfo.badge}
                  </div>

                  <p className="text-sm text-muted-foreground">{p.blurb}</p>

                  <ul className="space-y-1.5 text-sm">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span className="text-muted-foreground">{pt}</span>
                      </li>
                    ))}
                  </ul>

                  <Button asChild className="mt-auto w-full rounded-xl">
                    <Link to={p.to as any}>{statusInfo.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold">Add more services, earn more</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Offer any of these alongside your main service. Pricing below is the suggested Synchoo
            rate.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXTRA.map((e) => (
              <div key={e.title} className="rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <e.icon className="h-4 w-4 shrink-0 text-primary" />
                    <p className="truncate font-medium">{e.title}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{e.price}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{e.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold">How it works</h2>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <s.icon className="h-4 w-4 shrink-0 text-primary" />
                  Step {i + 1}
                </div>
                <p className="mt-2 font-medium">{s.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold">Ready to start earning?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your provider profile once — you can offer hosting, driving, cleaning or
                center services from the same account.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="rounded-xl">
                <Link to="/vendor">Get started</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/wash">Wash services</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
