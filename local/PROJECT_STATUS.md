# Project Status — Synchoo / StalightRide
**Snapshot:** `0400bd7` (2026-11-07)
**Current Stage:** Person 3 (Admin, Trust & Safety, Platform) implementation complete.

---

## Person 3 Module Status

### 3.1 Review Moderation & User Reports
- **Status:** ✅ Done
- **Database:** `reviews` table has admin DELETE and UPDATE RLS policies; `admin_remove_review` and `admin_dismiss_review_report` RPCs recalculate vehicle `avg_rating` and `review_count`. `user_reports` table created with RLS for customer reporting and admin resolution.
- **UI:** `src/components/admin/review-moderation-tab.tsx` supports review removal, report dismissal, and user/ride report resolution.

### 3.2 Support Tickets
- **Status:** ✅ Done
- **Database:** `support_tickets` and `ticket_messages` tables with RLS (users read/write own tickets, admins read/update all). Automated notifications on resolution and admin reply.
- **UI:** User-facing ticket submission form in `src/routes/help.tsx` and `src/routes/safety.tsx`; admin queue and conversation thread in `src/components/admin/support-tickets-tab.tsx`.

### 3.3 Safety & Emergency SOS
- **Status:** ✅ Done
- **Database:** `incidents` table (types: sos, accident, breakdown, lost_item, other; lat, lng, location_text, item_name, description) and `trusted_contacts` table. SOS triggers notify admins; lost items notify vehicle hosts.
- **UI:** In-trip SOS modal in `src/components/trip-safety-extension.tsx` captures live GPS coordinates and inserts incident; `src/routes/safety.tsx` saves incident reports, lost & found requests, and persistent trusted contacts.

### 3.4 Cities & Category Rules
- **Status:** ✅ Done
- **Database:** `cities` table (active, surge_multiplier) and `category_rules` table (min_deposit, min_window_hours, advance_notice_hours) with admin RLS.
- **UI:** `src/components/admin/cities-categories-tab.tsx` manages cities and vertical rules; `src/components/city-picker.tsx` dynamically queries active cities from database.

### 3.5 Platform Settings
- **Status:** ✅ Done
- **Database:** Single-row `platform_settings` table (id=1, GST %, service fee %, vertical commissions, SOS phone, maintenance mode, min driver advance hours, wallet limits) with public read and admin-only update RLS.
- **UI:** `src/components/admin/platform-settings-tab.tsx` reads and updates platform parameters.

### 3.6 Revenue & Commissions Analytics
- **Status:** ✅ Done
- **Database:** `admin_revenue_aggregates()` RPC aggregates GMV, Net Platform Revenue, Provider Payouts, and Refunds across rentals, driver hires, washes, and carpooling.
- **UI:** `src/components/admin/revenue-commissions-tab.tsx` displays live volume breakdowns and persists commission rates to `platform_settings`.

### 3.7 Scheduled Reminders
- **Status:** ✅ Done
- **Database:** `generate_scheduled_reminders()` RPC inserts idempotent notifications for bookings starting within 24h and 2h, and DL/vehicle document expiries within 30 days. Server endpoint at `src/routes/api/cron/reminders.ts`.
- **UI:** Removed browser-derived synthetic notifications from `src/components/notification-bell.tsx` to eliminate duplication.

### 3.8 Growth Features
- **Referrals:** ✅ Done — `referral_code` and `referred_by` on `profiles`, with `apply_referral_bonus_on_first_paid` trigger granting ₹500 wallet credit to both users via `wallet_apply` on first paid booking (GR-01).
- **Host Maintenance:** ✅ Done — `vehicle_maintenance` table and `src/components/vendor-maintenance.tsx` with full CRUD.
- **Membership, Corporate, Rewards:** ⏳ Coming Soon — Labeled with Early Access / Beta Preview badges.
