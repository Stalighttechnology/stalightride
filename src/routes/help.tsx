import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SupportTicketForm } from "@/components/support-ticket-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Car, UserRound, Droplets, Users, Wallet, ShieldCheck, Bell, Star, QrCode,
  ScanLine, ReceiptText, LifeBuoy, LayoutDashboard, MapPin, CreditCard, AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/help")({
  component: Help,
  head: () => ({
    meta: [
      { title: "Help Centre & User Manual — Synchoo" },
      { name: "description", content: "Step-by-step guide to Synchoo: rentals, driver hire, car pooling, vehicle wash, verification, payments, refunds, booking statuses, notifications and admin operations." },
      { property: "og:title", content: "Help Centre & User Manual — Synchoo" },
      { property: "og:description", content: "Complete user manual for renters, hosts, drivers and admins — every booking flow, verification step, payment and refund rule explained." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Help Centre & User Manual — Synchoo" },
      { name: "twitter:description", content: "Every Synchoo feature and booking flow explained in plain language." },
    ],
    links: [{ rel: "canonical", href: "https://stalightride.lovable.app/help" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Why can't I book a vehicle yet?",
            acceptedAnswer: { "@type": "Answer", text: "Bookings require an approved driving licence. Upload your licence on your Profile page and wait for admin approval." },
          },
          {
            "@type": "Question",
            name: "When can I start my trip?",
            acceptedAnswer: { "@type": "Answer", text: "Check-in opens 30 minutes before your pickup time. Open the booking, scan the QR code and complete the fuel, odometer and photo check." },
          },
          {
            "@type": "Question",
            name: "How are refunds paid?",
            acceptedAnswer: { "@type": "Answer", text: "Refunds are credited to your Synchoo wallet and appear instantly as a transaction you can spend on the next booking." },
          },
        ],
      }),
    }],
  }),
});

type Step = { title: string; body: string };

