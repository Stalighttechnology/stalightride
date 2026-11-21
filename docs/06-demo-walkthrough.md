# Demo walkthrough: click-by-click GUI testing

This guide tests the product the way a customer, a provider and an admin use it. Every step says **who** acts, **where** to go, **what to click**, and **what to check**, both on screen and behind the scenes.

It strings the [component docs](README.md#who-owns-what) together into end-to-end journeys. When a step fails, the component doc's case ID (for example RB-04) holds the detailed rule.

| Run                 | Sections          | Time             |
| ------------------- | ----------------- | ---------------- |
| **Demo path** | 0, 2, 3, 5, 6, 10 | about 45 minutes |
| **Full pass** | All               | about 2 hours    |

---

## How to test like it's production

### 1. One browser profile per person

The app keeps each sign-in in browser storage, so **two tabs in the same profile are the same user**. Open separate profiles and put them side by side, so you can watch notifications arrive live.

| Window      | How to open it                                           | Signed in as                              |
| ----------- | -------------------------------------------------------- | ----------------------------------------- |
| **A** | Chrome, your normal profile                              | Asha (customer)                           |
| **B** | Chrome, a second profile (profile icon → **Add**) | Hari (host), and later Cara (cleaner)     |
| **C** | Edge                                                     | Ada (admin)                               |
| **D** | Chrome Incognito, or Firefox                             | Ben (second customer), only for section 3 |

Accounts, passwords (`Test@1234`) and the standard vehicle are in [Local setup](02-local-setup-and-test-data.md) §3–4.

### 2. Five checks after every step

A step only passes when all five hold:

1. **Screen**: the toast and status say exactly what the **Check** column says.
2. **The other person**: the bell 🔔 in the other window shows the notification within about 2 seconds, without a refresh.
3. **Refresh (F5)**: the new state is still there after a reload.
4. **Console**: F12 → Console shows no red errors, and the Network tab shows no `500` responses. A `400` is fine when the step expects a refusal.
5. **Money**: for any step that moves money, the wallet changes by the exact amount shown.

After every section, run the **ledger check**. It must return no rows:

```sql
-- psql -U synchoo -h localhost -d synchoo   (password: synchoo)
SELECT w.user_id, w.balance, COALESCE(SUM(t.amount), 0) AS ledger
FROM public.wallets w LEFT JOIN public.wallet_transactions t ON t.user_id = w.user_id
GROUP BY w.user_id, w.balance HAVING w.balance <> COALESCE(SUM(t.amount), 0);
```

### 3. Try to break each flow

For each flow, try these on purpose. The app must refuse cleanly, with a clear message and no money moved:

- **Double-click** any Pay or Request button. It must charge or create once.
- **Two tabs**: act on the same booking from two profiles at once.
- **Back button** after paying, then pay again. It must say `Already paid`.
- **Close the Razorpay popup** without paying. The booking stays unpaid and can be paid again.
- **Phone width**: F12 → device toolbar → iPhone 12. Every button in this guide must be reachable and nothing should scroll sideways.

### 4. Recording results

Mark each step **PASS**, **FAIL** or **BLOCKED** in the last column of a printed or copied version of this file. For each FAIL, fill in the [bug template](#12-bug-report-template).

---

## 0. Pre-flight (5 minutes)

| #   | Do                                                                                                                               | Check                                                                                                                                             | Result |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 0.1 | `git pull`, then in `backend/` run `.venv/Scripts/python manage.py migrate`                                                | Ends with `0022_hot_path_indexes` applied, or "No migrations to apply"                                                                          |        |
| 0.2 | Start the backend with `.venv/Scripts/python manage.py runserver 8000`, and the frontend with `npm run dev` in `frontend/` | [http://localhost:8000/health/](http://localhost:8000/health/) shows `{"status": "ok"}`, and [http://localhost:8080](http://localhost:8080) loads |        |
| 0.3 | Sign in on windows A, B and C as Asha, Hari and Ada                                                                              | Ada lands on `/admin` (**Super Admin Console**), Hari on `/vendor`                                                                      |        |
| 0.4 | Check the standard data from doc 02 §4 exists                                                                                   | Licences approved, Hari approved, **Test Swift** is **Live**, Asha and Ben each have at least ₹20,000                                |        |
| 0.5 | Optional: Razorpay test keys are in both `.env` files                                                                          | Without them, use **Pay with wallet** everywhere; **Pay now** shows a configuration error                                             |        |

> Starting clean: doc 02 §8 resets the database. After a reset, repeat doc 02 §3–4.

---

## 1. Onboarding, verification and images

This section shows that nobody transacts until an admin verifies them, and that uploaded images show up everywhere.

| #   | Who / window        | Go to                                     | Click / do                                                                                                                                                                                                           | ✅ Check                                                                                                         | Result |
| --- | ------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1 | Rae (new), window D | `/auth` → **Sign Up** tab        | Enter Full Name `Rae Rider`, an email, password `Test@1234` → **Create Account**                                                                                                                          | Toast `Account created successfully!`, then lands on `/browse`                                               |        |
| 1.2 | Rae                 | `/profile` → **Driving licence** | Enter a licence number and an expiry 2+ years away, upload front and back photos → **Submit for verification**                                                                                                | Toast `Submitted — we'll review shortly`, badge **Pending**                                             |        |
| 1.3 | Rae                 | Open **Test Swift**, pick dates     | Look at the booking panel                                                                                                                                                                                            | The button reads **Verify licence to book**, so a pending licence cannot book                              |        |
| 1.4 | Ada, window C       | `/admin` → **Licences**          | Click Rae's front and back photo links                                                                                                                                                                               | Both images open, which proves the private file links work                                                       |        |
| 1.5 | Ada                 | Same row                                  | **Approve**                                                                                                                                                                                                    | Rae's badge becomes **Approved** after a refresh, and Rae gets a notification                              |        |
| 1.6 | Hari, window B      | `/vendor/vehicles/new`                  | Fill **Basics**, **Pricing (INR)** and the map pin. Under **Photos** upload 3 photos, and under **Verification documents** upload RC, Insurance and Pollution → **Submit for review** | Toast `Submitted for review — you'll be notified once approved.`, and the card shows **Pending review** |        |
| 1.7 | Guest               | `/browse`                               | Search for the new vehicle                                                                                                                                                                                           | **Not listed**, because it is not approved yet                                                             |        |
| 1.8 | Ada                 | `/admin` → **Vehicles**          | Open **RC**, **Insurance** and **Pollution**, then **Approve**                                                                                                                               | Toast `Vehicle approved`, and Hari's card turns **Live**                                                 |        |
| 1.9 | Guest               | `/browse` → open the vehicle           | Look at the photos                                                                                                                                                                                                   | The first photo is the browse thumbnail, and every photo shows on the vehicle page                               |        |

Behind the scenes: `/admin` → **Vehicles**, **Licences** and **Hosts (KYC)** each show **Previous / Page 1 of N / Next** once they hold more than 25 rows.

---

## 2. Rental booking end to end (the main demo)

Book **Test Swift** for **today, with pickup 2 hours 10 minutes from now, returning tomorrow at the same time**. Bookings need at least 2 hours' notice (business rules §17), and check-in opens 30 minutes before pickup. So run 2.1 to 2.10, then continue from 2.11 when check-in opens, about 1 hour 40 minutes later. For a live demo, make the booking before the audience arrives.

Expected money (business rules §1): base ₹2,000 + fee ₹100 + GST ₹18 + deposit ₹3,000 = **₹5,118**. Hari earns **₹1,764**, and Asha gets the **₹3,000** deposit back at the end.

| #    | Who         | Go to                                                    | Click / do                                                                                                                                                  | ✅ Check                                                                                                                                                           | Result |
| ---- | ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 2.1  | Asha (A)    | `/browse`                                              | Set **City** to Bengaluru, open **Test Swift**                                                                                                  | The vehicle page loads with photos, price and reviews                                                                                                              |        |
| 2.2  | Asha        | Booking panel, **1. Trip schedule**                | Set **Pickup date** to today, **Pickup time** to now + 2 h 10 min, and **Return date** / **Drop-off time** to tomorrow at the same time. Times under 2 hours away are not offered | **Fare breakdown**: base ₹2,000, fee ₹100, GST ₹18, deposit ₹3,000, total **₹5,118** (RB-01)                                                      |        |
| 2.3  | Asha        | **Coupon code**                                    | Type `save10` → **Apply**                                                                                                                          | Toast `Coupon SAVE10 applied!`, total **₹4,906.20**. Clear the code again so the rest of this section uses ₹5,118                                        |        |
| 2.4  | Asha        |                                                          | **Request to book** (double-click it on purpose)                                                                                                      | **One** toast `Booking requested! Host will respond by …` (about 1 hour from now), redirect to `/bookings`, and **one** card with progress at **Requested** and `Waiting for host, responds by …` with a countdown |        |
| 2.5  | Hari (B)    | 🔔                                                       | Open the bell                                                                                                                                               | A "new booking request" notification has arrived without a refresh                                                                                                 |        |
| 2.6  | Ada (C)     | `/admin` → **Bookings Monitor**                 | Look at the top row                                                                                                                                         | Test Swift, status **pending**, ₹5,118                                                                                                                      |        |
| 2.7  | Hari        | `/vendor` → **Bookings & Activity**             | Check the `Respond within …` badge, then **Approve**                                                                                                  | The status becomes **Confirmed**, Asha's bell says the host accepted, and her card shows **Pay by …** with a countdown                                       |        |
| 2.8  | Asha        | `/bookings` → **As renter**                     | In **Host accepted — confirm with payment**, click **Pay with wallet** twice quickly                                                           | One toast `Paid from wallet`, and the wallet drops by **exactly ₹5,118**. The progress reaches **Paid**                                             |        |
| 2.9  | Hari        | 🔔                                                       |                                                                                                                                                             | `Payment received: Payment of Rs 5118.00 received for Test Swift.`                                                                                               |        |
| 2.10 | Asha        | Same card → **Receipt**                           | **Download** or **Print / Save PDF**                                                                                                            | Rental fare ₹2,000, fee ₹100, GST ₹18, deposit ₹3,000, total ₹5,118                                                                                           |        |
| 2.11 | Hari        | `/bookings` → **As host** → **Check-in code** | Read the 6-digit code | The trip page shows **Check-in code** and nothing else to fill in | |
| 2.12 | Asha        | `/bookings` → **Start trip** (once check-in opens) | Take all 9 photos (4 sides, 4 corners, dashboard), enter odometer 12000, then type a wrong code | `That code is not right. Ask your host for the code.` The trip doesn't start | |
| 2.13 | Asha        | Same form | Enter Hari's check-in code → **Start trip** | Toast `Trip started. Drive safe!` Hari's page switches to **Check-out code** and shows Asha's photos labelled by angle | |
| 2.14 | Asha        | `/bookings` | Look at the card | The trip link reads **Live trip · check out**. Cancelling says `The trip has started — raise a dispute instead` (RB-22) | |
| 2.15 | Asha        | Trip page | **Share live location** (allow location) | Hari's trip page shows the pin moving every 15 seconds | |
| 2.16 | Asha        | Trip page → **Check-out** | Take the 9 photos, odometer **11000**, Hari's check-out code → **End trip** | Refused, because the return odometer can't be lower than pickup | |
| 2.17 | Asha        | Same | Odometer 12150, Hari's check-out code → **End trip** | Toast `Trip completed. Thanks for riding!`, and the status is **Completed** | |
| 2.18 | Asha / Hari | `/wallet` → **Transaction history**             | Read the newest rows                                                                                                                                        | Asha has **+₹3,000** (deposit back), and Hari has **+₹1,764** (earning). Ledger check: no rows                                                       |        |
| 2.19 | Asha        | `/rewards` → **View Points History**            |                                                                                                                                                             | **+512 points** ("Completed Trip Rewards"; ₹5,118 ÷ 10)                                                                                                    |        |
| 2.20 | Asha        | `/vehicle/<id>` → review box                          | 5 stars + a comment → **Post review**                                                                                                                | Toast `Thanks for your review!`, and the vehicle's rating and count update                                                                                       |        |
| 2.21 | Hari        | Same review                                              | **Post reply**                                                                                                                                        | The reply shows under the review for everyone                                                                                                                      |        |
| 2.22 | Ada         | **Bookings Monitor**                               | **Refresh live feed**                                                                                                                                 | The same booking now shows **completed**                                                                                                                     |        |

> Hari never fills in a form: he only reads out the codes. Asha can't finish the trip without Hari's check-out code.

### 2b. Deadlines and Instant Book

Uses the shortcuts in [doc 02 §6](02-local-setup-and-test-data.md#booking-windows-deadlines) to make a deadline pass, then `manage.py send_reminders`.

| #     | Who      | Do | ✅ Check | Result |
| ----- | -------- | -- | -------- | ------ |
| 2b.1  | Asha     | Request Test Swift a week ahead. Don't approve. Expire the response window and run `send_reminders` | Card says `The host did not respond in time, so the request expired.` with **Find similar cars**. Hari's bell has the expiry too | |
| 2b.2  | Asha     | **Find similar cars** | `/browse` opens with the same city and dates | |
| 2b.3  | Hari, Asha | Hari approves a new request. Expire the payment window and run `send_reminders` | Card says `The payment window closed before payment was completed.`, and the dates are free again | |
| 2b.4  | Hari     | `/vendor` → switch **Instant Book** on for Test Swift | Toast `Instant Book enabled`, and the **Instant** badge shows | |
| 2b.5  | Asha     | Request Test Swift again | Toast `Booking confirmed instantly! Please complete payment by …`, no host approval needed | |
| 2b.6  | Guest    | `/browse` for Bengaluru | Test Swift is listed first with the **Instant** badge | |

---

## 3. No double booking (atomic, even with simultaneous clicks)

This is the fix from migration 0020. Use a fresh date range, for example **D+10 to D+11**.

| #   | Who                    | Do                                                                                                                         | ✅ Check                                                                                                              | Result |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1 | Asha (A)               | On **Test Swift**, request D+10 → D+11                                                                              | `Booking requested!`, status **pending**                                                                      |        |
| 3.2 | Ben (D)                | Open the **same vehicle URL** (copy it from window A) and request **D+11 → D+12**                             | Red toast **`Vehicle not available for selected dates`**, and no booking appears in Ben's `/bookings`       |        |
| 3.3 | Asha **and** Ben | Both fill **D+20 → D+21** on the same vehicle. Count "3-2-1" and click **Request to book** at the same moment | **Exactly one** person sees `Booking requested!`. The other sees `Vehicle not available for selected dates` |        |
| 3.4 | Ada (C)                | **Bookings Monitor** → filter **rental**                                                                      | Only one booking for D+20                                                                                             |        |
| 3.5 | Hari (B)               | `/vendor` → **Availability Calendar** → set **Block from** to D+10 → **Block dates**                | Refused with **`These dates already have a booking. Decline or cancel it first`**                             |        |
| 3.6 | Hari                   | Block **D+30** (nothing booked)                                                                                      | `Dates blocked — hidden from Browse rides`                                                                         |        |
| 3.7 | Asha                   | Request D+30                                                                                                               | `Vehicle is blocked on selected dates`                                                                              |        |
| 3.8 | Hari                   | Decline Asha's D+10 request                                                                                                | Status **rejected**, and Asha is notified                                                                       |        |
| 3.9 | Ben                    | Request D+10 → D+11 again                                                                                                 | Now accepted, because declined requests free the dates (RB-28)                                                        |        |

Behind the scenes, there must be no overlapping active bookings. This query must return no rows:

```sql
SELECT a.id, b.id FROM public.bookings a JOIN public.bookings b
  ON a.vehicle_id = b.vehicle_id AND a.id < b.id
 AND a.status IN ('pending','confirmed') AND b.status IN ('pending','confirmed')
 AND a.start_date <= b.end_date AND a.end_date >= b.start_date;
```

The same guarantee covers driver hire (step 7.4) and one cleaner per wash job (step 5.10). A cleaner also cannot hold two overlapping wash jobs (VW-41).

---

## 4. Cancellation and refunds

Make one paid ₹5,118 booking per row (request → Hari approves → **Pay with wallet**), with pickup at the time given. Refunds always go to the wallet.

| #   | Pickup time                   | Who cancels                       | ✅ Expected refund to Asha                           | ✅ Host gets | Status                 | Result |
| --- | ----------------------------- | --------------------------------- | ---------------------------------------------------- | ------------ | ---------------------- | ------ |
| 4.1 | 3+ days away                  | Asha → **Cancel**          | ₹5,118.00                                           | ₹0          | `refunded`           |        |
| 4.2 | 10 hours away                 | Asha                              | ₹4,059.00                                           | ₹882.00     | `partially_refunded` |        |
| 4.3 | 1 hour away                   | Asha                              | ₹3,000.00 (deposit only)                            | ₹1,764.00   | `partially_refunded` |        |
| 4.4 | 1 hour away                   | Hari → **Cancel & refund** | ₹5,118.00                                           | ₹0          | `refunded`           |        |
| 4.5 | Unpaid pending request        | Asha                              | ₹0, no wallet row                                   | —           | `cancelled`          |        |
| 4.6 | Completed booking (section 2) | Asha                              | Refused: `This booking can no longer be cancelled` | —           | —                     |        |

After each row, check that the confirmation dialog's preview matches the refund actually credited, then run the ledger check.

---

## 5. Car wash

Asha books a **Car Express Wash at ₹449** in Bengaluru, at least 1 day ahead. There is no admin approval: she pays straight away and the job goes on the cleaner job board (business rules §17). Expected: Asha pays **₹475.49** and Cara earns **₹396.02** (business rules §4). Cara needs a base pin within 5 km of the address (doc 02 §4, step 10).

| #    | Who                            | Go to                       | Click / do | ✅ Check | Result |
| ---- | ------------------------------ | --------------------------- | ---------- | -------- | ------ |
| 5.1  | Asha (A)                       | `/wash`                     | **Choose a package** → Car Express Wash. Enter the date, time and address, and drop the **map pin** → book | Toast `Wash slot reserved! Please complete payment to notify nearby washers.` The booking shows `Payment pending (pay by …)`, 15 minutes from now | |
| 5.2  | Asha                           | `/washes`                   | **Pay with wallet** within 15 minutes | Toast `Paid successfully from wallet! Finding a nearby washer partner.` Wallet drops **₹475.49**, badge **Finding a washer** | |
| 5.3  | Ada (C)                        | `/admin` → **Wash Orders**  | Find the wash | Listed as paid. There is no approve step | |
| 5.4  | Cara (B, signed in as cleaner) | `/cleaner-dashboard`        | Switch **ONLINE** → **Available Requests** → **Claim Job** | The job moves to **Assigned & Active Jobs**, and Asha sees **Washer assigned** | |
| 5.5  | Cara                           | Job card                    | **On the Way** | Asha sees **Cleaner on the way** | |
| 5.6  | Cara                           |                             | **Start Wash** | Asha sees **Wash started** | |
| 5.7  | Cara                           |                             | **Mark Completed** | Asha sees **Wash completed**, and Cara's wallet shows **+₹396.02** under **Earnings & History** | |
| 5.8  | Asha                           | `/washes`                   | **Post review** | Cara's rating updates | |
| 5.9  | Asha, Cara, Cleo               | Book and pay a second wash. Cara and Cleo open **Available Requests** in two windows | Before the tier widens, only Cara sees it (top 3 within 5 km). After the shortcut in doc 02 §6 pushes the payment back 5 h, Cleo sees it too | |
| 5.10 | Cara + Cleo                    | Both click **Claim Job** at the same moment | One wins. The other sees `Another partner just claimed this job` | |
| 5.11 | Cara                           | **Release job** on a job whose slot is less than 12 h away | A late-strike warning, then the job goes back on the board and Ada is alerted | |
| 5.12 | Ada                            | Move an unclaimed paid wash's slot close (doc 02 §6), run `send_reminders` → **Bookings Monitor** | It is listed under **At risk: no washer assigned**. **Assign** Cara, and Asha sees **Washer assigned** | |
| 5.13 | Asha                           | Leave another paid wash unclaimed past its auto-cancel time, run `send_reminders` | `No washer was available for your slot. A full refund has been credited to your wallet.` Wallet back up by ₹475.49 | |

> **Known**: before and after photos on the cleaner dashboard are placeholder images, not real uploads. For a photo demo, use the rental trip inspection (2.13).

---

## 6. Referral and rewards

| #    | Who                               | Go to                                                                                                                                                | Click / do                                                                                                         | ✅ Check                                                                                                     | Result |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ |
| 6.1  | Asha (A)                          | `/referrals` (sidebar **Rewards & perks → Refer & earn**)                                                                                   | **Copy Invite Link**                                                                                         | The link looks like `/auth?mode=signup&ref=<CODE>`                                                         |        |
| 6.2  | New user Rio, window D signed out | Paste the link                                                                                                                                       | Sign up                                                                                                            | The sign-up page says `Referral code <CODE> applied`, and the account is created                           |        |
| 6.3  | Asha                              | Reload `/referrals`                                                                                                                                |                                                                                                                    | Rio is listed as **pending** with ₹0 rewarded                                                         |        |
| 6.4  | Ada                               | **Licences** → approve Rio's licence (Rio uploads it first, as in 1.2). **Promo credit** → give Rio ₹10,000 → **Grant credit** | Rio's wallet shows ₹10,000 under **Promo credits**                                                          |                                                                                                              |        |
| 6.5  | Rio                               | Book Test Swift on free dates. Hari approves, then Rio clicks **Pay with wallet**                                                              | Rio and Asha **both get +₹500**, with notifications "Welcome Bonus Credited" and "Referral Bonus Credited"  |                                                                                                              |        |
| 6.6  | Asha                              | `/referrals`                                                                                                                                       |                                                                                                                    | Rio shows as **rewarded**, ₹500                                                                       |        |
| 6.7  | Rio                               | Pay for a second rental                                                                                                                              | **No** further bonus (MR-06)                                                                                 |                                                                                                              |        |
| 6.8  | Asha                              | `/rewards` (**Synchoo Rewards**)                                                                                                             | Read the points balance                                                                                            | It matches the history (512 from section 2), and the same number shows in window D signed in as Asha (MR-23) |        |
| 6.9  | Asha                              | **Explore Perks** → a voucher she can afford → **Unlock Voucher** → confirm                                                           | Toast `Redeemed …!`, the points drop by the voucher cost, and the code appears in **My Redeemed Rewards** |                                                                                                              |        |
| 6.10 | Asha                              | **Copy Code**, then paste it into **Coupon code** on a booking of the matching service                                                   | Accepted only on its own service and only for Asha. Ben pasting it is refused                                      |                                                                                                              |        |
| 6.11 | Asha                              | `/membership`                                                                                                                                      | **Upgrade to Plus** → **Pay ₹499 & Activate** (wallet)                                               | The wallet drops by ₹499, and the plan shows active with an expiry 30 days out                              |        |
| 6.12 | Asha                              | Complete another paid rental                                                                                                                         | Points earned are **1.5×** (Plus multiplier)                                                                |                                                                                                              |        |

---

## 7. Driver hire (short)

| #   | Who  | Do                                                                                                                     | ✅ Check                                                                                | Result |
| --- | ---- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| 7.1 | Asha | `/drivers` → **View & hire** on Dev → **By day** → dates at least 2 h ahead and address → **Request this driver** | `Request sent — driver responds by …`, and `/hires` shows the countdown |        |
| 7.2 | Dev  | `/driver-dashboard` → check the `Respond within …` badge → **Approve Hire**                                    | Asha is notified and sees the payment deadline                                        |        |
| 7.3 | Asha | `/hires` → **Pay with wallet**                                                                                | Wallet drops by the hire total                                                          |        |
| 7.4 | Ben  | Request Dev for an overlapping day                                                                                     | **`Driver is already booked for the selected dates`**                           |        |
| 7.5 | Dev  | **Mark completed**                                                                                               | Dev's earning is credited. Asha → **Submit review** → `Thanks for the review` |        |
| 7.6 | Asha | Request Dev again, expire the response window (doc 02 §6), run `send_reminders` | `/hires` shows **Book a similar driver**. One tap opens another driver with the same dates filled in |        |

## 8. Car pooling (short)

| #   | Who  | Do                                                                                              | ✅ Check                                                        | Result |
| --- | ---- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| 8.1 | Dev  | `/pooling/new` → route, departure tomorrow, 3 seats, ₹200 → **Publish pooling trip** | `Pooling trip published`                                      |        |
| 8.2 | Asha | `/pooling` → same route → **Find matching trips** → **Request 1 seat(s)**      | `Seat requested — the driver will accept or decline shortly` |        |
| 8.3 | Dev  | `/pooling/driver` → **Accept**                                                         | `Rider accepted — seats updated`, and seats go 3 → 2        |        |
| 8.4 | Asha | `/pooling/mine` → **Cancel booking**                                                   | Seats go back to 3                                              |        |
| 8.5 | Ben  | Request 4 seats                                                                                 | Refused, because that's more than the seats available           |        |

## 9. Wallet and payouts

| #   | Who  | Do                                                                                                                  | ✅ Check                                                                                   | Result |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| 9.1 | Asha | `/wallet` → **+₹500** chip → **Add money** → Razorpay test (for example UPI `success@razorpay`) | `Money added to your wallet`, +₹500 exactly once, even if the success page is refreshed |        |
| 9.2 | Asha | Open **Add money** and close the popup                                                                        | Nothing credited                                                                           |        |
| 9.3 | Hari | **Earnings & payouts** → **Withdraw** ₹500 → UPI `hari@okbank` → **Request withdrawal**     | The wallet drops ₹500 immediately                                                         |        |
| 9.4 | Ada  | `/admin` → **Payouts** → **Mark paid** → enter a UTR                                               | Moves to **paid**, and Hari is notified                                              |        |
| 9.5 | Hari | Withdraw again, and Ada clicks **Reject**                                                                     | `Rejected — amount returned to wallet`, and the ₹500 is back                           |        |
| 9.6 | Asha | Try **Withdraw**                                                                                              | Not offered: top-ups, refunds and bonuses are not withdrawable                             |        |

---

## 10. Admin console tour

Run this in window C while sections 2–9 happen in the other windows.

| #    | Tab                          | Do                                                                                                                                        | ✅ Check                                                                                                                                             | Result |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 10.1 | **Bookings Monitor**   | Click the **rental**, **driver**, **wash** and **pooling** filters, then search a vehicle name                    | The count line "Monitoring N…" changes per filter. The pager shows **Page 1 of N · total**, and **Next** loads 25 more with no repeats |        |
| 10.2 | **Customers**          | Search a name, then click a licence filter                                                                                                | The results and total update, and the pager resets to page 1                                                                                         |        |
| 10.3 | **Payments & Refunds** | **Issue Customer Refund / Compensation**: Asha's email, ₹100, a reason → **Process Refund**                                 | Asha +₹100, and the row appears at the top of the transaction list                                                                                  |        |
| 10.4 | **Broadcasts**         | **Target Audience** All Platform Users, a title and message → **Dispatch Broadcast**                                         | Toast `Broadcast sent to N users`, where N equals every registered user (it used to stop at 100). The bell rings in **every** window         |        |
| 10.5 | **Support Tickets**    | Asha files a ticket at `/help` → **Submit Ticket**. Ada → **Open Ticket** → reply → **Send Reply & Close Ticket** | Asha sees the reply                                                                                                                                  |        |
| 10.6 | **Reviews**            | **Flagged**                                                                                                                         | Shows only reported or ≤2★ reviews, with a correct count. **Remove Review** removes it from the vehicle page                                 |        |
| 10.7 | **Disputes**           | Asha files one from **Report** on a booking. Ada → **Mark in review** → **Resolve**                                   | Asha is notified at each step                                                                                                                        |        |
| 10.8 | **Revenue & Fees**     | Open it                                                                                                                                   | The totals load. If the aggregate fails it shows an error, never made-up numbers                                                                     |        |
| 10.9 | **Coupons**            | Create `DEMO50` (₹50 off) → **Pause**                                                                                           | A paused code is refused at checkout with `Invalid or expired coupon`                                                                              |        |

## 11. Sidebar (grouped by category)

| #    | Signed in as | ✅ Groups shown, top to bottom                                                                                                                                       | Result                                                                                      |
| ---- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 11.1 | Signed out   | **Book**, **Rewards & perks**, **Earn with us**, **Help & safety**                                                                           |                                                                                             |
| 11.2 | Asha         | **Book**, **Your account** (Account hub, History ▸, Wallet, Saved, Profile), **Rewards & perks**, **Earn with us**, **Help & safety** |                                                                                             |
| 11.3 | Hari         | Same as Asha, plus **Provider console** (Host dashboard, Host trips, Add vehicle)                                                                        |                                                                                             |
| 11.4 | Ada          | Same as Asha, plus **Admin → Admin panel**                                                                                                                    |                                                                                             |
| 11.5 | Any user     | Click the collapse icon, then try phone width                                                                                                                        | Icons only with tooltips; the drawer opens and closes on a phone, and nothing appears twice |

---

## 12. Bug report template

```
ID / step:        e.g. 2.8
Window / user:    A / Asha
Steps:            what you clicked, in order
Expected:         copy the Check column
Actual:           what happened (exact toast text)
Screenshot:       attach
Console / server: the red console line, or the backend terminal traceback
Ledger check:     rows returned? (paste them)
```

## 13. Sign-off

| Section                 | Tester | Date | Pass / Fail / Blocked | Notes |
| ----------------------- | ------ | ---- | --------------------- | ----- |
| 0 Pre-flight            |        |      |                       |       |
| 1 Onboarding and images |        |      |                       |       |
| 2 Rental end to end     |        |      |                       |       |
| 3 No double booking     |        |      |                       |       |
| 4 Cancellations         |        |      |                       |       |
| 5 Car wash              |        |      |                       |       |
| 6 Referral and rewards  |        |      |                       |       |
| 7 Driver hire           |        |      |                       |       |
| 8 Car pooling           |        |      |                       |       |
| 9 Wallet and payouts    |        |      |                       |       |
| 10 Admin console        |        |      |                       |       |
| 11 Sidebar              |        |      |                       |       |

**Out of the demo**: avoid **Corporate travel**, which is still a demo with sample data (GAP-14). Other open defects are listed in [Launch gaps](04-launch-gaps.md).
