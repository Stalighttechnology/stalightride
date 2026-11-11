# Partial Feature Fixes Log — Synchoo / StalightRide

This document tracks all features identified in the gap analysis and records their factual implementation status across the database and codebase.

---

## Summary of Implementations & Actual Database Status

| # | Feature Area | Status | Actual Implementation & Database Backing |
|---|---|:---:|---|
| 1 | **Booking Flow (Instant Confirmation)** | ✅ Completed | Instant confirmation flow supported in `src/routes/vehicle.$id.tsx` and `src/routes/_authenticated/bookings.tsx`. |
| 2 | **Booking Summary (GST, Fee & Coupons)** | ✅ Completed | Database-backed pricing with `platform_settings` rates (GST, service fee) and `validate_coupon` RPC. |
| 3 | **Home Hero Search (Service & Dates)** | ✅ Completed | Segmented switcher for Vehicle Rental, Hire Driver, and Doorstep Wash with Shadcn date & time pickers in `src/routes/index.tsx`. |
| 4 | **Driver Hire (Trip Types & Service Area)** | ✅ Completed | Multi-trip type selection and service area in `src/routes/driver.$id.tsx` and `src/routes/drivers.tsx`. |
| 5 | **Driver Dashboard (Jobs, Earnings & Ratings)** | ✅ Completed | Availability switch, live earnings stats, Upcoming Confirmed Jobs, Trip History, and Ratings tabs in `src/routes/_authenticated/driver-dashboard.tsx`. |
| 6 | **Host Dashboard (Payouts, Documents & Reviews)** | ✅ Completed | Host Payouts tab, vehicle verification documents view, reviews view with ratings in `src/routes/_authenticated/vendor.index.tsx`. |
| 7 | **Wash (Status Pipeline & Reviews)** | ✅ Completed | Stepper (`Requested` → `Confirmed` → `Cleaner assigned` → `On the way` → `Started` → `Completed`) and reviews in `src/routes/_authenticated/washes.tsx`. |
| 8 | **Wallet (Withdrawable Balance & Payouts)** | ✅ Completed | Real wallet ledger, withdrawable balance calculation, and withdrawal requests in `src/routes/_authenticated/wallet.tsx`. |
| 9 | **Review & User Report Moderation (Person 3)** | ✅ Completed | Database-backed with admin DELETE policy on `reviews`, `admin_remove_review` & `admin_dismiss_review_report` RPCs (recalculating vehicle average rating), and `user_reports` moderation queue in `src/components/admin/review-moderation-tab.tsx`. |
| 10 | **Scheduled Reminders (Person 3)** | ✅ Completed | Server-side / database-driven via `generate_scheduled_reminders()` RPC and `/api/cron/reminders` endpoint. 24h & 2h trip pickup alerts and 30-day DL expiry alerts are written to `notifications`. Browser-derived synthetic alerts removed from `notification-bell.tsx` to eliminate duplication. |
| 11 | **Pooling Safety (Emergency Contact & Policy)** | ✅ Completed | Emergency contact input, written cancellation policy notice, and ride reporting in `src/routes/pooling.tsx`. |
| 12 | **Admin & Washing Center Verification** | ✅ Completed | Washing center queue (`wash_vendors`), Payouts queue, and Coupon manager in `src/routes/_authenticated/admin.tsx`. |
| 13 | **Visual Style (Light-first Look)** | ✅ Completed | Clean light-first theme default (`rs-theme || 'light'`) with toggleable dark mode in `src/routes/__root.tsx`. |
| 14 | **Shadcn UI Date & Time Pickers** | ✅ Completed | Reusable `DatePicker` and `TimePicker` components wrapping Shadcn UI `Calendar` across all forms. |
| 15 | **Roles: Vehicle Cleaner & Washing Center** | ✅ Completed | Dedicated dashboards for Cleaners (`cleaner-dashboard.tsx`) and Washing Centers (`wash-center-dashboard.tsx`). |
| 16 | **Platform Settings & Revenue Analytics (Person 3)** | ✅ Completed | Single-row `platform_settings` table (GST, fees, commission per vertical, SOS phone, maintenance mode, limits) with admin-only write RLS; real aggregated financials via `admin_revenue_aggregates()` RPC in `revenue-commissions-tab.tsx`. |
| 17 | **Cities & Category Rules (Person 3)** | ✅ Completed | `cities` (active, surge multiplier) and `category_rules` (min deposit, window hours) tables with admin management in `cities-categories-tab.tsx`; `CityPicker` reads active operating cities dynamically from database. |
| 18 | **Trip Safety Center & Emergency SOS (Person 3)** | ✅ Completed | Full database backing: `incidents` table (SOS with GPS coordinates, accidents, breakdown, lost items notifying hosts and admins) and `trusted_contacts` table in `safety.tsx` and `trip-safety-extension.tsx`. |
| 19 | **Support Tickets Helpdesk (Person 3)** | ✅ Completed | `support_tickets` and `ticket_messages` tables with user ticket submission form in `help.tsx` and `safety.tsx`, admin ticket management & reply resolution in `support-tickets-tab.tsx`, and user notification on resolution/reply. |
| 20 | **Referrals & Host Maintenance (Person 3)** | ✅ Completed | Referrals: unique `referral_code` and `referred_by` with automatic ₹500 wallet credit via `wallet_apply` on first paid booking (`apply_referral_bonus_on_first_paid` trigger / GR-01). Host Maintenance: fully database-backed `vehicle_maintenance` table in `vendor-maintenance.tsx`. |
| 21 | **Membership, Corporate, Rewards** | ⏳ Coming Soon | Clear "Early Access / Beta Preview" waitlist indicators displayed in `membership.tsx`, `corporate.tsx`, and `rewards.tsx` to honestly communicate upcoming availability without false claims of production billing. |

---
*Updated: 2026-11-07 by Person 3 (Admin, Trust and Safety, Platform)*
