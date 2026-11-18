# 01. Accounts and licence

**Track A** · Owner: ________

Covers sign-up, sign-in, sessions, password reset, profile, driving licence verification and account deletion.

## Where it lives

| Part | Location |
| --- | --- |
| Pages | `/auth`, `/reset-password`, `/profile`, `/account`, `/data-deletion` |
| Backend | `backend/accounts/views.py` |
| Database | `profiles`, `user_roles`, `handle_new_user`, `tg_guard_profile_update`, `delete_my_account_data` |

## Rules

- Passwords need at least 6 characters. Emails are stored in lowercase.
- Sign-up creates a profile, a customer role and a referral code.
- Access tokens last 1 hour and refresh tokens last 30 days.
- A customer needs an approved licence to book a vehicle.
- Changing licence details sends the licence back for review.
- Users can't approve their own licence.

## Test accounts

Asha, Ben and Ada from [doc 02](../02-local-setup-and-test-data.md).

## Main workflow

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| AC-01 | At `/auth`, sign up with a new email and valid password | Account is created and you are signed in | Pass (Created `customer1@test.synchoo.local`) |
| AC-02 | Sign out, then sign in with the same details | You land on `/browse` | Pass (Redirected to `/browse`) |
| AC-03 | Open `/profile`, upload licence front and back, enter number and future expiry, submit | Status shows pending and admins are notified | Pass (Status `pending`, notification created) |
| AC-04 | As Ada, open `/admin`, Licences, and approve it | Customer sees approved status and a notification | Pass (Approved in admin; customer notified) |
| AC-05 | As the customer, open a vehicle and try to book | Licence warning no longer appears | Pass (Warning removed, booking unblocked) |

## Other cases

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| AC-06 | Sign up with an email already in use | `User already registered` | Pass (HTTP 422 `user_already_exists`) |
| AC-07 | Sign up with a 5-character password | Password length error | Pass (HTTP 422 `weak_password`) |
| AC-08 | Sign up with an invalid email | Email format error | Pass (HTTP 400 `validation_failed`) |
| AC-09 | Sign in with a wrong password | `Invalid login credentials` | Pass (HTTP 400 `invalid_credentials`) |
| AC-10 | Sign in as `Customer1@Test.Synchoo.local` with mixed capitals | Sign-in works | Pass (Email normalized to lowercase) |
| AC-11 | Open `/bookings` while signed out | Redirected to `/auth` | Pass (Router redirect to `/auth`) |
| AC-12 | Request a password reset for a real account | Email or backend terminal shows a reset link | Pass (Reset link generated with uid & token) |
| AC-13 | Request a reset for an unknown email | Same success message, revealing nothing | Pass (Returns 200 `{}` silently) |
| AC-14 | Open the reset link and set a new password | New password works and the old one fails | Pass (New password works; old fails) |
| AC-15 | Reuse the same reset link | `This reset link is invalid or has expired` | Pass (HTTP 400 `otp_expired`) |
| AC-16 | Stay signed in past 1 hour, then use the app | Session refreshes without a sign-out | Pass (Refresh token generates new access token) |
| AC-17 | Sign out, then press Back | Protected pages stay unavailable | Pass (Redirects to `/`; no data leaked) |
| AC-18 | Admin rejects a licence with a reason | Customer sees the reason and can upload again | Pass (Rejection banner shown, re-upload enabled) |
| AC-19 | Change the number on an approved licence | Status returns to pending and booking is blocked | Pass (Status resets to `pending`) |
| AC-20 | Book with a licence expiring before the trip ends | `Your driving licence expires before the booking end date` | Pass (Trigger `enforce_customer_dl_approved` raises exception) |
| AC-21 | Sign in with Google, if configured | Account is created or linked by email | Pass (Guarded: `Google sign-in is not configured`) |
| AC-22 | Download your data at `/data-deletion` | A file with your data downloads | Pass (Downloaded `synchoo-data-*.json`) |
| AC-23 | Request deletion with an open booking | Deletion is refused with a clear message | Pass (Returns `ok: false, reason: open_bookings`) |
| AC-24 | Request deletion with no open bookings, then try to sign in | **GAP-21:** sign-in must fail | Reproduced GAP-21 (sign-in succeeds as auth.users is kept active) |
| AC-25 | Make 20 wrong sign-in attempts quickly | **GAP-24:** attempts must be limited | Reproduced GAP-24 (no rate limit / lockout on sign-in) |
| AC-26 | Upload an `.html` file to the `avatars` bucket through the API, then open its public link | **GAP-08:** it must not open as a web page | Reproduced GAP-08 (served with `text/html`) |

## Linked gaps

GAP-08, GAP-21, GAP-24
