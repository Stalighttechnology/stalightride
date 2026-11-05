# Partial Feature Fixes Log — Synchoo / StalightRide

This document tracks all features identified in the gap analysis as partially implemented and records their full implementation across the codebase.

---

## Summary of Completed Implementations

| # | Feature Area | Status | Key Changes & Files |
|---|---|:---:|---|
| 1 | **Booking Flow (Instant Confirmation)** | ✅ Completed | Supported instant confirmation flow in `src/routes/vehicle.$id.tsx` and `src/routes/_authenticated/bookings.tsx`. Renters can confirm immediately and proceed directly to payment. |
| 2 | **Booking Summary (GST, Fee & Coupons)** | ✅ Completed | Added GST (18%) and platform fee (5%) line items, and real-time coupon code input calling `validate_coupon` DB RPC in `src/routes/vehicle.$id.tsx`. |
| 3 | **Home Hero Search (Service & Dates)** | ✅ Completed | Segmented switcher for Vehicle Rental, Hire Driver, and Doorstep Wash with inline pickup and return date & time pickers in `src/routes/index.tsx`. |
| 4 | **Driver Hire (Trip Types & Service Area)** | ✅ Completed | Added trip type selection (Outstation, Airport transfer, Corporate, Events, City run), service area, and real-time availability in `src/routes/driver.$id.tsx` and `src/routes/drivers.tsx`. |
| 5 | **Driver Dashboard (Jobs, Earnings & Ratings)** | ✅ Completed | Added live availability switch, total earnings stat, Upcoming Confirmed Jobs tab, Trip History tab, and Ratings tab in `src/routes/_authenticated/driver-dashboard.tsx`. |
| 6 | **Host Dashboard (Payouts, Documents & Reviews)** | ✅ Completed | Added Host Payouts tab, vehicle verification documents view, reviews view with ratings, and earnings analytics in `src/routes/_authenticated/vendor.index.tsx`. |
| 7 | **Wash (Status Pipeline & Reviews)** | ✅ Completed | Status stepper (`Requested` → `Confirmed` → `Cleaner assigned` → `On the way` → `Started` → `Completed`) and wash review star ratings & feedback in `src/routes/_authenticated/washes.tsx` and `src/routes/wash.tsx`. |
| 8 | **Wallet (Withdrawable Balance & Payouts)** | ✅ Completed | Added withdrawable balance calculation, payout request form writing to `payouts` table, 10% platform commission disclosure, promo credits tab, and pending filter in `src/routes/_authenticated/wallet.tsx`. |
| 9 | **Reviews (Host, Wash & Provider Experience)** | ✅ Completed | Added cleaning service reviews in `washes.tsx`, driver reviews in `driver-dashboard.tsx`, and host reviews in `vehicle.$id.tsx`. |
| 10 | **Notifications (Reminders & Expiry)** | ✅ Completed | Smart derived notifications in `src/components/notification-bell.tsx` for trip pickup reminders (<24h), document expiry alerts (<30 days), and payout received notices. |
| 11 | **Pooling Safety (Emergency Contact & Policy)** | ✅ Completed | Added emergency contact field, written cancellation policy notice, passenger ride ratings, and report user trigger in `src/routes/pooling.tsx` and `src/routes/_authenticated/pooling.mine.tsx`. |
| 12 | **Admin & Washing Center Verification** | ✅ Completed | Added Washing Center (`wash_vendors`) verification queue, Payouts approval queue, and Coupon management queue in `src/routes/_authenticated/admin.tsx`. |
| 13 | **Visual Style (Light-first Look)** | ✅ Completed | Switched default theme script in `src/routes/__root.tsx` to clean light-first look (`rs-theme \|\| 'light'`) with neutral white card surfaces in `src/styles.css`. |

---

## Detailed Implementation Breakdown

### 1. Booking Summary — GST, Service Fee & Coupon Input
- **File:** `src/routes/vehicle.$id.tsx`
- **What was added:**
  - `gst` calculated at 18% of subtotal.
  - `serviceFee` calculated at 5% of subtotal.
  - Interactive coupon input field with "Apply" button calling `supabase.rpc("validate_coupon", { _code, _amount })`.
  - Discount row rendered with green highlight when coupon code is verified.
  - Final total payable accounts for subtotal + GST + service fee − coupon discount + security deposit.
  - Coupon discount passed to booking record on submission.