function Flow({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {steps.map((s, i) => (
        <li key={s.title} className="relative">
          <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-[11px] font-semibold text-foreground">
            {i + 1}
          </span>
          <p className="text-sm font-medium text-foreground">{s.title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

function Diagram({ children, caption }: { children: string; caption: string }) {
  return (
    <figure className="mt-4">
      <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
{children}
      </pre>
      <figcaption className="mt-1.5 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

const MODULES: { icon: LucideIcon; title: string; desc: string; to: string }[] = [
  { icon: Car, title: "Vehicle rentals", desc: "Rent cars, bikes, scooters and EVs by the hour, day or week.", to: "/browse" },
  { icon: UserRound, title: "Hire a driver", desc: "Book a verified driver for hourly or daily duty.", to: "/drivers" },
  { icon: Users, title: "Car pooling", desc: "Share a ride along a matching route and split the fare per seat.", to: "/pooling" },
  { icon: Droplets, title: "Vehicle wash", desc: "Book a doorstep wash slot; admin assigns a partner.", to: "/wash" },
  { icon: Wallet, title: "Wallet", desc: "Top up, pay for bookings and receive refunds instantly.", to: "/wallet" },
  { icon: LayoutDashboard, title: "Host & driver dashboards", desc: "Listings, availability, earnings and booking requests.", to: "/earn" },
];

function Help() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="max-w-2xl mb-8">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Help centre</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Synchoo user manual
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Everything the app can do, in plain language: how each booking works, what verification is needed, how money
            and refunds move, what each status means, and what to do when something goes wrong.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Quick Jump Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              <Card className="p-4 bg-muted/40 border-border">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Guide Sections
                </p>
                <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0 text-xs font-medium">
                  {[
                    { label: "1. Getting started", href: "#start", icon: ShieldCheck },
                    { label: "2. Vehicle rentals", href: "#rental", icon: Car },
                    { label: "3. Driver hire", href: "#drivers", icon: UserRound },
                    { label: "4. Car pooling", href: "#pooling", icon: Users },
                    { label: "5. Vehicle wash", href: "#wash", icon: Droplets },
                    { label: "6. Wallet & refunds", href: "#wallet", icon: Wallet },
                    { label: "7. Rules & lifecycles", href: "#rules", icon: Star },
                    { label: "8. Troubleshooting", href: "#trouble", icon: LifeBuoy },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-brand" />
                        <span>{item.label}</span>
                      </a>
                    );
                  })}
                </nav>
              </Card>

              <Card className="hidden lg:block p-3.5 text-xs text-muted-foreground bg-brand/5 border-brand/20">
                <p className="font-semibold text-foreground mb-1">Need human support?</p>
                Email our 24/7 care team at{" "}
                <span className="font-mono text-foreground font-medium">care@synchoo.com</span>
              </Card>
            </div>
          </aside>

          {/* Main Manual Content */}
          <div className="lg:col-span-3 space-y-12">
            {/* Modules */}
            <section aria-labelledby="modules">
              <h2 id="modules" className="font-display text-xl font-semibold">What's inside Synchoo</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.map((m) => (
                  <Card key={m.title} className="glass">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <m.icon className="h-4 w-4 text-brand" aria-hidden /> {m.title}
                      </CardTitle>
                      <CardDescription>{m.desc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button asChild variant="ghost" size="sm" className="px-0 text-brand hover:bg-transparent">
                        <Link to={m.to}>Open</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

        {/* Getting started */}
        <section className="mt-12" aria-labelledby="start">
          <h2 id="start" className="font-display text-xl font-semibold">1. Getting started</h2>
          <Card className="glass mt-4">
            <CardContent className="pt-6">
              <Flow
                steps={[
                  { title: "Create an account", body: "Sign up with email and a password, or use Sign in with Google. You land on the screen that matches your account type." },
                  { title: "Complete your profile", body: "Add your name, phone and city on the Profile page. These are what hosts see on a booking." },
                  { title: "Verify your driving licence", body: "Upload the front and back of your licence with its number and expiry. An admin reviews it; you get a notification when it is approved or rejected with a reason." },
                  { title: "Pick your city", body: "Use the city selector in the top bar so search, pooling and wash slots default to where you are." },
                ]}
              />
              <Diagram caption="Licence verification states shown on your profile.">{`none  ──upload──▶  pending  ──admin approve──▶  approved  ──▶ booking allowed
                            │
                            └──admin reject──▶  rejected (reason shown, resubmit)`}</Diagram>
            </CardContent>
          </Card>
        </section>

        {/* Rental flow */}
        <section className="mt-12" aria-labelledby="rental">
          <h2 id="rental" className="font-display text-xl font-semibold">2. Renting a vehicle</h2>
          <Card className="glass mt-4">
            <CardContent className="pt-6">
              <Flow
                steps={[
                  { title: "Search and filter", body: "Browse Rides lists only approved, active vehicles. Filter by city, category, fuel, transmission and price; pick your dates and vehicles already booked or blocked for that window disappear from the list." },
                  { title: "Open the vehicle", body: "See photos, specs, price tiers, host rating, reviews and the exact pickup point on the map with directions from your location." },
                  { title: "Choose your window", body: "Set start and end dates plus pickup and drop-off times. The price panel shows the base charge using the best hourly/daily/weekly tier, any coupon discount, the security deposit and the total." },
                  { title: "Pay", body: "Pay by card/UPI through the payment gateway, or from your wallet balance if it covers the total." },
                  { title: "Confirmation", body: "The booking appears in My Trips with a QR code and a receipt. Chat with the host unlocks for this booking." },
                  { title: "Check-in at pickup", body: "Check-in opens 30 minutes before pickup. Scan the QR, record fuel level, odometer, photos and any existing damage." },
                  { title: "Drive with live tracking", body: "During an active trip your location is shared with the host and support so pickup and route are always clear." },
                  { title: "Check-out at return", body: "Repeat the fuel, odometer, photo and damage checklist. The trip completes, the deposit is released after a clean check, and the review option unlocks." },
                ]}
              />
              <Diagram caption="Rental booking status lifecycle.">{`pending ──host accepts / payment ok──▶ confirmed ──check-in──▶ (trip active) ──check-out──▶ completed
   │                                        │
   ├── host rejects ──▶ rejected            └── cancelled (refund per policy)`}</Diagram>
            </CardContent>
          </Card>
        </section>

        {/* Other flows */}
        <section className="mt-12" aria-labelledby="flows">
          <h2 id="flows" className="font-display text-xl font-semibold">3. The other booking flows</h2>
          <Accordion type="single" collapsible className="glass mt-4 px-4 sm:px-6">
            <AccordionItem value="driver">
              <AccordionTrigger className="text-sm font-medium">Hire a driver</AccordionTrigger>
              <AccordionContent>
                <Flow
                  steps={[
                    { title: "Find a driver", body: "The driver directory shows only admin-verified drivers, with experience, languages, vehicle types they can drive, rating and hourly/daily rates." },
                    { title: "Choose hours or days", body: "Pick a rate type, dates and times. Hourly duty bills per hour; daily duty bills per day. The total is shown before payment." },
                    { title: "Pay and wait for acceptance", body: "Pay by card or wallet. The driver receives the request and accepts or declines; declines are refunded in full." },
                    { title: "Cancel if plans change", body: "Full refund more than 24 hours before start, 50% between 2 and 24 hours, none within 2 hours. The exact refund is shown before you confirm." },
                    { title: "Rate the driver", body: "After completion you can leave a rating and comment; the driver may post one response." },
                  ]}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pool">
              <AccordionTrigger className="text-sm font-medium">Car pooling</AccordionTrigger>
              <AccordionContent>
                <Flow
                  steps={[
                    { title: "Driver offers a trip", body: "The driver sets origin, destination, departure time, seats and fare per seat. The route is stored so it can be matched." },
                    { title: "Passenger searches", body: "Enter your pickup and drop points. Synchoo scores how closely your route follows each trip's corridor and shows the best matches first." },
                    { title: "Request seats", body: "Pick the number of seats and send a request with an optional note. Your fare is seats × fare per seat." },
                    { title: "Driver accepts or declines", body: "Seats are reserved only on acceptance, and available seats reduce automatically. Overbooking is blocked by the database." },
                    { title: "Travel and cancel safely", body: "Either side can cancel before departure; released seats return to the trip immediately." },
                  ]}
                />
                <Diagram caption="Pooling seat accounting.">{`trip: 4 seats ──request(2) pending──▶ still 4 available
              ──driver accepts──▶ 2 available
              ──passenger cancels──▶ 4 available again`}</Diagram>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="wash">
              <AccordionTrigger className="text-sm font-medium">Vehicle wash</AccordionTrigger>
              <AccordionContent>
                <Flow
                  steps={[
                    { title: "Pick a service and slot", body: "Choose a wash package for your vehicle type, then a date, time slot and address." },
                    { title: "Admin reviews availability", body: "Requests go to the admin queue, which assigns a wash partner if a cleaner is free, or rejects with a reason." },
                    { title: "Pay after approval", body: "Once approved, pay by card or wallet to confirm the slot. Rejected requests cost nothing." },
                    { title: "Service and receipt", body: "The partner completes the wash and the booking is marked completed with a downloadable bill." },
                  ]}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="host">
              <AccordionTrigger className="text-sm font-medium">Hosting a vehicle or working as a driver</AccordionTrigger>
              <AccordionContent>
                <Flow
                  steps={[
                    { title: "Submit host or driver details", body: "From Earn with Synchoo, register as a host, driver, car cleaner or wash centre. Provide business/identity details for review." },
                    { title: "List your vehicle", body: "Add photos, specs, prices, address (with map pin and address autocomplete) and upload registration, insurance, pollution and fitness documents." },
                    { title: "Wait for approval", body: "New listings and drivers always start pending — nothing goes public until an admin approves it. Rejections state exactly what to fix." },
                    { title: "Manage bookings", body: "Accept or reject requests, block unavailable dates on the calendar, chat with renters and complete handovers." },
                    { title: "Track earnings", body: "The dashboard shows bookings, occupancy and earnings; payouts follow completed trips." },
                  ]}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Money */}
        <section className="mt-12" aria-labelledby="money">
          <h2 id="money" className="font-display text-xl font-semibold">4. Payments, wallet and refunds</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-cyan" aria-hidden /> Paying</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Card and UPI payments run through the payment gateway; Synchoo never stores card data. Wallet payments are
                instant and are recorded in your ledger with the balance after each entry.
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-emerald" aria-hidden /> Refunds</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Cancellations, rejected requests and approved disputes are credited to your wallet, ready to spend on the
                next booking. Every entry shows the reason and the related booking.
              </CardContent>
            </Card>
          </div>
          <Diagram caption="How money moves through a booking.">{`top-up ──▶ wallet ──pay──▶ booking (deposit held)
                       │
   card/UPI ──pay──────┘
                       └──cancel / dispute approved──▶ refund ──▶ wallet`}</Diagram>
        </section>

        {/* Statuses */}
        <section className="mt-12" aria-labelledby="statuses">
          <h2 id="statuses" className="font-display text-xl font-semibold">5. What each status means</h2>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {[
              ["pending", "Waiting for host, driver or admin action."],
              ["confirmed", "Paid and locked in; handover will open before pickup."],
              ["rejected", "Declined by the host, driver or admin; any payment is refunded."],
              ["cancelled", "Ended before it started; refund follows the policy shown."],
              ["completed", "Finished — receipt available and reviews unlocked."],
            ].map(([s, d]) => (
              <div key={s} className="glass flex min-w-[240px] flex-1 items-start gap-3 p-3">
                <Badge variant="secondary" className="shrink-0 capitalize">{s}</Badge>
                <span className="text-sm text-muted-foreground">{d}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section className="mt-12" aria-labelledby="trust">
          <h2 id="trust" className="font-display text-xl font-semibold">6. Verification, safety and support</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: ShieldCheck, t: "Documents reviewed", d: "Licences, host identity, and vehicle registration, insurance, pollution and fitness are all checked by an admin before anything goes live." },
              { icon: QrCode, t: "QR handover", d: "Pickup and return are confirmed by scanning the booking QR — no confusion about who took the vehicle and when." },
              { icon: MapPin, t: "Live trip tracking", d: "During an active trip the map shows live position and directions to the host's exact pin." },
              { icon: AlertTriangle, t: "Damage & fuel record", d: "Photos, fuel percentage, odometer and a damage checklist are captured at both ends of the trip." },
              { icon: LifeBuoy, t: "Disputes", d: "Raise a dispute from a booking with photos; admins review the evidence and record a resolution." },
              { icon: Bell, t: "Notifications", d: "Bell alerts for booking requests, acceptances, payments, verification results, messages and wash approvals." },
            ].map((i) => (
              <Card key={i.t} className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><i.icon className="h-4 w-4 text-brand" aria-hidden /> {i.t}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{i.d}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Reviews + admin */}
        <section className="mt-12 grid gap-4 lg:grid-cols-2" aria-labelledby="reviews">
          <Card className="glass">
            <CardHeader>
              <CardTitle id="reviews" className="flex items-center gap-2 text-base"><Star className="h-4 w-4 text-ember" aria-hidden /> 7. Reviews and ratings</CardTitle>
              <CardDescription>Only real, completed trips can be reviewed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Rate 1–5 stars and add a comment after a trip completes. Averages on vehicle and driver profiles update automatically.</p>
              <p>Hosts and drivers can post a single public response, and cannot change your rating or comment. Anything abusive can be reported for admin review.</p>
            </CardContent>
          </Card>
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ScanLine className="h-4 w-4 text-violet" aria-hidden /> 8. Admin operations</CardTitle>
              <CardDescription>Available to admin accounts at /admin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Queues for host identity, driver verification, licences and vehicle documents — approve, or reject with a reason that the user sees.</p>
              <p>Wash requests are assigned to a partner or rejected. Disputes are reviewed with photo evidence and closed with a written resolution and any refund.</p>
            </CardContent>
          </Card>
        </section>

        {/* Troubleshooting */}
        <section className="mt-12" aria-labelledby="trouble">
          <h2 id="trouble" className="font-display text-xl font-semibold">9. Troubleshooting and edge cases</h2>
          <Accordion type="single" collapsible className="glass mt-4 px-4 sm:px-6">
            {[
              ["I can't create a booking", "Your driving licence must be approved first. Check Profile — if it says pending, an admin is still reviewing; if rejected, the reason explains what to re-upload."],
              ["My new listing isn't visible", "Every listing starts as pending and becomes public only after admin approval. Make sure all four documents are uploaded and readable."],
              ["The vehicle I wanted disappeared", "It is booked or blocked for the dates you selected. Change the window or check other vehicles in the city."],
              ["Check-in button is disabled", "Handover opens 30 minutes before your pickup time and needs a confirmed, paid booking."],
              ["Chat isn't available", "Messaging unlocks only between a renter and the host of an existing booking, and stays available for that booking."],
              ["Payment succeeded but status is still pending", "Some flows wait for the host, driver or admin to accept. If nothing changes, open the booking and raise a dispute so support can trace the payment reference."],
              ["Live location isn't updating", "Location needs browser permission and an active trip. Re-enable location for the site and reload; the trip itself is unaffected."],
              ["I can't delete my account", "Deletion is blocked while a rental, hire or wash booking is pending or confirmed. Complete or cancel it, then try again."],
            ].map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-left text-sm font-medium">{q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Raise a Support Ticket Form */}
        <section className="mt-12" id="ticket-support">
          <SupportTicketForm defaultCategory="Other" />
        </section>

        {/* Footer CTAs */}
        <section className="mt-12 grid gap-3 sm:grid-cols-3">
          <Button asChild className="btn-gradient"><Link to="/browse">Browse rides</Link></Button>
          <Button asChild variant="outline"><Link to="/bookings"><ReceiptText className="mr-2 h-4 w-4" />My trips & bills</Link></Button>
          <Button asChild variant="outline"><Link to="/data-deletion">Privacy & data controls</Link></Button>
        </section>
          </div>
        </div>
      </main>

    </div>
  );
}
