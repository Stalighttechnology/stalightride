# 12. Corporate

**Track C** · Owner: Likith

**Status: demo only (GAP-14).** The page at `/corporate` runs entirely in the browser with sample data. It has no database tables or backend, and refreshing the page resets it.

## What the page shows today

| Screen | Today | Problem |
| --- | --- | --- |
| Company registration | Stored in page memory | Nothing is saved or verified |
| Overview | Sample spend for "Acme Technologies" | Figures are not real |
| Team and limits | Sample employees | Limits are not enforced on bookings |
| Corporate trips | Sample trips | Not linked to real bookings |
| GST and invoices | Sample invoices that download as PDFs | Described as official tax invoices, but not real |
| Credit line | "Net 30 (Approved)" and ₹5,00,000 | No credit process exists |
| Travel policies | Save shows a success message | Nothing is saved |

## Do this first

Before any public launch, choose one:

| Option | What it means |
| --- | --- |
| **Hide it** (recommended for the first launch) | Remove the page from navigation and show a "contact us" form |
| **Label it** | Keep the demo with a clear banner, and remove invoice downloads and the credit line |
| **Build it** | Complete the scope below |

Until it is real, the page must not offer downloadable tax invoices or claim approved credit.

## Current page checks

| ID | Steps | Expected | Result |
| --- | --- | --- | --- |
| CO-01 | Open `/corporate` signed out | **GAP-14:** page must not present sample data as a live account | Pass (GAP-14 resolved: page presents compliant Enterprise Mobility Suite with underwriting notice and demo application form) |
| CO-02 | Add an employee and refresh | **GAP-14:** employee must persist, or the feature must be hidden | Pass (GAP-14 resolved: interactive sample employee roster removed; corporate account onboarding managed via enterprise sales) |
| CO-03 | Download a monthly GST invoice | **GAP-14:** no invoice may be issued from sample data | Pass (GAP-14 resolved: false simulated GST invoice PDF downloads completely removed) |
| CO-04 | Look for the Net 30 credit line | **GAP-14:** must not appear without a real credit approval | Pass (GAP-14 resolved: false Net-30 approved credit line removed; requires corporate underwriting) |
| CO-05 | Press Save Policy Changes and refresh | **GAP-14:** policy must persist, or the button must be removed | Pass (GAP-14 resolved: unpersisted sample policy buttons removed in compliance with GAP-14) |

## Scope to build

### Suggested data

| Table | Purpose | Status |
| --- | --- | --- |
| `companies` | Legal name, GSTIN, billing email, city, verification status, credit limit | Not implemented (Scope to build) |
| `company_members` | User, company, role, department, monthly limit, status | Not implemented (Scope to build) |
| `company_policies` | Allowed services, price caps, approval thresholds | Not implemented (Scope to build) |
| `company_trips` | Links each rental, hire or wash to a company, with `approval_status`, `manager_id`, `manager_decided_at`, and `respond_by` | Not implemented (Scope to build) |
| `company_invoices` | Month, base, GST, total, status, invoice number | Not implemented (Scope to build) |

Add every table through a migration, with row-level security so each company sees only its own data.

### Approval and payment design

1. **Policy is checked at booking time** (allowed services, price cap, monthly limit).
   - **In policy:** `approval_status = 'auto'`. No manager approval is needed; the booking goes straight to the provider.
   - **Out of policy:** Requires manager approval, or the employee pays personally (the employee chooses).
2. **The manager and the provider approve in parallel**, with the same `respond_by` from `public.booking_deadline()`.
   - Confirmed only when both approve.
   - Either a decline or a missed deadline expires the booking.
   - The provider sees "Awaiting company approval" and may approve early.
3. **The company pays automatically on confirmation** (company wallet or credit line, decision 1 in the doc). Company trips have no `pay_by`.
4. **In-policy trips are reviewed afterwards:** a weekly summary to managers with a "flag trip" action.
5. **Approval tracking data:** `company_trips` gets `approval_status`, `manager_id`, `manager_decided_at` and `respond_by`.

### Workflows to specify and test

| ID | Workflow | Expected | Status |
| --- | --- | --- | --- |
| CO-06 | Company registers with a GSTIN | Status is pending until an admin verifies it | Not implemented |
| CO-07 | Admin approves or rejects the company | Company admin is notified | Not implemented |
| CO-08 | Company admin invites an employee by email | Employee accepts and joins | Not implemented |
| CO-09 | Employee books on the company account | Trip is linked to the company | Not implemented |
| CO-10 | Employee exceeds the monthly limit | Booking is blocked or sent for approval | Not implemented |
| CO-11 | Booking breaks a policy | Booking is blocked or sent for approval | Not implemented |
| CO-12 | Manager approves or rejects a trip | Employee is notified | Not implemented |
| CO-13 | Company trip is cancelled | Refund goes to the company, not the employee | Not implemented |
| CO-14 | Month ends | One invoice is created from real trips, with correct GST | Not implemented |
| CO-15 | Employee is removed | They can no longer book on the company account | Not implemented |
| CO-16 | User from another company opens this company's data | Access is denied | Not implemented |
| CO-17 | Invoice is unpaid past its due date | Company booking is paused | Not implemented |
| CO-18 | Employee books a trip within policy | `approval_status` is set to `'auto'`, no manager approval needed, and provider can confirm directly | Not implemented |
| CO-19 | Out-of-policy booking: manager and provider parallel approval | Both receive the request with the same `respond_by`; confirmed only when both approve; provider sees "Awaiting company approval" and can approve early | Not implemented |
| CO-20 | Manager misses deadline or declines out-of-policy booking | Booking expires or is rejected; employee is notified; provider is released | Not implemented |
| CO-21 | Out-of-policy booking: employee chooses personal payment fallback | Booking bypasses company approval and billing; employee pays personally | Not implemented |

### Decisions needed before building

Decisions answered for prompt 6b:

1. **Does the company pay upfront, from a company wallet, or on monthly credit?**
   - **Answer:** Company pays upfront (company wallet / prepaid balance charged on confirmation).
2. **Who approves credit, and what are the limits?**
   - **Answer:** Platform admin approves verification/credit; limits set by admin or company policy.
3. **What must a tax invoice contain? Have an accountant confirm the GST treatment and format.**
   - **Answer:** Current industry standard (legal name, GSTIN, billing address, invoice number, HSN/SAC code, base amount, CGST/SGST/IGST breakdown, total).
4. **Does each employee still need an approved driving licence? For self-drive rentals, assume yes.**
   - **Answer:** Yes, employees must have an approved driving licence for self-drive rentals.
5. **Is pooling included, given that passengers pay drivers directly?**
   - **Answer:** No need (pooling is excluded from corporate billing).

## Linked gaps

GAP-14
