# 11. Membership, rewards and referrals

**Track B** · Owner: Likith

| Feature | Current state |
| --- | --- |
| Referrals | Working |
| Membership | Purchase works, but benefits are not applied and payment proof is not enforced |
| Rewards | Preview only. Points live in the browser |

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/referrals`, `/membership`, `/rewards` |
| Backend | `createMembershipOrder`, `subscribeMembership`, `cancelMembership`, `getMembershipStatus` in `payments/views.py` |
| Database | `profiles` membership and referral columns, `apply_referral_bonus_on_first_paid`, `my_referrals` |

## Rules

See [Business rules](../03-business-rules.md), sections 12 and 13.

## Referral workflow

Use a new account called Rae for the invited friend.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-01 | As Asha, open `/referrals` and copy the link | Link contains the referral code | Pass (Link contains `ref=ASHA500` with local origin) |
| MR-02 | Open the link signed out and sign up as Rae | Sign-up shows the code as applied | Pass (Sign-up page captures and pre-fills `ASHA500`) |
| MR-03 | As Asha, reload `/referrals` | Rae is listed as not yet rewarded | Pass (Rae listed under referrals as 'Pending' with ₹0 rewarded) |
| MR-04 | As Rae, get a licence approved and complete payment on a first rental | Both wallets gain ₹500 | Pass (Trigger `trg_booking_referral_bonus` credited ₹500 to both Asha and Rae) |
| MR-05 | As Asha, reload `/referrals` | Rae shows as rewarded | Pass (Asha's referrals list updates Rae to 'Rewarded' with ₹500 earned) |

## Referral edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-06 | Rae pays for a second rental | No further bonus | Pass (Second paid rental triggers zero additional referral bonuses) |
| MR-07 | Sign up with an invalid code | Account is created with no referrer | Pass (Account created smoothly with `referred_by: null`) |
| MR-08 | Change `referred_by` on your profile through the API | The change is ignored | Pass (Profile `referred_by` column protected by RLS against client updates) |
| MR-09 | Rae pays only for a driver hire or wash | No bonus, because only rentals count | Pass (Trigger verifies booking type; hires and washes do not trigger referral bonus) |
| MR-10 | Try withdrawing a referral bonus | Bonus isn't withdrawable | Pass (Referral bonus promo credit excluded from withdrawable bank balance) |

## Membership workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-11 | As Asha, open `/membership` and buy Plus monthly with wallet | Wallet drops by ₹499 and the plan shows active for 30 days | Pass (Wallet charged ₹499 and plan active for 30 days) |
| MR-12 | Reload the page | Plan and expiry date remain | Pass (Active plan and expiry persist from profiles table) |
| MR-13 | Cancel the membership | Auto-renew is off and benefits last until expiry | Pass (Auto-renew turned off; benefits remain active until cycle expiry) |
| MR-14 | Buy Black annual by Razorpay test mode | Plan is active for 365 days | Pass (Subscribes to Black VIP for 365 days) |
| MR-15 | Switch back to Standard | Plan returns to free | Pass (Plan reverts to 'free') |

## Membership edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-16 | Buy with too little wallet balance | Insufficient balance error, nothing is charged | Pass (Insufficient balance rejected; wallet balance unchanged) |
| MR-17 | Send an invalid plan or cycle | Refused | Pass (Backend rejects invalid plan or cycle with HTTP 400) |
| MR-18 | Change your plan directly through the API | The change is ignored | Pass (Direct updates to `membership_plan` in profiles blocked by RLS) |
| MR-19 | Let a membership expire | Status shows the free plan | Pass (When `membership_expires_at` is in past, status returns 'free') |
| MR-20 | Activate with a made-up payment ID and no signature | **GAP-01:** must be refused | Fail (GAP-01: Membership can activate with made-up payment ID without verified signature) |
| MR-21 | As a Plus or Black member, price a booking | **GAP-15:** advertised benefits must apply, or the claims must be removed | Pass (Membership discounts & free wash perks applied at checkout via migration 0014) |
| MR-22 | Let an auto-renew membership reach expiry | **GAP-15:** it must renew or say clearly that it won't | Fail (GAP-15: No background cron job exists to automatically renew expiring memberships) |

## Rewards

The Rewards page must not suggest that points have real value until this work is done.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-23 | Open `/rewards` on two browsers with one account | **GAP-17:** points must match | Fail (GAP-17: Points live in client localStorage and do not sync across devices) |
| MR-24 | Edit the points in browser storage and reload | **GAP-17:** balance must not change | Fail (GAP-17: Editing points in browser localStorage alters visible points balance) |
| MR-25 | Complete a paid trip | **GAP-17:** points must be earned from the server | Fail (GAP-17: Points are not awarded from database ledger on trip completion) |
| MR-26 | Redeem a voucher or convert points | **GAP-17:** must be real, or shown clearly as coming soon | Pass (Voucher redemption & wallet conversion displays 'Coming soon. This feature isn't live yet.') |

## Decisions needed

1. Which membership benefits will actually be offered, and how are they funded?
2. How many points does each rupee earn, and what can points buy?
3. Do points expire?

## Linked gaps

GAP-01, GAP-15, GAP-17
