import { describe, it, expect } from "vitest";
import { resolveNotificationDestination } from "@/lib/notification-router";

describe("Notification Router", () => {
  it("routes host booking request notifications to /vendor?tab=bookings", () => {
    const dest = resolveNotificationDestination(
      {
        title: "New booking request",
        body: "ertiga · 2026-11-20 → 2026-11-23",
        link: "/vendor",
      },
      "host"
    );
    expect(dest.path).toBe("/vendor");
    expect(dest.tab).toBe("bookings");
    expect(dest.fullUrl).toBe("/vendor?tab=bookings");
  });

  it("routes host payment received notifications to /vendor?tab=payouts", () => {
    const dest = resolveNotificationDestination(
      {
        title: "Payment received",
        body: "Payment of Rs 10959.90 received for ertiga.",
        link: "/vendor",
      },
      "host"
    );
    expect(dest.path).toBe("/vendor");
    expect(dest.tab).toBe("payouts");
    expect(dest.fullUrl).toBe("/vendor?tab=payouts");
  });

  it("routes host vehicle approvals to /vendor?tab=fleet", () => {
    const dest = resolveNotificationDestination(
      {
        title: "Vehicle approved",
        body: "ertiga is now live on Synchoo.",
        link: "/vendor",
      },
      "host"
    );
    expect(dest.path).toBe("/vendor");
    expect(dest.tab).toBe("fleet");
  });

  it("routes host KYC notifications to /vendor?tab=kyc", () => {
    const dest = resolveNotificationDestination(
      {
        title: "Document submitted",
        body: "Our team is reviewing your identity proof.",
        link: "/vendor",
      },
      "host"
    );
    expect(dest.path).toBe("/vendor");
    expect(dest.tab).toBe("kyc");
  });

  it("routes customer booking notifications to /bookings", () => {
    const dest = resolveNotificationDestination(
      {
        title: "Booking approved",
        body: "ertiga is confirmed. Complete the payment to lock it in.",
        link: "/bookings",
      },
      "customer"
    );
    expect(dest.path).toBe("/bookings");
  });

  it("preserves specific trip deep-links", () => {
    const dest = resolveNotificationDestination(
      {
        title: "Pickup confirmed",
        body: "Handover verified by QR. Drive safe!",
        link: "/bookings/b-1234/trip",
      },
      "customer"
    );
    expect(dest.path).toBe("/bookings/b-1234/trip");
    expect(dest.fullUrl).toBe("/bookings/b-1234/trip");
  });

  it("routes doorstep wash notifications to cleaner dashboard for cleaners", () => {
    const dest = resolveNotificationDestination(
      {
        title: "New wash request",
        body: "Doorstep wash requested in Indiranagar",
        link: null,
      },
      "cleaner"
    );
    expect(dest.path).toBe("/cleaner-dashboard");
    expect(dest.tab).toBe("available");
  });

  it("routes customer wash notifications to /washes", () => {
    const dest = resolveNotificationDestination(
      {
        title: "Wash slot approved",
        body: "Pay now to confirm your doorstep wash.",
        link: "/washes",
      },
      "customer"
    );
    expect(dest.path).toBe("/washes");
  });

  it("routes driver hire notifications to driver dashboard", () => {
    const dest = resolveNotificationDestination(
      {
        title: "New hire request",
        body: "Customer requested a driver for 4 hours",
        link: null,
      },
      "driver"
    );
    expect(dest.path).toBe("/driver-dashboard");
    expect(dest.tab).toBe("upcoming");
  });

  it("routes admin verification alerts to /admin?tab=hosts", () => {
    const dest = resolveNotificationDestination(
      {
        title: "Host ID awaiting review",
        body: "Hari Host submitted documents",
        link: "/admin",
      },
      "admin"
    );
    expect(dest.path).toBe("/admin");
    expect(dest.tab).toBe("hosts");
  });
});
