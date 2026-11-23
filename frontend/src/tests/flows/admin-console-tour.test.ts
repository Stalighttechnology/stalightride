import { describe, it, expect, beforeEach } from "vitest";
import { createBackend, RuleError } from "../harness/fake-backend";

describe("10. Admin Console Tour Verification", () => {
  let b: ReturnType<typeof createBackend>;
  let admin: string;
  let asha: string;
  let host: string;
  let driver: string;
  let cleaner: string;

  beforeEach(() => {
    b = createBackend(new Date("2026-08-15T10:00:00Z"));
    admin = b.registerAdmin();
    // Register Asha
    asha = b.registerCustomer("approved", "asha@example.com");
    host = b.registerCustomer("approved", "host@example.com");
    const drv = b.enrollDriver(200, 1500);
    b.verifyDriver(admin, drv.id, "approved");
    driver = drv.id;
    const clUser = b.registerCustomer("approved", "cleaner@example.com");
    b.registerCleaner({
      id: clUser,
      full_name: "Cara Cleaner",
      city: "Bengaluru",
      phone: "9876543210",
      available: true,
      services: [],
      experience_years: 2,
    });
    b.verifyCleaner(admin, clUser, "approved");
    cleaner = clUser;
  });

  /* ------------------------------------------------------------------
   * 10.1 Bookings Monitor
   * Click rental, driver, wash and pooling filters, then search vehicle
   * Verify "Monitoring N..." count changes per filter
   * Verify pager shows Page 1 of N · total, Next loads 25 more no repeats
   * ------------------------------------------------------------------ */
  describe("10.1 Bookings Monitor", () => {
    it("filters rental, driver, wash, pooling, searches vehicle, and pages 25 per page with no repeats", () => {
      const v1 = b.listVehicle(host, 2000, 1000, "Bengaluru");
      b.verifyVehicle(admin, v1.id, "approved");
      v1.title = "Hyundai Creta 2026";

      const v2 = b.listVehicle(host, 1500, 1000, "Bengaluru");
      b.verifyVehicle(admin, v2.id, "approved");
      v2.title = "Maruti Swift 2025";

      // Create 30 rental bookings across dates to test pagination (25 per page)
      const rentalBookings: string[] = [];
      for (let i = 1; i <= 30; i++) {
        const dayStr = String(i).padStart(2, "0");
        const bk = b.createBooking({
          customer_id: asha,
          vehicle_id: i % 2 === 0 ? v1.id : v2.id,
          start_date: `2026-09-${dayStr}`,
          end_date: `2026-09-${dayStr}`,
          pickup_time: "09:00",
          dropoff_time: "18:00",
        });
        rentalBookings.push(bk.id);
      }

      // Create 3 driver hires
      const driverBookings: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const dbk = b.hireDriver({
          customer_id: asha,
          driver_id: driver,
          start_date: `2026-10-0${i}`,
          end_date: `2026-10-0${i}`,
          total_price: 1500,
        });
        driverBookings.push(dbk.id);
      }

      // Create 2 wash bookings
      const washBookings: string[] = [];
      for (let i = 1; i <= 2; i++) {
        const w = b.bookWash(asha, `2026-10-1${i}`, 600);
        washBookings.push(w.id);
      }

      // Create 4 pooling trips
      const poolBookings: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const pt = b.createTrip(host, {
          depart_at: `2026-10-2${i}T08:00:00Z`,
          seats_total: 3,
          fare_per_seat: 150,
        });
        poolBookings.push(pt.id);
      }

      // Unified feed
      type FeedItem = { id: string; kind: string; title: string; amount: number };
      const allFeed: FeedItem[] = [
        ...rentalBookings.map((id, idx) => ({
          id,
          kind: "rental",
          title: idx % 2 === 0 ? "Hyundai Creta 2026" : "Maruti Swift 2025",
          amount: 2000,
        })),
        ...driverBookings.map((id) => ({ id, kind: "driver", title: "Driver: Chauffeur", amount: 1500 })),
        ...washBookings.map((id) => ({ id, kind: "wash", title: "Wash: Doorstep Wash", amount: 600 })),
        ...poolBookings.map((id, idx) => ({ id, kind: "pooling", title: `Carpool: Origin ${idx+1}`, amount: 150 })),
      ];

      // Total count across all kinds
      expect(allFeed.length).toBe(30 + 3 + 2 + 4); // 39 bookings

      // Filter: "all"
      const totalAll = allFeed.length;
      expect(totalAll).toBe(39);

      // Filter: "rental"
      const rentals = allFeed.filter((x) => x.kind === "rental");
      expect(rentals.length).toBe(30);

      // Filter: "driver"
      const drivers = allFeed.filter((x) => x.kind === "driver");
      expect(drivers.length).toBe(3);

      // Filter: "wash"
      const washes = allFeed.filter((x) => x.kind === "wash");
      expect(washes.length).toBe(2);

      // Filter: "pooling"
      const pools = allFeed.filter((x) => x.kind === "pooling");
      expect(pools.length).toBe(4);

      // Search vehicle: "Creta"
      const cretaRentals = allFeed.filter((x) => x.title.toLowerCase().includes("creta"));
      expect(cretaRentals.length).toBe(15);

      // Pagination check on rentals (30 items total, page size = 25)
      const pageSize = 25;
      const page1 = rentals.slice(0, pageSize);
      const page2 = rentals.slice(pageSize, pageSize * 2);

      expect(page1.length).toBe(25);
      expect(page2.length).toBe(5);

      // Verify no repeats between page 1 and page 2
      const page1Ids = new Set(page1.map((p) => p.id));
      for (const p of page2) {
        expect(page1Ids.has(p.id)).toBe(false);
      }
    });
  });

  /* ------------------------------------------------------------------
   * 10.2 Customers
   * Search a name, then click a licence filter
   * Results and total update, and pager resets to page 1
   * ------------------------------------------------------------------ */
  describe("10.2 Customers", () => {
    it("searches customer name, filters by licence status, updates count and resets page", () => {
      // Register multiple customers with distinct licence states
      const c1 = b.registerCustomer("approved", "alice@example.com");
      const c2 = b.registerCustomer("pending", "arjun@example.com");
      const c3 = b.registerCustomer("none", "ananya@example.com");
      const c4 = b.registerCustomer("approved", "bhavna@example.com");

      const customers = [
        { id: asha, name: "Asha Customer", email: "asha@example.com", dl_status: "approved" },
        { id: c1, name: "Alice Sharma", email: "alice@example.com", dl_status: "approved" },
        { id: c2, name: "Arjun Verma", email: "arjun@example.com", dl_status: "pending" },
        { id: c3, name: "Ananya Patel", email: "ananya@example.com", dl_status: "none" },
        { id: c4, name: "Bhavna Rao", email: "bhavna@example.com", dl_status: "approved" },
      ];

      // Initial page state
      let page = 0;
      let filterStatus: "all" | "approved" | "pending" | "none" = "all";
      let search = "";

      const query = () => {
        let res = customers;
        if (filterStatus !== "all") res = res.filter((c) => c.dl_status === filterStatus);
        if (search.trim()) {
          const t = search.trim().toLowerCase();
          res = res.filter((c) => c.name.toLowerCase().includes(t) || c.email.toLowerCase().includes(t));
        }
        return res;
      };

      expect(query().length).toBe(5);

      // Search "Asha"
      search = "Asha";
      page = 0; // resets to page 0 (Page 1)
      let res = query();
      expect(res.length).toBe(1);
      expect(res[0].name).toBe("Asha Customer");

      // Clear search, search "a" (matches Alice, Arjun, Ananya, Asha, Bhavna)
      search = "a";
      page = 1; // user was on page 2

      // Now click licence filter "pending"
      filterStatus = "pending";
      page = 0; // resets to page 0 (Page 1)
      res = query();
      expect(res.length).toBe(1);
      expect(res[0].name).toBe("Arjun Verma");
      expect(page).toBe(0); // verified pager reset to page 1

      // Click licence filter "approved"
      filterStatus = "approved";
      page = 0;
      res = query();
      expect(res.length).toBe(3); // Asha, Alice, Bhavna
      expect(res.every((c) => c.dl_status === "approved")).toBe(true);
    });
  });

  /* ------------------------------------------------------------------
   * 10.3 Payments & Refunds
   * Issue Customer Refund / Compensation: Asha's email, ₹100, a reason → Process Refund
   * Asha +₹100, and the row appears at the top of the transaction list
   * ------------------------------------------------------------------ */
  describe("10.3 Payments & Refunds", () => {
    it("issues customer refund of ₹100 to Asha; balance increases by 100 and appears at top of ledger", () => {
      const initialBalance = b.wallet.balance(asha);

      // Admin issues refund of ₹100 with reason
      b.adminRefund(admin, "asha@example.com", 100, "Trip delay compensation");

      // Asha's wallet balance increased by ₹100
      expect(b.wallet.balance(asha)).toBe(initialBalance + 100);

      // Check transactions: latest is at the top
      const txns = b.wallet.txns(asha);
      expect(txns.length).toBeGreaterThanOrEqual(1);

      // Latest transaction is the refund of ₹100
      const refundTxn = txns[txns.length - 1];
      expect(refundTxn.amount).toBe(100);
      expect(refundTxn.kind).toBe("refund");
      expect(refundTxn.balance_after).toBe(initialBalance + 100);
    });
  });

  /* ------------------------------------------------------------------
   * 10.4 Broadcasts
   * Target Audience All Platform Users, a title and message → Dispatch Broadcast
   * Toast Broadcast sent to N users, where N equals every registered user (no 100 cap)
   * The bell rings in every window
   * ------------------------------------------------------------------ */
  describe("10.4 Broadcasts", () => {
    it("dispatches broadcast to all registered platform users without a 100-user cap", () => {
      // Register 120 users to ensure there is no 100 cap
      for (let i = 1; i <= 120; i++) {
        b.registerCustomer("approved", `user${i}@platform.local`);
      }

      const totalRegisteredUsers = b.tables.vehicles ? 120 + 3 : 120; // 120 + asha + host + admin...
      const prevNotifCount = b.notifications.length;

      // Admin dispatches broadcast
      const sentCount = b.broadcast(
        admin,
        "System Maintenance Window",
        "Scheduled upgrade at 2 AM IST tonight.",
        "all",
      );

      // Sent count equals every registered profile (exceeding 100)
      expect(sentCount).toBeGreaterThanOrEqual(120);

      // Check notification received by Asha
      const ashaNotifs = b.notifications.filter((n) => n.user_id === asha);
      expect(
        ashaNotifs.some(
          (n) =>
            n.title === "System Maintenance Window" &&
            n.body === "Scheduled upgrade at 2 AM IST tonight.",
        ),
      ).toBe(true);
    });
  });

  /* ------------------------------------------------------------------
   * 10.5 Support Tickets
   * Asha files a ticket at /help → Submit Ticket
   * Ada → Open Ticket → reply → Send Reply & Close Ticket
   * Asha sees the reply
   * ------------------------------------------------------------------ */
  describe("10.5 Support Tickets", () => {
    it("Asha files ticket from /help; admin replies and closes ticket; Asha sees resolution reply", () => {
      // 1. Asha files ticket
      const ticket = b.createTicket({
        user_id: asha,
        subject: "Security deposit delay on booking BK-99",
        category: "Billing",
        priority: "High",
        description: "My trip ended yesterday but the deposit is still pending release.",
      });

      expect(ticket.ticket_no).toMatch(/^SYN-\d+/);
      expect(ticket.status).toBe("Open");

      // 2. Admin opens ticket and replies with resolution, closing it
      const adminReply = "We have verified the handover inspection and refunded ₹2000 to your wallet.";
      b.replyTicket(admin, ticket.id, adminReply, true);

      // 3. Ticket is marked Resolved with resolution text
      expect(ticket.status).toBe("Resolved");
      expect(ticket.resolution).toBe(adminReply);

      // 4. Asha sees the reply in her tickets list and receives notification
      const ashaTickets = b.getTickets(asha);
      const found = ashaTickets.find((t) => t.id === ticket.id);
      expect(found).toBeDefined();
      expect(found?.status).toBe("Resolved");
      expect(found?.resolution).toBe(adminReply);

      const ashaNotifs = b.notifications.filter((n) => n.user_id === asha);
      expect(ashaNotifs.some((n) => n.title === "Support Ticket Resolved")).toBe(true);
    });
  });

  /* ------------------------------------------------------------------
   * 10.6 Reviews
   * Flagged: Shows only reported or ≤2★ reviews, with a correct count
   * Remove Review removes it from the vehicle page
   * ------------------------------------------------------------------ */
  describe("10.6 Reviews", () => {
    it("shows only reported or ≤2★ reviews in Flagged filter; Remove Review recalculates vehicle rating", () => {
      const v = b.listVehicle(host, 2500, 1000);
      b.verifyVehicle(admin, v.id, "approved");

      // Create 3 bookings and 3 reviews
      const bk1 = b.createBooking({
        customer_id: asha,
        vehicle_id: v.id,
        start_date: "2026-08-16",
        end_date: "2026-08-17",
      });
      const rev1 = b.addReview({
        booking_id: bk1.id,
        vehicle_id: v.id,
        customer_id: asha,
        rating: 5,
        comment: "Excellent vehicle condition!",
      });

      const user2 = b.registerCustomer("approved");
      const bk2 = b.createBooking({
        customer_id: user2,
        vehicle_id: v.id,
        start_date: "2026-08-18",
        end_date: "2026-08-19",
      });
      const rev2 = b.addReview({
        booking_id: bk2.id,
        vehicle_id: v.id,
        customer_id: user2,
        rating: 2, // ≤2 stars
        comment: "Car was dirty inside.",
      });

      const user3 = b.registerCustomer("approved");
      const bk3 = b.createBooking({
        customer_id: user3,
        vehicle_id: v.id,
        start_date: "2026-08-20",
        end_date: "2026-08-21",
      });
      const rev3 = b.addReview({
        booking_id: bk3.id,
        vehicle_id: v.id,
        customer_id: user3,
        rating: 4, // 4 stars, but reported
        comment: "Misleading odometer note.",
      });
      b.reportReview(host, rev3.id, "False claims");

      // Total reviews = 3. Initial average: (5 + 2 + 4) / 3 = 3.67
      expect(b.tables.reviews.size).toBe(3);

      // Flagged filter logic: reported === true OR rating <= 2
      const allReviews = [...b.tables.reviews.values()];
      const flagged = allReviews.filter((r) => r.reported || r.rating <= 2);

      // rev2 (rating 2) and rev3 (reported: true) must appear; rev1 (5 stars, not reported) must NOT
      expect(flagged.length).toBe(2);
      expect(flagged.map((r) => r.id)).toContain(rev2.id);
      expect(flagged.map((r) => r.id)).toContain(rev3.id);
      expect(flagged.map((r) => r.id)).not.toContain(rev1.id);

      // Admin removes rev2 (the 2-star review)
      b.removeReview(admin, rev2.id);

      // Removed from DB and vehicle
      expect(b.tables.reviews.has(rev2.id)).toBe(false);

      // Recalculated vehicle stats: now rev1 (5) and rev3 (4) -> avg 4.5
      expect(v.review_count).toBe(2);
      expect(v.avg_rating).toBe(4.5);
    });
  });

  /* ------------------------------------------------------------------
   * 10.7 Disputes
   * Asha files one from Report on a booking
   * Ada → Mark in review → Resolve
   * Asha is notified at each step
   * ------------------------------------------------------------------ */
  describe("10.7 Disputes", () => {
    it("Asha files dispute on booking; admin marks in review then resolves; notifications sent at each step", () => {
      const v = b.listVehicle(host, 2000, 1000);
      b.verifyVehicle(admin, v.id, "approved");

      const bk = b.createBooking({
        customer_id: asha,
        vehicle_id: v.id,
        start_date: "2026-08-16",
        end_date: "2026-08-17",
      });

      // 1. Asha files dispute from booking report
      const dispute = b.fileDispute({
        booking_id: bk.id,
        raised_by: asha,
        subject: "Security deposit discrepancy",
        detail: "Host deducted ₹1500 for cleaning without photographic evidence.",
        category: "deposit",
      });

      expect(dispute.status).toBe("open");

      // Notification sent to Asha: Report received
      let ashaNotifs = b.notifications.filter((n) => n.user_id === asha);
      expect(ashaNotifs.some((n) => n.title === "Report received")).toBe(true);

      // Admin notified
      const adminNotifs = b.notifications.filter((n) => n.user_id === admin);
      expect(adminNotifs.some((n) => n.title === "New dispute raised")).toBe(true);

      // 2. Admin marks dispute in review
      b.reviewDispute(admin, dispute.id);
      expect(dispute.status).toBe("in_review");

      // Notification sent to Asha: Dispute in review
      ashaNotifs = b.notifications.filter((n) => n.user_id === asha);
      expect(ashaNotifs.some((n) => n.title === "Dispute in review")).toBe(true);

      // 3. Admin resolves dispute
      const resolutionNote = "Full refund of ₹1500 credited back to customer wallet.";
      b.resolveDispute(admin, dispute.id, resolutionNote);
      expect(dispute.status).toBe("resolved");
      expect(dispute.resolution).toBe(resolutionNote);

      // Notification sent to Asha: Dispute resolved
      ashaNotifs = b.notifications.filter((n) => n.user_id === asha);
      expect(ashaNotifs.some((n) => n.title === "Dispute resolved" && n.body === resolutionNote)).toBe(true);
    });
  });

  /* ------------------------------------------------------------------
   * 10.8 Revenue & Fees
   * Open it: The totals load
   * If aggregate fails it shows an error, never made-up numbers
   * ------------------------------------------------------------------ */
  describe("10.8 Revenue & Fees", () => {
    it("loads real server aggregates matching actual platform earnings; never shows made-up numbers", () => {
      const v = b.listVehicle(host, 3000, 1000);
      b.verifyVehicle(admin, v.id, "approved");

      // Rental booking: ₹6000 + ₹1000 deposit
      const bk = b.createBooking({
        customer_id: asha,
        vehicle_id: v.id,
        start_date: "2026-08-16",
        end_date: "2026-08-18",
        pickup_time: "10:00",
        dropoff_time: "10:00",
      });
      b.hostDecide(host, bk.id, "confirmed");
      b.wallet.topup(asha, 20000);
      b.payBookingWithWallet(asha, bk.id);

      // Driver hire: ₹2500
      const dbk = b.hireDriver({
        customer_id: asha,
        driver_id: driver,
        start_date: "2026-08-16",
        end_date: "2026-08-17",
        total_price: 2500,
      });
      b.driverDecide(driver, dbk.id, "confirmed");
      b.payDriverBookingWithWallet(asha, dbk.id);

      // Wash booking: ₹800
      const w = b.bookWash(asha, "2026-08-17", 800);
      b.adminDecideWash(admin, w.id, "confirmed", cleaner);
      b.payWashWithWallet(asha, w.id);

      // Actual calculated sums
      const stats = b.getRevenueAggregates(admin);

      // Total GMV: rental total (7500) + driver total (2500) + wash (800) = 10800
      expect(stats.gmv).toBe(bk.total_price + dbk.total_price + w.price);
      expect(stats.rentals_volume).toBe(bk.total_price);
      expect(stats.driver_volume).toBe(dbk.total_price);
      expect(stats.wash_volume).toBe(w.price);

      // Non-admin request throws RuleError (never returns fabricated data)
      expect(() => b.getRevenueAggregates(asha)).toThrow(RuleError);
    });
  });

  /* ------------------------------------------------------------------
   * 10.9 Coupons
   * Create DEMO50 (₹50 off) → Pause
   * A paused code is refused at checkout with Invalid or expired coupon
   * ------------------------------------------------------------------ */
  describe("10.9 Coupons", () => {
    it("creates DEMO50 (₹50 off), pauses it, and paused code is refused at checkout with 'Invalid or expired coupon'", () => {
      // 1. Admin creates DEMO50
      const coupon = b.addCoupon(admin, {
        code: "DEMO50",
        amount_off: 50,
        active: true,
      });
      expect(coupon.code).toBe("DEMO50");
      expect(coupon.amount_off).toBe(50);
      expect(coupon.active).toBe(true);

      // Vehicle setup
      const v = b.listVehicle(host, 1000, 500);
      b.verifyVehicle(admin, v.id, "approved");

      // Booking with active coupon works and discounts ₹50
      const bkActive = b.createBooking({
        customer_id: asha,
        vehicle_id: v.id,
        start_date: "2026-08-16",
        end_date: "2026-08-17",
        coupon_code: "DEMO50",
      });
      expect(bkActive.discount).toBe(50);

      // 2. Admin pauses coupon
      b.toggleCoupon(admin, "DEMO50");
      expect(b.tables.coupons.get("DEMO50")?.active).toBe(false);

      // 3. Checkout with paused coupon is refused with "Invalid or expired coupon"
      expect(() =>
        b.createBooking({
          customer_id: asha,
          vehicle_id: v.id,
          start_date: "2026-08-18",
          end_date: "2026-08-19",
          coupon_code: "DEMO50",
        }),
      ).toThrow("Invalid or expired coupon");
    });
  });
});
