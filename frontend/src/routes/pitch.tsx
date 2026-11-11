import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  Check,
  Download,
  Droplets,
  Layers3,
  MapPinned,
  QrCode,
  Route as RouteIcon,
  ShieldCheck,
  CircleGauge,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import pitch from "@/content/pitch.json";

export const Route = createFileRoute("/pitch")({
  component: PitchPage,
  head: () => ({
    meta: [
      { title: "Synchoo enterprise pitch — Unified mobility platform" },
      { name: "description", content: "Explore Synchoo's verified product capabilities, mobility workflows, platform architecture, trust controls and delivery roadmap." },
      { property: "og:title", content: "Synchoo enterprise pitch — Unified mobility platform" },
      { property: "og:description", content: "A verified executive overview of Synchoo's rental, driver, pooling and vehicle-care platform." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://stalightride.lovable.app/pitch" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://stalightride.lovable.app/pitch" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Synchoo enterprise pitch",
        description: "Verified product, workflow, architecture and roadmap overview for Synchoo.",
        url: "https://stalightride.lovable.app/pitch",
        isPartOf: { "@type": "WebSite", name: "Synchoo", url: "https://stalightride.lovable.app" },
      }),
    }],
  }),
});

const serviceIcons = [CarFront, CircleGauge, UsersRound, Droplets];
const roleTints = ["text-brand", "text-cyan", "text-violet", "text-ember", "text-emerald"];

function SectionHeading({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{kicker}</p>
      <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl lg:text-5xl">{title}</h2>
      {body ? <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{body}</p> : null}
    </div>
  );
}

function PitchPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <section className="aurora relative overflow-hidden border-b border-border">
          <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
            <div className="rise">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">{pitch.eyebrow}</p>
              <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-[1.02] sm:text-6xl lg:text-7xl">
                {pitch.title.split("shared mobility")[0]}<span className="text-gradient">shared mobility.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-xl">{pitch.summary}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="btn-gradient h-13 rounded-2xl px-6">
                  <a href="/downloads/synchoo-enterprise-pitch.pdf" download="synchoo-enterprise-pitch.pdf" target="_blank" rel="noopener">
                    <Download className="h-4 w-4" /> Download the deck
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 rounded-2xl border-border bg-card/50 px-6">
                  <Link to="/browse">Explore the product <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
              <p className="mt-5 max-w-xl text-xs leading-relaxed text-muted-foreground">Repository-verified overview. Current capabilities and proposed roadmap items are explicitly separated.</p>
            </div>

            <div className="relative mx-auto w-full max-w-xl" aria-label="Synchoo platform ecosystem">
              <div className="glow-border glass-strong relative overflow-hidden p-5 sm:p-7">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Synchoo platform</p>
                    <p className="mt-1 font-display text-xl font-bold">One account. Four journeys.</p>
                  </div>
                  <Layers3 className="h-7 w-7 text-brand" />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {pitch.services.map((service, index) => {
                    const Icon = serviceIcons[index];
                    return (
                      <div key={service.title} className="glass min-h-32 p-4">
                        <Icon className={`h-5 w-5 ${roleTints[index]}`} aria-hidden />
                        <p className="mt-7 text-sm font-semibold">{service.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Independent workflow</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 glass flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
                  <span>Shared trust · payments · operations</span>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cv-auto py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading kicker="The operating problem" title="Mobility breaks when the journey is fragmented." />
            <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-3">
              {pitch.positioning.map((item, index) => (
                <div key={item} className="bg-background p-7 sm:p-9">
                  <span className="font-display text-4xl font-bold text-gradient">0{index + 1}</span>
                  <p className="mt-6 text-base leading-relaxed text-foreground/90">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="cv-auto border-y border-border bg-card/30 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading kicker="Product ecosystem" title="Purpose-built flows. Shared platform intelligence." body="Each service keeps its own lifecycle while reusing identity, trust, payments, notifications and operational controls." />
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {pitch.services.map((service, index) => {
                const Icon = serviceIcons[index];
                return (
                  <article key={service.title} className="glass lift p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="glass grid h-12 w-12 place-items-center rounded-xl"><Icon className={`h-5 w-5 ${roleTints[index]}`} /></div>
                      <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">0{index + 1}</span>
                    </div>
                    <h3 className="mt-8 text-xl font-semibold">{service.title}</h3>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{service.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="cv-auto py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-24">
              <SectionHeading kicker="Rental lifecycle" title="From discovery to defensible handover." body="The primary rental journey keeps availability, identity, payment and trip evidence connected." />
              <div className="mt-7 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {["Availability", "Payment", "QR", "GPS", "Inspection"].map((label) => <span key={label} className="glass px-3 py-2">{label}</span>)}
              </div>
            </div>
            <ol className="relative space-y-3 before:absolute before:bottom-8 before:left-6 before:top-8 before:w-px before:bg-border">
              {pitch.rentalLifecycle.map((step, index) => (
                <li key={step} className="glass relative grid grid-cols-[3rem_1fr] items-start gap-4 p-4 sm:p-5">
                  <span className="relative z-10 grid h-12 w-12 place-items-center rounded-xl bg-brand text-sm font-bold text-brand-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <p className="pt-2 text-sm leading-relaxed sm:text-base">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="cv-auto border-y border-border bg-card/30 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading kicker="Operating model" title="Designed around every participant." />
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {pitch.roles.map((role, index) => (
                <article key={role.title} className="glass p-5 lg:min-h-56">
                  <UsersRound className={`h-5 w-5 ${roleTints[index]}`} />
                  <h3 className="mt-10 text-base font-semibold">{role.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{role.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="cv-auto py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading kicker="Platform capability" title="The operational layer beneath every booking." />
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pitch.capabilities.map((capability, index) => (
                <div key={capability} className="glass flex min-h-24 items-start gap-3 p-5">
                  <Check className={`mt-0.5 h-4 w-4 shrink-0 ${roleTints[index % roleTints.length]}`} />
                  <p className="text-sm leading-relaxed">{capability}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="cv-auto border-y border-border bg-card/30 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading kicker="Architecture" title="A focused, modern application stack." body="The architecture separates experience, application logic, platform services and external integrations without overstating unverified production guarantees." />
            <div className="mt-10 grid gap-3 lg:grid-cols-4">
              {pitch.architecture.map((item, index) => (
                <div key={item.layer} className="glass relative overflow-hidden p-6">
                  <span className="absolute right-4 top-3 font-display text-5xl font-bold text-muted/70">{index + 1}</span>
                  <Layers3 className={`relative h-5 w-5 ${roleTints[index]}`} />
                  <h3 className="relative mt-16 font-semibold">{item.layer}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <div className="glass p-6 sm:p-8">
                <h3 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-emerald" /> Trust controls</h3>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {pitch.trust.map((item) => <li key={item} className="flex gap-2 text-sm leading-relaxed text-muted-foreground"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{item}</li>)}
                </ul>
              </div>
              <div className="glass p-6 sm:p-8">
                <h3 className="flex items-center gap-2 text-lg font-semibold"><MapPinned className="h-5 w-5 text-cyan" /> Connected trip record</h3>
                <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs">
                  {[{ icon: WalletCards, label: "Payment" }, { icon: QrCode, label: "Handover" }, { icon: RouteIcon, label: "Trip" }].map((item) => <div key={item.label} className="glass p-3"><item.icon className="mx-auto h-5 w-5 text-brand" /><p className="mt-2">{item.label}</p></div>)}
                </div>
                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">Booking membership links communication, live tracking, inspections, reviews and disputes to the correct parties.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="cv-auto py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading kicker="Delivery readiness" title="Clear about what exists — and what comes next." />
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {pitch.readiness.map((item, index) => (
                <article key={item.label} className="glass p-6 sm:p-8">
                  <span className={`text-xs font-semibold uppercase tracking-[0.14em] ${roleTints[index]}`}>{item.label}</span>
                  <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                </article>
              ))}
            </div>
            <div className="mt-12 grid gap-3 lg:grid-cols-3">
              {pitch.roadmap.map((item, index) => (
                <article key={item.phase} className="relative border-l border-border pl-6">
                  <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-brand" />
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{item.status}</p>
                  <h3 className="mt-2 text-lg font-semibold">{item.phase}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                </article>
              ))}
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {pitch.launchGates.map((item) => (
                <article key={item.title} className="border-t border-border pt-5">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="cv-auto pb-20 sm:pb-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="aurora glow-border glass-strong relative overflow-hidden p-7 sm:p-12 lg:p-14">
              <div className="relative grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">Decision brief</p>
                  <h2 className="mt-4 max-w-3xl font-display text-3xl font-bold sm:text-5xl">{pitch.decision.title}</h2>
                  <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{pitch.decision.detail}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                  <Button asChild size="lg" className="btn-gradient h-13 rounded-2xl px-6"><a href="/downloads/synchoo-enterprise-pitch.pdf" download="synchoo-enterprise-pitch.pdf" target="_blank" rel="noopener"><Download className="h-4 w-4" /> Download PDF</a></Button>
                  <Button asChild size="lg" variant="outline" className="h-13 rounded-2xl border-border bg-card/50 px-6"><Link to="/help">Read the product guide</Link></Button>
                </div>
              </div>
            </div>
            <details className="mt-8 text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">Evidence notes and limitations</summary>
              <ul className="mt-4 space-y-2 border-l border-border pl-5">
                {pitch.caveats.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          </div>
        </section>
      </main>
    </div>
  );
}