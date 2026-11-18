# 11. Membership, rewards and referrals

**Track B** · Owner: ________

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
| MR-01 | As Asha, open `/referrals` and copy the link | Link contains the referral code | |
| MR-02 | Open the link signed out and sign up as Rae | Sign-up shows the code as applied | |
| MR-03 | As Asha, reload `/referrals` | Rae is listed as not yet rewarded | |
| MR-04 | As Rae, get a licence approved and complete payment on a first rental | Both wallets gain ₹500 | |
| MR-05 | As Asha, reload `/referrals` | Rae shows as rewarded | |

## Referral edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-06 | Rae pays for a second rental | No further bonus | |
| MR-07 | Sign up with an invalid code | Account is created with no referrer | |
| MR-08 | Change `referred_by` on your profile through the API | The change is ignored | |
| MR-09 | Rae pays only for a driver hire or wash | No bonus, because only rentals count | |
| MR-10 | Try withdrawing a referral bonus | Bonus isn't withdrawable | |

## Membership workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-11 | As Asha, open `/membership` and buy Plus monthly with wallet | Wallet drops by ₹499 and the plan shows active for 30 days | |
| MR-12 | Reload the page | Plan and expiry date remain | |
| MR-13 | Cancel the membership | Auto-renew is off and benefits last until expiry | |
| MR-14 | Buy Black annual by Razorpay test mode | Plan is active for 365 days | |
| MR-15 | Switch back to Standard | Plan returns to free | |

## Membership edge cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-16 | Buy with too little wallet balance | Insufficient balance error, nothing is charged | |
| MR-17 | Send an invalid plan or cycle | Refused | |
| MR-18 | Change your plan directly through the API | The change is ignored | |
| MR-19 | Let a membership expire | Status shows the free plan | |
| MR-20 | Activate with a made-up payment ID and no signature | **GAP-01:** must be refused | |
| MR-21 | As a Plus or Black member, price a booking | **GAP-15:** advertised benefits must apply, or the claims must be removed | |
| MR-22 | Let an auto-renew membership reach expiry | **GAP-15:** it must renew or say clearly that it won't | |

## Rewards

The Rewards page must not suggest that points have real value until this work is done.

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| MR-23 | Open `/rewards` on two browsers with one account | **GAP-17:** points must match | |
| MR-24 | Edit the points in browser storage and reload | **GAP-17:** balance must not change | |
| MR-25 | Complete a paid trip | **GAP-17:** points must be earned from the server | |
| MR-26 | Redeem a voucher or convert points | **GAP-17:** must be real, or shown clearly as coming soon | |

## Decisions needed

1. Which membership benefits will actually be offered, and how are they funded?
2. How many points does each rupee earn, and what can points buy?
3. Do points expire?

## Linked gaps

GAP-01, GAP-15, GAP-17
