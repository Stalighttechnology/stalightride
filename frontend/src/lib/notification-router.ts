export interface NotificationDestination {
  path: string;
  tab?: string;
  search?: Record<string, string>;
  fullUrl: string;
}

/**
 * Resolves a notification's title, body, and link to a precise in-app route and tab.
 */
export function resolveNotificationDestination(
  notification: {
    title: string;
    body?: string | null;
    link?: string | null;
  },
  activeRole?: string
): NotificationDestination {
  const { title, link } = notification;
  const t = (title || "").toLowerCase();
  const rawLink = (link || "").trim();

  // 1. If rawLink already has explicit query params (?tab=...)
  if (rawLink.includes("?")) {
    const [pathPart, queryPart] = rawLink.split("?");
    const params = new URLSearchParams(queryPart);
    const tab = params.get("tab") || undefined;
    const searchObj: Record<string, string> = {};
    params.forEach((v, k) => {
      searchObj[k] = v;
    });
    return {
      path: pathPart,
      tab,
      search: searchObj,
      fullUrl: rawLink,
    };
  }

  // 2. Specific deep-links with IDs (e.g. /bookings/:id/trip, /messages/:id, /receipt/:kind/:id)
  if (rawLink.startsWith("/bookings/") && rawLink.includes("/trip")) {
    return { path: rawLink, fullUrl: rawLink };
  }
  if (rawLink.startsWith("/messages/")) {
    return { path: rawLink, fullUrl: rawLink };
  }
  if (rawLink.startsWith("/receipt/")) {
    return { path: rawLink, fullUrl: rawLink };
  }

  // 3. Host / Vehicle Host context
  const isHostNotification =
    activeRole === "host" ||
    rawLink.startsWith("/vendor") ||
    t.includes("booking request") ||
    t.includes("vehicle approved") ||
    t.includes("vehicle rejected") ||
    t.includes("verified host") ||
    (t.includes("payment received") && activeRole === "host");

  if (isHostNotification) {
    if (
      t.includes("booking request") ||
      t.includes("booking cancelled") ||
      t.includes("trip extension") ||
      t.includes("pickup confirmed") ||
      t.includes("return confirmed") ||
      t.includes("trip completed") ||
      t.includes("trip extended")
    ) {
      return {
        path: "/vendor",
        tab: "bookings",
        search: { tab: "bookings" },
        fullUrl: "/vendor?tab=bookings",
      };
    }
    if (t.includes("payment received") || t.includes("payout") || t.includes("earnings updated")) {
      return {
        path: "/vendor",
        tab: "payouts",
        search: { tab: "payouts" },
        fullUrl: "/vendor?tab=payouts",
      };
    }
    if (t.includes("vehicle approved") || t.includes("vehicle rejected") || t.includes("new vehicle")) {
      return {
        path: "/vendor",
        tab: "fleet",
        search: { tab: "fleet" },
        fullUrl: "/vendor?tab=fleet",
      };
    }
    if (
      t.includes("document submitted") ||
      t.includes("identity check") ||
      t.includes("verified host") ||
      t.includes("host id")
    ) {
      return {
        path: "/vendor",
        tab: "kyc",
        search: { tab: "kyc" },
        fullUrl: "/vendor?tab=kyc",
      };
    }
    // Default host fallback: Bookings tab
    return {
      path: "/vendor",
      tab: "bookings",
      search: { tab: "bookings" },
      fullUrl: "/vendor?tab=bookings",
    };
  }

  // 4. Admin alerts
  if (activeRole === "admin" || rawLink.startsWith("/admin")) {
    if (t.includes("host id") || t.includes("host awaiting")) {
      return { path: "/admin", tab: "hosts", search: { tab: "hosts" }, fullUrl: "/admin?tab=hosts" };
    }
    if (t.includes("licence") || t.includes("license")) {
      return { path: "/admin", tab: "licences", search: { tab: "licences" }, fullUrl: "/admin?tab=licences" };
    }
    if (t.includes("driver")) {
      return { path: "/admin", tab: "drivers", search: { tab: "drivers" }, fullUrl: "/admin?tab=drivers" };
    }
    if (t.includes("vehicle")) {
      return { path: "/admin", tab: "vehicles", search: { tab: "vehicles" }, fullUrl: "/admin?tab=vehicles" };
    }
    if (t.includes("dispute")) {
      return { path: "/admin", tab: "disputes", search: { tab: "disputes" }, fullUrl: "/admin?tab=disputes" };
    }
    if (t.includes("withdrawal") || t.includes("payout")) {
      return { path: "/admin", tab: "payouts", search: { tab: "payouts" }, fullUrl: "/admin?tab=payouts" };
    }
    if (t.includes("wash")) {
      return { path: "/admin", tab: "washes", search: { tab: "washes" }, fullUrl: "/admin?tab=washes" };
    }
    return { path: "/admin", fullUrl: "/admin" };
  }

  // 5. Doorstep Wash & Wash Centers
  if (t.includes("wash") || t.includes("cleaner")) {
    if (activeRole === "cleaner") {
      const tab = t.includes("new wash") || t.includes("available") ? "available" : "jobs";
      return { path: "/cleaner-dashboard", tab, search: { tab }, fullUrl: `/cleaner-dashboard?tab=${tab}` };
    }
    if (activeRole === "wash_center") {
      return { path: "/wash-center-dashboard", fullUrl: "/wash-center-dashboard" };
    }
    if (t.includes("unavailable")) {
      return { path: "/wash", fullUrl: "/wash" };
    }
    return { path: "/washes", fullUrl: "/washes" };
  }

  // 6. Driver Hires
  if (t.includes("driver") || t.includes("hire")) {
    if (activeRole === "driver") {
      return {
        path: "/driver-dashboard",
        tab: "upcoming",
        search: { tab: "upcoming" },
        fullUrl: "/driver-dashboard?tab=upcoming",
      };
    }
    if (t.includes("profile approved") || t.includes("profile rejected")) {
      return { path: "/profile", fullUrl: "/profile" };
    }
    return { path: "/hires", fullUrl: "/hires" };
  }

  // 7. Carpooling
  if (t.includes("pooling") || t.includes("carpool")) {
    return { path: "/pooling/mine", fullUrl: "/pooling/mine" };
  }

  // 8. Wallet & Payouts
  if (t.includes("wallet") || t.includes("payout") || t.includes("withdrawal")) {
    return { path: "/wallet", fullUrl: "/wallet" };
  }

  // 9. Customer Bookings & Trips
  if (
    t.includes("booking") ||
    t.includes("trip") ||
    t.includes("extension") ||
    t.includes("handover")
  ) {
    return { path: "/bookings", fullUrl: "/bookings" };
  }

  // 10. Licence / KYC (Customer / Driver)
  if (t.includes("licence") || t.includes("license") || t.includes("dl ")) {
    return { path: "/profile", fullUrl: "/profile" };
  }

  // 11. Support & Safety
  if (t.includes("ticket") || t.includes("support")) {
    return { path: "/help", fullUrl: "/help" };
  }
  if (t.includes("safety") || t.includes("sos")) {
    return { path: "/safety", fullUrl: "/safety" };
  }

  // Fallback to rawLink if available
  if (rawLink && rawLink.startsWith("/")) {
    return { path: rawLink, fullUrl: rawLink };
  }

  return {
    path: activeRole === "host" ? "/vendor" : "/account",
    fullUrl: activeRole === "host" ? "/vendor" : "/account",
  };
}
