# Local setup and test data

Everyone should test with the same accounts and vehicle so results can be compared.

## 1. Install and run

Follow the "Prerequisites", "First-time setup" and "Run it" sections of the [main README](../README.md). You should end up with:

| Service | Address |
| --- | --- |
| App | http://localhost:8080 |
| Backend | http://localhost:8000 |

## 2. Keys you need

Put these in `backend/.env` and `frontend/.env`. Templates are in each folder's `.env.example`.

| Key | Needed for | Without it |
| --- | --- | --- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Card and UPI payments | Pay now shows an error. Wallet payment still works |
| `VITE_RAZORPAY_KEY_ID` | Razorpay checkout | Same as above |
| `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` | Google sign-in | Email sign-in still works |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps | Map features are limited |
| `EMAIL_*` | Real password-reset emails | The email prints in the backend terminal |

Use Razorpay **test mode** keys only. Take test card and UPI details from Razorpay's test documentation. Never commit keys.

## 3. Create the test accounts

Sign up at `/auth` with each account below. Use the password `Test@1234`.

| Name | Email | Used as |
| --- | --- | --- |
| Asha Customer | `customer1@test.synchoo.local` | Main customer |
| Ben Customer | `customer2@test.synchoo.local` | Second customer, for conflict tests |
| Hari Host | `host@test.synchoo.local` | Vehicle host |
| Dev Driver | `driver@test.synchoo.local` | Hired driver and pool driver |
| Cara Cleaner | `cleaner@test.synchoo.local` | Doorstep cleaner in Bengaluru |
| Cleo Cleaner | `cleaner2@test.synchoo.local` | Second cleaner, for dispatch-tier and claim-race tests |
| Wes WashCenter | `center@test.synchoo.local` | Washing center |
| Ada Admin | `admin@test.synchoo.local` | Admin |

Make Ada an admin:

```bash
psql -U synchoo -h localhost -d synchoo -c "INSERT INTO public.user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'admin@test.synchoo.local';"
```

The local database password is `synchoo`.

## 4. Create the standard test data

Do these in order through the app.

| Step | Who | Action |
| --- | --- | --- |
| 1 | Asha, Ben | `/profile`: upload licence photos, enter a number and an expiry date at least 2 years away |
| 2 | Ada | `/admin`, Licences tab: approve both licences |
| 3 | Hari | `/vendor`: create the host profile and upload an identity document |
| 4 | Ada | `/admin`, Hosts (KYC) tab: approve Hari |
| 5 | Hari | `/vendor/vehicles/new`: add the standard vehicle below |
| 6 | Ada | `/admin`, Vehicles tab: approve the vehicle |
| 7 | Dev | `/driver-dashboard`: submit the standard driver below |
| 8 | Ada | `/admin`, Drivers tab: approve Dev |
| 9 | Dev | `/driver-dashboard`: switch to live |
| 10 | Cara, Cleo | `/cleaner-dashboard`: submit a profile with city `Bengaluru`. Set Cara's base pin within 5 km of MG Road and Cleo's 6 to 8 km away, both with radius 8 km |
| 11 | Ada | `/admin`, Cleaners tab: approve Cara and Cleo |
| 12 | Wes | `/wash-center-dashboard`: submit a profile with city `Bengaluru` |
| 13 | Ada | `/admin`, Wash Centers tab: approve Wes |
| 14 | Ada | `/admin`, Coupons tab: create `SAVE10` for 10% off and `FLAT100` for ₹100 off |
| 15 | Ada | `/admin`, Promo credit tab: grant Asha and Ben ₹20,000 each |

### Standard vehicle

| Field | Value |
| --- | --- |
| Title | Test Swift |
| Category | Car |
| Brand, model, year | Maruti, Swift, 2024 |
| City | Bengaluru |
| Hourly price | ₹200 |
| Daily price | ₹2,000 |
| Weekly price | ₹12,000 |
| Security deposit | ₹3,000 |

### Standard driver

| Field | Value |
| --- | --- |
| Name | Dev Driver |
| City | Bengaluru |
| Hourly rate | ₹300 |
| Daily rate | ₹2,500 |
| Trip types | City, airport |

## 5. Default fees

These are the seeded values in `platform_settings`. Every worked example in these docs uses them.

