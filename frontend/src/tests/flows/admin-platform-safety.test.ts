import { describe, it, expect, beforeEach } from "vitest";
import { createBackend, RuleError } from "../harness/fake-backend";

describe("Person 3: Admin, Trust and Safety, Platform Flow Tests", () => {
  let b: ReturnType<typeof createBackend>;
  let admin: string;
  let host: string;
  let customer1: string;
  let customer2: string;

  beforeEach(() => {
    b = createBackend(new Date("2026-08-15T10:00:00Z"));
    admin = b.registerAdmin();
    host = b.registerCustomer("approved");
    customer1 = b.registerCustomer("approved");
    customer2 = b.registerCustomer("approved");
  });

  /* ===================================================================
   * 3.1 Review Moderation (MD-01, MD-02, MD-03)
   * =================================================================== */
  describe("3.1 Review Moderation", () => {
    it("MD-01: Admin removes a reported review; row deleted and vehicle average recalculated", () => {
      const v = b.listVehicle(host, 2000, 3000);
      b.verifyVehicle(admin, v.id, "approved");

      // Create two completed bookings & reviews
      const bk1 = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-10",
        end_date: "2026-08-11",
      });
      const rev1 = b.addReview({
        booking_id: bk1.id,
        vehicle_id: v.id,
        customer_id: customer1,
        rating: 5,
        comment: "Superb car",
      });

      const bk2 = b.createBooking({
        customer_id: customer2,
        vehicle_id: v.id,
        start_date: "2026-08-12",
        end_date: "2026-08-13",
      });
      const rev2 = b.addReview({
        booking_id: bk2.id,
        vehicle_id: v.id,
        customer_id: customer2,
        rating: 1,
        comment: "Spam abusive review",
      });

      // Rating is (5 + 1) / 2 = 3.0
      expect(v.avg_rating).toBe(3);
      expect(v.review_count).toBe(2);

      // Host flags rev2
      b.reportReview(host, rev2.id, "Profanity and false claims");
      expect(rev2.reported).toBe(true);

      // Admin removes rev2
      const res = b.removeReview(admin, rev2.id);
      expect(res).toBe(true);
      expect(b.tables.reviews.has(rev2.id)).toBe(false);

      // Recalculated vehicle rating: now only rev1 (5 stars)
      expect(v.avg_rating).toBe(5);
      expect(v.review_count).toBe(1);
    });

    it("MD-02: Admin dismisses a report; reported becomes false in DB", () => {
      const v = b.listVehicle(host, 1500, 2000);
      b.verifyVehicle(admin, v.id, "approved");

      const bk = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-10",
        end_date: "2026-08-11",
      });
      const rev = b.addReview({
        booking_id: bk.id,
        vehicle_id: v.id,
        customer_id: customer1,
        rating: 3,
        comment: "Decent ride",
      });

      // Flagged
      b.reportReview(host, rev.id, "Disputed cleanliness");
      expect(rev.reported).toBe(true);
      expect(rev.report_reason).toBe("Disputed cleanliness");

      // Admin dismisses report
      b.dismissReviewReport(admin, rev.id);
      expect(rev.reported).toBe(false);
      expect(rev.report_reason).toBeUndefined();
    });

    it("MD-03: Non-admin tries to delete someone else's review; blocked with error", () => {
      const v = b.listVehicle(host, 1500, 2000);
      b.verifyVehicle(admin, v.id, "approved");

      const bk = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-10",
        end_date: "2026-08-11",
      });
      const rev = b.addReview({
        booking_id: bk.id,
        vehicle_id: v.id,
        customer_id: customer1,
        rating: 2,
        comment: "Fair",
      });

      // Customer 2 (or host) tries to delete customer 1's review
      expect(() => b.removeReview(customer2, rev.id)).toThrow(RuleError);
      expect(() => b.removeReview(host, rev.id)).toThrow("You cannot delete this review");
      expect(b.tables.reviews.has(rev.id)).toBe(true);
    });
  });

  /* ===================================================================
   * 3.2 Support Tickets (ST-01, ST-02)
   * =================================================================== */
  describe("3.2 Support Tickets", () => {
    it("ST-01: User raises a ticket from /help; appears in admin queue with urgency", () => {
      const t = b.createTicket({
        user_id: customer1,
        subject: "Security deposit delayed",
        category: "Billing",
        priority: "Urgent",
        description: "Handover was completed 24h ago but ₹3000 deposit has not refunded.",
      });

      expect(t.ticket_no).toMatch(/^SYN-\d+/);
      expect(t.priority).toBe("Urgent");
      expect(t.status).toBe("Open");

      const adminQueue = b.getTickets(admin);
      expect(adminQueue.some((item) => item.id === t.id && item.priority === "Urgent")).toBe(true);
    });

    it("ST-02: Admin replies and closes ticket; user notified; User A cannot read User B tickets", () => {
      const tA = b.createTicket({
        user_id: customer1,
        subject: "App crashed during check-in",
        category: "Account",
        priority: "Medium",
        description: "Error when uploading fuel gauge photo.",
      });

      const tB = b.createTicket({
        user_id: customer2,
        subject: "Driver dispute invoice",
        category: "Billing",
        priority: "High",
        description: "Extra toll charged incorrectly.",
      });

      // User A reads their own tickets only
      const userATickets = b.getTickets(customer1);
      expect(userATickets.map((t) => t.id)).toContain(tA.id);
      expect(userATickets.map((t) => t.id)).not.toContain(tB.id);

      // Admin replies and resolves ticket A
      b.replyTicket(
        admin,
        tA.id,
        "We have verified your check-in photos manually. Trip marked started.",
        true,
      );

      expect(tA.status).toBe("Resolved");
      expect(tA.resolution).toContain("photos manually");

      // Customer 1 received notification
      const userNotifs = b.notifications.filter((n) => n.user_id === customer1);
      expect(userNotifs.some((n) => n.title === "Support Ticket Resolved")).toBe(true);
    });
  });

  /* ===================================================================
   * 3.3 Safety & SOS (SF-01, SF-02, SF-03)
   * =================================================================== */
  describe("3.3 Safety & SOS", () => {
    it("SF-01: Press SOS during a trip; incidents row with GPS created and admins notified", () => {
      const v = b.listVehicle(host, 1200, 2000);
      b.verifyVehicle(admin, v.id, "approved");
      const bk = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-15",
        end_date: "2026-08-16",
      });

      const inc = b.triggerSos({
        user_id: customer1,
        booking_id: bk.id,
        lat: 12.9716,
        lng: 77.5946,
      });

      expect(inc.type).toBe("sos");
      expect(inc.lat).toBe(12.9716);
      expect(inc.lng).toBe(77.5946);
      expect(inc.booking_id).toBe(bk.id);

      // Admin notified
      const adminNotifs = b.notifications.filter((n) => n.user_id === admin);
      expect(adminNotifs.some((n) => n.title === "EMERGENCY SOS Triggered!")).toBe(true);
    });

    it("SF-02: Submit incident report or lost & found; visible to admin, host notified for lost item", () => {
      const v = b.listVehicle(host, 1200, 2000);
      b.verifyVehicle(admin, v.id, "approved");
      const bk = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-14",
        end_date: "2026-08-15",
      });

      const lost = b.reportIncident({
        user_id: customer1,
        type: "lost_item",
        booking_id: bk.id,
        item_name: "Blue Ray-Ban Sunglasses",
        description: "Left in the glove compartment.",
      });

      expect(b.tables.incidents.has(lost.id)).toBe(true);

      // Host was notified
      const hostNotifs = b.notifications.filter((n) => n.user_id === host);
      expect(hostNotifs.some((n) => n.title === "Lost Item Reported")).toBe(true);
    });

    it("SF-03: Add trusted contact; persists across retrievals", () => {
      b.addTrustedContact(customer1, "Anita Sharma", "+91 98765 43210", "Spouse");
      b.addTrustedContact(customer1, "Rajesh Sharma", "+91 98765 11111", "Brother");

      const contacts = b.getTrustedContacts(customer1);
      expect(contacts.length).toBe(2);
      expect(contacts[0].name).toBe("Anita Sharma");
      expect(contacts[1].relationship).toBe("Brother");
    });
  });

  /* ===================================================================
   * 3.4 Cities & Category Rules (CC-01)
   * =================================================================== */
  describe("3.4 Cities & Categories", () => {
    it("CC-01: Admin deactivates a city; city removed from active picker and browse shows nothing", () => {
      const vBengaluru = b.listVehicle(host, 1200, 2000, "Bengaluru");
      b.verifyVehicle(admin, vBengaluru.id, "approved");

      const vMumbai = b.listVehicle(host, 1500, 2000, "Mumbai");
      b.verifyVehicle(admin, vMumbai.id, "approved");

      expect(b.getCities(true).map((c) => c.name)).toContain("Mumbai");
      expect(b.browse(undefined, undefined, "Mumbai").length).toBe(1);

      // Admin deactivates Mumbai
      b.setCityActive(admin, "Mumbai", false);

      // Disappears from active cities picker
      expect(b.getCities(true).map((c) => c.name)).not.toContain("Mumbai");

      // Browse in deactivated city returns empty
      expect(b.browse(undefined, undefined, "Mumbai")).toEqual([]);

      // Active city Bengaluru still shows
      expect(b.browse(undefined, undefined, "Bengaluru").length).toBe(1);
    });
  });

  /* ===================================================================
   * 3.5 Platform Settings (PS-01, PS-02)
   * =================================================================== */
  describe("3.5 Platform Settings", () => {
    it("PS-01: Admin changes GST to 12%; new bookings compute with 12%", () => {
      // Initially 18%
      const initialCharges = b.calculateBookingCharges(10000);
      expect(initialCharges.gstRate).toBe(18);
      expect(initialCharges.gst).toBe(1800);

      // Admin updates GST to 12%
      b.updatePlatformSettings(admin, { gst_pct: 12 });

      const newCharges = b.calculateBookingCharges(10000);
      expect(newCharges.gstRate).toBe(12);
      expect(newCharges.gst).toBe(1200);
    });

    it("PS-02: Non-admin tries to update platform settings; blocked", () => {
      expect(() => b.updatePlatformSettings(customer1, { gst_pct: 5 })).toThrow(RuleError);
      expect(() => b.updatePlatformSettings(customer1, { gst_pct: 5 })).toThrow(
        "Only admins can update platform settings",
      );
      expect(b.getPlatformSettings().gst_pct).toBe(18);
    });
  });

  /* ===================================================================
   * 3.6 Revenue Aggregates (RE-01)
   * =================================================================== */
  describe("3.6 Revenue Aggregates", () => {
    it("RE-01: Revenue tab matches manual sum of paid bookings, hires, and washes", () => {
      const v = b.listVehicle(host, 2000, 1000);
      b.verifyVehicle(admin, v.id, "approved");

      // 1. Paid rental booking: total 5000 (2 days @ 2000 + 1000 deposit)
      const bk = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-16",
        end_date: "2026-08-18",
        pickup_time: "10:00",
        dropoff_time: "10:00",
      });
      b.hostDecide(host, bk.id, "confirmed");
      b.wallet.topup(customer1, 10000);
      b.payBookingWithWallet(customer1, bk.id);

      // 2. Paid driver hire: total 3000
      const d = b.enrollDriver(200, 1500);
      b.verifyDriver(admin, d.id, "approved");
      const dbk = b.hireDriver({
        customer_id: customer1,
        driver_id: d.id,
        start_date: "2026-08-16",
        end_date: "2026-08-17",
        total_price: 3000,
      });
      b.driverDecide(d.id, dbk.id, "confirmed");
      b.payDriverBookingWithWallet(customer1, dbk.id);

      // 3. Paid wash booking: total 600
      const w = b.bookWash(customer1, "2026-08-17", 600);
      b.adminDecideWash(admin, w.id, "confirmed", "wash_v_1");
      b.payWashWithWallet(customer1, w.id);

      // Manual sum: 5000 + 3000 + 600 = 8600
      const manualGmv = 5000 + 3000 + 600;
      const stats = b.getRevenueAggregates(admin);

      expect(stats.gmv).toBe(manualGmv);
      expect(stats.rentals_volume).toBe(5000);
      expect(stats.driver_volume).toBe(3000);
      expect(stats.wash_volume).toBe(600);

      // Commission: 10% of 5000 (500) + 10% of 3000 (300) + 15% of 600 (90) = 890
      expect(stats.platform_revenue).toBe(890);
    });
  });

  /* ===================================================================
   * 3.7 Scheduled Reminders (RM-01, RM-02)
   * =================================================================== */
  describe("3.7 Scheduled Reminders", () => {
    it("RM-01: Booking pickup in 24h triggers scheduled notification", () => {
      const v = b.listVehicle(host, 1200, 2000);
      b.verifyVehicle(admin, v.id, "approved");

      // Current time is 2026-08-15T10:00:00Z. Booking starts at 2026-08-16 08:00 (22 hours away)
      const bk = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-16",
        end_date: "2026-08-17",
        pickup_time: "08:00",
      });
      b.hostDecide(host, bk.id, "confirmed");
      b.wallet.topup(customer1, 5000);
      b.payBookingWithWallet(customer1, bk.id);

      // Run scheduler
      const count = b.generateScheduledReminders();
      expect(count).toBeGreaterThanOrEqual(1);

      const customerNotifs = b.notifications.filter((n) => n.user_id === customer1);
      expect(customerNotifs.some((n) => n.title === "Trip reminder (24h)")).toBe(true);
    });

    it("RM-02: Run scheduler twice; no duplicate reminders created", () => {
      const v = b.listVehicle(host, 1200, 2000);
      b.verifyVehicle(admin, v.id, "approved");

      const bk = b.createBooking({
        customer_id: customer1,
        vehicle_id: v.id,
        start_date: "2026-08-16",
        end_date: "2026-08-17",
        pickup_time: "08:00",
      });
      b.hostDecide(host, bk.id, "confirmed");
      b.wallet.topup(customer1, 5000);
      b.payBookingWithWallet(customer1, bk.id);

      // First run: inserts reminder
      const run1 = b.generateScheduledReminders();
      expect(run1).toBe(1);

      const notifsRun1 = b.notifications.filter(
        (n) => n.user_id === customer1 && n.title === "Trip reminder (24h)",
      );
      expect(notifsRun1.length).toBe(1);

      // Second run immediately: 0 new reminders created
      const run2 = b.generateScheduledReminders();
      expect(run2).toBe(0);

      const notifsRun2 = b.notifications.filter(
        (n) => n.user_id === customer1 && n.title === "Trip reminder (24h)",
      );
      expect(notifsRun2.length).toBe(1);
    });
  });

  /* ===================================================================
   * 3.8 Growth: Referrals (GR-01)
   * =================================================================== */
  describe("3.8 Growth: Referrals", () => {
    it("GR-01: Friend signs up with code and makes first paid booking; both wallets credited ₹500 via wallet_apply exactly once", () => {
      const referrerCode = b.getProfile(customer1)!.referral_code;

      // Friend registers with referrer's code
      const friend = b.registerCustomer("approved", referrerCode);
      expect(b.getProfile(friend)?.referred_by).toBe(customer1);
      expect(b.getProfile(friend)?.referral_rewarded).toBe(false);

      expect(b.wallet.balance(customer1)).toBe(0);
      expect(b.wallet.balance(friend)).toBe(0);

      const v = b.listVehicle(host, 1000, 1000);
      b.verifyVehicle(admin, v.id, "approved");

      // Friend's 1st booking: 1 day @ 1000 + 1000 deposit = 2000
      const bk1 = b.createBooking({
        customer_id: friend,
        vehicle_id: v.id,
        start_date: "2026-08-20",
        end_date: "2026-08-21",
        pickup_time: "10:00",
        dropoff_time: "10:00",
      });
      b.hostDecide(host, bk1.id, "confirmed");
      b.wallet.topup(friend, 5000);
      b.payBookingWithWallet(friend, bk1.id);

      // Both wallets credited ₹500
      expect(b.wallet.balance(customer1)).toBe(500); // 0 + 500
      expect(b.wallet.balance(friend)).toBe(3500); // 5000 - 2000 + 500

      const friendTxns = b.wallet.txns(friend);
      expect(friendTxns.some((t) => t.kind === "referral_bonus" && t.amount === 500)).toBe(true);

      const referrerTxns = b.wallet.txns(customer1);
      expect(referrerTxns.some((t) => t.kind === "referral_bonus" && t.amount === 500)).toBe(true);

      expect(b.getProfile(friend)?.referral_rewarded).toBe(true);

      // Friend's 2nd booking does NOT trigger bonus again
      const bk2 = b.createBooking({
        customer_id: friend,
        vehicle_id: v.id,
        start_date: "2026-08-22",
        end_date: "2026-08-23",
        total_price: 2000,
      });
      b.hostDecide(host, bk2.id, "confirmed");
      b.payBookingWithWallet(friend, bk2.id);

      expect(b.wallet.balance(customer1)).toBe(500); // Still 500, no duplicate bonus
    });
  });
});
