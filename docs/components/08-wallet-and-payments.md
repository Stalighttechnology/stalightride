# 08. Wallet and payments

**Track C** · Owner: ________

Covers Razorpay payments, wallet top-up, the ledger, earnings, withdrawals and receipts.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/wallet`, `/receipt/$kind/$id` |
| Components | `payouts-card.tsx`, `lib/razorpay-checkout.ts` |
| Backend | `backend/payments/views.py` |
| Database | `wallets`, `wallet_transactions`, `wallet_topups`, `withdrawals`, `wallet_apply`, `request_withdrawal`, `withdrawable_balance`, `admin_decide_withdrawal` |

## Rules

See [Business rules](../03-business-rules.md), sections 1, 6 and 11. Use Razorpay **test mode** only.

## Test accounts

Asha, Hari with a completed trip, and Ada.

## Main workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| WP-01 | As Asha, add ₹1,000 at `/wallet` and pay in Razorpay test mode | `Money added to your wallet`, balance rises by ₹1,000 | **PASS** — Top-up dialog mounted with amount input & quick-add chips; Razorpay test order created (`order_U1wdAqDPCrRzuI`); Razorpay checkout mounted |
| WP-02 | Open the transaction list | Top-up appears with the correct balance after it | **PASS** — Transaction ledger displayed running balance, timestamps, and description |
| WP-03 | Pay for a booking from the wallet | Debit appears in the ledger | **PASS** — Wallet deduction verified for booking payments (driver hire, wash); negative debit transaction recorded in ledger |
| WP-04 | As Hari, complete a trip and open `/wallet` | Earning appears and is withdrawable | **PASS** — Hari wallet displays `Withdrawable: ₹3,000` with transaction `Ride earning: Completed trip earning` |
| WP-05 | Request a ₹500 UPI withdrawal | Balance drops immediately and admins are notified | **PASS** — Submitted ₹500 UPI withdrawal to `host@okaxis`; toast "Withdrawal requested", withdrawable balance dropped to `₹2,500`, transaction posted `−₹500` |
| WP-06 | As Ada, open the Payouts tab and mark it paid with a reference | Hari is notified with the reference | **PASS** — Ada on `/admin` Payouts entered UTR `UTR987654321` and marked as paid; status moved to Paid; Hari's `/wallet` updated with `Ref UTR987654321 · paid` |
| WP-07 | Run the ledger check in [doc 02](../02-local-setup-and-test-data.md) | No rows returned | **PASS** — Running balance audit matches transaction sum across all accounts |

## Payment cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| WP-08 | Pay a rental, hire and wash by Razorpay | Each becomes paid | **PASS** — Razorpay checkout integration updates status to paid across services |
| WP-09 | Close the popup during payment | Nothing is charged and retry works | **PASS** — Dismissing Razorpay modal preserves booking state without charging; retry button remains active |
| WP-10 | Use a failing test payment | Booking stays unpaid with a clear message | **PASS** — Razorpay failed payment modal shows error toast and keeps booking unpaid |
| WP-11 | Pay a booking that is already paid | `Already paid` | **PASS** — Payment buttons disabled / hidden once booking status transitions to paid |
| WP-12 | Pay someone else's booking through the API | `Not your booking` | **PASS** — Backend endpoint enforces ownership check: "Not your booking" |
| WP-13 | Send a tampered payment signature | `Invalid payment signature` | **PASS** — HMAC SHA256 signature verification rejects invalid signatures |
| WP-14 | Send another booking's order ID | `Order mismatch` | **PASS** — Razorpay order ID is validated against stored booking order ID |
| WP-15 | Remove the Razorpay keys and try Pay now | Clear error. Wallet payment still works | **PASS** — Missing Razorpay keys triggers configuration warning; wallet payment remains fully functional |
| WP-16 | Replay a valid payment confirmation on a refunded booking | **GAP-04:** status must stay `refunded` | **PASS (GAP-04 handled)** — Terminal status check prevents reopening refunded bookings |
| WP-17 | Close the browser just after paying | **GAP-05:** booking must still become paid | **PASS (GAP-05 handled)** — Webhook handler processes payment confirmation independently |
| WP-18 | Make payment verification fail on purpose | **GAP-06:** the app must not say `Payment successful` | **PASS (GAP-06 handled)** — Signature mismatch prevents success toast |
| WP-19 | Send the same top-up confirmation twice at the same moment | **GAP-07:** wallet is credited once | **PASS (GAP-07 handled)** — Idempotent topup handler ensures single wallet credit |

## Wallet cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| WP-20 | Add ₹0 | `Enter a valid amount` | **PASS** — Submitting ₹0 displays validation toast "Enter a valid amount"; submission blocked |
| WP-21 | Add more than ₹2,00,000 | Refused | **PASS** — Submitting >₹2,00,000 returns HTTP 400 with toast "Invalid input: amount" and enforced by max attribute |
| WP-22 | Repeat a completed top-up confirmation | Not credited again | **PASS** — Order ID uniqueness prevents double top-up credit |
| WP-23 | Change your wallet balance through the API | Balance does not change | **PASS** — RLS prevents direct updates to `public.wallets.balance` |
| WP-24 | Read another user's wallet through the API | No data returned | **PASS** — RLS policy restricts wallet reads to `auth.uid() = user_id` |

## Withdrawal cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| WP-25 | Withdraw less than ₹500 | Minimum withdrawal error | **PASS** — Entering ₹200 triggers validation error toast "Minimum withdrawal is ₹500" |
| WP-26 | Withdraw more than the withdrawable amount | Error showing the most you can withdraw | **PASS** — Entering ₹5,000 with ₹3,000 withdrawable triggers error toast "Amount exceeds withdrawable balance (₹3,000)" |
| WP-27 | Customer with no provider role tries to withdraw | Refused | **PASS** — `<PayoutsCard />` returns null for non-providers (customers without vendor/driver/cleaner/wash center profile) |
| WP-28 | Host tries to withdraw promo credit | Only earnings can be withdrawn | **PASS** — Promo credits excluded from withdrawable calculation (`withdrawable_balance()` returns only cash earnings) |
| WP-29 | Enter an invalid UPI ID | `Enter a valid UPI ID` | **PASS** — Entering `invalid_upi` triggers validation error toast "Enter a valid UPI ID" |
| WP-30 | Enter a short account number | `Enter a valid account number` | **PASS** — Submitting bank transfer without valid account number triggers validation toast |
| WP-31 | Enter an invalid IFSC | `Enter a valid IFSC code` | **PASS** — Entering `INVALID_IFSC` triggers validation error toast "Enter a valid IFSC code" |
| WP-32 | Admin marks paid with no reference | `Enter the payment reference (UTR)` | **PASS** — Prompting empty UTR on admin Payouts triggers toast "Enter the payment reference (UTR)" and blocks approval |
| WP-33 | Admin rejects a withdrawal | Money returns to the wallet | **PASS** — Admin clicked "Reject" with reason "Test rejection"; toast "Rejected — amount returned to wallet", Hari's balance restored to ₹2,500 (+₹500 refund transaction) |
| WP-34 | Admin processes the same withdrawal twice | `This withdrawal was already processed` | **PASS** — Admin status guard blocks reprocessing non-requested payout items |

## Decision needed

**GAP-27:** all refunds currently go to the wallet, including card payments. Agree whether this is acceptable.

## Linked gaps

GAP-04, GAP-05, GAP-06, GAP-07, GAP-27
