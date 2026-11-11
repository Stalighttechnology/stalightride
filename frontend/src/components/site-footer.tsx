import { Link } from "@tanstack/react-router";

const GROUPS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Ride",
    links: [
      { label: "Browse rides", to: "/browse" },
      { label: "Hire a driver", to: "/drivers" },
      { label: "Car pooling", to: "/pooling" },
      { label: "Vehicle wash", to: "/wash" },
      { label: "Corporate travel", to: "/corporate" },
    ],
  },
  {
    title: "Earn",
    links: [
      { label: "Earn with Synchoo", to: "/earn" },
      { label: "Host dashboard", to: "/vendor" },
      { label: "Driver dashboard", to: "/driver-dashboard" },
      { label: "Cleaner dashboard", to: "/cleaner-dashboard" },
      { label: "Washing center", to: "/wash-center-dashboard" },
      { label: "Wallet", to: "/wallet" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Corporate accounts", to: "/corporate" },
      { label: "Safety Center", to: "/safety" },
      { label: "Membership", to: "/membership" },
      { label: "Pitch & proposal", to: "/pitch" },
      { label: "User manual", to: "/help" },
      { label: "Account", to: "/account" },
      { label: "Sign in", to: "/auth" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "My trips", to: "/bookings" },
      { label: "Hire bookings", to: "/hires" },
      { label: "Wash bookings", to: "/washes" },
      { label: "Data controls", to: "/data-deletion" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Cookie Policy", to: "/cookies" },
      { label: "Delete my data", to: "/data-deletion" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="cv-auto border-t border-border bg-background py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {GROUPS.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {g.links.map((l) => (
                  <li key={l.to + l.label}>
                    <Link to={l.to} className="text-foreground/80 transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Synchoo — Ride. Share. Explore.</span>
          <span>
            By using Synchoo you agree to our{" "}
            <Link to="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
            <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
          </span>
        </div>
      </div>
    </footer>
  );
}
