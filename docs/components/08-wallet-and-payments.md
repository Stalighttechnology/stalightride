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
| WP-01 | As Asha, add ₹1,000 at `/wallet` and pay in Razorpay test mode | `Money added to your wallet`, balance rises by ₹1,000 | |
| WP-02 | Open the transaction list | Top-up appears with the correct balance after it | |
| WP-03 | Pay for a booking from the wallet | Debit appears in the ledger | |
| WP-04 | As Hari, complete a trip and open `/wallet` | Earning appears and is withdrawable | |
| WP-05 | Request a ₹500 UPI withdrawal | Balance drops immediately and admins are notified | |
| WP-06 | As Ada, open the Payouts tab and mark it paid with a reference | Hari is notified with the reference | |
| WP-07 | Run the ledger check in [doc 02](../02-local-setup-and-test-data.md) | No rows returned | |

## Payment cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| WP-08 | Pay a rental, hire and wash by Razorpay | Each becomes paid | |
| WP-09 | Close the popup during payment | Nothing is charged and retry works | |
| WP-10 | Use a failing test payment | Booking stays unpaid with a clear message | |
| WP-11 | Pay a booking that is already paid | `Already paid` | |
| WP-12 | Pay someone else's booking through the API | `Not your booking` | |
| WP-13 | Send a tampered payment signature | `Invalid payment signature` | |
| WP-14 | Send another booking's order ID | `Order mismatch` | |
| WP-15 | Remove the Razorpay keys and try Pay now | Clear error. Wallet payment still works | |
| WP-16 | Replay a valid payment confirmation on a refunded booking | **GAP-04:** status must stay `refunded` | |
| WP-17 | Close the browser just after paying | **GAP-05:** booking must still become paid | |
| WP-18 | Make payment verification fail on purpose | **GAP-06:** the app must not say `Payment successful` | |
| WP-19 | Send the same top-up confirmation twice at the same moment | **GAP-07:** wallet is credited once | |

## Wallet cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| WP-20 | Add ₹0 | `Enter a valid amount` | |
| WP-21 | Add more than ₹2,00,000 | Refused | |
| WP-22 | Repeat a completed top-up confirmation | Not credited again | |
| WP-23 | Change your wallet balance through the API | Balance does not change | |
| WP-24 | Read another user's wallet through the API | No data returned | |

## Withdrawal cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| WP-25 | Withdraw less than ₹500 | Minimum withdrawal error | |
| WP-26 | Withdraw more than the withdrawable amount | Error showing the most you can withdraw | |
| WP-27 | Customer with no provider role tries to withdraw | Refused | |
| WP-28 | Host tries to withdraw promo credit | Only earnings can be withdrawn | |
| WP-29 | Enter an invalid UPI ID | `Enter a valid UPI ID` | |
| WP-30 | Enter a short account number | `Enter a valid account number` | |
| WP-31 | Enter an invalid IFSC | `Enter a valid IFSC code` | |
| WP-32 | Admin marks paid with no reference | `Enter the payment reference (UTR)` | |
| WP-33 | Admin rejects a withdrawal | Money returns to the wallet | |
| WP-34 | Admin processes the same withdrawal twice | `This withdrawal was already processed` | |

## Decision needed

**GAP-27:** all refunds currently go to the wallet, including card payments. Agree whether this is acceptable.

## Linked gaps

GAP-04, GAP-05, GAP-06, GAP-07, GAP-27