| Setting | Value |
| --- | --- |
| Service fee | 5% |
| GST | 18% |
| Commission | 10% |
| Minimum withdrawal | ₹500 |

## 6. Testing time-based rules

Most time rules depend on the pickup time you choose, so you don't need to wait.

| To test | Choose a pickup time |
| --- | --- |
| Full refund | More than 24 hours from now |
| 50% refund | Between 2 and 24 hours from now |
| No refund | Less than 2 hours from now |
| Check-in open | Within the next 30 minutes |
| Check-in not open yet | More than 30 minutes from now |

All trip times are India time (`Asia/Kolkata`).

### Booking windows (deadlines)

Since #40 to #45 and #49, requests, payments, pooling seats, and corporate approvals have deadlines ([Business rules §17](03-business-rules.md#17-booking-windows)). Expiry, reminders, departure closures, and wash dispatch alerts only happen when the scheduled job runs, so run it by hand while testing:

```bash
cd backend && .venv/Scripts/python manage.py send_reminders
```

The first run on an old local database cancels every request that is already past its deadline. That is expected.

To make a deadline pass without waiting, change it in `psql` (connected as `synchoo`, the owner), then run `send_reminders`. Replace `<id>` with the booking's id.

| To test | SQL |
| --- | --- |
| Host or driver missed the response window | `UPDATE public.bookings SET respond_by = now() - interval '1 minute' WHERE id = '<id>';` (use `public.driver_bookings` for a hire) |
| Pool driver missed response window | `UPDATE public.pool_requests SET respond_by = now() - interval '1 minute' WHERE id = '<id>';` |
| Halfway reminder is due | `UPDATE public.bookings SET respond_by = now() + interval '1 minute' WHERE id = '<id>';` |
| Customer missed the payment window | `UPDATE public.bookings SET pay_by = now() - interval '1 minute' WHERE id = '<id>';` (works on `driver_bookings` and `wash_bookings` too) |
| Corporate manager missed response window | `UPDATE public.company_trips SET respond_by = now() - interval '1 minute' WHERE id = '<id>';` |
| Wash moves to a later tier | `UPDATE public.wash_bookings SET paid_at = paid_at - interval '5 hours' WHERE id = '<id>';` then refresh the cleaner's board |
| Wash reaches its admin alert or auto-cancel time | Move the slot close: `UPDATE public.wash_bookings SET slot_date = (now() AT TIME ZONE 'Asia/Kolkata')::date, slot_time = ((now() AT TIME ZONE 'Asia/Kolkata') + interval '45 minutes')::time WHERE id = '<id>';` Use 20 minutes instead of 45 for the auto-cancel |
| Host pause after 3 expiries | Expire three of Hari's requests as above, then run `send_reminders` |

Only do this on your local database.

## 7. Useful checks

Run these with `psql -U synchoo -h localhost -d synchoo`.

```sql
-- Latest bookings and their money
SELECT id, status, payment_status, base_price, total_price, refund_amount, provider_earning
FROM public.bookings ORDER BY created_at DESC LIMIT 5;

-- One person's wallet history
SELECT t.created_at, t.kind, t.amount, t.balance_after, t.description
FROM public.wallet_transactions t JOIN auth.users u ON u.id = t.user_id
WHERE u.email = 'customer1@test.synchoo.local' ORDER BY t.created_at DESC;

-- Every wallet balance must equal the sum of its ledger. This should return no rows
SELECT w.user_id, w.balance, COALESCE(SUM(t.amount), 0) AS ledger
FROM public.wallets w LEFT JOIN public.wallet_transactions t ON t.user_id = w.user_id
GROUP BY w.user_id, w.balance HAVING w.balance <> COALESCE(SUM(t.amount), 0);
```

## 8. Start again with a clean database

```bash
psql -U postgres -c "DROP DATABASE IF EXISTS synchoo"
psql -U postgres -f backend/scripts/bootstrap_db.sql
cd backend && .venv/Scripts/python manage.py migrate
```

This deletes all local data, so you will need to repeat sections 3 and 4.

If `migrate` complains about `0031_instant_book_and_host_accountability`, `0032_driver_booking_windows` or `0033_wash_booking_dispatch`, your database ran those migrations before they were renumbered to 0032, 0033 and 0034. Start again with a clean database as above.