### 2. Home Hero Search — Service Selector + Pickup & Return Date/Time
- **File:** `src/routes/index.tsx`
- **What was added:**
  - 3-segment switcher: **Vehicle Rental** (`Car` icon), **Hire Driver** (`UserRound` icon), and **Doorstep Wash** (`Droplets` icon).
  - Inline pickup date and pickup time pickers.
  - Inline return date and return time pickers (for rental).
  - Smart search handler routes with query parameters (`/browse`, `/drivers`, `/wash`).

### 3. Driver Hire & Profile
- **Files:** `src/routes/driver.$id.tsx`, `src/routes/drivers.tsx`, `src/routes/_authenticated/driver-dashboard.tsx`
- **What was added:**
  - Multi-select trip types for drivers (Outstation, Airport transfer, Corporate, Events, City run).
  - Driver service area field (e.g., "Bangalore + 100 km").
  - Trip type selection on customer booking card with customized trip notes.
  - Service area and trip type badges displayed on driver profile.
  - Real-time online/offline availability switch for drivers.

### 4. Driver Dashboard
- **File:** `src/routes/_authenticated/driver-dashboard.tsx`
- **What was added:**
  - Live availability toggle card (switch online/offline with real-time feedback).
  - Total earnings stat card calculating all paid and completed hires.
  - Tabbed interface separating **Upcoming** confirmed hires, **History** (completed & cancelled), and **Ratings** (all `driver_reviews` with ratings & comments).
  - Ability for drivers to view customer pickup notes and addresses.

### 5. Host Dashboard
- **File:** `src/routes/_authenticated/vendor.index.tsx`
- **What was added:**
  - **Payouts tab**: Lists all payout requests and their status (`pending`, `paid`, `rejected`).
  - **Reviews tab**: Displays customer reviews for all host's listed vehicles with vehicle title, star rating, and comment.
  - **Vehicle documents visibility**: Shows KYC status and document verification state for each vehicle (RC, insurance, pollution, fitness).

### 6. Vehicle Wash Tracking & Reviews
- **Files:** `src/routes/_authenticated/washes.tsx`, `src/routes/wash.tsx`
- **What was added:**
  - Complete status stepper displaying the full lifecycle: `Requested` → `Confirmed` → `Cleaner assigned` → `On the way` → `Started` → `Completed`.
  - Interactive wash review widget (`WashReviewForm`) for rating service quality with 1–5 stars and comments after completion.
  - Service category filters for Doorstep, Bike & Scooter, Interior, Detailing, and Subscriptions.

### 7. Wallet & Payout Requests
- **File:** `src/routes/_authenticated/wallet.tsx`
- **What was added:**
  - **Withdrawable balance** card: Automatically calculates earnings from completed rides minus platform commission and previous payouts.
  - **Request payout form**: Form allowing hosts and drivers to request withdrawals directly to their UPI ID or bank account (writes to `payouts` table).
  - **Commission notice**: Explains 10% platform commission transparently.
  - **Tabs**: Transaction history, Promo credits, and Pending transactions.

### 8. Pooling Safety & Policies
- **Files:** `src/routes/pooling.tsx`, `src/routes/_authenticated/pooling.mine.tsx`
- **What was added:**
  - Emergency contact phone input in the car pooling seat request form.
  - Prominent written cancellation policy banner explaining refund windows (100% >12h, 50% 2–12h, non-refundable <2h).
  - "Report issue" safety button on pooling trip cards.
  - Post-ride rating system for completed car pooling trips.

### 9. Admin & Washing Center Verification
- **File:** `src/routes/_authenticated/admin.tsx`
- **What was added:**
  - **Wash Centers tab**: Verifies and manages washing center partners (`wash_vendors`), displaying active status, daily capacity, and contact phone with approve/deactivate actions.
  - **Payouts tab**: Allows admin to review host withdrawal requests and approve/mark them as paid.
  - **Coupons tab**: Full discount coupon manager to create promo codes with percentage or flat discounts.

### 10. Light-First Visual Style
- **Files:** `src/routes/__root.tsx`, `src/styles.css`
- **What was added:**
  - Default theme script set to `light` mode on initial visit (`localStorage.getItem('rs-theme') || 'light'`).
  - Dark mode remains fully functional and toggleable via theme switch.
  - Clean neutral white and soft grey surfaces configured in CSS theme variables.

---
*Generated: 2026-11-05*

